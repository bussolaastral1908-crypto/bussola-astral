/**
 * Bússola Astral — contas (cadastro, login, perfil e Premium) no servidor próprio (/api/conta).
 * Substitui o firebase-client.js, que usava uma chave inválida e guardava a conta só no navegador.
 * Mantém os mesmos nomes de função usados pelas páginas: registerUser, loginUser, logoutUser,
 * resetPassword, getActiveProfile.
 */
(function () {
  const TOKEN_KEY = 'ba_token';
  const USER_KEY = 'ba_current_user';
  const LEGACY_PROFILE_KEY = 'bussolaAstral_profile';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function guardar(token, profile) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (profile) localStorage.setItem(USER_KEY, JSON.stringify(profile));
    } catch (e) {}
  }
  function limpar() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(LEGACY_PROFILE_KEY); } catch (e) {}
  }

  async function api(acao, { method = 'POST', body, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && getToken()) headers.Authorization = 'Bearer ' + getToken();
    let r;
    try {
      r = await fetch('/api/conta?acao=' + acao, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Sem conexão com a internet. Tente de novo.');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || 'Não deu certo agora. Tente de novo.');
      err.status = r.status;
      throw err;
    }
    return data;
  }

  // Cadastro: profileData = { name, birth_date, birth_time, birth_city, phone }
  async function registerUser(email, password, profileData) {
    const data = await api('cadastro', { body: Object.assign({ email, password }, profileData || {}) });
    guardar(data.token, data.profile);
    return { user: { email: data.profile.email }, profile: data.profile };
  }

  async function loginUser(email, password) {
    try {
      const data = await api('login', { body: { email, password } });
      guardar(data.token, data.profile);
      return { user: { email: data.profile.email }, profile: data.profile };
    } catch (err) {
      // Resgate: quem se cadastrou entre 28/08 e a correção ficou com a conta só neste
      // navegador. Se o perfil guardado aqui é deste e-mail, cria a conta no servidor.
      const local = getActiveProfile();
      if (err.status === 401 && local && String(local.email || '').toLowerCase() === String(email).trim().toLowerCase()) {
        try {
          return await registerUser(email, password, {
            name: local.name, birth_date: local.birth_date, birth_time: local.birth_time,
            birth_city: local.birth_city, phone: local.phone,
          });
        } catch (e2) { /* já existe: era senha errada mesmo */ }
      }
      throw err;
    }
  }

  async function logoutUser() {
    limpar();
    window.location.href = '/login.html';
  }

  async function resetPassword(email) {
    await api('esqueci', { body: { email } });
  }

  function getActiveProfile() {
    try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function hasSession() { return !!getToken(); }

  // Perfil + Premium atualizados do servidor. Sem sessão válida: null (e limpa o navegador).
  async function fetchProfile() {
    if (!getToken()) return null;
    try {
      const data = await api('perfil', { method: 'GET', auth: true });
      guardar(null, data.profile);
      return data.profile;
    } catch (err) {
      if (err.status === 401) { limpar(); return null; }
      return getActiveProfile(); // sem internet: usa o que está guardado
    }
  }

  async function saveProfile(fields) {
    const data = await api('perfil', { method: 'PUT', body: fields, auth: true });
    guardar(null, data.profile);
    return data.profile;
  }

  async function deleteAccount(email, password) {
    await api('excluir', { body: email ? { email, password } : {}, auth: !email });
    if (!email) limpar();
  }

  Object.assign(window, { registerUser, loginUser, logoutUser, resetPassword, getActiveProfile });
  window.BAConta = { hasSession, fetchProfile, saveProfile, deleteAccount, getToken, logout: logoutUser, resetPassword };
})();
