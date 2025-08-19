// proxy-server.js
// This server acts as a middleman. Your game client will talk to this server.
// This server will then securely call the other API server.

// Import necessary modules
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt'); // For hashing passwords
// We use 'node-fetch' to make HTTP requests to the other server.
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const os = require("os");
 // import model


// --- Configuration ---
const SECRET_KEY = '904c3acfdc028f495ccc5b60d01dcc49';
const OPERATOR_CODE = 'i4bi';
const PROVIDER_CODE = 'JE'; // replace with actual
const API_URL = 'http://gsmd.336699bet.com';


// MongoDB configuration
const MONGO_URI = 'mongodb+srv://yashmanjhi80ys:yashpass@ddn.tbanshc.mongodb.net/?retryWrites=true&w=majority&appName=DDN'; // Change if needed
const DB_NAME = 'user';
let db;

// Initialize the Express application
const app = express();
const PROXY_PORT = process.env.PORT || 3000;


// Middleware to parse JSON request bodies
app.use(express.json());

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB');
  })
  .catch(err => console.error('MongoDB connection error:', err));

/**
 * =============================================================================
 * API Endpoint: Register Player (Proxy)
 * =============================================================================
 * Route: POST /register
 * Description: Receives user details, saves them locally, then securely calls
 * the main user creation API.
 *
 * Request Body (JSON):
 * {
 * "username": "newplayer",
 * "email": "player@example.com",
 * "password": "a-strong-password"
 * }
 */



const LG_PAY_APP_ID = 'YD4125';  //
const LG_PAY_TRADE_TYPE = 'INRUPI'; // Payment collection channel
const LG_PAY_SECRET = 'l8BlAeUb5Bd3zwGHCvLs3GNSFRKJ71nL';
const LG_PAY_API = 'https://www.lg-pay.com/api/order/create';
const LG_PAY_NOTIFY_URL = 'https://congenial-space-computing-machine-p67v65p5wj4crpxw-4000.app.github.dev/payment-callback';



app.post('/create-payment', async (req, res) => {
    try {
        const { orderId, amount, username, password, ip = '0.0.0.0', remark = '' } = req.body;

        if (!orderId || !amount || !username) {
            return res.status(400).json({ success: false, message: 'orderId, amount, and username are required' });
        }
// Ensure whole number only
const wholeAmount = parseInt(amount, 10);
if (isNaN(wholeAmount) || wholeAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount — must be a positive whole number' });
}

const money = (wholeAmount * 100).toString(); // integer string for LG Pay


        // Save user deposit in DB
        await db.collection('deposits').insertOne({
            orderId,
            username,
            password,
            amount: wholeAmount,
            money,
            status: 'pending',
            createdAt: new Date()
        });

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
        console.error('Error creating payment:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});







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
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Save the complete user profile to your local DB
      await db.collection('users').insertOne({ 
          username, 
          email, 
          password: hashedPassword, 
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




// GET BALANCE endpoint
app.get('/balance', async (req, res) => {
  const { username, password } = req.query;

  // Validate inputs
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.'
    });
  }

  try {
    // Create signature
    const stringToHash = OPERATOR_CODE + password + PROVIDER_CODE + username + SECRET_KEY;
    const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

    // Build API request URL
    const requestUrl = `${API_URL}/getBalance.aspx?operatorcode=${OPERATOR_CODE}&providercode=${PROVIDER_CODE}&username=${username}&password=${password}&signature=${signature}`;
    
    console.log(`Fetching balance from: ${requestUrl}`);

    // Call external API
    const apiResponse = await fetch(requestUrl);
    const apiText = await apiResponse.text();

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(apiText);
    } catch {
      data = { rawResponse: apiText };
    }

    // Send result back to client
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error in /balance endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});




// GET Launch Game endpoint
app.get('/launch-game', async (req, res) => {
  const { username, password, type, gameid = '0', lang = 'en-US', html5 = '0', blimit = '' } = req.query;

  // Validate required fields
  if (!username || !password || !type) {
    return res.status(400).json({
      success: false,
      message: 'Username, password, and type are required.'
    });
  }

  try {
    // Create signature
    const stringToHash = OPERATOR_CODE + password + PROVIDER_CODE + type + username + SECRET_KEY;
    const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

    // Build API request URL
    const requestUrl =
      `${API_URL}/launchGames.aspx?operatorcode=${OPERATOR_CODE}` +
      `&providercode=${PROVIDER_CODE}` +
      `&username=${username}` +
      `&password=${password}` +
      `&type=${type}` +
      `&gameid=${gameid}` +
      `&lang=${lang}` +
      `&html5=${html5}` +
      `&signature=${signature}` +
      (blimit ? `&blimit=${blimit}` : '');

    console.log(`Launching game: ${requestUrl}`);

    // Call external API
    const apiResponse = await fetch(requestUrl);
    const apiText = await apiResponse.text();

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(apiText);
    } catch {
      data = { rawResponse: apiText };
    }

    // Send result to client
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error in /launch-game endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});



// GET Transfer Funds endpoint
app.get('/transfer', async (req, res) => {
  const { username, password, referenceid, type, amount } = req.query;

  // Validate required fields
  if (!username || !password || !referenceid || !type || !amount) {
    return res.status(400).json({
      success: false,
      message: 'Username, password, referenceid, type, and amount are required.'
    });
  }

  // Check username length and type validity
  if (username.length < 3 || username.length > 12) {
    return res.status(400).json({ success: false, message: 'Invalid username length (3–12 chars).' });
  }
  if (!['0', '1'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Type must be "0" (deposit) or "1" (withdraw).' });
  }

  try {
    // Create signature
    const stringToHash = amount + OPERATOR_CODE + password + PROVIDER_CODE + referenceid + type + username + SECRET_KEY;
    const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

    // Build API request URL
    const requestUrl =
      `${API_URL}/makeTransfer.aspx?operatorcode=${OPERATOR_CODE}` +
      `&providercode=${PROVIDER_CODE}` +
      `&username=${username}` +
      `&password=${password}` +
      `&referenceid=${referenceid}` +
      `&type=${type}` +
      `&amount=${amount}` +
      `&signature=${signature}`;

    console.log(`Making transfer: ${requestUrl}`);

    // Call external API
    const apiResponse = await fetch(requestUrl);
    const apiText = await apiResponse.text();

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(apiText);
    } catch {
      data = { rawResponse: apiText };
    }

    // Handle unknown status codes (997, 999)
    if (data.errCode === '997' || data.errCode === '999') {
      console.warn(`Transaction ${referenceid} status is unknown — must be verified manually.`);
      // Optionally store in DB for later verification
      await db.collection('pendingTransactions').insertOne({
        username,
        referenceid,
        type,
        amount,
        status: 'PENDING',
        createdAt: new Date()
      });
    }

    // Send result to client
    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error in /transfer endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});


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
const stringToHash = `${amount}${OPERATOR_CODE}${plainPassword}${PROVIDER_CODE}${referenceid}${type}${deposit.username}${SECRET_KEY}`;
const signature = crypto.createHash('md5').update(stringToHash).digest('hex').toUpperCase();

// Construct transfer URL
const transferUrl = `${API_URL}/makeTransfer.aspx?operatorcode=${OPERATOR_CODE}&providercode=${PROVIDER_CODE}&username=${deposit.username}&password=${plainPassword}&referenceid=${referenceid}&type=${type}&amount=${amount}&signature=${signature}`;

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
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
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
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
}
// Start the proxy server
app.listen(PROXY_PORT, () => {
  const ip = getLocalIP();
  console.log(`Proxy server running on http://${ip}:${PROXY_PORT}`);

});






