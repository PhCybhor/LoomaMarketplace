(() => {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const msg = document.getElementById('auth-msg');

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || '/seller-dashboard.html';

  if (LoomaAPI.isLoggedIn()) {
    window.location.href = redirect;
    return;
  }

  function showMsg(text, isError = true) {
    msg.textContent = text;
    msg.classList.toggle('hidden', !text);
    msg.classList.toggle('text-red-600', isError);
    msg.classList.toggle('text-emerald-700', !isError);
  }

  function setTab(mode) {
    const isLogin = mode === 'login';
    formLogin.classList.toggle('hidden', !isLogin);
    formRegister.classList.toggle('hidden', isLogin);
    tabLogin.className = `flex-1 py-2 text-sm font-semibold rounded-md ${
      isLogin ? 'bg-looma-indigo text-white' : 'text-slate-600'
    }`;
    tabRegister.className = `flex-1 py-2 text-sm font-semibold rounded-md ${
      !isLogin ? 'bg-looma-indigo text-white' : 'text-slate-600'
    }`;
    showMsg('');
  }

  tabLogin.addEventListener('click', () => setTab('login'));
  tabRegister.addEventListener('click', () => setTab('register'));

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formLogin);
    try {
      const data = await LoomaAPI.post('/api/auth/login', {
        email: fd.get('email'),
        password: fd.get('password')
      });
      LoomaAPI.setSession(data.token, data.user);
      window.location.href = redirect;
    } catch (err) {
      showMsg(err.message || 'Falha no login');
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formRegister);
    try {
      const data = await LoomaAPI.post('/api/auth/register', {
        name: fd.get('name'),
        email: fd.get('email'),
        password: fd.get('password')
      });
      LoomaAPI.setSession(data.token, data.user);
      showMsg('Conta criada! Redirecionando...', false);
      setTimeout(() => {
        window.location.href = redirect;
      }, 600);
    } catch (err) {
      showMsg(err.message || 'Falha no cadastro');
    }
  });
})();
