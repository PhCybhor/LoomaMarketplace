const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register — cadastra BUYER por padrão.
 */
async function register(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Informe um nome válido.' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado na Looma.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, 'BUYER')`,
      [name, email, passwordHash]
    );

    const user = {
      id: result.insertId,
      name,
      email,
      role: 'BUYER'
    };

    const token = signToken(user);
    return res.status(201).json({
      message: 'Conta criada com sucesso na Looma.',
      token,
      user
    });
  } catch (err) {
    console.error('[auth] register:', err.message);
    return res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
}

/**
 * POST /api/auth/login — retorna JWT e dados básicos.
 */
async function login(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const userRow = rows[0];
    const match = await bcrypt.compare(password, userRow.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role
    };

    const token = signToken(user);
    return res.json({
      message: 'Login realizado com sucesso.',
      token,
      user
    });
  } catch (err) {
    console.error('[auth] login:', err.message);
    return res.status(500).json({ error: 'Não foi possível autenticar.' });
  }
}

/**
 * GET /api/auth/me — perfil do usuário autenticado + loja se existir.
 */
async function me(req, res) {
  try {
    const [stores] = await pool.execute(
      `SELECT id, name, slug, document, description, logo_url, status, commission_rate, created_at
       FROM stores WHERE owner_id = ? LIMIT 1`,
      [req.user.id]
    );

    return res.json({
      user: req.user,
      store: stores[0] || null
    });
  } catch (err) {
    console.error('[auth] me:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar perfil.' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { register, login, me };
