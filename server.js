const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let gridActive = false;
let lastBuyPrice = null;
const gridPercent = 1.2;
const intervalMs = 10000;

function getTimestamp() {
  return Date.now().toString();
}

function signRequest(timestamp, method, endpoint, body, secretKey) {
  const preSign = timestamp + method.toUpperCase() + endpoint + body;
  return crypto.createHmac('sha256', secretKey).update(preSign).digest('hex');
}

async function getPrice() {
  const res = await fetch('https://api.bitget.com/api/spot/v1/market/ticker?symbol=BTCUSDT_SPBL');
  const data = await res.json();
  return parseFloat(data.data.close);
}

async function placeOrder(side, amount, apiKey, secretKey, passphrase) {
  const endpoint = '/api/spot/v1/trade/orders';
  const timestamp = getTimestamp();
  const body = JSON.stringify({
    symbol: 'BTCUSDT_SPBL',
    side: side,
    orderType: 'market',
    size: amount.toString()
  });

  const sign = signRequest(timestamp, 'POST', endpoint, body, secretKey);
  const headers = {
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  };

  const res = await fetch('https://api.bitget.com' + endpoint, {
    method: 'POST',
    headers,
    body
  });

  return await res.json();
}

async function getBalanceFromBitget(apiKey, secretKey, passphrase) {
  const timestamp = getTimestamp();
  const endpoint = '/api/spot/v1/account/assets';
  const sign = signRequest(timestamp, 'GET', endpoint, '', secretKey);

  const headers = {
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase
  };

  const response = await fetch('https://api.bitget.com' + endpoint, {
    method: 'GET',
    headers
  });

  return await response.json();
}

async function runGrid(danaAwal, apiKey, secretKey, passphrase) {
  const usdtPerTrade = danaAwal / 5;
  console.log('Infinity Grid Spot dimulai...');
  lastBuyPrice = null;

  while (gridActive) {
    try {
      const harga = await getPrice();
      console.log('Harga BTC:', harga);

      if (!lastBuyPrice) {
        console.log('Melakukan pembelian pertama...');
        const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
        console.log('Order beli:', res);
        lastBuyPrice = harga;
      } else {
        const targetBuy = lastBuyPrice * (1 - gridPercent / 100);
        const targetSell = lastBuyPrice * (1 + gridPercent / 100);

        if (harga <= targetBuy) {
          console.log('Harga turun, beli lagi');
          const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
          console.log('Order beli:', res);
          lastBuyPrice = harga;
        } else if (harga >= targetSell) {
          console.log('Harga naik, jual sebagian');
          const res = await placeOrder('sell', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
          console.log('Order jual:', res);
          lastBuyPrice = harga;
        } else {
          console.log('Harga belum melewati grid, menunggu...');
        }
      }
    } catch (e) {
      console.error('Error loop grid:', e.message);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.log('Grid spot dihentikan.');
}

// Start Grid
app.post('/start-grid', (req, res) => {
  const { apiKey, apiSecret, passphrase, dana } = req.body;
  if (!apiKey || !apiSecret || !passphrase || !dana) {
    return res.status(400).json({ error: 'Lengkapi semua data: API key, secret, passphrase, dana' });
  }

  if (gridActive) return res.json({ status: 'Bot sudah aktif' });

  gridActive = true;
  runGrid(dana, apiKey, apiSecret, passphrase);
  res.json({ status: 'Infinity Grid Spot dimulai', dana });
});

// Stop Grid
app.post('/stop-grid', (req, res) => {
  gridActive = false;
  res.json({ status: 'Bot dihentikan' });
});

// Get Balance
app.post('/get-balance', async (req, res) => {
  const { apiKey, apiSecret, passphrase } = req.body;
  if (!apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ code: 1, msg: 'API credentials missing' });
  }

  try {
    const result = await getBalanceFromBitget(apiKey, apiSecret, passphrase);
    res.json({ code: 0, data: result.data });
  } catch (e) {
    res.status(500).json({ code: 2, msg: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
