// models/Deposit.js
const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    amount: { type: Number, required: true }, // in normal currency (not cents)
    money: { type: Number, required: true },  // in cents
    status: { type: String, default: 'pending' }, // pending, paid, failed
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Deposit', depositSchema);
