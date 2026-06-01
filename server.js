const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "y6qNrfP7R0qJUh1x";

// TronGrid Configuration
const TRONGRID_API = "https://api.trongrid.io";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT (TRC-20) contract
const YOUR_WALLET = "TJBMedguebbWDtbVR9tYjBg3kb6NjMZWwg"; // Your receiving address

app.use(express.json());
app.use(express.static('public'));

// ============================================================
// DATABASE (In-Memory - For production use PostgreSQL)
// ============================================================
const users = [];
const deposits = [];
const withdrawals = [];
const bets = [];
const transactions = [];

let nextUserId = 1;
let nextDepositId = 1;
let nextWithdrawalId = 1;
let nextBetId = 1;
let nextTxId = 1;

// ============================================================
// USER REGISTRATION & LOGIN
// ============================================================

app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    const existingUser = users.find(u => u.email === email || u.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const newUser = {
        id: nextUserId++,
        username,
        email,
        password, // In production: hash with bcrypt
        balance: 1000, // Free signup bonus
        createdAt: new Date().toISOString(),
        isAdmin: email === 'admin@example.com'
    };
    
    users.push(newUser);
    
    // Record signup bonus transaction
    transactions.push({
        id: nextTxId++,
        userId: newUser.id,
        type: 'bonus',
        amount: 1000,
        status: 'completed',
        description: 'Signup bonus',
        timestamp: new Date().toISOString()
    });
    
    res.json({ 
        success: true, 
        user: { id: newUser.id, username: newUser.username, email: newUser.email, balance: newUser.balance }
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    res.json({ 
        success: true, 
        user: { 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            balance: user.balance, 
            isAdmin: user.isAdmin || false 
        }
    });
});

app.get('/api/user/:id', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id: user.id, username: user.username, email: user.email, balance: user.balance });
});

// ============================================================
// DEPOSIT (Manual & TronGrid)
// ============================================================

// Manual deposit (admin adds manually)
app.post('/api/manual-deposit', (req, res) => {
    const { userId, amount, txid, adminKey } = req.body;
    
    // Simple admin check (in production, use proper auth)
    if (adminKey !== 'ADMIN_SECRET_123') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.balance += amount;
    
    const deposit = {
        id: nextDepositId++,
        userId,
        amount,
        txid: txid || `MANUAL_${Date.now()}`,
        status: 'completed',
        timestamp: new Date().toISOString()
    };
    deposits.push(deposit);
    
    transactions.push({
        id: nextTxId++,
        userId,
        type: 'deposit',
        amount,
        status: 'completed',
        description: `Manual deposit - TXID: ${deposit.txid}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, newBalance: user.balance });
});

// TronGrid webhook endpoint (called by TronGrid when deposit arrives)
app.post('/api/tron-webhook', async (req, res) => {
    try {
        const { transaction_id, from, to, amount, contract_ret } = req.body;
        
        // Verify it's USDT and sent to your wallet
        if (to.toLowerCase() !== YOUR_WALLET.toLowerCase()) {
            return res.status(200).json({ received: false, reason: 'Not my wallet' });
        }
        
        // Check if already processed
        const existingDeposit = deposits.find(d => d.txid === transaction_id);
        if (existingDeposit) {
            return res.status(200).json({ received: true, already_processed: true });
        }
        
        // Find user by wallet address (you need to store wallet addresses per user)
        // For now, we'll need to associate wallet with user separately
        // This is simplified - in production, users must link their wallet first
        
        // For demo, we'll create a pending deposit for admin to assign
        const pendingDeposit = {
            id: nextDepositId++,
            userId: null, // Admin must assign
            amount: parseFloat(amount) / 1e6, // USDT has 6 decimals
            txid: transaction_id,
            fromAddress: from,
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        deposits.push(pendingDeposit);
        
        // Notify via console (in production, send email or store for admin)
        console.log(`💰 New USDT Deposit: ${amount} USDT from ${from}`);
        console.log(`   TXID: ${transaction_id}`);
        console.log(`   Pending assignment - Go to Admin Panel to assign to user`);
        
        res.json({ received: true, pending: true });
        
    } catch (error) {
        console.error('TronGrid webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get pending deposits (for admin)
app.get('/api/pending-deposits', (req, res) => {
    const pending = deposits.filter(d => d.status === 'pending');
    res.json(pending);
});

// Assign pending deposit to user (admin)
app.post('/api/assign-deposit', (req, res) => {
    const { depositId, userId, adminKey } = req.body;
    
    if (adminKey !== 'ADMIN_SECRET_123') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const deposit = deposits.find(d => d.id === depositId);
    if (!deposit) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    deposit.userId = userId;
    deposit.status = 'completed';
    user.balance += deposit.amount;
    
    transactions.push({
        id: nextTxId++,
        userId,
        type: 'deposit',
        amount: deposit.amount,
        status: 'completed',
        description: `USDT Deposit - TXID: ${deposit.txid}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, newBalance: user.balance });
});

// ============================================================
// WITHDRAWAL
// ============================================================

