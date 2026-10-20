const pool = require('../config/db');

/**
 * POST /api/seller/products — cadastra produto vinculado à loja do lojista.
 */
async function createProduct(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const price = Number(req.body.price);
    const stock = parseInt(req.body.stock, 10);
    const categoryId = req.body.category_id ? parseInt(req.body.category_id, 10) : null;

    if (!name) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'Preço inválido.' });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Estoque inválido.' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const [result] = await pool.execute(
      `INSERT INTO products (store_id, category_id, name, description, price, stock, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.storeId, categoryId, name, description || null, price, stock, imageUrl]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Produto cadastrado no Looma Hub.',
      product: rows[0]
    });
  } catch (err) {
    console.error('[product] createProduct:', err.message);
    return res.status(500).json({ error: 'Não foi possível cadastrar o produto.' });
  }
}

/**
 * GET /api/seller/products — lista produtos da loja logada.
 */
async function listSellerProducts(req, res) {
  try {
    const [products] = await pool.execute(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = ?
       ORDER BY p.created_at DESC`,
      [req.storeId]
    );

    return res.json({ products });
  } catch (err) {
    console.error('[product] listSellerProducts:', err.message);
    return res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
}

/**
 * PUT /api/seller/products/:id — edita produto da própria loja (isolamento por store_id).
 */
async function updateProduct(req, res) {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const [existing] = await pool.execute(
      'SELECT * FROM products WHERE id = ? AND store_id = ? LIMIT 1',
      [productId, req.storeId]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Produto não encontrado na sua loja.' });
    }

    const current = existing[0];
    const name = req.body.name !== undefined ? String(req.body.name).trim() : current.name;
    const description = req.body.description !== undefined
      ? String(req.body.description).trim()
      : current.description;
    const price = req.body.price !== undefined ? Number(req.body.price) : Number(current.price);
    const stock = req.body.stock !== undefined ? parseInt(req.body.stock, 10) : current.stock;
    const categoryId = req.body.category_id !== undefined
      ? (req.body.category_id ? parseInt(req.body.category_id, 10) : null)
      : current.category_id;
    const isActive = req.body.is_active !== undefined
      ? (req.body.is_active === true || req.body.is_active === '1' || req.body.is_active === 1 ? 1 : 0)
      : current.is_active;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : current.image_url;

    if (!name) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'Preço inválido.' });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Estoque inválido.' });
    }

    await pool.execute(
      `UPDATE products
       SET name = ?, description = ?, price = ?, stock = ?, category_id = ?, image_url = ?, is_active = ?
       WHERE id = ? AND store_id = ?`,
      [name, description || null, price, stock, categoryId, imageUrl, isActive, productId, req.storeId]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE id = ? AND store_id = ?',
      [productId, req.storeId]
    );

    return res.json({ message: 'Produto atualizado.', product: rows[0] });
  } catch (err) {
    console.error('[product] updateProduct:', err.message);
    return res.status(500).json({ error: 'Não foi possível atualizar o produto.' });
  }
}

/**
 * DELETE /api/seller/products/:id — remove produto da própria loja.
 */
async function deleteProduct(req, res) {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      return res.status(400).json({ error: 'ID inválido.' });
    }

    const [result] = await pool.execute(
      'DELETE FROM products WHERE id = ? AND store_id = ?',
      [productId, req.storeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado na sua loja.' });
    }

    return res.json({ message: 'Produto removido.' });
  } catch (err) {
    console.error('[product] deleteProduct:', err.message);
    return res.status(500).json({ error: 'Não foi possível remover o produto.' });
  }
}

/**
 * GET /api/products — vitrine pública com busca e categoria.
 */
async function listPublicProducts(req, res) {
  try {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const params = [];
    let sql = `
      SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, p.created_at,
             s.id AS store_id, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo,
             c.name AS category_name, c.slug AS category_slug
      FROM products p
      INNER JOIN stores s ON s.id = p.store_id AND s.status = 'ACTIVE'
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND p.stock > 0
    `;

    if (search) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR s.name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (category) {
      sql += ' AND c.slug = ?';
      params.push(category);
    }

    sql += ' ORDER BY p.created_at DESC LIMIT 100';

    const [products] = await pool.execute(sql, params);
    return res.json({ products });
  } catch (err) {
    console.error('[product] listPublicProducts:', err.message);
    return res.status(500).json({ error: 'Erro ao listar produtos da Looma.' });
  }
}

/**
 * GET /api/products/:id — detalhe público de um produto.
 */
async function getPublicProduct(req, res) {
  try {
    const productId = parseInt(req.params.id, 10);
    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, p.created_at,
              s.id AS store_id, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo,
              c.name AS category_name
       FROM products p
       INNER JOIN stores s ON s.id = p.store_id AND s.status = 'ACTIVE'
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1
       LIMIT 1`,
      [productId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    return res.json({ product: rows[0] });
  } catch (err) {
    console.error('[product] getPublicProduct:', err.message);
    return res.status(500).json({ error: 'Erro ao carregar produto.' });
  }
}

/**
 * GET /api/categories — categorias globais.
 */
async function listCategories(_req, res) {
  try {
    const [categories] = await pool.execute(
      'SELECT id, name, slug FROM categories ORDER BY name ASC'
    );
    return res.json({ categories });
  } catch (err) {
    console.error('[product] listCategories:', err.message);
    return res.status(500).json({ error: 'Erro ao listar categorias.' });
  }
}

module.exports = {
  createProduct,
  listSellerProducts,
  updateProduct,
  deleteProduct,
  listPublicProducts,
  getPublicProduct,
  listCategories
};
