const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Garante que a pasta de uploads exista na Hostinger
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middlewares Globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do Frontend da Looma e Imagens
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API Looma
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/stores', require('./routes/storeRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/seller', require('./routes/sellerRoutes'));
app.use('/api', require('./routes/orderRoutes'));

// Rota amigável da loja: /loja/:slug
app.get('/loja/:slug', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'loja.html'));
});

// Healthcheck Hostinger
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'online',
    platform: 'Looma Marketplace',
    slogan: 'Onde todas as lojas se conectam',
    modules: ['Looma Storefront', 'Looma Hub (Seller)', 'Looma Pay (Split)']
  });
});

// Erro de upload (multer)
app.use((err, _req, res, next) => {
  if (err instanceof Error && err.message.includes('imagens')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Arquivo muito grande (máx. 5MB).' });
  }
  return next(err);
});

// Porta dinâmica exigida pelo Phusion Passenger / Node.js da Hostinger
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Looma Marketplace rodando na porta ${PORT}`);
});
