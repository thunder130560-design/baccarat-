const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "y6qNrfP7R0qJUh1x";

app.use(express.json());
app.use(express.static('public'));

// ============================================================
// DATABASE (In-Memory for now - will reset on restart)
// For production, replace with PostgreSQL
// ============================================================
const users = [];
const deposits = [];
const withdrawals = [];
const bets = [];

let nextUserId = 1;
let nextDepositId = 1;
let nextWithdrawalId = 1;
let nextBetId = 1;

// ============================================================
// USER REGISTRATION & LOGIN
// ============================================================

// Register new user
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
        password, // In production, hash this with bcrypt
        balance: 1000, // Free signup bonus
        createdAt: new Date().toISOString(),
        isAdmin: email === 'admin@example.com' // First admin user
    };
    
    users.push(newUser);
    
    res.json({ 
        success: true, 
        user: { id: newUser.id, username: newUser.username, email: newUser.email, balance: newUser.balance }
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    res.json({ 
        success: true, 
        user: { id: user.id, username: user.username, email: user.email, balance: user.balance, isAdmin: user.isAdmin || false }
    });
});

// Get user by ID
app.get('/api/user/:id', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id: user.id, username: user.username, email: user.email, balance: user.balance });
});

// Update user balance
app.post('/api/update-balance', (req, res) => {
    const { userId, amount, reason } = req.body
