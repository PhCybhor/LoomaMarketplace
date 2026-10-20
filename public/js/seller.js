(() => {
  const toastEl = document.getElementById('toast');
  const panelOnboarding = document.getElementById('panel-onboarding');
  const panelDashboard = document.getElementById('panel-dashboard');

  function toast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  if (!LoomaAPI.isLoggedIn()) {
    window.location.href = '/login.html?redirect=/seller-dashboard.html';
    return;
  }

  const user = LoomaAPI.getUser();
  document.getElementById('seller-user').textContent = user?.name || '';

  document.getElementById('btn-logout').addEventListener('click', () => {
    LoomaAPI.clearSession();
    window.location.href = '/';
  });

  async function init() {
    try {
      const me = await LoomaAPI.get('/api/auth/me');
      LoomaAPI.setSession(LoomaAPI.getToken(), me.user);
      if (!me.store) {
        panelOnboarding.classList.remove('hidden');
        return;
      }
      panelDashboard.classList.remove('hidden');
      await loadDashboard(me.store);
    } catch (err) {
      if (err.status === 401) {
        LoomaAPI.clearSession();
        window.location.href = '/login.html?redirect=/seller-dashboard.html';
        return;
      }
      toast(err.message || 'Erro ao carregar Hub', 'error');
    }
  }

  document.getElementById('form-store').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('onboard-msg');
    msg.classList.add('hidden');
    const fd = new FormData(form);
    try {
      const data = await LoomaAPI.postForm('/api/stores', fd);
      toast(data.message || 'Loja criada!');
      panelOnboarding.classList.add('hidden');
      panelDashboard.classList.remove('hidden');
      await loadDashboard(data.store);
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.remove('hidden');
    }
  });

  const modal = document.getElementById('product-modal');
  document.getElementById('btn-open-product-modal').addEventListener('click', () => {
    modal.classList.add('open');
  });
  document.getElementById('btn-close-product-modal').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  async function loadCategories() {
    try {
      const data = await LoomaAPI.get('/api/products/categories');
      const select = document.getElementById('product-category');
      select.innerHTML = '<option value="">Sem categoria</option>';
      for (const c of data.categories || []) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
      }
    } catch {
      /* ignore */
    }
  }

  document.getElementById('form-product').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('product-msg');
    msg.classList.add('hidden');
    const fd = new FormData(form);
    try {
      await LoomaAPI.postForm('/api/seller/products', fd);
      toast('Produto cadastrado');
      form.reset();
      modal.classList.remove('open');
      await refreshProducts();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.remove('hidden');
    }
  });

  async function loadDashboard(store) {
    document.getElementById('store-title').textContent = store.name;
    const urlEl = document.getElementById('store-url');
    urlEl.textContent = `/loja/${store.slug}`;
    urlEl.href = `/loja/${store.slug}`;

    await loadCategories();

    try {
      const storeData = await LoomaAPI.get('/api/stores/me');
      document.getElementById('stat-wallet').textContent = formatBRL(
        storeData.store.wallet_balance
      );
    } catch {
      document.getElementById('stat-wallet').textContent = formatBRL(0);
    }

    await refreshProducts();
    await refreshOrders();
  }

  async function refreshProducts() {
    const tbody = document.getElementById('products-tbody');
    try {
      const data = await LoomaAPI.get('/api/seller/products');
      const products = data.products || [];
      if (!products.length) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum produto ainda.</td></tr>';
        return;
      }
      tbody.innerHTML = products
        .map(
          (p) => `
        <tr class="border-t border-slate-100">
          <td class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded bg-slate-100 overflow-hidden shrink-0">
                ${
                  p.image_url
                    ? `<img src="${escapeHtml(p.image_url)}" alt="" class="w-full h-full object-cover" />`
                    : ''
                }
              </div>
              <span class="font-medium">${escapeHtml(p.name)}</span>
            </div>
          </td>
          <td class="px-4 py-3">${formatBRL(p.price)}</td>
          <td class="px-4 py-3">${p.stock}</td>
          <td class="px-4 py-3">${p.is_active ? 'Ativo' : 'Inativo'}</td>
          <td class="px-4 py-3 text-right">
            <button type="button" data-delete-product="${p.id}" class="text-red-600 text-xs font-medium">Excluir</button>
          </td>
        </tr>`
        )
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-red-600">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById('products-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-product]');
    if (!btn) return;
    if (!confirm('Remover este produto?')) return;
    try {
      await LoomaAPI.delete(`/api/seller/products/${btn.getAttribute('data-delete-product')}`);
      toast('Produto removido');
      await refreshProducts();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function refreshOrders() {
    const list = document.getElementById('orders-list');
    try {
      const data = await LoomaAPI.get('/api/seller/orders');
      const orders = data.orders || [];
      document.getElementById('stat-orders').textContent = String(orders.length);
      const salesNet = orders.reduce((s, o) => s + Number(o.seller_net_amount || 0), 0);
      document.getElementById('stat-sales').textContent = formatBRL(salesNet);

      if (!orders.length) {
        list.innerHTML = '<p class="text-sm text-slate-500">Nenhum pedido recebido ainda.</p>';
        return;
      }

      list.innerHTML = orders
        .map(
          (o) => `
        <article class="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div class="flex flex-wrap justify-between gap-2">
            <p class="font-semibold text-sm">Pedido #${o.order_id} · Sub #${o.id}</p>
            <span class="text-xs font-medium px-2 py-1 rounded bg-indigo-50 text-looma-indigo">${escapeHtml(o.fulfillment_status)}</span>
          </div>
          <p class="text-xs text-slate-500">Comprador: ${escapeHtml(o.buyer_name)} · ${escapeHtml(o.buyer_email)}</p>
          <p class="text-xs text-slate-500">Entrega: ${escapeHtml(o.shipping_address)}</p>
          <ul class="text-sm space-y-1">
            ${(o.items || [])
              .map(
                (it) =>
                  `<li>${escapeHtml(it.product_name)} × ${it.quantity} — ${formatBRL(it.unit_price)}</li>`
              )
              .join('')}
          </ul>
          <div class="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
            <p class="text-sm mr-auto">Líquido Looma Pay: <strong>${formatBRL(o.seller_net_amount)}</strong></p>
            <select data-status-for="${o.id}" class="text-sm rounded-lg border border-slate-200 px-2 py-1.5">
              ${['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
                .map(
                  (s) =>
                    `<option value="${s}" ${s === o.fulfillment_status ? 'selected' : ''}>${s}</option>`
                )
                .join('')}
            </select>
            <input data-tracking-for="${o.id}" type="text" value="${escapeHtml(o.tracking_code || '')}" placeholder="Rastreio" class="text-sm rounded-lg border border-slate-200 px-2 py-1.5 w-32" />
            <button type="button" data-update-order="${o.id}" class="btn-indigo text-xs font-semibold px-3 py-1.5 rounded-lg">Atualizar</button>
          </div>
        </article>`
        )
        .join('');
    } catch (err) {
      list.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(err.message)}</p>`;
    }
  }

  document.getElementById('orders-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-update-order]');
    if (!btn) return;
    const id = btn.getAttribute('data-update-order');
    const status = document.querySelector(`[data-status-for="${id}"]`)?.value;
    const tracking_code = document.querySelector(`[data-tracking-for="${id}"]`)?.value || '';
    try {
      await LoomaAPI.patch(`/api/seller/orders/${id}`, {
        fulfillment_status: status,
        tracking_code
      });
      toast('Status atualizado');
      await refreshOrders();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  init();
})();
