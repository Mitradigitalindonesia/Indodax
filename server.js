const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bitget Balance API is running');
});

app.post('/check-balance', async (req, res) => {
  const { apiKey, apiSecret, passphrase } = req.body;

  if (!apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ error: 'Missing API credentials' });
  }

  const timestamp = new Date().toISOString();
  const method = 'GET';
  const requestPath = '/api/spot/v1/account/assets';
  const prehash = timestamp + method + requestPath;

  const sign = crypto.createHmac('sha256', apiSecret)
                     .update(prehash)
                     .digest('base64');

  try {
    const response = await fetch('https://api.bitget.com' + requestPath, {
      method,
      headers: {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': sign,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bitget API server running on port ${port}`));
