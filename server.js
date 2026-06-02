const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'ADMIN_SECRET_123';
const API_KEY = "y6qNrfP7R0qJUh1x";

// TronGrid Configuration
const TRONGRID_API = "https://api.trongrid.io";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const YOUR_WALLET = "TJBMedguebbWDtbVR9tYjBg3kb6NjMZWwg";

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ============================================================
// DATABASE (In-Memory - Replace with PostgreSQL for production)
// ============================================================
const users = [];
const deposits = [];
const withdrawals = [];
const bets = [];
const transactions = [];
const referrals = [];

let nextUserId = 1;
let nextDepositId = 1;
let nextWithdrawalId = 1;
let nextBetId = 1;
let nextTxId = 1;

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function generateReferralCode() {
    return 'REF_' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ============================================================
// USER REGISTRATION & LOGIN (with JWT & Referral)
// ============================================================

app.post('/api/register', async (req, res) => {
    const { username, email, password, confirmPassword, referralCode } = req.body;
    
    if (!username || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields required' });
    }
    
    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = users.find(u => u.email === email || u.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newReferralCode = generateReferralCode();
    
    let referredBy = null;
    if (referralCode) {
        const referrer = users.find(u => u.referralCode === referralCode);
        if (referrer) {
            referredBy = referrer.id;
            // Give referrer 10% bonus on first deposit (handled later)
        }
    }
    
    const newUser = {
        id: nextUserId++,
        username,
        email,
        password: hashedPassword,
        balance: 1000, // Signup bonus
        referralCode: newReferralCode,
        referredBy,
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
    
    // Generate JWT token
    const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
        success: true, 
        token,
        user: { 
            id: newUser.id, 
            username: newUser.username, 
            email: newUser.email, 
            balance: newUser.balance,
            referralCode: newUser.referralCode
        }
    });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
        success: true, 
        token,
        user: { 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            balance: user.balance,
            referralCode: user.referralCode,
            isAdmin: user.isAdmin || false
        }
    });
});

// Verify token middleware
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

app.get('/api/me', verifyToken, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        balance: user.balance,
        referralCode: user.referralCode,
        isAdmin: user.isAdmin || false
    });
});

// ============================================================
// REFERRAL SYSTEM
// ============================================================

app.get('/api/referral-stats', verifyToken, (req, res) => {
    const user = users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const referredUsers = users.filter(u => u.referredBy === user.id);
    const totalReferrals = referredUsers.length;
    const totalCommission = transactions
        .filter(t => t.userId === user.id && t.type === 'referral_commission')
        .reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
        referralCode: user.referralCode,
        totalReferrals,
        totalCommission,
        referralLink: `https://go-f55z.onrender.com/?ref=${user.referralCode}`
    });
});

// ============================================================
// DEPOSIT (Manual & TronGrid)
// ============================================================

