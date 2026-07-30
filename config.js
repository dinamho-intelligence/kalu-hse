/* ============================================================
 *  KALU · CONFIGURACIÓN CENTRAL DE SUPABASE
 *  ------------------------------------------------------------
 *  Un solo archivo para apuntar TODA la plataforma a un proyecto.
 *  El día del "upgrade" (cutover) cambiás SB_URL + SB_KEY acá y
 *  listo: todas las apps (editor, lente, consola, ingreso, admin,
 *  hse, firmas) quedan apuntando al proyecto definitivo.
 *
 *  Cómo usarlo en cada app: agregá esta línea ANTES de tu <script>
 *      <script src="/config.js"></script>
 *  y reemplazá los SB_URL/SB_ANON hardcodeados por window.KALU.*
 * ============================================================ */
window.KALU = window.KALU || {};

/* 👉 SANDBOX (donde trabajamos sin tocar lo en vivo) */
window.KALU.SB_URL = 'https://nignqeipzlemwfrwmpip.supabase.co';
window.KALU.SB_KEY = 'sb_publishable_7ni9tHH8H180SiFTEmXB_w_Qzmw_cXl';

/* Cliente supabase-js ya configurado (para apps que usan la librería) */
window.KALU.cliente = function(opts){
  if(!window.supabase || !window.supabase.createClient){
    throw new Error('Falta la librería supabase-js en la página.');
  }
  return window.supabase.createClient(
    window.KALU.SB_URL,
    window.KALU.SB_KEY,
    Object.assign({
      auth:{ storage:window.sessionStorage, persistSession:true, autoRefreshToken:true }
    }, opts || {})
  );
};

/* Headers REST directos (para apps que hacen fetch a PostgREST, como la app del lente).
   OJO: con las keys nuevas (sb_publishable_...) se manda la misma key en apikey Y en
   Authorization. Para operadores (anón) eso es correcto; cuando hay sesión de consola,
   pasale el access_token del usuario en 'auth'.  */
window.KALU.headers = function(auth, extra){
  return Object.assign({
    apikey: window.KALU.SB_KEY,
    Authorization: 'Bearer ' + (auth || window.KALU.SB_KEY),
    'Content-Type': 'application/json'
  }, extra || {});
};
