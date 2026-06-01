const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = "y6qNrfP7R0qJUh1x";

app.use(express.static('public'));

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

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
