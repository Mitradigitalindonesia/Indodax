const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

app.post('/check-balance', async (req, res) => {
  const { apiKey, secretKey } = req.body;

  if (!apiKey || !secretKey) {
    return res.status(400).json({ error: 'Missing API keys' });
  }

  const nonce = Date.now().toString();
  const params = new URLSearchParams({ method: 'getInfo', nonce });
  const sign = crypto.createHmac('sha512', secretKey).update(params.toString()).digest('hex');

  try {
    const response = await fetch('https://indodax.com/tapi', {
      method: 'POST',
      headers: {
        Key: apiKey,
        Sign: sign,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));