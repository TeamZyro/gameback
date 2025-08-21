// proxy-server.js (Wallet Management integrated)

// ----------------- existing imports/config -----------------
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const os = require("os");

const SECRET_KEY = '904c3acfdc028f495ccc5b60d01dcc49';
const OPERATOR_CODE = 'i4bi';
const API_URL = 'http://gsmd.336699bet.com';

const MONGO_URI = 'mongodb+srv://yashmanjhi80ys:yashpass@ddn.tbanshc.mongodb.net/?retryWrites=true&w=majority&appName=DDN';
const DB_NAME = 'user';
let db;

const app = express();
const PROXY_PORT = process.env.PORT || 3000;
app.use(express.json());

const LG_PAY_APP_ID = 'YD4125';  //
const LG_PAY_TRADE_TYPE = 'INRUPI'; // Payment collection channel
const LG_PAY_SECRET = 'l8BlAeUb5Bd3zwGHCvLs3GNSFRKJ71nL';
const LG_PAY_API = 'https://www.lg-pay.com/api/order/create';
const LG_PAY_NOTIFY_URL = 'https://congenial-space-computing-machine-p67v65p5wj4crpxw-4000.app.github.dev/payment-callback';



// ----------------- MongoDB connect -----------------
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB');
  })
  .catch(err => console.error('MongoDB connection error:', err));

// ----------------- Helper: get balance from provider -----------------
async function getBalanceFromProvider(provider, username, password) {
  const stringToHash = OPERATOR_CODE + password + provider + username + SECRET_KEY;
  const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

  const requestUrl = `${API_URL}/getBalance.aspx?operatorcode=${OPERATOR_CODE}&providercode=${provider}&username=${username}&password=${password}&signature=${signature}`;
  const res = await fetch(requestUrl);
  const text = await res.text();
  try { return JSON.parse(text).balance || 0; } catch { return 0; }
}

