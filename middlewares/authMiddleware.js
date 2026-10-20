const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Valida JWT no header Authorization: Bearer <token>
 * e injeta req.user = { id, email, role, name }.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'JWT_SECRET não configurado.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
      [payload.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('[auth] authenticate:', err.message);
    return res.status(500).json({ error: 'Erro ao validar autenticação.' });
  }
}

/**
 * Garante que o usuário possui loja ativa no Looma Hub
 * e injeta req.storeId / req.store.
 */
async function isSeller(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, name, slug, status, commission_rate
       FROM stores
       WHERE owner_id = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(403).json({
        error: 'Você precisa de uma loja ativa no Looma Hub para acessar este recurso.'
      });
    }

    req.store = rows[0];
    req.storeId = rows[0].id;
    next();
  } catch (err) {
    console.error('[auth] isSeller:', err.message);
    return res.status(500).json({ error: 'Erro ao verificar loja do lojista.' });
  }
}

module.exports = { authenticate, isSeller };
