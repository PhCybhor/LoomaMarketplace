/**
 * Cliente HTTP compartilhado da Looma (fetch + JWT no localStorage).
 */
const LoomaAPI = (() => {
  const TOKEN_KEY = 'looma_token';
  const USER_KEY = 'looma_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn() {
    return Boolean(getToken());
  }

  /**
   * @param {string} path
   * @param {RequestInit & { formData?: FormData }} [options]
   */
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    let body = options.body;
    if (options.formData) {
      body = options.formData;
    } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const res = await fetch(path, { ...options, headers, body });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(data.error || 'Falha na requisição.');
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  return {
    getToken,
    getUser,
    setSession,
    clearSession,
    isLoggedIn,
    request,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
    postForm: (path, formData) => request(path, { method: 'POST', formData }),
    putForm: (path, formData) => request(path, { method: 'PUT', formData })
  };
})();

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