// ----------------- Helper: transfer funds -----------------
async function transferFunds(provider, username, password, referenceid, type, amount) {
  const stringToHash = `${amount}${OPERATOR_CODE}${password}${provider}${referenceid}${type}${username}${SECRET_KEY}`;
  const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

  const requestUrl = `${API_URL}/makeTransfer.aspx?operatorcode=${OPERATOR_CODE}&providercode=${provider}&username=${username}&password=${password}&referenceid=${referenceid}&type=${type}&amount=${amount}&signature=${signature}`;

  const res = await fetch(requestUrl);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ----------------- Wallet switch -----------------
async function switchWallet(user, fromProvider, toProvider, password) {
  const balance = await getBalanceFromProvider(fromProvider, user.username, password);
  if (balance > 0) {
    await transferFunds(fromProvider, user.username, password, `SW-${Date.now()}`, "1", balance); // withdraw
    await transferFunds(toProvider, user.username, password, `SW-${Date.now()}`, "0", balance);   // deposit
  }
  await db.collection('users').updateOne(
    { username: user.username },
    { $set: { walletProvider: toProvider, balance, updatedAt: new Date() } }
  );
}

// ----------------- Modified: create-payment -----------------
app.post('/create-payment', async (req, res) => {
  try {
    const { orderId, amount, username, password, walletProvider = 'JE', ip = '0.0.0.0', remark = '' } = req.body;

    if (!orderId || !amount || !username ) {
      return res.status(400).json({ success: false, message: 'orderId, amount, username and walletProvider are required' });
    }

    const wholeAmount = parseInt(amount, 10);
    if (isNaN(wholeAmount) || wholeAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    
    const money = (wholeAmount * 100).toString(); // integer string for LG Pay
    const user = await db.collection('users').findOne({ username });

        // Save deposit in DB
    await db.collection('deposits').insertOne({
      orderId, username, password, amount: wholeAmount, walletProvider: user.walletProvider, status: 'pending', createdAt: new Date()
    });

    // Update user wallet info (credit locally + set walletProvider)
    // await db.collection('users').updateOne(
    //   { username },
    //   { $set: { walletProvider, updatedAt: new Date() }, $inc: { balance: wholeAmount } },
    //   { upsert: true }
    // );
    
            // Save user deposit in DB
            // await db.collection('deposits').insertOne({
            //     orderId,
            //     username,
            //     password,
            //     amount: wholeAmount,
            //     money,
            //     status: 'pending',
            //     createdAt: new Date()
            // });
    
            const params = {
                app_id: LG_PAY_APP_ID,
                trade_type: LG_PAY_TRADE_TYPE,
                order_sn: orderId,
                money: money,
                notify_url: LG_PAY_NOTIFY_URL,
                ip,
                remark
            };
    
            Object.keys(params).forEach(key => {
                if (!params[key]) delete params[key];
            });
    
            const sortedKeys = Object.keys(params).sort();
            const stringA = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
            const stringToSign = `${stringA}&key=${LG_PAY_SECRET}`;
            const sign = crypto.createHash('md5').update(stringToSign).digest('hex').toUpperCase();
    
            params.sign = sign;
    
            const formData = new URLSearchParams(params);
            const response = await fetch(LG_PAY_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
            });
    
            const data = await response.json();
            console.log('LG Pay create order response:', data);
    
            res.json(data);


  } catch (err) {
    console.error('Error in /create-payment:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ----------------- Modified: balance -----------------
app.get('/balance', async (req, res) => {
  const { username, password } = req.query;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    const user = await db.collection('users').findOne({ username });
    if (!user || !user.walletProvider) return res.status(404).json({ success: false, message: 'User wallet not found' });

    const balance = await getBalanceFromProvider(user.walletProvider, username, password);
    res.json({ success: true, walletProvider: user.walletProvider, balance });
  } catch (err) {
    console.error('Error in /balance:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ----------------- Modified: launch-game -----------------
app.get('/launch-game', async (req, res) => {
  const { username, password, type, provider_code, gameid = '0', lang = 'en-US', html5 = '0' } = req.query;
  if (!username || !password || !type || !provider_code) return res.status(400).json({ success: false, message: 'Missing required fields' });

  try {
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.walletProvider && user.walletProvider !== provider_code) {
      console.log(`Switching wallet from ${user.walletProvider} to ${provider_code} for ${username}`);
      await switchWallet(user, user.walletProvider, provider_code, password);
    }

    // Signature for launch
    const stringToHash = OPERATOR_CODE + password + provider_code + type + username + SECRET_KEY;
    const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

    const requestUrl = `${API_URL}/launchGames.aspx?operatorcode=${OPERATOR_CODE}&providercode=${provider_code}&username=${username}&password=${password}&type=${type}&gameid=${gameid}&lang=${lang}&html5=${html5}&signature=${signature}`;

    const apiResponse = await fetch(requestUrl);
    const text = await apiResponse.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    res.json({ success: true, data });

  } catch (err) {
    console.error('Error in /launch-game:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ----------------- keep your other endpoints -----------------

app.post('/register', async (req, res) => {
  // 1. Get user details from the request body
  const { username, email, password } = req.body;

  // 2. --- Input Validation ---
  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username, email, and password are required.',
    });
  }

  // Username format validation
  if (username.length < 3 || username.length > 12 || username !== username.toLowerCase()) {
    return res.status(400).json({
      success: false,
      message: 'Invalid username format. Must be 3-12 lowercase characters.'
    });
  }

  // Password strength (simple example)
  if (password.length < 6) {
      return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long.'
      });
  }

  try {
    // --- MongoDB: Check if username or email already exists ---
    const existingUser = await db.collection('users').findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
        const message = existingUser.username === username 
            ? 'Username already exists.' 
            : 'Email already in use.';
        return res.status(409).json({ success: false, message });
    }

    // --- Prepare the request for the other server ---
    const stringToHash = OPERATOR_CODE + username + SECRET_KEY;
    const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();
    const requestUrl = `${API_URL}/createMember.aspx?operatorcode=${OPERATOR_CODE}&username=${username}&signature=${signature}`;
    
    console.log(`Proxying request to: ${requestUrl}`);

    // --- Call the other server ---
    const apiResponse = await fetch(requestUrl);
    const responseData = await apiResponse.json();

    console.log('Received response from API server:', responseData);
    
    // --- Save user to LOCAL DB only if external API call was successful ---

      // Securely hash the password before saving
      // const saltRounds = 10;
      // const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Save the complete user profile to your local DB
      await db.collection('users').insertOne({ 
          username, 
          email, 
          password: password,
          balance: '0',
          walletProvider: 'JE',
          updatedAt: '0', // Default wallet provider
          createdAt: new Date() 
        });
        console.log(`User '${username}' saved to local database.`);
    

    // --- Return the response to the original caller ---
    return res.status(apiResponse.status).json(responseData);

  } catch (error) {
    console.error('Error in /register endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

/**
 * =============================================================================
 * API Endpoint: Login Player
 * =============================================================================
 * Route: POST /login
 * Description: Authenticates a user based on username and password stored locally.
 *
 * Request Body (JSON):
 * {
 * "username": "newplayer",
 * "password": "a-strong-password"
 * }
 */



// LG Pay Callback (notify_url)
app.post('/payment-callback', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { order_sn, money, status, pay_time, remark, sign } = req.body;

    if (!order_sn || !money || !status || !pay_time || !sign) {
      return res.status(400).send('Missing fields');
    }

    // Recreate the sign to verify LG Pay callback
    const stringToSign = `money=${money}&notify_url=${LG_PAY_NOTIFY_URL}&order_sn=${order_sn}&remark=${remark || ''}&status=${status}&key=${LG_PAY_SECRET}`;
    const localSign = crypto.createHash('md5').update(stringToSign).digest('hex').toUpperCase();

    if (localSign !== sign) {
      console.warn('LG Pay callback sign mismatch!', { localSign, sign });
      return res.status(400).send('Invalid sign');
    }

    if (status === '1') {
      const deposit = await db.collection('deposits').findOne({ orderId: order_sn });
      if (!deposit) return res.status(404).send('Order not found');

      // Prevent double-processing
      if (deposit.status === 'paid') return res.send('ok');

      // Update deposit status
      await db.collection('deposits').updateOne(
        { orderId: order_sn },
        { $set: { status: 'paid', paidAt: new Date(pay_time) } }
      );

      console.log(`Deposit marked paid: ${order_sn} for ${deposit.username}`);

      // 1️⃣ Update local user balance
      await db.collection('users').updateOne(
        { username: deposit.username },
        { $inc: { balance: deposit.amount } }
      );

      // 2️⃣ Transfer funds to external game API
const referenceid = order_sn; // can reuse order_sn as reference
const type = '0'; // deposit
const amount = deposit.amount;

// Fetch the original (plain) password from users collection
const userRecord = await db.collection('users').findOne({ username: deposit.username });
if (!userRecord) {
  console.error(`User ${deposit.username} not found in users collection`);
  return res.status(404).send('User not found');
}

// IMPORTANT: If you stored hashed password, you need the plain one from registration flow.
// Assuming you still have plain password stored (or in another field like rawPassword).
const plainPassword = userRecord.password; 

if (!plainPassword) {
  console.error(`Plain password missing for ${deposit.username}`);
  return res.status(500).send('Password missing for user');
}

// Build signature according to provider spec
const stringToHash = `${amount}${OPERATOR_CODE}${plainPassword}${deposit.walletProvider}${referenceid}${type}${deposit.username}${SECRET_KEY}`;
const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

// Construct transfer URL
const transferUrl = `${API_URL}/makeTransfer.aspx?operatorcode=${OPERATOR_CODE}&providercode=${deposit.walletProvider}&username=${deposit.username}&password=${plainPassword}&referenceid=${referenceid}&type=${type}&amount=${amount}&signature=${signature}`;

console.log(`Transfer URL: ${transferUrl}`);

const transferResponse = await fetch(transferUrl);
const transferText = await transferResponse.text();
console.log(`Transfer response for ${deposit.username}:`, transferText);

let transferData;
try { transferData = JSON.parse(transferText); } catch { transferData = { raw: transferText }; }

if (transferData.errCode && transferData.errCode !== '0') {
  console.warn(`Transfer failed for ${deposit.username}:`, transferData);
  await db.collection('pendingTransactions').insertOne({
    username: deposit.username,
    referenceid,
    type,
    amount,
    status: 'PENDING',
    createdAt: new Date()
  });
}
    }


    // Respond to LG Pay
    res.send('ok');

  } catch (err) {
    console.error('Error in /payment-callback:', err);
    res.status(500).send('Internal server error');
  }
});



// Agent endpoint: Get recent 50 transactions
app.get('/agent/recent-transactions', async (req, res) => {
  try {
    // Fetch the latest 50 deposits sorted by createdAt (newest first)
    const transactions = await db.collection('deposits')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (err) {
    console.error('Error fetching recent transactions:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Agent endpoint: Get recent 50 transactions
app.get('/agent/users', async (req, res) => {
  try {
    // Fetch the latest 50 deposits sorted by createdAt (newest first)
    const allacc = await db.collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json({
      success: true,
      count: allacc.length,
      allacc
    });
  } catch (err) {
    console.error('Error fetching recent transactions:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});


app.post('/login', async (req, res) => {
    // 1. Get credentials from request body
    const { username, password } = req.body;

    // 2. --- Input Validation ---
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required.'
        });
    }

    try {
        // 3. --- Find user in the local database ---
        const user = await db.collection('users').findOne({ username });

        if (!user) {
            // User not found
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials.'
            });
        }

        // 4. --- Compare the provided password with the stored hash ---
        // const isMatch = await bcrypt.compare(password, user.password);

        if (password !== user.password) {
            // Passwords do not match
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials.'
            });
        }

        // 5. --- Login successful ---
        // For a real app, you would generate a JWT token here.
        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            user: {
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Error in /login endpoint:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.'
        });
    }
});




function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
}
app.listen(PROXY_PORT, () => {
  const ip = getLocalIP();
  console.log(`Proxy server running on http://${ip}:${PROXY_PORT}`);
});
