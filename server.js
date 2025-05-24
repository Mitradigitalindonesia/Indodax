const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// Ganti dengan API kamu sendiri ya
const API_KEY = 'bg_ea757446453d07d472f6e537b362d9f9';
const SECRET_KEY = '6f99c4d12fe2d2a57b96b22a25ac3a4cd97eb3cf5393c4c112da9a9f659ade52';
const PASSPHRASE = 'Barokah99';

let gridActive = false;
let lastBuyPrice = null;
const gridPercent = 1.2;
const intervalMs = 10000;

async function getPrice() {
  const res = await fetch('https://api.bitget.com/api/spot/v1/market/ticker?symbol=BTCUSDT_SPBL');
  const data = await res.json();
  return parseFloat(data.data.close);
}

function getTimestamp() {
  return Date.now().toString();
}

function signRequest(timestamp, method, endpoint, body = '') {
  const preSign = timestamp + method.toUpperCase() + endpoint + body;
  return crypto.createHmac('sha256', SECRET_KEY).update(preSign).digest('hex');
}

async function placeOrder(side, amount) {
  const endpoint = '/api/spot/v1/trade/orders';
  const timestamp = getTimestamp();
  const body = JSON.stringify({
    symbol: 'BTCUSDT_SPBL',
    side: side,
    orderType: 'market',
    size: amount.toString()
  });

  const sign = signRequest(timestamp, 'POST', endpoint, body);
  const headers = {
    'ACCESS-KEY': API_KEY,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': PASSPHRASE,
    'Content-Type': 'application/json'
  };

  const res = await fetch('https://api.bitget.com' + endpoint, {
    method: 'POST',
    headers,
    body
  });

  const result = await res.json();
  return result;
}

async function getBalanceFromBitget() {
  const timestamp = getTimestamp();
  const endpoint = '/api/spot/v1/account/assets';
  const sign = signRequest(timestamp, 'GET', endpoint);

  const headers = {
    'ACCESS-KEY': API_KEY,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': PASSPHRASE
  };

  const response = await fetch('https://api.bitget.com' + endpoint, {
    method: 'GET',
    headers
  });

  const result = await response.json();
  return result;
}

async function runGrid(danaAwal) {
  const usdtPerTrade = danaAwal / 5;
  console.log('Infinity Grid Spot dimulai...');
  lastBuyPrice = null;

  while (gridActive) {
    try {
      const harga = await getPrice();
      console.log('Harga BTC:', harga);

      if (!lastBuyPrice) {
        console.log('Melakukan pembelian pertama...');
        const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6));
        console.log('Order beli:', res);
        lastBuyPrice = harga;
      } else {
        const targetBuy = lastBuyPrice * (1 - gridPercent / 100);
        const targetSell = lastBuyPrice * (1 + gridPercent / 100);

        if (harga <= targetBuy) {
          console.log('Harga turun, beli lagi');
          const res = await placeOrder('buy', (usdtPerTrade / harga).toFixed(6));
          console.log('Order beli:', res);
          lastBuyPrice = harga;
        } else if (harga >= targetSell) {
          console.log('Harga naik, jual sebagian');
          const res = await placeOrder('sell', (usdtPerTrade / harga).toFixed(6));
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

app.post('/start-grid', (req, res) => {
  const { dana } = req.body;
  if (gridActive) return res.json({ status: 'Bot sudah aktif' });

  gridActive = true;
  runGrid(dana);
  res.json({ status: 'Infinity Grid Spot dimulai', dana });
});

app.post('/stop-grid', (req, res) => {
  gridActive = false;
  res.json({ status: 'Bot dihentikan' });
});

app.get('/get-balance', async (req, res) => {
  try {
    const result = await getBalanceFromBitget();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Gagal ambil saldo', message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