app.post('/api/manual-deposit', (req, res) => {
    const { userId, amount, txid, adminKey } = req.body;
    
    if (adminKey !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.balance += amount;
    
    // Give referral commission (10% of deposit)
    if (user.referredBy) {
        const referrer = users.find(u => u.id === user.referredBy);
        if (referrer) {
            const commission = amount * 0.1;
            referrer.balance += commission;
            transactions.push({
                id: nextTxId++,
                userId: referrer.id,
                type: 'referral_commission',
                amount: commission,
                status: 'completed',
                description: `Commission from deposit of user ${user.username}`,
                timestamp: new Date().toISOString()
            });
        }
    }
    
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
        description: `Deposit - TXID: ${deposit.txid}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, newBalance: user.balance });
});

// TronGrid webhook endpoint
app.post('/api/tron-webhook', async (req, res) => {
    try {
        const { transaction_id, from, to, amount, contract_ret } = req.body;
        
        if (to.toLowerCase() !== YOUR_WALLET.toLowerCase()) {
            return res.status(200).json({ received: false, reason: 'Not my wallet' });
        }
        
        const existingDeposit = deposits.find(d => d.txid === transaction_id);
        if (existingDeposit) {
            return res.status(200).json({ received: true, already_processed: true });
        }
        
        const pendingDeposit = {
            id: nextDepositId++,
            userId: null,
            amount: parseFloat(amount) / 1e6,
            txid: transaction_id,
            fromAddress: from,
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        deposits.push(pendingDeposit);
        
        console.log(`💰 New USDT Deposit: ${amount} USDT from ${from}`);
        console.log(`   TXID: ${transaction_id}`);
        
        res.json({ received: true, pending: true });
        
    } catch (error) {
        console.error('TronGrid webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pending-deposits', (req, res) => {
    const pending = deposits.filter(d => d.status === 'pending');
    res.json(pending);
});

app.post('/api/assign-deposit', (req, res) => {
    const { depositId, userId, adminKey } = req.body;
    
    if (adminKey !== ADMIN_SECRET) {
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
    
    // Give referral commission
    if (user.referredBy) {
        const referrer = users.find(u => u.id === user.referredBy);
        if (referrer) {
            const commission = deposit.amount * 0.1;
            referrer.balance += commission;
            transactions.push({
                id: nextTxId++,
                userId: referrer.id,
                type: 'referral_commission',
                amount: commission,
                status: 'completed',
                description: `Commission from deposit of user ${user.username}`,
                timestamp: new Date().toISOString()
            });
        }
    }
    
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
// WITHDRAWAL (Auto via TronGrid)
// ============================================================

app.post('/api/withdraw-request', verifyToken, async (req, res) => {
    const { amount, walletAddress } = req.body;
    const user = users.find(u => u.id === req.userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (amount > user.balance) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    if (amount < 10) {
        return res.status(400).json({ error: 'Minimum withdrawal is 10 USDT' });
    }
    
    // For auto-withdrawal via TronGrid (requires private key)
    // This creates a pending withdrawal for admin approval (safety)
    const withdrawal = {
        id: nextWithdrawalId++,
        userId: user.id,
        amount,
        walletAddress,
        status: 'pending',
        timestamp: new Date().toISOString()
    };
    withdrawals.push(withdrawal);
    
    transactions.push({
        id: nextTxId++,
        userId: user.id,
        type: 'withdrawal_request',
        amount,
        status: 'pending',
        description: `Withdrawal request to ${walletAddress}`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Withdrawal request submitted', requestId: withdrawal.id });
});

app.post('/api/approve-withdrawal', (req, res) => {
    const { withdrawalId, adminKey } = req.body;
    
    if (adminKey !== ADMIN_SECRET) {
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

// ============================================================
// BETS
// ============================================================

app.post('/api/place-bet', verifyToken, (req, res) => {
    const { bets: betSelections, totalStake, totalOdds } = req.body;
    const user = users.find(u => u.id === req.userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (totalStake > user.balance) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    user.balance -= totalStake;
    
    const betRecord = {
        id: nextBetId++,
        userId: user.id,
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
        userId: user.id,
        type: 'bet',
        amount: totalStake,
        status: 'completed',
        description: `Parlay bet: ${betSelections.length} selections @ ${totalOdds}x`,
        timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, newBalance: user.balance, betId: betRecord.id });
});

app.get('/api/user-bets', verifyToken, (req, res) => {
    const userBets = bets.filter(b => b.userId === req.userId);
    res.json(userBets);
});

app.get('/api/user-transactions', verifyToken, (req, res) => {
    const userTransactions = transactions.filter(t => t.userId === req.userId);
    res.json(userTransactions);
});

// ============================================================
// ADMIN PANEL DATA
// ============================================================

app.get('/api/admin/users', (req, res) => {
    const usersData = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        balance: u.balance,
        referralCode: u.referralCode,
        referredBy: u.referredBy,
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
    console.log(`🔑 Admin secret: ${ADMIN_SECRET}`);
    console.log(`💰 USDT Wallet: ${YOUR_WALLET}`);
    console.log(`📡 TronGrid webhook: https://your-app.onrender.com/api/tron-webhook`);
});
