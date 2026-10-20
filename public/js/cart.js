/**
 * Carrinho Looma — localStorage com agrupamento visual por loja.
 */
const LoomaCart = (() => {
  const CART_KEY = 'looma_cart';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function save(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('looma:cart-updated'));
  }

  function getItems() {
    return load();
  }

  function count() {
    return load().reduce((sum, i) => sum + i.quantity, 0);
  }

  function total() {
    return load().reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  }

  /**
   * @param {{ id:number, name:string, price:number, image_url?:string, store_id:number, store_name:string, store_slug:string }} product
   * @param {number} [qty]
   */
  function add(product, qty = 1) {
    const items = load();
    const existing = items.find((i) => i.product_id === product.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        image_url: product.image_url || '',
        store_id: product.store_id,
        store_name: product.store_name,
        store_slug: product.store_slug,
        quantity: qty
      });
    }
    save(items);
  }

  function setQuantity(productId, quantity) {
    let items = load();
    if (quantity <= 0) {
      items = items.filter((i) => i.product_id !== productId);
    } else {
      const item = items.find((i) => i.product_id === productId);
      if (item) item.quantity = quantity;
    }
    save(items);
  }

  function remove(productId) {
    save(load().filter((i) => i.product_id !== productId));
  }

  function clear() {
    save([]);
  }

  /** Agrupa itens por loja para o drawer / checkout. */
  function groupByStore() {
    const map = new Map();
    for (const item of load()) {
      const key = item.store_id;
      if (!map.has(key)) {
        map.set(key, {
          store_id: item.store_id,
          store_name: item.store_name,
          store_slug: item.store_slug,
          items: [],
          subtotal: 0
        });
      }
      const group = map.get(key);
      group.items.push(item);
      group.subtotal += Number(item.price) * item.quantity;
    }
    return Array.from(map.values());
  }

  function toCheckoutPayload() {
    return load().map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity
    }));
  }

  return {
    getItems,
    count,
    total,
    add,
    setQuantity,
    remove,
    clear,
    groupByStore,
    toCheckoutPayload
  };
})();
