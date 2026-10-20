(() => {
  const grid = document.getElementById('products-grid');
  const emptyEl = document.getElementById('products-empty');
  const loadingEl = document.getElementById('products-loading');
  const categoryFilters = document.getElementById('category-filters');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const cartBadge = document.getElementById('cart-badge');
  const cartBody = document.getElementById('cart-body');
  const cartTotal = document.getElementById('cart-total');
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const toastEl = document.getElementById('toast');
  const navAuth = document.getElementById('nav-auth');

  let activeCategory = '';
  let searchTerm = '';

  function toast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  function updateAuthNav() {
    if (LoomaAPI.isLoggedIn()) {
      const user = LoomaAPI.getUser();
      navAuth.textContent = user?.name?.split(' ')[0] || 'Conta';
      navAuth.href = '/seller-dashboard.html';
    } else {
      navAuth.textContent = 'Entrar';
      navAuth.href = '/login.html';
    }
  }

  function updateCartBadge() {
    const n = LoomaCart.count();
    if (n > 0) {
      cartBadge.textContent = String(n);
      cartBadge.classList.remove('hidden');
    } else {
      cartBadge.classList.add('hidden');
    }
  }

  function openCart() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    renderCart();
  }

  function closeCart() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }

  function renderCart() {
    const groups = LoomaCart.groupByStore();
    cartTotal.textContent = formatBRL(LoomaCart.total());

    if (!groups.length) {
      cartBody.innerHTML = '<p class="text-sm text-slate-500 text-center py-8">Carrinho vazio.</p>';
      return;
    }

    cartBody.innerHTML = groups
      .map(
        (g) => `
      <div class="store-package rounded-lg p-3 space-y-2">
        <p class="text-xs font-semibold text-looma-indigo uppercase tracking-wide">
          Pacote · ${escapeHtml(g.store_name)}
        </p>
        ${g.items
          .map(
            (item) => `
          <div class="flex gap-3 items-start bg-white rounded-md p-2 border border-slate-100">
            <div class="w-12 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
              ${
                item.image_url
                  ? `<img src="${escapeHtml(item.image_url)}" alt="" class="w-full h-full object-cover" />`
                  : ''
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">${escapeHtml(item.name)}</p>
              <p class="text-xs text-slate-500">${formatBRL(item.price)}</p>
              <div class="flex items-center gap-2 mt-1">
                <button type="button" data-qty-minus="${item.product_id}" class="w-6 h-6 border rounded text-xs">−</button>
                <span class="text-sm">${item.quantity}</span>
                <button type="button" data-qty-plus="${item.product_id}" class="w-6 h-6 border rounded text-xs">+</button>
                <button type="button" data-remove="${item.product_id}" class="ml-auto text-xs text-red-600">Remover</button>
              </div>
            </div>
          </div>`
          )
          .join('')}
        <p class="text-right text-sm font-semibold">${formatBRL(g.subtotal)}</p>
      </div>`
      )
      .join('');
  }

  function renderProducts(products) {
    loadingEl.classList.add('hidden');
    if (!products.length) {
      grid.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    grid.innerHTML = products
      .map(
        (p, i) => `
      <article class="product-tile rounded-xl overflow-hidden flex flex-col fade-up" style="animation-delay:${(i % 8) * 40}ms">
        <a href="/loja/${escapeHtml(p.store_slug)}" class="block aspect-square bg-slate-100 overflow-hidden">
          ${
            p.image_url
              ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">Sem foto</div>`
          }
        </a>
        <div class="p-3 flex flex-col flex-1 gap-2">
          <span class="store-seal rounded-md">
            <a href="/loja/${escapeHtml(p.store_slug)}">${escapeHtml(p.store_name)}</a>
          </span>
          <h3 class="text-sm font-semibold leading-snug line-clamp-2">${escapeHtml(p.name)}</h3>
          <p class="font-display font-bold text-looma-indigo mt-auto">${formatBRL(p.price)}</p>
          <button
            type="button"
            class="btn-coral w-full text-sm font-semibold py-2 rounded-lg"
            data-add="${encodeURIComponent(
              JSON.stringify({
                id: p.id,
                name: p.name,
                price: p.price,
                image_url: p.image_url || '',
                store_id: p.store_id,
                store_name: p.store_name,
                store_slug: p.store_slug
              })
            )}"
          >
            Adicionar
          </button>
        </div>
      </article>`
      )
      .join('');
  }

  async function loadProducts() {
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (activeCategory) params.set('category', activeCategory);
    const qs = params.toString();
    try {
      const data = await LoomaAPI.get(`/api/products${qs ? `?${qs}` : ''}`);
      renderProducts(data.products || []);
    } catch (err) {
      loadingEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      emptyEl.textContent = err.message || 'Erro ao carregar produtos.';
    }
  }

  async function loadCategories() {
    try {
      const data = await LoomaAPI.get('/api/products/categories');
      const cats = data.categories || [];
      categoryFilters.innerHTML = [
        `<button type="button" data-cat="" class="cat-btn text-xs font-medium px-3 py-1.5 rounded-full border ${
          !activeCategory ? 'bg-looma-indigo text-white border-looma-indigo' : 'bg-white border-slate-200'
        }">Todos</button>`,
        ...cats.map(
          (c) =>
            `<button type="button" data-cat="${escapeHtml(c.slug)}" class="cat-btn text-xs font-medium px-3 py-1.5 rounded-full border ${
              activeCategory === c.slug
                ? 'bg-looma-indigo text-white border-looma-indigo'
                : 'bg-white border-slate-200'
            }">${escapeHtml(c.name)}</button>`
        )
      ].join('');
    } catch {
      categoryFilters.innerHTML = '';
    }
  }

  document.getElementById('btn-cart').addEventListener('click', openCart);
  document.getElementById('btn-close-cart').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchTerm = searchInput.value.trim();
    loadProducts();
  });

  categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    activeCategory = btn.getAttribute('data-cat') || '';
    loadCategories();
    loadProducts();
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    try {
      const product = JSON.parse(decodeURIComponent(btn.getAttribute('data-add')));
      LoomaCart.add(product);
      toast('Adicionado ao carrinho');
      updateCartBadge();
    } catch {
      toast('Não foi possível adicionar', 'error');
    }
  });

  cartBody.addEventListener('click', (e) => {
    const minus = e.target.closest('[data-qty-minus]');
    const plus = e.target.closest('[data-qty-plus]');
    const remove = e.target.closest('[data-remove]');
    if (minus) {
      const id = Number(minus.getAttribute('data-qty-minus'));
      const item = LoomaCart.getItems().find((i) => i.product_id === id);
      if (item) LoomaCart.setQuantity(id, item.quantity - 1);
    }
    if (plus) {
      const id = Number(plus.getAttribute('data-qty-plus'));
      const item = LoomaCart.getItems().find((i) => i.product_id === id);
      if (item) LoomaCart.setQuantity(id, item.quantity + 1);
    }
    if (remove) {
      LoomaCart.remove(Number(remove.getAttribute('data-remove')));
    }
    updateCartBadge();
    renderCart();
  });

  document.getElementById('btn-checkout').addEventListener('click', async () => {
    if (!LoomaAPI.isLoggedIn()) {
      toast('Faça login para finalizar', 'error');
      setTimeout(() => {
        window.location.href = '/login.html?redirect=/';
      }, 800);
      return;
    }
    const items = LoomaCart.toCheckoutPayload();
    if (!items.length) {
      toast('Carrinho vazio', 'error');
      return;
    }
    const shipping_address = document.getElementById('shipping-address').value.trim();
    if (shipping_address.length < 10) {
      toast('Informe o endereço completo', 'error');
      return;
    }
    try {
      const data = await LoomaAPI.post('/api/checkout', { items, shipping_address });
      LoomaCart.clear();
      updateCartBadge();
      renderCart();
      toast(data.message || 'Pedido realizado!');
      closeCart();
    } catch (err) {
      toast(err.message || 'Falha no checkout', 'error');
    }
  });

  window.addEventListener('looma:cart-updated', () => {
    updateCartBadge();
  });

  updateAuthNav();
  updateCartBadge();
  loadCategories();
  loadProducts();
})();
