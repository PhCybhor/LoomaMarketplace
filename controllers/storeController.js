const pool = require('../config/db');
const { slugify } = require('../utils/slugify');

/**
 * POST /api/stores — abre loja no Looma Hub, vira SELLER e cria carteira Looma Pay.
 */
async function createStore(req, res) {
  const conn = await pool.getConnection();
  try {
    const name = String(req.body.name || '').trim();
    const document = String(req.body.document || '').replace(/\D/g, '');
    const description = String(req.body.description || '').trim();

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Informe o nome da loja.' });
    }
    if (document.length < 11 || document.length > 14) {
      return res.status(400).json({ error: 'Informe um CPF ou CNPJ válido.' });
    }

    const [existing] = await conn.execute(
      'SELECT id FROM stores WHERE owner_id = ? LIMIT 1',
      [req.user.id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Você já possui uma loja na Looma.' });
    }

    let slug = slugify(name);
    if (!slug) {
      return res.status(400).json({ error: 'Nome da loja inválido para gerar URL.' });
    }

    const [slugRows] = await conn.execute(
      'SELECT id FROM stores WHERE slug = ? LIMIT 1',
      [slug]
    );
    if (slugRows.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const logoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await conn.beginTransaction();

    const [storeResult] = await conn.execute(
      `INSERT INTO stores (owner_id, name, slug, document, description, logo_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [req.user.id, name, slug, document, description || null, logoUrl]
    );

    const storeId = storeResult.insertId;

    await conn.execute(
      'INSERT INTO wallets (store_id, balance) VALUES (?, 0.00)',
      [storeId]
    );

    await conn.execute(
      `UPDATE users SET role = 'SELLER' WHERE id = ?`,
      [req.user.id]
    );

    await conn.commit();

    const [stores] = await pool.execute(
      `SELECT id, name, slug, document, description, logo_url, status, commission_rate, created_at
       FROM stores WHERE id = ?`,
      [storeId]
    );

    return res.status(201).json({
      message: 'Loja criada com sucesso no Looma Hub. Carteira Looma Pay ativada.',
      store: stores[0]
    });
  } catch (err) {
    await conn.rollback();
    console.error('[store] createStore:', err.message);
    return res.status(500).json({ error: 'Não foi possível criar a loja.' });
  } finally {
    conn.release();
  }
}

/**
 * GET /api/stores/me — loja do usuário logado + saldo Looma Pay.
 */
async function getMyStore(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT s.id, s.name, s.slug, s.document, s.description, s.logo_url,
              s.status, s.commission_rate, s.created_at,
              COALESCE(w.balance, 0) AS wallet_balance
       FROM stores s
       LEFT JOIN wallets w ON w.store_id = s.id
       WHERE s.owner_id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Você ainda não abriu uma loja na Looma.' });
    }

    return res.json({ store: rows[0] });
  } catch (err) {
    console.error('[store] getMyStore:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar sua loja.' });
  }
}

/**
 * GET /api/stores/:slug — vitrine pública da loja + produtos ativos.
 */
async function getStoreBySlug(req, res) {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();

    const [stores] = await pool.execute(
      `SELECT id, name, slug, description, logo_url, status, created_at
       FROM stores
       WHERE slug = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [slug]
    );

    if (!stores.length) {
      return res.status(404).json({ error: 'Loja não encontrada na Looma.' });
    }

    const store = stores[0];

    const [products] = await pool.execute(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, p.created_at,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = ? AND p.is_active = 1
       ORDER BY p.created_at DESC`,
      [store.id]
    );

    return res.json({ store, products });
  } catch (err) {
    console.error('[store] getStoreBySlug:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar a loja.' });
  }
}

module.exports = { createStore, getMyStore, getStoreBySlug };
