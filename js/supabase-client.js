// ============================================================
//  MyScheduler — Supabase Client
// ============================================================

let db;

function initSupabase() {
  if (db) return db;
  const { createClient } = window.supabase;
  db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    realtime: {
      params: { eventsPerSecond: 10 }
    }
  });
  return db;
}

// Initialize immediately
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
