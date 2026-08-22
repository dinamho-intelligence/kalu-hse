/* =====================================================================
   KALU · Módulo Capacitador — front de producción
   ---------------------------------------------------------------------
   Un solo archivo. Inyecta sus estilos y monta las pantallas donde le
   digas. No pisa nada del resto de KALU: todo va bajo la clase .kc.

   USO
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1/dist/qrcode.js"></script>
     <script src="capacitador.js"></script>
     <script>
       KaluCap.init({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
       KaluCap.pasaporte('#cap');        // app.html   — el trabajador
       KaluCap.supervision('#cap');      // hse.html   — el supervisor
       KaluCap.admin('#cap');            // admin.html — HSE / operaciones
     </script>

   Si ya tenés un cliente de Supabase creado, pasalo directo:
       KaluCap.init({ client: miClienteExistente });

   La librería de QR es opcional: sin ella la credencial muestra el
   código en texto en vez del cuadro.
   ===================================================================== */
(function (global) {
'use strict';

let sb = null;

/* ---------------------------------------------------------------- estilos */
const CSS = `
.kc{--kc-ground:#EEF2F0;--kc-card:#FFF;--kc-card2:#F5F8F6;--kc-ink:#11201B;
 --kc-ink2:#4B605A;--kc-ink3:#7E918B;--kc-rule:#DBE3DF;--kc-rule2:#C3CFCA;
 --kc-ac:#0B5D45;--kc-acs:#DCEBE4;--kc-ok:#147A54;--kc-oks:#DCEDE4;
 --kc-wa:#8F6200;--kc-was:#F7EBD2;--kc-cr:#A82D22;--kc-crs:#F6DEDA;
 --kc-sh:0 1px 2px rgba(17,32,27,.07),0 10px 26px -18px rgba(17,32,27,.35);
 --kc-fd:"Barlow Semi Condensed","Arial Narrow",Arial,sans-serif;
 --kc-fb:"Barlow",-apple-system,"Segoe UI",Roboto,sans-serif;
 --kc-fm:"Roboto Mono",ui-monospace,Menlo,monospace;
 font-family:var(--kc-fb);color:var(--kc-ink);font-size:15px;line-height:1.55;
 background:var(--kc-ground)}
@media (prefers-color-scheme:dark){.kc:not([data-theme=light]){
 --kc-ground:#0F1714;--kc-card:#16211D;--kc-card2:#1C2925;--kc-ink:#E4EDE9;
 --kc-ink2:#A2B4AE;--kc-ink3:#758781;--kc-rule:#25332E;--kc-rule2:#35473F;
 --kc-ac:#4FB894;--kc-acs:#123025;--kc-ok:#5FC79B;--kc-oks:#0F2C21;
 --kc-wa:#D9A441;--kc-was:#2E2411;--kc-cr:#E58074;--kc-crs:#2F1815;
 --kc-sh:0 1px 2px rgba(0,0,0,.5),0 10px 26px -18px rgba(0,0,0,.8)}}
.kc[data-theme=dark]{--kc-ground:#0F1714;--kc-card:#16211D;--kc-card2:#1C2925;
 --kc-ink:#E4EDE9;--kc-ink2:#A2B4AE;--kc-ink3:#758781;--kc-rule:#25332E;
 --kc-rule2:#35473F;--kc-ac:#4FB894;--kc-acs:#123025;--kc-ok:#5FC79B;
 --kc-oks:#0F2C21;--kc-wa:#D9A441;--kc-was:#2E2411;--kc-cr:#E58074;--kc-crs:#2F1815;
 --kc-sh:0 1px 2px rgba(0,0,0,.5),0 10px 26px -18px rgba(0,0,0,.8)}
.kc *{box-sizing:border-box}
.kc h1,.kc h2,.kc h3{font-family:var(--kc-fd);margin:0;letter-spacing:-.01em}
.kc button{font:inherit;color:inherit}
.kc .mono{font-family:var(--kc-fm)}
.kc-wrap{max-width:440px;margin:0 auto;padding-bottom:24px}
.kc-wide{max-width:1080px;margin:0 auto;padding:0 16px 40px}

.kc-carga{padding:50px 20px;text-align:center;color:var(--kc-ink3);font-size:14px}
.kc-err{margin:16px;background:var(--kc-crs);border-left:3px solid var(--kc-cr);
 border-radius:8px;padding:14px 16px;font-size:14px;color:var(--kc-ink2)}
.kc-err b{display:block;color:var(--kc-cr);font-family:var(--kc-fm);font-size:10px;
 letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}

/* --- portada / banda de estado --- */
.kc-hero{padding:20px 16px;background:var(--kc-card);border-bottom:1px solid var(--kc-rule)}
.kc-cargo{font-family:var(--kc-fm);font-size:10.5px;letter-spacing:.1em;
 text-transform:uppercase;color:var(--kc-ink3);margin-bottom:5px}
.kc-nom{font-family:var(--kc-fd);font-weight:600;font-size:23px;line-height:1.1;
 margin-bottom:15px}
.kc-band{border-radius:10px;padding:15px 17px;display:flex;align-items:center;gap:13px}
.kc-band.ok{background:var(--kc-oks)}.kc-band.wa{background:var(--kc-was)}
.kc-band.cr{background:var(--kc-crs)}
.kc-band .m{width:36px;height:36px;border-radius:50%;flex:0 0 auto;display:grid;
 place-items:center;color:var(--kc-card);font-family:var(--kc-fd);font-weight:700;font-size:17px}
.kc-band.ok .m{background:var(--kc-ok)}.kc-band.wa .m{background:var(--kc-wa)}
.kc-band.cr .m{background:var(--kc-cr)}
.kc-band .t1{font-family:var(--kc-fd);font-weight:700;font-size:20px;line-height:1.08}
.kc-band.ok .t1{color:var(--kc-ok)}.kc-band.wa .t1{color:var(--kc-wa)}
.kc-band.cr .t1{color:var(--kc-cr)}
.kc-band .t2{font-size:13px;color:var(--kc-ink2);margin-top:2px}
.kc-cts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--kc-rule);
 border:1px solid var(--kc-rule);border-radius:8px;overflow:hidden;margin-top:13px}
.kc-ct{background:var(--kc-card2);padding:9px 4px;text-align:center}
.kc-ct b{display:block;font-family:var(--kc-fd);font-weight:700;font-size:19px;line-height:1;
 font-variant-numeric:tabular-nums}
.kc-ct span{display:block;font-family:var(--kc-fm);font-size:8px;letter-spacing:.06em;
 text-transform:uppercase;color:var(--kc-ink3);margin-top:4px}
.kc-ct.v b{color:var(--kc-cr)}.kc-ct.x b{color:var(--kc-wa)}.kc-ct.a b{color:var(--kc-ok)}

/* --- pestañas y filtros --- */
.kc-tabs{display:flex;background:var(--kc-card);border-bottom:1px solid var(--kc-rule)}
.kc-tab{flex:1;background:none;border:none;padding:12px 4px;cursor:pointer;
 font-family:var(--kc-fd);font-weight:600;font-size:14px;letter-spacing:.03em;
 text-transform:uppercase;color:var(--kc-ink3);border-bottom:2px solid transparent}
.kc-tab[aria-selected=true]{color:var(--kc-ac);border-bottom-color:var(--kc-ac)}
.kc-tab:focus-visible{outline:2px solid var(--kc-ac);outline-offset:-3px}
.kc-fil{display:flex;gap:7px;padding:12px 16px;overflow-x:auto;scrollbar-width:none}
.kc-fil::-webkit-scrollbar{display:none}
.kc-chip{flex:0 0 auto;border:1px solid var(--kc-rule2);background:var(--kc-card);
 color:var(--kc-ink2);border-radius:999px;padding:6px 12px;cursor:pointer;
 font-size:12.5px;font-weight:500;white-space:nowrap}
.kc-chip[aria-pressed=true]{background:var(--kc-ac);border-color:var(--kc-ac);color:var(--kc-ground)}

/* --- lista de capacitaciones --- */
.kc-list{padding:0 16px;display:flex;flex-direction:column;gap:9px}
.kc-it{background:var(--kc-card);border:1px solid var(--kc-rule);border-radius:9px;
 box-shadow:var(--kc-sh);overflow:hidden;display:flex;text-align:left;width:100%;
 padding:0;cursor:pointer;border-left:0}
.kc-st{width:4px;flex:0 0 auto}
.kc-st.vencida{background:var(--kc-cr)}.kc-st.por_vencer{background:var(--kc-wa)}
.kc-st.pendiente{background:var(--kc-rule2)}.kc-st.al_dia{background:var(--kc-ok)}
.kc-bd{padding:11px 13px;min-width:0;flex:1}
.kc-r1{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}
.kc-cd{font-family:var(--kc-fm);font-size:10.5px;color:var(--kc-ink3)}
.kc-pill{margin-left:auto;font-family:var(--kc-fm);font-size:9px;letter-spacing:.05em;
 text-transform:uppercase;padding:2px 6px;border-radius:3px;flex:0 0 auto}
.kc-pill.vencida{background:var(--kc-crs);color:var(--kc-cr)}
.kc-pill.por_vencer{background:var(--kc-was);color:var(--kc-wa)}
.kc-pill.pendiente{background:var(--kc-card2);color:var(--kc-ink2)}
.kc-pill.al_dia{background:var(--kc-oks);color:var(--kc-ok)}
.kc-tt{font-family:var(--kc-fd);font-weight:600;font-size:15.5px;line-height:1.22}
.kc-mt{font-family:var(--kc-fm);font-size:10.5px;color:var(--kc-ink3);margin-top:5px}
.kc-why{padding:9px 13px 12px;font-size:12.5px;color:var(--kc-ink2);
 border-top:1px dashed var(--kc-rule);display:none}
.kc-it.open .kc-why{display:block}
.kc-why b{font-family:var(--kc-fm);font-size:9.5px;letter-spacing:.06em;
 text-transform:uppercase;color:var(--kc-ink3);display:block;margin-bottom:3px;font-weight:500}
.kc-go{margin-top:9px;background:var(--kc-ac);color:var(--kc-ground);border:none;
 border-radius:7px;padding:9px 14px;font-family:var(--kc-fd);font-weight:600;
 font-size:14px;cursor:pointer}
.kc-vacio{text-align:center;color:var(--kc-ink3);padding:36px 20px;font-size:14px}

/* --- credencial --- */
.kc-cred{margin:18px 16px;background:var(--kc-card);border:1px solid var(--kc-rule);
 border-radius:14px;overflow:hidden;box-shadow:var(--kc-sh)}
.kc-ctop{background:var(--kc-ac);padding:13px 17px;display:flex;justify-content:space-between;
 align-items:center}
.kc-ctop .l{font-family:var(--kc-fd);font-weight:700;font-size:16px;color:#fff}
.kc-ctop .r{font-family:var(--kc-fm);font-size:9px;letter-spacing:.08em;
 text-transform:uppercase;color:rgba(255,255,255,.72)}
.kc-cbody{padding:17px}
.kc-cgrid{display:grid;grid-template-columns:1fr auto;gap:15px;align-items:center;margin-top:13px}
.kc-fld .k{font-family:var(--kc-fm);font-size:9px;letter-spacing:.09em;
 text-transform:uppercase;color:var(--kc-ink3)}
.kc-fld .v{font-family:var(--kc-fm);font-size:13px;margin-top:1px}
.kc-fld+.kc-fld{margin-top:8px}
.kc-qr{width:112px;height:112px;background:#fff;padding:6px;border-radius:7px;
 border:1px solid var(--kc-rule)}
.kc-qr svg{display:block;width:100%;height:100%}
.kc-cfoot{border-top:1px solid var(--kc-rule);padding:11px 17px;display:flex;
 align-items:center;gap:9px;font-size:12.5px}
.kc-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.kc-dot.ok{background:var(--kc-ok)}.kc-dot.wa{background:var(--kc-wa)}
.kc-dot.cr{background:var(--kc-cr)}
.kc-nota{font-size:12px;color:var(--kc-ink3);margin:12px 16px;text-align:center;line-height:1.45}

/* --- curso --- */
.kc-top{position:sticky;top:0;z-index:20;background:var(--kc-card);
 border-bottom:1px solid var(--kc-rule);padding:11px 16px 0}
.kc-bar{height:3px;background:var(--kc-rule);border-radius:2px;overflow:hidden}
.kc-bar i{display:block;height:100%;background:var(--kc-ac);width:0;transition:width .3s}
@media (prefers-reduced-motion:reduce){.kc-bar i{transition:none}}
.kc-main{padding:20px 18px 12px}
.kc-h1{font-family:var(--kc-fd);font-weight:700;font-size:25px;line-height:1.08;margin-bottom:13px}
.kc-h2{font-family:var(--kc-fd);font-weight:600;font-size:19px;margin:24px 0 9px}
.kc-h2:first-child{margin-top:0}
.kc-p{margin:0 0 14px}
.kc-ul{margin:0 0 15px;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.kc-ul li{position:relative;padding-left:21px;color:var(--kc-ink2)}
.kc-ul li::before{content:'';position:absolute;left:4px;top:.62em;width:6px;height:6px;
 border-radius:50%;background:var(--kc-ac)}
.kc-avi{background:var(--kc-was);border-left:3px solid var(--kc-wa);border-radius:8px;
 padding:13px 15px;margin:0 0 15px;font-size:14.5px;color:var(--kc-ink2)}
.kc-pie{font-size:12.5px;color:var(--kc-ink3);margin:-7px 0 15px;font-style:italic}
.kc-q{font-family:var(--kc-fd);font-weight:600;font-size:20px;line-height:1.2;margin:0 0 17px}
.kc-ops{display:flex;flex-direction:column;gap:9px}
.kc-op{display:block;width:100%;text-align:left;cursor:pointer;background:var(--kc-card);
 border:1.5px solid var(--kc-rule2);border-radius:10px;padding:13px 15px;
 box-shadow:var(--kc-sh);line-height:1.4}
.kc-op[aria-pressed=true]{border-color:var(--kc-ac);background:var(--kc-acs)}
.kc-op:disabled{cursor:default}
.kc-foot{position:sticky;bottom:0;background:var(--kc-card);border-top:1px solid var(--kc-rule);
 padding:12px 18px calc(12px + env(safe-area-inset-bottom))}
.kc-btn{width:100%;font-family:var(--kc-fd);font-weight:600;font-size:16px;
 background:var(--kc-ac);color:var(--kc-ground);border:none;border-radius:10px;
 padding:13px;cursor:pointer}
.kc-btn:disabled{background:var(--kc-card2);color:var(--kc-ink3);cursor:default}
.kc-aro{width:112px;height:112px;margin:0 auto 18px;position:relative}
.kc-aro svg{transform:rotate(-90deg)}
.kc-aro .n{position:absolute;inset:0;display:grid;place-items:center;
 font-family:var(--kc-fd);font-weight:700;font-size:29px}

/* --- tablas y paneles anchos --- */
.kc-sc{overflow-x:auto;border:1px solid var(--kc-rule);border-radius:9px;
 background:var(--kc-card);box-shadow:var(--kc-sh);margin-bottom:16px}
.kc table{border-collapse:collapse;width:100%;min-width:640px;font-size:14px}
.kc th{font-family:var(--kc-fm);font-size:9.5px;font-weight:500;letter-spacing:.07em;
 text-transform:uppercase;color:var(--kc-ink3);text-align:left;padding:10px 12px;
 background:var(--kc-card2);border-bottom:1px solid var(--kc-rule2);white-space:nowrap}
.kc td{padding:9px 12px;border-bottom:1px solid var(--kc-rule);vertical-align:middle}
.kc tr:last-child td{border-bottom:none}
.kc td.k{font-family:var(--kc-fd);font-weight:600;white-space:nowrap}
.kc td.n{font-family:var(--kc-fm);font-variant-numeric:tabular-nums;font-size:13px}
.kc-tag{font-family:var(--kc-fm);font-size:9px;letter-spacing:.06em;text-transform:uppercase;
 padding:3px 7px;border-radius:3px;white-space:nowrap}
.kc-tag.si{background:var(--kc-oks);color:var(--kc-ok)}
.kc-tag.no{background:var(--kc-crs);color:var(--kc-cr)}
.kc-mini{border:1px solid var(--kc-rule2);background:var(--kc-card2);color:var(--kc-ink2);
 border-radius:6px;padding:5px 10px;cursor:pointer;font-family:var(--kc-fd);
 font-weight:600;font-size:12.5px;white-space:nowrap}
.kc-mini.p{background:var(--kc-ac);border-color:var(--kc-ac);color:var(--kc-ground)}
.kc-cent{display:flex;align-items:center;gap:12px;border-radius:10px;padding:13px 16px;
 margin:16px 0}
.kc-cent.ok{background:var(--kc-oks)}.kc-cent.mal{background:var(--kc-crs)}
.kc-cent .b{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
 font-family:var(--kc-fd);font-weight:700;color:#fff;flex:0 0 auto}
.kc-cent.ok .b{background:var(--kc-ok)}.kc-cent.mal .b{background:var(--kc-cr)}
.kc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.kc-p1{background:var(--kc-card);border:1px solid var(--kc-rule);border-radius:10px;
 box-shadow:var(--kc-sh);overflow:hidden}
.kc-lks{display:flex;gap:6px;margin-top:9px}
.kc-lk{flex:1;border:1px solid var(--kc-rule);border-radius:6px;padding:6px;text-align:center}
.kc-lk.on{background:var(--kc-oks);border-color:transparent}
.kc-lk .i{font-size:13px}.kc-lk.on .i{color:var(--kc-ok)}.kc-lk.off .i{color:var(--kc-ink3)}
.kc-lk .l{font-family:var(--kc-fm);font-size:8.5px;letter-spacing:.05em;
 text-transform:uppercase;color:var(--kc-ink3);margin-top:3px}
.kc dialog{border:none;border-radius:12px;padding:0;max-width:460px;width:92vw;
 background:var(--kc-card);color:var(--kc-ink)}
.kc dialog::backdrop{background:rgba(17,32,27,.5)}
.kc-dlg{padding:20px}
.kc-dlg h3{font-size:18px;margin-bottom:5px}
.kc-dlg p{color:var(--kc-ink2);font-size:14px;margin:0 0 14px}
.kc-dlg label{display:block;font-family:var(--kc-fm);font-size:9.5px;letter-spacing:.07em;
 text-transform:uppercase;color:var(--kc-ink3);margin-bottom:5px}
.kc-dlg select,.kc-dlg input,.kc-dlg textarea{width:100%;font:inherit;font-size:14px;
 padding:9px 11px;border:1px solid var(--kc-rule2);border-radius:7px;
 background:var(--kc-card2);color:var(--kc-ink);margin-bottom:12px}
.kc-row{display:flex;gap:9px}.kc-row>button{flex:1}
.kc-b2{border:1px solid var(--kc-rule2);background:none;color:var(--kc-ink2);
 border-radius:8px;padding:10px;cursor:pointer;font-family:var(--kc-fd);font-weight:600}
`;

function estilos() {
  if (document.getElementById('kc-css')) return;
  const s = document.createElement('style');
  s.id = 'kc-css'; s.textContent = CSS;
  document.head.appendChild(s);
  if (!document.querySelector('link[href*="Barlow"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600' +
             '&family=Barlow+Semi+Condensed:wght@500;600;700' +
             '&family=Roboto+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  }
}

/* ------------------------------------------------------------- utilidades */
const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const EST = { vencida:'Vencida', por_vencer:'Por vencer', pendiente:'Pendiente', al_dia:'Al día' };
const EJE = { hse:'HSE', tecnica:'Técnica', arl:'ARL', induccion:'Inducción' };
const nodo = sel => typeof sel === 'string' ? document.querySelector(sel) : sel;
const hoy = () => new Date();
const dias = d => Math.round((new Date(d + 'T12:00:00') - hoy()) / 86400000);
const fecha = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO',
  { day:'2-digit', month:'short', year:'numeric' }) : '—';

function cargando(el, txt) {
  el.className = 'kc'; el.innerHTML = `<div class="kc-carga">${esc(txt || 'Cargando…')}</div>`;
}
function error(el, e) {
  el.className = 'kc';
  el.innerHTML = `<div class="kc-err"><b>No se pudo cargar</b>${esc(e.message || e)}</div>`;
  console.error('[KaluCap]', e);
}
async function rpc(fn, args) {
  const { data, error: err } = await sb.rpc(fn, args || {});
  if (err) throw new Error(err.message);
  return data;
}
function qrSvg(txt) {
  if (!global.qrcode) return `<div class="mono" style="font-size:9px;word-break:break-all">${esc(txt)}</div>`;
  const q = global.qrcode(0, 'M'); q.addData(txt); q.make();
  const n = q.getModuleCount(); let p = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"
    aria-label="Código de la credencial"><path d="${p}" fill="#11201B"/></svg>`;
}

/* =================================================================
   PASAPORTE — app.html
   ================================================================= */
async function pasaporte(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Cargando tu pasaporte…');
  let D;
  try { D = await rpc('cap_mi_pasaporte'); } catch (e) { return error(el, e); }
  if (!D || !D.persona) return error(el, new Error(
    'No se encontró tu ficha. Puede que tu usuario todavía no esté vinculado a una persona.'));

  let filtro = 'todas', tab = 'pas';
  const items = D.items || [], port = D.portada || {};
  const form = items.filter(x => x.tipo !== 'charla');
  const charlas = items.filter(x => x.tipo === 'charla');

  function pintar() {
    const cls = port.vencidas > 0 ? 'cr' : (port.pendientes > 0 ? 'wa' : 'ok');
    const t1 = port.vencidas > 0
      ? (port.vencidas === 1 ? 'Tenés 1 vencida' : `Tenés ${port.vencidas} vencidas`)
      : (port.pendientes > 0 ? `${port.pendientes} pendientes` : 'Al día');
    const t2 = port.vencidas > 0 ? 'Hablá con el área HSE para reprogramarla.'
      : (port.pendientes > 0 ? 'Ninguna vencida. Están sin dictar o sin programar.'
                             : 'Toda tu formación está vigente.');

    const lista = filtro === 'charla' ? charlas
      : form.filter(x => filtro === 'todas' || x.estado === filtro);

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wrap">
      <div class="kc-hero">
        <div class="kc-cargo">${esc(D.persona.cargo)}</div>
        <div class="kc-nom">${esc(D.persona.nombre)}</div>
        <div class="kc-band ${cls}"><div class="m">${cls === 'ok' ? '✓' : '!'}</div>
          <div><div class="t1">${esc(t1)}</div><div class="t2">${esc(t2)}</div></div></div>
        <div class="kc-cts">
          <div class="kc-ct v"><b>${port.vencidas ?? 0}</b><span>Vencidas</span></div>
          <div class="kc-ct x"><b>${port.por_vencer ?? 0}</b><span>Por vencer</span></div>
          <div class="kc-ct"><b>${port.pendientes ?? 0}</b><span>Pendientes</span></div>
          <div class="kc-ct a"><b>${port.al_dia ?? 0}</b><span>Al día</span></div></div>
      </div>
      <div class="kc-tabs" role="tablist">
        <button class="kc-tab" data-t="pas" role="tab" aria-selected="${tab==='pas'}">Capacitaciones</button>
        <button class="kc-tab" data-t="cred" role="tab" aria-selected="${tab==='cred'}">Credencial</button>
      </div>
      ${tab === 'pas' ? vistaLista(lista) : vistaCred()}
    </div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => { tab = b.dataset.t; pintar(); });
    el.querySelectorAll('.kc-chip').forEach(b => b.onclick = () => { filtro = b.dataset.f; pintar(); });
    el.querySelectorAll('.kc-it').forEach(b => b.onclick = ev => {
      if (ev.target.closest('.kc-go')) return;
      b.classList.toggle('open');
    });
    el.querySelectorAll('.kc-go').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      curso(sel, b.dataset.c, { volver: () => pasaporte(sel, opt) });
    });
  }

  function vistaLista(lista) {
    const cont = (k, l, n) =>
      `<button class="kc-chip" data-f="${k}" aria-pressed="${filtro===k}">${l} · ${n}</button>`;
    const disp = new Set((D.disponibles || []).map(d => d.catalogo_id));
    return `<div class="kc-fil">
        ${cont('todas','Formación',form.length)}
        ${cont('vencida','Vencidas',form.filter(x=>x.estado==='vencida').length)}
        ${cont('por_vencer','Por vencer',form.filter(x=>x.estado==='por_vencer').length)}
        ${cont('pendiente','Pendientes',form.filter(x=>x.estado==='pendiente').length)}
        ${cont('al_dia','Al día',form.filter(x=>x.estado==='al_dia').length)}
        ${cont('charla','Charlas semanales',charlas.length)}
      </div>
      <div class="kc-list">` + (lista.length ? lista.map(x => {
        let meta;
        if (x.estado === 'pendiente') meta = 'Sin registro de asistencia';
        else if (x.estado === 'al_dia' && !x.vence_el) meta = 'Hecha el ' + fecha(x.ultima_vez) + ' · no vence';
        else if (x.estado === 'vencida') meta = 'Venció el ' + fecha(x.vence_el) + ' · hace ' + Math.abs(dias(x.vence_el)) + ' días';
        else if (x.estado === 'por_vencer') meta = 'Vence el ' + fecha(x.vence_el) + ' · en ' + dias(x.vence_el) + ' días';
        else meta = 'Hecha el ' + fecha(x.ultima_vez) + ' · vence ' + fecha(x.vence_el);
        const puede = disp.has(x.catalogo_id);
        return `<button class="kc-it" type="button">
          <div class="kc-st ${x.estado}"></div>
          <div style="flex:1;min-width:0">
            <div class="kc-bd">
              <div class="kc-r1"><span class="kc-cd">${esc(x.codigo[0])}-${esc(x.codigo.slice(1))} · ${EJE[x.eje]||x.eje}</span>
                <span class="kc-pill ${x.estado}">${EST[x.estado]}</span></div>
              <div class="kc-tt">${esc(x.titulo)}</div>
              <div class="kc-mt">${esc(meta)}</div>
            </div>
            <div class="kc-why"><b>Por qué me aplica</b>${esc(x.por_que_aplica)}
              ${x.certificable ? ' · Genera certificado' : ''}
              ${puede ? `<button class="kc-go" data-c="${x.catalogo_id}">Hacerla ahora</button>` : ''}
            </div>
          </div></button>`;
      }).join('') : '<p class="kc-vacio">Nada en esta categoría.</p>') + `</div>`;
  }

  function vistaCred() {
    const cls = port.vencidas > 0 ? 'cr' : (port.pendientes > 0 ? 'wa' : 'ok');
    const tot = (port.al_dia||0)+(port.pendientes||0)+(port.vencidas||0)+(port.por_vencer||0);
    return `<div class="kc-cred">
      <div class="kc-ctop"><div class="l">${esc(opt && opt.empresa || 'DINAMHO T&T')}</div>
        <div class="r">Credencial SST</div></div>
      <div class="kc-cbody">
        <div class="kc-nom" style="font-size:21px;margin-bottom:3px">${esc(D.persona.nombre)}</div>
        <div style="font-size:13.5px;color:var(--kc-ink2)">${esc(D.persona.cargo)}</div>
        <div class="kc-cgrid">
          <div>
            <div class="kc-fld"><div class="k">Cédula</div><div class="v">${esc(D.persona.cedula||'—')}</div></div>
            <div class="kc-fld"><div class="k">Formación vigente</div>
              <div class="v">${port.al_dia ?? 0} de ${tot}</div></div>
            <div class="kc-fld"><div class="k">Verificada</div>
              <div class="v">${hoy().toLocaleDateString('es-CO')}</div></div>
          </div>
          <div class="kc-qr">${qrSvg(D.persona.token || '')}</div>
        </div>
      </div>
      <div class="kc-cfoot"><span class="kc-dot ${cls}"></span><span>${
        port.vencidas > 0 ? port.vencidas + ' vencida(s)'
        : (port.pendientes > 0 ? 'Sin vencidas · ' + port.pendientes + ' pendientes'
                               : 'Formación al día')}</span></div>
    </div>
    <p class="kc-nota">El supervisor escanea el código y ve tu estado en tiempo real.
      El código no guarda el estado: lo consulta.</p>`;
  }

  pintar();
}

/* =================================================================
   CURSO — autoestudio
   ================================================================= */
async function curso(sel, catalogoId, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Abriendo el curso…');
  let C;
  try { C = await rpc('cap_mi_curso', { p_catalogo: catalogoId }); }
  catch (e) { return error(el, e); }

  const pant = [];
  (C.contenido || []).forEach(b => {
    if (b.tipo === 'titulo' || !pant.length) pant.push([]);
    pant[pant.length - 1].push(b);
  });
  const Q = C.preguntas || [];
  let i = 0, resp = {}, fin = null, enviando = false;
  const TOT = pant.length + Q.length;

  function bloque(b) {
    if (b.tipo === 'titulo') return `<h2 class="kc-h2">${esc(b.texto)}</h2>`;
    if (b.tipo === 'aviso')  return `<div class="kc-avi">${esc(b.texto)}</div>` +
      (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
    if (b.tipo === 'lista')  return '<ul class="kc-ul">' + b.texto.split('|').map(x => {
        const m = x.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)\s—\s(.*)$/);
        return `<li>${m ? '<b>'+esc(m[1])+'</b> — '+esc(m[2]) : esc(x)}</li>`;
      }).join('') + '</ul>' + (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
    if (b.tipo === 'imagen') return `<img src="${esc(b.url)}" alt="${esc(b.nota||'')}"
      style="width:100%;border-radius:8px;margin-bottom:14px">`;
    if (b.tipo === 'separador') return '<hr style="border:none;border-top:1px solid var(--kc-rule);margin:20px 0">';
    return `<p class="kc-p">${esc(b.texto)}</p>` + (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
  }

  function pintar() {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wrap">
      <div class="kc-top"><div style="display:flex;gap:10px;align-items:center;margin-bottom:9px">
        <div style="min-width:0"><div class="kc-cd">Autoestudio · intento ${C.numero} de 2</div>
        <div class="kc-tt" id="kc-ct"></div></div>
        <div class="kc-cd" style="margin-left:auto" id="kc-paso"></div></div>
        <div class="kc-bar"><i id="kc-bi"></i></div></div>
      <div class="kc-main" id="kc-m"></div>
      <div class="kc-foot"><button class="kc-btn" id="kc-b"></button></div></div>`;
    render();
  }

  function render() {
    const m = el.querySelector('#kc-m'), b = el.querySelector('#kc-b');
    el.querySelector('#kc-bi').style.width = Math.round(100 * Math.min(i, TOT) / TOT) + '%';
    el.querySelector('#kc-ct').textContent = opt && opt.titulo || '';

    if (fin) return verFin();

    if (i < pant.length) {
      el.querySelector('#kc-paso').textContent = `Lectura ${i+1}/${pant.length}`;
      m.innerHTML = pant[i].map(bloque).join('');
      b.disabled = false;
      b.textContent = i === pant.length - 1 ? 'Empezar las preguntas' : 'Seguir';
      b.onclick = () => { i++; window.scrollTo(0,0); render(); };
      return;
    }
    const k = i - pant.length, q = Q[k];
    el.querySelector('#kc-paso').textContent = `Pregunta ${k+1}/${Q.length}`;
    m.innerHTML = `<p class="kc-cd" style="margin-bottom:8px">PREGUNTA ${k+1} DE ${Q.length}</p>
      <p class="kc-q">${esc(q.enunciado)}</p><div class="kc-ops">` +
      q.opciones.map(o => `<button class="kc-op" type="button" data-o="${o.id}"
        aria-pressed="${resp[q.id]===o.id}">${esc(o.texto)}</button>`).join('') + '</div>';
    m.querySelectorAll('.kc-op').forEach(x => x.onclick = () => { resp[q.id] = x.dataset.o; render(); });
    b.disabled = !resp[q.id] || enviando;
    b.textContent = k === Q.length - 1 ? 'Entregar' : 'Siguiente';
    b.onclick = async () => {
      if (k < Q.length - 1) { i++; window.scrollTo(0,0); return render(); }
      enviando = true; b.disabled = true; b.textContent = 'Corrigiendo…';
      try { fin = await rpc('cap_entregar', { p_intento: C.intento_id, p_respuestas: resp }); }
      catch (e) { enviando = false; return error(el, e); }
      i = TOT; window.scrollTo(0,0); render();
    };
  }

  function verFin() {
    const f = fin, R = 50, Cc = 2 * Math.PI * R;
    const col = f.aprobado ? 'var(--kc-ok)' : 'var(--kc-cr)';
    el.querySelector('#kc-paso').textContent = `Intento ${f.intento} de 2`;
    el.querySelector('#kc-m').innerHTML = `<div style="text-align:center;padding:16px 0">
      <div class="kc-aro"><svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r="${R}" fill="none" stroke="var(--kc-rule)" stroke-width="9"/>
        <circle cx="56" cy="56" r="${R}" fill="none" stroke="${col}" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${Cc}"
          stroke-dashoffset="${Cc*(1-f.nota/100)}"/></svg>
        <div class="n" style="color:${col}">${f.nota}%</div></div>
      <h2 style="font-size:24px;color:${col};margin-bottom:7px">${f.aprobado ? 'Aprobaste' : 'No alcanzó'}</h2>
      <p style="color:var(--kc-ink2);max-width:34ch;margin:0 auto 16px;font-size:15px">${
        f.aprobado ? `Acertaste ${f.correctas} de ${f.total}. Ya quedó registrada en tu pasaporte.`
        : `Acertaste ${f.correctas} de ${f.total}. Hace falta ${f.minimo}% para aprobar.` +
          (f.puede_reintentar ? ' Te queda una oportunidad más.' : ' Hablá con HSE para reprogramarla.')}</p>
      <div style="text-align:left;border-top:1px solid var(--kc-rule);padding-top:16px">
        <p class="kc-cd" style="margin-bottom:11px">REPASO</p>` +
        (f.detalle||[]).map(d => `<div style="display:flex;gap:10px;padding:10px 0;
          border-bottom:1px solid var(--kc-rule);font-size:14.5px">
          <span style="flex:0 0 auto;width:19px;height:19px;border-radius:50%;display:grid;
            place-items:center;font-size:11px;color:#fff;margin-top:2px;
            background:${d.acerto ? 'var(--kc-ok)' : 'var(--kc-cr)'}">${d.acerto?'✓':'✕'}</span>
          <span>${esc(d.pregunta)}${d.acerto ? '' :
            `<i style="display:block;font-style:normal;color:var(--kc-ink3);font-size:13px;
             margin-top:3px">Era: ${esc(d.correcta)}</i>`}</span></div>`).join('') +
      `</div></div>`;
    const b = el.querySelector('#kc-b');
    b.disabled = false;
    b.textContent = (!f.aprobado && f.puede_reintentar) ? 'Intentar de nuevo' : 'Volver al pasaporte';
    b.onclick = () => {
      if (!f.aprobado && f.puede_reintentar) return curso(sel, catalogoId, opt);
      if (opt && opt.volver) opt.volver();
    };
  }
  pintar();
}

/* =================================================================
   SUPERVISIÓN — hse.html
   ================================================================= */
async function supervision(sel) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Cargando tu equipo…');
  let D, INF = null;
  try { D = await rpc('cap_mi_equipo'); } catch (e) { return error(el, e); }
  let tab = 1;
  const hoyD = hoy();

  async function pintar() {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:24px 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:18px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · PANEL DE SUPERVISIÓN</div>
        <h1 style="font-size:32px;font-weight:700">Mi equipo</h1>
        <p style="color:var(--kc-ink2);margin:6px 0 0">${esc(D.jefe?.nombre||'')} · ${esc(D.jefe?.cargo||'')}</p>
      </div>
      <div class="kc-tabs" style="margin-bottom:20px">
        <button class="kc-tab" data-t="1" aria-selected="${tab===1}">Mi equipo</button>
        <button class="kc-tab" data-t="2" aria-selected="${tab===2}">Me toca a mí (${(D.pendientes||[]).length})</button>
        <button class="kc-tab" data-t="3" aria-selected="${tab===3}">Informe mensual</button>
      </div>
      <div id="kc-v"></div></div>`;
    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => { tab = +b.dataset.t; pintar(); });
    const v = el.querySelector('#kc-v');
    if (tab === 1) v.innerHTML = vEquipo();
    else if (tab === 2) v.innerHTML = vPend();
    else { v.innerHTML = '<div class="kc-carga">Calculando…</div>'; await vInf(v); }
    v.querySelectorAll('[data-aval]').forEach(b => b.onclick = () => dlgAval(b.dataset.aval, b.dataset.ruta, b.dataset.nom));
  }

  function vEquipo() {
    const lk = (on, t) => `<div class="kc-lk ${on?'on':'off'}"><div class="i">${on?'✓':'○'}</div>
      <div class="l">${t}</div></div>`;
    return '<div class="kc-grid">' + (D.equipo||[]).map(p => {
      const puede = p.candado_cursos && p.candado_tiempo && !p.candado_aval;
      return `<article class="kc-p1">
        <div style="padding:13px 15px 11px;border-bottom:1px solid var(--kc-rule);display:flex;gap:10px">
          <div><div class="kc-tt" style="font-size:16px">${esc(p.persona)}</div>
            <div class="kc-cd" style="margin-top:3px">${esc(p.cargo)}</div></div>
          <span class="kc-tag ${p.apto_operacion?'si':'no'}" style="margin-left:auto;align-self:start">
            ${p.apto_operacion?'Apto':'No apto'}</span></div>
        <div class="kc-cts" style="border:none;border-radius:0;margin:0">
          <div class="kc-ct v"><b>${p.vencidas??0}</b><span>Vencidas</span></div>
          <div class="kc-ct x"><b>${p.por_vencer??0}</b><span>Por vencer</span></div>
          <div class="kc-ct"><b>${p.pendientes??0}</b><span>Pendientes</span></div>
          <div class="kc-ct a"><b>${p.al_dia??0}</b><span>Al día</span></div></div>
        <div style="padding:12px 15px">
          <div style="font-size:13px;color:var(--kc-ink2);margin-bottom:8px">Próximo peldaño:
            <b style="color:var(--kc-ink);font-family:var(--kc-fd);font-size:14px">${esc(p.cargo_siguiente||'—')}</b></div>
          <div class="kc-lks">
            ${lk(p.candado_cursos, (p.cursos_cumplidos??0)+'/'+(p.cursos_requeridos??0)+' cursos')}
            ${lk(p.candado_tiempo, p.meses_faltantes ? p.meses_faltantes+' meses' : 'tiempo')}
            ${lk(p.candado_aval, 'tu aval')}</div>
          ${puede ? `<button class="kc-btn" style="margin-top:10px;font-size:14px;padding:9px"
            data-aval="${p.persona_id}" data-ruta="${p.ruta_id}" data-nom="${esc(p.persona)}">Dar el aval</button>` : ''}
        </div></article>`;
    }).join('') + '</div>';
  }

  function vPend() {
    const P = D.pendientes || [];
    if (!P.length) return '<p class="kc-vacio">No hay nada esperándote.</p>';
    return '<div style="display:flex;flex-direction:column;gap:9px">' + P.map(x =>
      `<div style="background:var(--kc-card);border:1px solid var(--kc-rule);
        border-left:3px solid ${x.tipo==='aval'?'var(--kc-ac)':'var(--kc-wa)'};
        border-radius:8px;padding:12px 15px;display:flex;gap:12px;align-items:center;
        box-shadow:var(--kc-sh)">
        <span class="kc-tag" style="background:${x.tipo==='aval'?'var(--kc-acs)':'var(--kc-was)'};
          color:${x.tipo==='aval'?'var(--kc-ac)':'var(--kc-wa)'}">${x.tipo==='aval'?'Aval':'Desempeño'}</span>
        <b class="kc-tt" style="font-size:15px">${esc(x.persona)}</b>
        <span style="color:var(--kc-ink2);font-size:13.5px">${esc(x.detalle)}</span></div>`).join('') + '</div>';
  }

  async function vInf(v) {
    if (!INF) {
      try { INF = await rpc('cap_mi_informe', { p_anio: hoyD.getFullYear(), p_mes: hoyD.getMonth()+1 }); }
      catch (e) { return error(v, e); }
    }
    const C = [['persona','Persona','k'],['meses_en_el_cargo','Meses','n'],
      ['cap_completadas','Capacitaciones','n'],['charlas','Charlas','n'],
      ['pct_participacion','% partic.','n'],['ausencias_injust','Aus. injust.','n'],
      ['dicto_charlas','Dictó','n'],['avance_ruta','Avance','n'],
      ['falta_para_ascender','Falta para ascender','']];
    v.innerHTML = `<h2 style="font-size:19px;margin-bottom:5px">Informe de ${
      hoyD.toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</h2>
      <p style="color:var(--kc-ink2);font-size:14px;margin:0 0 15px;max-width:66ch">
        La mitad dura del informe, ya calculada. Lo que falta lo escribís vos.</p>
      <div class="kc-sc"><table><thead><tr>${C.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${(INF||[]).map(r => '<tr>' + C.map(c => {
        let val = c[0]==='charlas' ? `${r.charlas_asistidas}/${r.charlas_convocadas}`
          : c[0]==='pct_participacion' ? (r.pct_participacion!=null ? r.pct_participacion+'%' : '—')
          : (r[c[0]] ?? '—');
        return `<td class="${c[2]}">${esc(val)}</td>`;
      }).join('') + '</tr>').join('')}</tbody></table></div>
      <div style="background:var(--kc-was);border:1px dashed var(--kc-wa);border-radius:8px;
        padding:13px 16px;font-size:13.5px;color:var(--kc-ink2)">
        <b style="display:block;font-family:var(--kc-fm);font-size:10px;letter-spacing:.07em;
          text-transform:uppercase;color:var(--kc-wa);margin-bottom:5px">Lo que sigue siendo tuyo</b>
        El contexto operativo del mes, la valoración individual y las oportunidades de mejora.
        KALU no las escribe: te evita tipear los datos.</div>`;
  }

  function dlgAval(persona, ruta, nombre) {
    const d = document.createElement('dialog');
    d.innerHTML = `<div class="kc-dlg"><h3>Aval para ${esc(nombre)}</h3>
      <p>Cumple los cursos y el tiempo. Falta tu valoración. Queda registrada con tu nombre y la fecha.</p>
      <label for="kcr">Resultado</label>
      <select id="kcr"><option value="aprobado">Aprobado — está lista para el ascenso</option>
        <option value="con_reservas">Con reservas — avanza con seguimiento</option>
        <option value="no_aprobado">No aprobado — todavía no</option></select>
      <label for="kco">Observación</label><textarea id="kco" rows="3"></textarea>
      <div class="kc-row"><button class="kc-b2" id="kcx">Cancelar</button>
        <button class="kc-btn" id="kck">Guardar</button></div></div>`;
    const w = el.querySelector('.kc-wide') || el;
    w.appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const btn = d.querySelector('#kck'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await rpc('cap_dar_aval', { p_persona: persona, p_ruta: ruta,
          p_resultado: d.querySelector('#kcr').value,
          p_observacion: d.querySelector('#kco').value || null });
        d.close(); d.remove(); supervision(sel);
      } catch (e) { btn.disabled = false; btn.textContent = 'Guardar'; alert(e.message); }
    };
  }
  pintar();
}

/* =================================================================
   ADMINISTRACIÓN — admin.html
   ================================================================= */
async function admin(sel) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Cargando…');
  let D;
  try { D = await rpc('cap_admin_datos'); } catch (e) { return error(el, e); }
  let tab = 1;

  function pintar() {
    const sm = (D.sinMapear || []).length;
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:24px 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:6px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · ADMINISTRACIÓN</div>
        <h1 style="font-size:30px;font-weight:700">Cargos y personas</h1></div>
      <div class="kc-cent ${sm?'mal':'ok'}"><div class="b">${sm||'✓'}</div><div>
        <div class="kc-tt" style="font-size:15px;color:${sm?'var(--kc-cr)':'var(--kc-ok)'}">${
          sm ? sm+' persona(s) con el cargo sin mapear' : 'Todos los cargos mapeados'}</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${sm
          ? 'A esta gente el sistema dejó de exigirle su formación por cargo. Mapealas antes de seguir.'
          : 'Si alguien escribe una variante nueva, aparece acá en rojo.'}</div></div></div>
      ${sm ? '<div class="kc-sc"><table><thead><tr><th>Persona</th><th>Cargo escrito</th>' +
        '<th>Capacitaciones hoy</th><th></th></tr></thead><tbody>' +
        D.sinMapear.map(s => `<tr><td class="k">${esc(s.nombre)}</td>
          <td>${esc(s.cargo_texto)}</td><td class="n">${s.capacitaciones_hoy}</td>
          <td><button class="kc-mini p" data-map="${esc(s.cargo_texto)}">Mapear</button></td></tr>`).join('') +
        '</tbody></table></div>' : ''}
      <div class="kc-tabs" style="margin:18px 0 20px">
        <button class="kc-tab" data-t="1" aria-selected="${tab===1}">Personas</button>
        <button class="kc-tab" data-t="2" aria-selected="${tab===2}">Catálogo de cargos</button>
      </div>
      <div id="kc-v">${tab===1 ? vPers() : vCargos()}</div></div>`;
    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => { tab = +b.dataset.t; pintar(); });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => dlg(b.dataset.a, b.dataset.i));
    el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => dlgMapear(b.dataset.map));
  }

  function vPers() {
    return '<div class="kc-sc"><table><thead><tr><th>Persona</th><th>Cargo</th>' +
      '<th>En el padrón</th><th>Desde</th><th>Meses</th><th>Apto</th><th>Venc.</th>' +
      '<th>Tramos</th><th></th></tr></thead><tbody>' +
      (D.personas||[]).map(p => `<tr>
        <td class="k">${esc(p.nombre)}</td><td>${esc(p.cargo||'—')}</td>
        <td style="color:var(--kc-ink3);font-size:13px">${esc(p.cargoTexto)}</td>
        <td class="n">${esc(p.desde||'—')}</td><td class="n">${p.meses ?? '—'}</td>
        <td><span class="kc-tag ${p.apto?'si':'no'}">${p.apto?'Sí':'No'}</span></td>
        <td class="n">${p.venc ?? 0}</td><td class="n">${p.tramos}</td>
        <td><div style="display:flex;gap:6px">
          <button class="kc-mini" data-a="corregir" data-i="${p.id}">Corregir</button>
          <button class="kc-mini p" data-a="mover" data-i="${p.id}">Mover</button></div></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  function vCargos() {
    return '<div class="kc-sc"><table><thead><tr><th>Cargo</th><th>Área</th><th>Reporta a</th>' +
      '<th>Personas</th><th>Alias</th><th>Rutas</th><th></th></tr></thead><tbody>' +
      (D.cargos||[]).map(c => `<tr${c.activo?'':' style="opacity:.5"'}>
        <td class="k">${esc(c.nombre)}</td><td style="color:var(--kc-ink3)">${esc(c.area||'—')}</td>
        <td style="color:var(--kc-ink3)">${esc(c.jefe||'—')}</td>
        <td class="n">${c.personas}</td><td class="n">${c.alias}</td>
        <td class="n">↑${c.rutasEntran} ↓${c.rutasSalen}</td>
        <td><div style="display:flex;gap:6px">
          <button class="kc-mini" data-a="renombrar" data-i="${c.id}">Renombrar</button>
          <button class="kc-mini" data-a="desactivar" data-i="${c.id}">Desactivar</button></div></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  const opts = (sel2) => (D.cargos||[]).filter(c=>c.activo).map(c =>
    `<option value="${c.id}"${c.nombre===sel2?' selected':''}>${esc(c.nombre)}</option>`).join('');

  function abrir(html, onOk) {
    const d = document.createElement('dialog');
    d.innerHTML = `<div class="kc-dlg">${html}<div class="kc-row">
      <button class="kc-b2" id="kcx">Cancelar</button>
      <button class="kc-btn" id="kck">Guardar</button></div></div>`;
    el.querySelector('.kc-wide').appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const b = d.querySelector('#kck'); b.disabled = true; b.textContent = 'Guardando…';
      try { await onOk(d); d.close(); d.remove(); admin(sel); }
      catch (e) { b.disabled = false; b.textContent = 'Guardar'; alert(e.message); }
    };
    return d;
  }

  function dlg(accion, id) {
    const p = (D.personas||[]).find(x => x.id === id);
    const c = (D.cargos||[]).find(x => x.id === id);
    if (accion === 'corregir') {
      abrir(`<h3>Corregir el cargo de ${esc(p.nombre)}</h3>
        <p>Usalo sólo si el dato estaba mal cargado. La antigüedad sigue corriendo desde el ${esc(p.desde)}.</p>
        <label for="k1">Cargo correcto</label><select id="k1">${opts(p.cargo)}</select>
        <label for="k2">Motivo</label><input type="text" id="k2" placeholder="Ej: se cargó mal en el alta">`,
        d => rpc('cap_corregir_cargo', { p_persona: id,
          p_cargo: d.querySelector('#k1').value, p_motivo: d.querySelector('#k2').value }));
    } else if (accion === 'mover') {
      abrir(`<h3>Mover a ${esc(p.nombre)}</h3>
        <p>Se cierra el tramo actual y se abre uno nuevo. Los ${p.meses??0} meses acumulados
        quedan en la historia; el peldaño nuevo arranca en cero.</p>
        <label for="k1">Cargo nuevo</label><select id="k1">${opts(p.sig)}</select>
        <label for="k3">Fecha del movimiento</label>
        <input type="date" id="k3" value="${new Date().toISOString().slice(0,10)}">
        <label for="k2">Motivo</label><input type="text" id="k2" placeholder="Ej: ascenso con aval">`,
        d => rpc('cap_mover_cargo', { p_persona: id, p_cargo: d.querySelector('#k1').value,
          p_fecha: d.querySelector('#k3').value, p_motivo: d.querySelector('#k2').value }));
    } else if (accion === 'renombrar') {
      abrir(`<h3>Renombrar “${esc(c.nombre)}”</h3>
        <p>Es seguro: todo apunta al identificador. El nombre viejo queda como alias.</p>
        <label for="k1">Nombre nuevo</label><input type="text" id="k1" value="${esc(c.nombre)}">`,
        d => rpc('cap_renombrar_cargo', { p_cargo: id, p_nombre: d.querySelector('#k1').value }));
    } else {
      abrir(`<h3>Desactivar “${esc(c.nombre)}”</h3>
        <p>${c.personas ? `<b>${c.personas} persona(s)</b> tienen este cargo. Movelas primero:
          si lo desactivás quedan sin plan de formación.` : 'Nadie ocupa este cargo.'}</p>`,
        () => rpc('cap_desactivar_cargo', { p_cargo: id }));
    }
  }

  function dlgMapear(alias) {
    abrir(`<h3>Mapear “${esc(alias)}”</h3>
      <p>Elegí a qué cargo normalizado corresponde esta variante.</p>
      <label for="k1">Cargo</label><select id="k1">${opts()}</select>`,
      async d => {
        const emp = (D.personas[0] || {}).empresa_id;
        return rpc('cap_mapear_alias', { p_empresa: emp || null,
          p_alias: alias, p_cargo: d.querySelector('#k1').value });
      });
  }
  pintar();
}

/* =================================================================
   VERIFICAR CREDENCIAL — para el supervisor que escanea
   ================================================================= */
async function verificar(sel, token) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Verificando…');
  let r;
  try { r = await rpc('cap_verificar', { p_token: token }); } catch (e) { return error(el, e); }
  if (!r || !r.valido) {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-err"><b>Credencial no válida</b>Ese código no corresponde a nadie.</div>`;
    return;
  }
  const cls = r.apto_operacion ? 'ok' : 'cr';
  el.className = 'kc';
  el.innerHTML = `<div class="kc-wrap"><div class="kc-hero">
    <div class="kc-cargo">${esc(r.cargo)}</div>
    <div class="kc-nom">${esc(r.nombre)}</div>
    <div class="kc-band ${cls}"><div class="m">${r.apto_operacion?'✓':'!'}</div>
      <div><div class="t1">${r.apto_operacion ? 'Apto para operar' : 'No apto'}</div>
      <div class="t2">${r.vencidas} vencida(s) · ${r.pendientes} pendiente(s)</div></div></div>
    <p class="kc-nota">Verificado el ${new Date(r.verificado).toLocaleString('es-CO')}</p>
  </div></div>`;
}

/* ------------------------------------------------------------------ init */
function init(cfg) {
  if (cfg && cfg.client) { sb = cfg.client; return; }
  if (!global.supabase || !global.supabase.createClient)
    throw new Error('Falta supabase-js. Cargalo antes de capacitador.js');
  if (!cfg || !cfg.url || !cfg.key)
    throw new Error('KaluCap.init necesita { url, key } o { client }');
  sb = global.supabase.createClient(cfg.url, cfg.key);
}

global.KaluCap = { init, pasaporte, curso, supervision, admin, verificar,
                   get cliente() { return sb; } };

})(typeof window !== 'undefined' ? window : this);
