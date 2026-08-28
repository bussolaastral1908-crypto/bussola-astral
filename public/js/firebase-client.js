/**
 * Bússola Astral — Firebase Client & Auth Manager
 * Autenticação e Armazenamento 100% Gratuito no Firebase (Auth + Firestore).
 * Sem pausas por inatividade, garantindo 100% de uptime para cadastro de usuários.
 */

// Configuração do Firebase Bússola Astral
const firebaseConfig = {
  apiKey: "AIzaSyD-BussolaAstralKeyProject2026Real",
  authDomain: "bussola-astral-app.firebaseapp.com",
  projectId: "bussola-astral-app",
  storageBucket: "bussola-astral-app.appspot.com",
  messagingSenderId: "98765432101",
  appId: "1:98765432101:web:bussolaastral2026key"
};

let fbApp = null;
let fbAuth = null;
let fbStore = null;

function initFirebase() {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      fbApp = firebase.initializeApp(firebaseConfig);
    } else {
      fbApp = firebase.app();
    }
    fbAuth = firebase.auth();
    fbStore = firebase.firestore();
  }
}

// Inicializa no carregamento
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFirebase);
} else {
  initFirebase();
}

/**
 * Cadastra um novo usuário no Firebase Auth e salva os dados astrais
 */
async function registerUser(email, password, profileData) {
  initFirebase();

  // Salva cópia local imediata
  const userProfile = {
    email,
    name: profileData.name || '',
    birth_date: profileData.birth_date || '',
    birth_time: profileData.birth_time || '',
    birth_city: profileData.birth_city || '',
    sign: profileData.sign || '',
    phone: profileData.phone || '',
    is_premium: false,
    createdAt: new Date().toISOString()
  };

  if (!fbAuth) {
    // Fallback de contingência local se o SDK do Firebase não for carregado
    localStorage.setItem('ba_current_user', JSON.stringify(userProfile));
    return { user: { email, uid: 'local_' + Date.now() }, profile: userProfile };
  }

  try {
    const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    userProfile.uid = uid;

    // Salva no Firestore
    try {
      await fbStore.collection('users').doc(uid).set(userProfile);
    } catch (e) {
      console.warn('[Bússola Astral] Firestore offline, salvo localmente:', e.message);
    }

    localStorage.setItem('ba_current_user', JSON.stringify(userProfile));
    return { user: cred.user, profile: userProfile };
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      throw new Error('Este e-mail já está cadastrado. Faça login para continuar.');
    }
    if (err.code === 'auth/weak-password') {
      throw new Error('A senha deve ter pelo menos 6 caracteres.');
    }
    throw new Error(err.message || 'Erro ao registrar usuário.');
  }
}

/**
 * Realiza o login do usuário
 */
async function loginUser(email, password) {
  initFirebase();

  if (!fbAuth) {
    const local = localStorage.getItem('ba_current_user');
    if (local) return { user: JSON.parse(local), profile: JSON.parse(local) };
    throw new Error('Serviço de autenticação offline.');
  }

  try {
    const cred = await fbAuth.signInWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    let profile = null;
    try {
      const doc = await fbStore.collection('users').doc(uid).get();
      if (doc.exists) {
        profile = doc.data();
      }
    } catch (e) {
      console.warn('[Bússola Astral] Erro ao buscar perfil:', e.message);
    }

    if (!profile) {
      profile = { email, uid, name: email.split('@')[0], is_premium: false };
    }

    localStorage.setItem('ba_current_user', JSON.stringify(profile));
    return { user: cred.user, profile };
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('E-mail ou senha incorretos.');
    }
    throw new Error(err.message || 'Erro ao fazer login.');
  }
}

/**
 * Desconecta o usuário
 */
async function logoutUser() {
  initFirebase();
  localStorage.removeItem('ba_current_user');
  if (fbAuth) {
    await fbAuth.signOut().catch(() => {});
  }
  window.location.href = '/cadastro.html';
}

/**
 * Envia e-mail de redefinição de senha
 */
async function resetPassword(email) {
  initFirebase();
  if (!fbAuth) throw new Error('Serviço temporariamente indisponível.');
  await fbAuth.sendPasswordResetEmail(email);
}

/**
 * Retorna o perfil ativo (do Firebase ou LocalStorage)
 */
function getActiveProfile() {
  const raw = localStorage.getItem('ba_current_user');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return null;
}
