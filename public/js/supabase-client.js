/**
 * Bússola Astral — Supabase Client Helper
 * Mantido para compatibilidade legado sem exibição de banners de aviso.
 */

const SB_URL = 'https://jnjdkfmzkppzqafhjsbl.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuamRrZm16a3BwenFhZmhqc2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDg1MTEsImV4cCI6MjA5NzU4NDUxMX0.xpBcvJ2y6Mj3mL5HrO_XVuj-YD3RIW3P1dMWY_H16y4';

let dbClient = null;

function getSupabaseClient() {
  if (!dbClient) {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      try {
        dbClient = supabase.createClient(SB_URL, SB_KEY);
      } catch (e) {
        console.warn('[Bússola Astral] Supabase offline.');
      }
    }
  }
  return dbClient;
}

// Remove qualquer banner legado se existir na página
function removeLegacyBanners() {
  const notice = document.getElementById('ba-offline-banner');
  if (notice) notice.remove();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', removeLegacyBanners);
} else {
  removeLegacyBanners();
}
