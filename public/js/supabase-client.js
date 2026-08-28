/**
 * Bússola Astral — Supabase Client & Backend Health Helper
 * Centraliza a conexão com o Supabase e lida graciosamente com indisponibilidade de rede/banco.
 */

const SB_URL = 'https://jnjdkfmzkppzqafhjsbl.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuamRrZm16a3BwenFhZmhqc2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDg1MTEsImV4cCI6MjA5NzU4NDUxMX0.xpBcvJ2y6Mj3mL5HrO_XVuj-YD3RIW3P1dMWY_H16y4';

let dbClient = null;

function getSupabaseClient() {
  if (!dbClient) {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      dbClient = supabase.createClient(SB_URL, SB_KEY);
    } else {
      console.error('[Bússola Astral] Biblioteca Supabase JS não carregada.');
    }
  }
  return dbClient;
}

// Inicializa a verificação de saúde do backend
async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${SB_URL}/auth/v1/health`, {
      method: 'GET',
      headers: { 'apikey': SB_KEY },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (!res || !res.ok) {
      showBackendOfflineNotice();
      return false;
    }
    return true;
  } catch (e) {
    showBackendOfflineNotice();
    return false;
  }
}

function showBackendOfflineNotice() {
  let notice = document.getElementById('ba-offline-banner');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'ba-offline-banner';
    notice.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #991b1b, #7f1d1d);
      color: #fef2f2;
      padding: 10px 16px;
      font-size: 13px;
      font-family: system-ui, sans-serif;
      text-align: center;
      z-index: 999999;
      box-shadow: 0 4px 14px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    `;
    notice.innerHTML = `
      <span>⚠️ <strong>Aviso Bússola Astral:</strong> O banco de dados Supabase está pausado/indisponível neste momento. Para reativá-lo, acesse o <strong>Supabase Dashboard</strong> e clique em <em>Restore Project</em>.</span>
      <button onclick="document.getElementById('ba-offline-banner').remove()" style="background:rgba(255,255,255,0.2); border:none; color:#fff; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:12px;">✕ Fechar</button>
    `;
    document.body.prepend(notice);
  }
}

// Executa verificação suave ao carregar a página
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkBackendHealth);
} else {
  checkBackendHealth();
}
