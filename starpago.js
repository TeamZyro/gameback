// starpago.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const STARPAGO_CONFIG = {
  appKey: process.env.STARPAGO_APP_KEY || 'c8da3307f66655642e2f6e7beaf970d5',
  appSecret: process.env.STARPAGO_APP_SECRET || '79254ac07096e6f58a5767047ea19a64',
  baseUrl: process.env.STARPAGO_API_URL || 'https://api.simplypay.vip', // Change for production
};

/**
 * Generate StarPago signature
 * Steps:
 * 1. Sort all parameters alphabetically by key
 * 2. Concatenate as key=value&key2=value2...
 * 3. Append appSecret at the end
 * 4. SHA256 → Uppercase Hex
 */
function generateSignature(params) {
  const sortedKeys = Object.keys(params).sort();
  const signStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + STARPAGO_CONFIG.appSecret;
  
  return crypto.createHash('sha256').update(signStr, 'utf8').digest('hex').toUpperCase();
}

/**
 * Send request to StarPago API
 * @param {string} path - API endpoint (e.g., /gateway/pay)
 * @param {object} params - Request parameters
 */
async function sendRequest(path, params) {
  const signedParams = {
    ...params,
    appKey: STARPAGO_CONFIG.appKey,
    timestamp: Date.now(),
  };
  signedParams.sign = generateSignature(signedParams);

  const response = await fetch(`${STARPAGO_CONFIG.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedParams),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

module.exports = {
  sendRequest,
  generateSignature,
  config: STARPAGO_CONFIG
};
