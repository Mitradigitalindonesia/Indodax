const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let gridActive = false;
let lastBuyPrice = null;
const gridPercent = 1.2;
const intervalMs = 10000;

function getTimestamp() {
  return Date.now().toString();
}

function signRequest(timestamp, method, endpoint, body = '', secretKey) {
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
        console.log('Pembelian pertama...');
        const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
        console.log('Order beli:', res);
        lastBuyPrice = harga;
      } else {
        const targetBuy = lastBuyPrice * (1 - gridPercent / 100);
        const targetSell = lastBuyPrice * (1 + gridPercent / 100);

        if (harga <= targetBuy) {
          const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
          console.log('Order beli grid:', res);
          lastBuyPrice = harga;
        } else if (harga >= targetSell) {
          const res = await placeOrder('sell', (usdtPerTrade / harga).toFixed(6), apiKey, secretKey, passphrase);
          console.log('Order jual grid:', res);
          lastBuyPrice = harga;
        } else {
          console.log('Harga dalam grid. Menunggu...');
        }
      }
    } catch (e) {
      console.error('Error loop grid:', e.message);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.log('Bot dihentikan.');
}

app.post('/start-grid', (req, res) => {
  const { dana, apiKey, apiSecret, passphrase } = req.body;
  if (!dana || !apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ error: 'Lengkapi semua input' });
  }

  if (gridActive) return res.json({ status: 'Bot sudah aktif' });

  gridActive = true;
  runGrid(dana, apiKey, apiSecret, passphrase);
  res.json({ status: 'Bot dimulai', dana });
});

app.post('/stop-grid', (req, res) => {
  gridActive = false;
  res.json({ status: 'Bot dihentikan' });
});

app.post('/get-balance', async (req, res) => {
  const { apiKey, apiSecret, passphrase } = req.body;
  if (!apiKey || !apiSecret || !passphrase) {
    return res.status(400).json({ error: 'API credentials missing' });
  }

  try {
    const result = await getBalanceFromBitget(apiKey, apiSecret, passphrase);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Gagal ambil saldo', message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