app.post('/api/withdraw-request', (req, res) => {
    const { userId, amount, walletAddress } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (amount > user.balance) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    if (amount < 10) {
        return res.status(400).json({ error: 'Minimum withdrawal is 10 USDT' });
    }
    
    // Create withdrawal request (pending approval)
    const withdrawal = {
        id: nextWithdrawalId++,
        userId,
        amount,
        walletAddress,
        status: 'pending',
        timestamp: new Date().toISOString()
    };
    withdrawals.push(withdrawal);
    
    transactions.push({
        id: nextTxId++,
        userId,
        type: 'withdrawal_request',
        amount,
        status: 'pending',
        description: `Withdrawal request to ${walletAddress}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Withdrawal request submitted', requestId: withdrawal.id });
});

// Approve withdrawal (admin)
app.post('/api/approve-withdrawal', (req, res) => {
    const { withdrawalId, adminKey } = req.body;
    
    if (adminKey !== 'ADMIN_SECRET_123') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const withdrawal = withdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) {
        return res.status(404).json({ error: 'Withdrawal not found' });
    }
    
    if (withdrawal.status !== 'pending') {
        return res.status(400).json({ error: 'Withdrawal already processed' });
    }
    
    const user = users.find(u => u.id === withdrawal.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Deduct balance (already deducted when request was made? No, deduct now)
    // For safety, deduct at approval time
    if (user.balance < withdrawal.amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    user.balance -= withdrawal.amount;
    withdrawal.status = 'approved';
    
    transactions.push({
        id: nextTxId++,
        userId: withdrawal.userId,
        type: 'withdrawal',
        amount: withdrawal.amount,
        status: 'completed',
        description: `Withdrawal to ${withdrawal.walletAddress}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
});

// Reject withdrawal (admin)
app.post('/api/reject-withdrawal', (req, res) => {
    const { withdrawalId, adminKey } = req.body;
    
    if (adminKey !== 'ADMIN_SECRET_123') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const withdrawal = withdrawals.find(w => w.id === withdrawalId);
    if (!withdrawal) {
        return res.status(404).json({ error: 'Withdrawal not found' });
    }
    
    withdrawal.status = 'rejected';
    
    transactions.push({
        id: nextTxId++,
        userId: withdrawal.userId,
        type: 'withdrawal_rejected',
        amount: withdrawal.amount,
        status: 'rejected',
        description: `Withdrawal rejected`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true });
});

// ============================================================
// BETS & TRANSACTIONS
// ============================================================

app.post('/api/place-bet', (req, res) => {
    const { userId, bets: betSelections, totalStake, totalOdds } = req.body;
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (totalStake > user.balance) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    user.balance -= totalStake;
    
    const betRecord = {
        id: nextBetId++,
        userId,
        selections: betSelections,
        totalStake,
        totalOdds,
        potentialWin: totalStake * totalOdds,
        status: 'pending',
        timestamp: new Date().toISOString()
    };
    bets.push(betRecord);
    
    transactions.push({
        id: nextTxId++,
        userId,
        type: 'bet',
        amount: totalStake,
        status: 'completed',
        description: `Parlay bet: ${betSelections.length} selections @ ${totalOdds}x`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, newBalance: user.balance, betId: betRecord.id });
});

app.get('/api/user-bets/:userId', (req, res) => {
    const userBets = bets.filter(b => b.userId === parseInt(req.params.userId));
    res.json(userBets);
});

app.get('/api/user-transactions/:userId', (req, res) => {
    const userTransactions = transactions.filter(t => t.userId === parseInt(req.params.userId));
    res.json(userTransactions);
});

// ============================================================
// ADMIN PANEL DATA
// ============================================================

app.get('/api/admin/users', (req, res) => {
    // In production, add admin authentication
    const usersData = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        balance: u.balance,
        createdAt: u.createdAt
    }));
    res.json(usersData);
});

app.get('/api/admin/deposits', (req, res) => {
    res.json(deposits);
});

app.get('/api/admin/withdrawals', (req, res) => {
    res.json(withdrawals);
});

app.get('/api/admin/bets', (req, res) => {
    res.json(bets);
});

app.get('/api/admin/stats', (req, res) => {
    const totalUsers = users.length;
    const totalDeposits = deposits.reduce((sum, d) => sum + (d.status === 'completed' ? d.amount : 0), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + (w.status === 'approved' ? w.amount : 0), 0);
    const totalBets = bets.reduce((sum, b) => sum + b.totalStake, 0);
    
    res.json({
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        totalBets,
        pendingDeposits: deposits.filter(d => d.status === 'pending').length,
        pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length
    });
});

// ============================================================
// iSPORTS API PROXY
// ============================================================

app.get('/api/livescores', async (req, res) => {
    try {
        const url = `http://api.isportsapi.com/sport/football/livescores?api_key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔑 Admin secret: ADMIN_SECRET_123`);
    console.log(`💰 USDT Wallet: ${YOUR_WALLET}`);
    console.log(`📡 TronGrid webhook URL: https://your-app.onrender.com/api/tron-webhook`);
});
