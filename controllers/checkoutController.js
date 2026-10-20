const pool = require('../config/db');

const ALLOWED_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/**
 * Taxa padrão da plataforma Looma (10%). Configurável via LOOMA_PLATFORM_FEE.
 */
function getPlatformFeeRate() {
  const fee = Number(process.env.LOOMA_PLATFORM_FEE);
  return Number.isFinite(fee) && fee >= 0 && fee < 1 ? fee : 0.1;
}

/**
 * POST /api/checkout — carrinho único com order splitting e crédito Looma Pay.
 */
async function checkout(req, res) {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const shippingAddress = String(req.body.shipping_address || '').trim();

  if (!items.length) {
    return res.status(400).json({ error: 'O carrinho está vazio.' });
  }
  if (!shippingAddress || shippingAddress.length < 10) {
    return res.status(400).json({ error: 'Informe um endereço de entrega completo.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const feeRate = getPlatformFeeRate();
    /** @type {Map<number, { storeId: number, items: Array, subtotal: number }>} */
    const byStore = new Map();
    let orderTotal = 0;

    for (const raw of items) {
      const productId = parseInt(raw.product_id, 10);
      const quantity = parseInt(raw.quantity, 10);

      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        throw Object.assign(new Error('Item do carrinho inválido.'), { status: 400 });
      }

      const [rows] = await conn.execute(
        `SELECT id, store_id, price, stock, name, is_active
         FROM products
         WHERE id = ?
         FOR UPDATE`,
        [productId]
      );

      if (!rows.length || !rows[0].is_active) {
        throw Object.assign(new Error(`Produto #${productId} indisponível.`), { status: 400 });
      }

      const product = rows[0];
      if (product.stock < quantity) {
        throw Object.assign(
          new Error(`Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`),
          { status: 400 }
        );
      }

      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [quantity, productId]
      );

      const unitPrice = Number(product.price);
      const lineTotal = unitPrice * quantity;
      orderTotal += lineTotal;

      const storeId = product.store_id;
      if (!byStore.has(storeId)) {
        byStore.set(storeId, { storeId, items: [], subtotal: 0 });
      }
      const group = byStore.get(storeId);
      group.items.push({
        product_id: productId,
        quantity,
        unit_price: unitPrice
      });
      group.subtotal += lineTotal;
    }

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (buyer_id, total_amount, shipping_address, payment_status)
       VALUES (?, ?, ?, 'PAID')`,
      [req.user.id, orderTotal, shippingAddress]
    );
    const orderId = orderResult.insertId;

    const subOrdersSummary = [];

    for (const group of byStore.values()) {
      const platformFee = Number((group.subtotal * feeRate).toFixed(2));
      const sellerNet = Number((group.subtotal - platformFee).toFixed(2));

      const [subResult] = await conn.execute(
        `INSERT INTO sub_orders
           (order_id, store_id, subtotal, platform_fee, seller_net_amount, fulfillment_status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [orderId, group.storeId, group.subtotal, platformFee, sellerNet]
      );
      const subOrderId = subResult.insertId;

      for (const item of group.items) {
        await conn.execute(
          `INSERT INTO order_items (sub_order_id, product_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [subOrderId, item.product_id, item.quantity, item.unit_price]
        );
      }

      // Credita saldo líquido na carteira Looma Pay da loja
      await conn.execute(
        'UPDATE wallets SET balance = balance + ? WHERE store_id = ?',
        [sellerNet, group.storeId]
      );

      subOrdersSummary.push({
        sub_order_id: subOrderId,
        store_id: group.storeId,
        subtotal: group.subtotal,
        platform_fee: platformFee,
        seller_net_amount: sellerNet
      });
    }

    await conn.commit();

    return res.status(201).json({
      message: 'Pedido realizado com sucesso na Looma.',
      order: {
        id: orderId,
        total_amount: orderTotal,
        shipping_address: shippingAddress,
        payment_status: 'PAID',
        sub_orders: subOrdersSummary
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('[checkout] checkout:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      error: status === 500 ? 'Não foi possível finalizar o pedido.' : err.message
    });
  } finally {
    conn.release();
  }
}

/**
 * GET /api/seller/orders — sub_orders da loja do lojista.
 */
async function listSellerOrders(req, res) {
  try {
    const [subOrders] = await pool.execute(
      `SELECT so.id, so.order_id, so.subtotal, so.platform_fee, so.seller_net_amount,
              so.fulfillment_status, so.tracking_code, so.created_at,
              o.shipping_address, o.payment_status, o.buyer_id,
              u.name AS buyer_name, u.email AS buyer_email
       FROM sub_orders so
       INNER JOIN orders o ON o.id = so.order_id
       INNER JOIN users u ON u.id = o.buyer_id
       WHERE so.store_id = ?
       ORDER BY so.created_at DESC`,
      [req.storeId]
    );

    for (const so of subOrders) {
      const [items] = await pool.execute(
        `SELECT oi.id, oi.quantity, oi.unit_price, p.name AS product_name, p.image_url
         FROM order_items oi
         INNER JOIN products p ON p.id = oi.product_id
         WHERE oi.sub_order_id = ?`,
        [so.id]
      );
      so.items = items;
    }

    return res.json({ orders: subOrders });
  } catch (err) {
    console.error('[checkout] listSellerOrders:', err.message);
    return res.status(500).json({ error: 'Erro ao listar pedidos do Looma Hub.' });
  }
}

/**
 * PATCH /api/seller/orders/:id — atualiza status de envio do sub_order.
 */
async function updateSellerOrderStatus(req, res) {
  try {
    const subOrderId = parseInt(req.params.id, 10);
    const status = String(req.body.fulfillment_status || '').toUpperCase();
    const trackingCode = req.body.tracking_code !== undefined
      ? String(req.body.tracking_code).trim()
      : undefined;

    if (!subOrderId) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Use: ${ALLOWED_STATUSES.join(', ')}.`
      });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM sub_orders WHERE id = ? AND store_id = ? LIMIT 1',
      [subOrderId, req.storeId]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Pedido não encontrado na sua loja.' });
    }

    if (trackingCode !== undefined) {
      await pool.execute(
        `UPDATE sub_orders
         SET fulfillment_status = ?, tracking_code = ?
         WHERE id = ? AND store_id = ?`,
        [status, trackingCode || null, subOrderId, req.storeId]
      );
    } else {
      await pool.execute(
        `UPDATE sub_orders SET fulfillment_status = ? WHERE id = ? AND store_id = ?`,
        [status, subOrderId, req.storeId]
      );
    }

    const [rows] = await pool.execute(
      'SELECT * FROM sub_orders WHERE id = ? AND store_id = ?',
      [subOrderId, req.storeId]
    );

    return res.json({ message: 'Status de envio atualizado.', order: rows[0] });
  } catch (err) {
    console.error('[checkout] updateSellerOrderStatus:', err.message);
    return res.status(500).json({ error: 'Não foi possível atualizar o pedido.' });
  }
}

/**
 * GET /api/orders/me — pedidos do comprador autenticado.
 */
async function listBuyerOrders(req, res) {
  try {
    const [orders] = await pool.execute(
      `SELECT id, total_amount, shipping_address, payment_status, created_at
       FROM orders
       WHERE buyer_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    for (const order of orders) {
      const [subs] = await pool.execute(
        `SELECT so.id, so.subtotal, so.fulfillment_status, so.tracking_code,
                s.name AS store_name, s.slug AS store_slug
         FROM sub_orders so
         INNER JOIN stores s ON s.id = so.store_id
         WHERE so.order_id = ?`,
        [order.id]
      );
      order.sub_orders = subs;
    }

    return res.json({ orders });
  } catch (err) {
    console.error('[checkout] listBuyerOrders:', err.message);
    return res.status(500).json({ error: 'Erro ao listar seus pedidos.' });
  }
}

module.exports = {
  checkout,
  listSellerOrders,
  updateSellerOrderStatus,
  listBuyerOrders
};
