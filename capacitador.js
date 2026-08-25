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
       KaluCap.init();        // toma config.js y la sesión de KALU solo
       KaluCap.pasaporte('#cap');        // app.html   — el trabajador
       KaluCap.supervision('#cap');      // hse.html   — el supervisor
       KaluCap.admin('#cap');            // admin.html — HSE / operaciones
     </script>

   Sesión compartida: lee window.KALU (config.js) y el token que
   ingreso.html deja en localStorage bajo 'sb-<ref>-auth-token'.
   En páginas standalone usá  await KaluCap.iniciar()  (renueva token y
   prende el candado de sesión); init() sigue existiendo, sincrónico,
   para hosts que ya lo llamaban así.

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
.kc-ct{background:var(--kc-card2);padding:9px 4px;text-align:center;border:none;
 font:inherit;color:inherit;cursor:pointer;position:relative}
.kc-ct[aria-pressed=true]{background:var(--kc-card);box-shadow:inset 0 -3px 0 var(--kc-ac)}
.kc-ct:focus-visible{outline:2px solid var(--kc-ac);outline-offset:-3px}
.kc-ct b{display:block;font-family:var(--kc-fd);font-weight:700;font-size:19px;line-height:1;
 font-variant-numeric:tabular-nums}
.kc-ct span{display:block;font-family:var(--kc-fm);font-size:8px;letter-spacing:.06em;
 text-transform:uppercase;color:var(--kc-ink3);margin-top:4px}
.kc-ct.v b{color:var(--kc-cr)}.kc-ct.x b{color:var(--kc-wa)}.kc-ct.a b{color:var(--kc-ok)}

/* --- pestañas y filtros --- */
.kc-tabs{display:flex;flex-wrap:wrap;background:var(--kc-card);
 border-bottom:1px solid var(--kc-rule)}
.kc-tab{flex:1 1 0;min-width:152px;background:none;border:none;padding:12px 4px;cursor:pointer;
 font-family:var(--kc-fd);font-weight:600;font-size:14px;letter-spacing:.03em;
 text-transform:uppercase;color:var(--kc-ink3);border-bottom:2px solid transparent}
.kc-tab[aria-selected=true]{color:var(--kc-ac);border-bottom-color:var(--kc-ac)}
.kc-tab:focus-visible{outline:2px solid var(--kc-ac);outline-offset:-3px}
/* La franja de categorías queda pegada arriba: se cambia de categoría
   sin tener que volver al principio de la lista. */
.kc-fil{display:flex;flex-wrap:wrap;gap:7px;padding:12px 16px;
 position:sticky;top:0;z-index:6;background:var(--kc-ground);
 box-shadow:0 6px 10px -10px rgba(17,32,27,.5)}
.kc-wide .kc-fil{position:static;box-shadow:none;background:none}
.kc-filtro{margin:0 16px 10px;font-size:13px;color:var(--kc-ink2);
 display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.kc-filtro button{background:none;border:none;padding:0;cursor:pointer;
 color:var(--kc-ac);font:inherit;text-decoration:underline}
.kc-chip{flex:0 0 auto;border:1px solid var(--kc-rule2);background:var(--kc-card);
 color:var(--kc-ink2);border-radius:999px;padding:6px 12px;cursor:pointer;
 font-size:12.5px;font-weight:500;white-space:nowrap}
.kc-chip[aria-pressed=true]{background:var(--kc-ac);border-color:var(--kc-ac);color:var(--kc-ground)}

/* --- lista de capacitaciones --- */
.kc-eje{display:flex;align-items:center;gap:10px;margin:22px 16px 2px;
 font-family:var(--kc-fd);font-weight:700;font-size:17px;letter-spacing:-.01em}
.kc-eje:first-child{margin-top:6px}
.kc-eje span{flex:0 0 auto}
.kc-eje::after{content:'';flex:1;height:2px;background:var(--kc-ink);opacity:.14}
.kc-eje i{font-family:var(--kc-fm);font-style:normal;font-size:11px;color:var(--kc-ink3)}
.kc-sub{margin:13px 16px 7px;font-family:var(--kc-fm);font-size:9.5px;letter-spacing:.09em;
 text-transform:uppercase;color:var(--kc-ink3)}
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
.kc-go{display:block;margin-top:11px;background:var(--kc-ac);color:var(--kc-ground);border:none;
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
.kc-qr{width:134px;height:134px;background:#fff;padding:4px;border-radius:7px;
 border:1px solid var(--kc-rule)}
@media (max-width:380px){.kc-qr{width:118px;height:118px}}
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

/* --- catálogo y cronograma --- */
.kc-bar2{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.kc-bus{flex:1 1 220px;min-width:0;font:inherit;font-size:14px;padding:9px 12px;
 border:1px solid var(--kc-rule2);border-radius:8px;background:var(--kc-card);color:var(--kc-ink)}
.kc-sel{font:inherit;font-size:14px;padding:9px 11px;border:1px solid var(--kc-rule2);
 border-radius:8px;background:var(--kc-card);color:var(--kc-ink)}
.kc-tag.wa{background:var(--kc-was);color:var(--kc-wa)}
.kc-tag.n{background:var(--kc-card2);color:var(--kc-ink2)}
.kc-tag.g{background:var(--kc-card2);color:var(--kc-ink3)}
.kc-chips{display:flex;flex-wrap:wrap;gap:4px;max-width:290px}
.kc-mch{font-size:11.5px;background:var(--kc-card2);border:1px solid var(--kc-rule);
 color:var(--kc-ink2);border-radius:4px;padding:1px 6px;white-space:nowrap}
.kc-mch.b{background:var(--kc-was);border-color:transparent;color:var(--kc-wa)}
.kc-mes{font-family:var(--kc-fd);font-weight:700;font-size:13px;letter-spacing:.04em;
 text-transform:uppercase;color:var(--kc-ink3);margin:20px 0 8px;display:flex;
 align-items:center;gap:9px}
.kc-mes::after{content:'';flex:1;height:1px;background:var(--kc-rule)}
.kc-mes span{order:3;font-family:var(--kc-fm);font-size:11px;color:var(--kc-ink3)}
.kc-ev{display:flex;align-items:center;gap:13px;background:var(--kc-card);
 border:1px solid var(--kc-rule);border-radius:9px;padding:9px 13px;margin-bottom:7px;
 box-shadow:var(--kc-sh)}
.kc-ev.off{opacity:.5}
.kc-ev.off .kc-evt{text-decoration:line-through}
.kc-evd{flex:0 0 44px;text-align:center;font-family:var(--kc-fm);line-height:1.1}
.kc-evd b{display:block;font-family:var(--kc-fd);font-size:19px;font-weight:700}
.kc-evd span{font-size:9.5px;color:var(--kc-ink3);text-transform:uppercase}
.kc-mal{color:var(--kc-cr);font-style:normal}
.kc-evb{flex:1;min-width:0}
.kc-evt{font-family:var(--kc-fd);font-weight:600;font-size:15px;line-height:1.25}
.kc-eva{display:flex;gap:6px;flex:0 0 auto}
.kc-asig{display:flex;align-items:center;gap:10px;padding:8px 0;
 border-bottom:1px solid var(--kc-rule);font-size:13.5px}
.kc-asig>div{flex:1;min-width:0}



/* --- generador con IA --- */
.kc-gen{display:flex;flex-direction:column;gap:10px}
.kc-gi{background:var(--kc-card);border:1px solid var(--kc-rule);border-left:3px solid var(--kc-rule2);
 border-radius:9px;padding:13px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;
 box-shadow:var(--kc-sh)}
.kc-gi.borrador{border-left-color:var(--kc-wa)}
.kc-gi.publicada{border-left-color:var(--kc-ok)}
.kc-gi.error{border-left-color:var(--kc-cr)}
.kc-gi.procesando,.kc-gi.pendiente{border-left-color:var(--kc-ac)}
.kc-gi .n{flex:1;min-width:0}
.kc-gi .n b{font-family:var(--kc-fd);font-size:16px;display:block}
.kc-gi .n span{font-size:12.5px;color:var(--kc-ink3)}
.kc-bl{background:var(--kc-card);border:1px solid var(--kc-rule);border-radius:9px;
 padding:12px 14px;margin-bottom:9px}
.kc-bl .top{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.kc-bl select{margin:0;width:auto;min-width:120px;font-size:12.5px;padding:5px 8px}
.kc-bl .mv{margin-left:auto;display:flex;gap:5px}
.kc-bl textarea,.kc-bl input[type=text]{display:block;width:100%;margin:0 0 7px;
 font:inherit;font-size:14px;padding:8px 11px;border:1px solid var(--kc-rule2);
 border-radius:7px;background:var(--kc-card2);color:var(--kc-ink);resize:vertical}
.kc-op2 input[type=text]{margin:0}
.kc-bl textarea:last-child,.kc-bl input:last-child{margin-bottom:0}
.kc-op2{display:flex;gap:8px;align-items:center;margin-bottom:6px}
.kc-op2 input[type=radio]{width:17px;height:17px;margin:0;flex:0 0 auto;accent-color:var(--kc-ok)}
.kc-op2 input[type=text]{margin:0;flex:1}
.kc-secc{font-family:var(--kc-fd);font-weight:700;font-size:19px;margin:22px 0 10px;
 display:flex;align-items:center;gap:10px}
.kc-secc::after{content:'';flex:1;height:1px;background:var(--kc-rule)}
.kc-drop{border:2px dashed var(--kc-rule2);border-radius:10px;padding:20px;text-align:center;
 color:var(--kc-ink3);font-size:14px;margin-bottom:12px;background:var(--kc-card2)}
.kc-drop b{display:block;color:var(--kc-ink);font-family:var(--kc-fd);font-size:16px;
 margin-bottom:4px}
.kc-arch{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.kc-arch div{display:flex;gap:9px;align-items:center;font-size:13px;padding:6px 10px;
 background:var(--kc-card2);border-radius:6px}
.kc-arch span{margin-left:auto;font-family:var(--kc-fm);font-size:10.5px;color:var(--kc-ink3)}

/* --- certificado imprimible --- */
.kc-cert{max-width:800px;margin:0 auto;background:#fff;color:#11201B;
 border:1px solid var(--kc-rule);box-shadow:var(--kc-sh);padding:0;overflow:hidden}
.kc-cert *{color:inherit}
.kc-cbar{height:9px;background:var(--kc-cert-color,#0B5D45)}
.kc-cin{padding:44px 54px 38px}
.kc-chead{display:flex;align-items:flex-start;gap:16px;
 border-bottom:1px solid #DBE3DF;padding-bottom:18px;margin-bottom:30px}
.kc-chead img{height:44px;width:auto}
.kc-chead .e{font-family:var(--kc-fd);font-weight:700;font-size:20px;line-height:1.1}
.kc-chead .n{font-family:var(--kc-fm);font-size:10.5px;color:#7E918B;margin-top:3px}
.kc-chead .d{margin-left:auto;text-align:right;font-family:var(--kc-fm);font-size:9.5px;
 color:#7E918B;line-height:1.7}
.kc-ctit{font-family:var(--kc-fm);font-size:11px;letter-spacing:.22em;text-transform:uppercase;
 color:var(--kc-cert-color,#0B5D45);text-align:center;margin-bottom:8px}
.kc-cque{font-family:var(--kc-fd);font-size:15px;color:#4B605A;text-align:center;margin-bottom:22px}
.kc-cnom{font-family:var(--kc-fd);font-weight:700;font-size:38px;line-height:1.05;
 text-align:center;margin-bottom:6px;text-wrap:balance}
.kc-cced{font-family:var(--kc-fm);font-size:12px;color:#4B605A;text-align:center;margin-bottom:26px}
.kc-ccur{text-align:center;margin-bottom:28px}
.kc-ccur .k{font-family:var(--kc-fm);font-size:10px;letter-spacing:.13em;text-transform:uppercase;
 color:#7E918B;margin-bottom:7px}
.kc-ccur .t{font-family:var(--kc-fd);font-weight:600;font-size:25px;line-height:1.15;
 text-wrap:balance;max-width:30ch;margin:0 auto}
.kc-ccur .o{font-size:14px;color:#4B605A;margin-top:9px;max-width:60ch;
 margin-left:auto;margin-right:auto}
.kc-cdat{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#DBE3DF;
 border:1px solid #DBE3DF;margin-bottom:26px}
.kc-cdat>div{background:#F5F8F6;padding:11px 12px;text-align:center}
.kc-cdat .k{font-family:var(--kc-fm);font-size:8.5px;letter-spacing:.09em;
 text-transform:uppercase;color:#7E918B;margin-bottom:4px}
.kc-cdat .v{font-family:var(--kc-fd);font-weight:600;font-size:15px}
.kc-cpie{display:flex;gap:26px;align-items:flex-end;border-top:1px solid #DBE3DF;padding-top:20px}
.kc-cfirma{flex:1}
.kc-cfirma .l{border-top:1px solid #11201B;padding-top:6px;margin-top:38px;max-width:250px;
 font-family:var(--kc-fd);font-weight:600;font-size:13.5px}
.kc-cfirma .r{font-family:var(--kc-fm);font-size:9.5px;color:#7E918B;margin-top:2px}
.kc-cqr{width:96px;flex:0 0 auto;text-align:center}
.kc-cqr svg{width:96px;height:96px;display:block}
.kc-cqr span{font-family:var(--kc-fm);font-size:8px;color:#7E918B;display:block;margin-top:5px}
.kc-cleg{font-family:var(--kc-fm);font-size:8.5px;color:#7E918B;line-height:1.7;
 margin:18px 0 0;max-width:64ch}
.kc-cacc{max-width:800px;margin:0 auto 16px;display:flex;gap:9px;flex-wrap:wrap;
 align-items:center}
@media print{
  @page{size:A4 portrait;margin:0}
  body{background:#fff!important}
  .kc-cacc,.kc-noimp{display:none!important}
  .kc-cert{box-shadow:none;border:none;max-width:none;margin:0}
  .kc-cin{padding:26mm 22mm}
}

/* --- pasar lista y convalidar --- */
.kc dialog.ancho{max-width:660px}
.kc-ros{max-height:44vh;overflow:auto;border:1px solid var(--kc-rule);
 border-radius:8px;margin-bottom:12px;background:var(--kc-card2)}
.kc-rw{display:grid;grid-template-columns:1fr 168px;gap:9px;align-items:center;
 padding:8px 11px;border-bottom:1px solid var(--kc-rule)}
.kc-rw:last-child{border-bottom:none}
.kc-rw.chk{grid-template-columns:22px 1fr auto}
.kc-rw select,.kc-rw input[type=text]{margin:0;font-size:13px;padding:6px 8px}
.kc-rw input[type=checkbox]{width:17px;height:17px;margin:0;accent-color:var(--kc-ac)}
.kc-rw .nm{font-size:14px;min-width:0;line-height:1.3}
.kc-rw .nm span{display:block;font-family:var(--kc-fm);font-size:9.5px;
 color:var(--kc-ink3);text-transform:uppercase;letter-spacing:.05em}
.kc-rw .mot{grid-column:1/-1;margin:0}
.kc-rw .est{font-family:var(--kc-fm);font-size:9.5px;letter-spacing:.05em;
 text-transform:uppercase;white-space:nowrap}
.kc-rw .est.vencida{color:var(--kc-cr)}
.kc-rw .est.pendiente{color:var(--kc-ink2)}
.kc-rw .est.por_vencer{color:var(--kc-wa)}
.kc-rw .est.al_dia{color:var(--kc-ok)}
.kc-rap{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
.kc-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99;
 max-width:min(560px,92vw);background:var(--kc-ink);color:var(--kc-ground);
 border-radius:9px;padding:12px 17px;font-size:13.5px;line-height:1.45;
 box-shadow:0 8px 30px -8px rgba(0,0,0,.5)}

/* ---- puesta en marcha ---- */
.kc-pasos{display:flex;flex-direction:column;gap:9px}
.kc-paso{display:flex;gap:13px;align-items:flex-start;background:var(--kc-card);
 border:1px solid var(--kc-rule);border-left:3px solid var(--kc-rule2);
 border-radius:10px;padding:14px 16px}
.kc-paso.ok{border-left-color:var(--kc-ok)}
.kc-paso.no{border-left-color:var(--kc-cr)}
.kc-paso.opt{border-left-color:var(--kc-rule2);opacity:.78}
.kc-paso .n{flex:0 0 26px;height:26px;border-radius:50%;display:grid;place-items:center;
 font-family:var(--kc-fd);font-weight:700;font-size:13px;background:var(--kc-card2);
 color:var(--kc-ink3)}
.kc-paso.ok .n{background:var(--kc-oks);color:var(--kc-ok)}
.kc-paso.no .n{background:var(--kc-crs);color:var(--kc-cr)}
.kc-paso .c{flex:1 1 auto;min-width:0}
.kc-paso .d{font-size:13.5px;color:var(--kc-ink2);margin-top:3px}
.kc-paso .ojo{font-size:12.5px;color:var(--kc-wa);margin-top:5px}
.kc-in{font:inherit;font-size:13.5px;color:inherit;background:var(--kc-card);
 border:1px solid var(--kc-rule2);border-radius:7px;padding:6px 9px;max-width:100%}
.kc-in:disabled{background:var(--kc-card2);color:var(--kc-ink3)}
.kc-in.nom{min-width:300px;width:100%}
.kc-in.area{min-width:120px;width:100%}
.kc-off{opacity:.45}
.kc-chip2{display:inline-block;font-size:11.5px;background:var(--kc-card2);
 border:1px solid var(--kc-rule);border-radius:999px;padding:2px 9px;margin:2px 3px 2px 0;
 color:var(--kc-ink2)}
.kc-chip2.j{background:var(--kc-acs);border-color:var(--kc-ac);color:var(--kc-ac)}

@media (max-width:640px){
  .kc-ev{flex-wrap:wrap}
  .kc-evb{flex:1 1 100%;order:3}
  .kc-eva{flex:1 1 100%;order:4}
}
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
const EST_P = { vencida:'vencidas', por_vencer:'que están por vencer',
                pendiente:'pendientes', al_dia:'que están al día' };
const EJE = { hse:'HSE', tecnica:'Técnica', arl:'ARL', induccion:'Inducción' };
const nodo = sel => typeof sel === 'string' ? document.querySelector(sel) : sel;
const hoy = () => new Date();
// AAAA-MM-DD en la hora local del usuario. toISOString() usa UTC y en
// Colombia (UTC-5) después de las 19:00 devolvería el día siguiente.
const iso = d => { const x = d || hoy();
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
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
  if (err) {
    const m = (err.message || '') + ' ' + (err.code || '');
    if (/JWT|401|expired|invalid/i.test(m))
      throw new Error('Tu sesión venció. Entrá de nuevo a KALU y volvé a abrir esta página.');
    throw new Error(err.message);
  }
  return data;
}
// El color de la empresa se aplica solo si es lo bastante oscuro para
// llevar texto claro encima. Si no, se conserva el verde del módulo:
// vale más una interfaz legible que una fiel a la marca.
function marca(el, emp) {
  if (!emp) return;
  const c = (emp.color || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(c)) return;
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  if (lum < 0.55) el.style.setProperty('--kc-ac', c);
}

/* La dirección que guarda el QR. Sale de dónde está publicada la
   página, así que si mañana el módulo vive en otro dominio el código
   sigue apuntando bien sin tocar nada. */
function urlVerificar(token) {
  const base = global.location
    ? global.location.origin + global.location.pathname.replace(/[^/]*$/, '')
    : 'https://getkalu.com/';
  return base + 'verificar.html?c=' + encodeURIComponent(token || '');
}

function qrSvg(txt) {
  if (!global.qrcode) return `<div class="mono" style="font-size:9px;word-break:break-all">${esc(txt)}</div>`;
  const q = global.qrcode(0, 'M'); q.addData(txt); q.make();
  const n = q.getModuleCount();
  // Zona de silencio: sin este margen blanco de 4 módulos alrededor, la
  // cámara no encuentra el código. Va adentro del SVG y no en el CSS,
  // para que no dependa de dónde se dibuje.
  const m = 4, t = n + m * 2;
  let p = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (q.isDark(r, c)) p += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img"
    aria-label="Código de la credencial"><rect width="${t}" height="${t}" fill="#fff"/>
    <path d="${p}" fill="#11201B"/></svg>`;
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

  let cat = 'todas', est = null, tab = 'pas';
  const items = D.items || [], port = D.portada || {}, emp = D.empresa || {};
  marca(el, emp);
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

    const base = cat === 'charla' ? charlas
      : form.filter(x => cat === 'todas' || (EJE_ORDEN.includes(x.eje) ? x.eje : 'otro') === cat);
    const lista = base.filter(x => !est || x.estado === est);

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wrap">
      <div class="kc-hero">
        <div class="kc-cargo">${esc(D.persona.cargo)}</div>
        <div class="kc-nom">${esc(D.persona.nombre)}</div>
        <div class="kc-band ${cls}"><div class="m">${cls === 'ok' ? '✓' : '!'}</div>
          <div><div class="t1">${esc(t1)}</div><div class="t2">${esc(t2)}</div></div></div>
        <div class="kc-cts">${[
            ['vencida','v','Vencidas',port.vencidas],
            ['por_vencer','x','Por vencer',port.por_vencer],
            ['pendiente','','Pendientes',port.pendientes],
            ['al_dia','a','Al día',port.al_dia]
          ].map(([k,c,t,n]) => `<button class="kc-ct ${c}" type="button" data-e="${k}"
            aria-pressed="${est===k}"><b>${n ?? 0}</b><span>${t}</span></button>`).join('')}</div>
      </div>
      <div class="kc-tabs" role="tablist">
        <button class="kc-tab" data-t="pas" role="tab" aria-selected="${tab==='pas'}">Capacitaciones</button>
        <button class="kc-tab" data-t="cred" role="tab" aria-selected="${tab==='cred'}">Credencial</button>
        <button class="kc-tab" data-t="certs" role="tab" aria-selected="${tab==='certs'}">Certificados</button>
      </div>
      ${tab === 'pas' ? vistaLista(lista) : tab === 'cred' ? vistaCred() : vistaCerts()}
    </div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => { tab = b.dataset.t; pintar(); });
    el.querySelectorAll('.kc-chip').forEach(b => b.onclick = () => {
      cat = b.dataset.f; pintar();
    });
    // Los contadores de arriba son el filtro por estado. Tocar el que
    // ya está activo lo suelta.
    el.querySelectorAll('.kc-ct[data-e]').forEach(b => b.onclick = () => {
      est = (est === b.dataset.e) ? null : b.dataset.e; pintar();
    });
    const limpia = el.querySelector('#kc-limpia');
    if (limpia) limpia.onclick = () => { est = null; pintar(); };
    el.querySelectorAll('.kc-it').forEach(b => {
      const abrirCerrar = ev => {
        if (ev.target.closest('.kc-go')) return;
        b.classList.toggle('open');
        b.setAttribute('aria-expanded', String(b.classList.contains('open')));
      };
      b.onclick = abrirCerrar;
      b.onkeydown = ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirCerrar(ev); }
      };
    });
    el.querySelectorAll('.kc-go[data-c]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      curso(sel, b.dataset.c, { volver: () => pasaporte(sel, opt) });
    });
    el.querySelectorAll('[data-cert]').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      certificado(sel, b.dataset.cert, { volver: () => pasaporte(sel, opt) });
    });
  }

  // El pasaporte se lee en dos niveles: primero de qué se trata
  // (seguridad, ARL, plan de carrera) y dentro de cada uno de dónde le
  // viene: a todos, por el cargo, por el comité, por lo que hace.
  const EJE_T = { induccion:'Inducción', hse:'Seguridad y salud',
                  arl:'ARL', tecnica:'Plan de carrera' };
  const EJE_ORDEN = ['induccion','hse','arl','tecnica'];
  const ALC_T = { todos:'Para todo el personal', cargo:'Por tu cargo',
                  rol:'Por tu comité', actividad:'Por lo que hacés' };
  const ALC_ORDEN = ['todos','cargo','rol','actividad'];

  function vistaLista(lista) {
    const cont = (k, l, n) =>
      `<button class="kc-chip" data-f="${k}" aria-pressed="${cat===k}">${l} · ${n}</button>`;
    const disp = new Set((D.disponibles || []).map(d => d.catalogo_id));

    function tarjeta(x) {
      let meta;
      if (x.estado === 'pendiente') meta = 'Sin registro de asistencia';
      else if (x.estado === 'al_dia' && !x.vence_el) meta = 'Hecha el ' + fecha(x.ultima_vez) + ' · no vence';
      else if (x.estado === 'vencida') meta = 'Venció el ' + fecha(x.vence_el) + ' · hace ' + Math.abs(dias(x.vence_el)) + ' días';
      else if (x.estado === 'por_vencer') meta = 'Vence el ' + fecha(x.vence_el) + ' · en ' + dias(x.vence_el) + ' días';
      else meta = 'Hecha el ' + fecha(x.ultima_vez) + ' · vence ' + fecha(x.vence_el);
      const puede = disp.has(x.catalogo_id);
      // div y no button: adentro va otro botón ("Hacerla ahora") y el
      // HTML no admite botones anidados — el navegador lo expulsa de la
      // tarjeta y queda suelto en la lista.
      return `<div class="kc-it" role="button" tabindex="0" aria-expanded="false">
        <div class="kc-st ${x.estado}"></div>
        <div style="flex:1;min-width:0">
          <div class="kc-bd">
            <div class="kc-r1"><span class="kc-cd">${esc(x.codigo[0])}-${esc(x.codigo.slice(1))}${
              x.bloqueante && x.bloqueante !== 'no'
                ? ' · ' + (x.bloqueante === 'ingreso' ? 'obligatoria' : 'para operar') : ''}</span>
              <span class="kc-pill ${x.estado}">${EST[x.estado]}</span></div>
            <div class="kc-tt">${esc(x.titulo)}</div>
            <div class="kc-mt">${esc(meta)}</div>
          </div>
          <div class="kc-why"><b>Por qué me aplica</b>${esc(x.por_que_aplica)}
            ${x.certificable ? ' · Genera certificado' : ''}
            ${puede ? `<button class="kc-go" data-c="${x.catalogo_id}">${
              x.estado === 'por_vencer' ? 'Renovarla ahora'
                : x.estado === 'vencida' ? 'Rehacerla ahora' : 'Hacerla ahora'}</button>` : ''}
          </div>
        </div></div>`;
    }

    // agrupar: eje → alcance
    const ejes = [];
    EJE_ORDEN.concat(['otro']).forEach(e => {
      const dele = lista.filter(x => (EJE_ORDEN.includes(x.eje) ? x.eje : 'otro') === e);
      if (!dele.length) return;
      const grupos = [];
      ALC_ORDEN.concat(['otro']).forEach(a => {
        const g = dele.filter(x => (ALC_ORDEN.includes(x.alcance) ? x.alcance : 'otro') === a);
        if (g.length) grupos.push([a, g]);
      });
      ejes.push([e, dele.length, grupos]);
    });

    const cuerpo = ejes.map(([e, n, grupos]) => (ejes.length > 1 ? `
      <div class="kc-eje"><span>${esc(EJE_T[e] || 'Otras')}</span><i>${n}</i></div>` : '') +
      grupos.map(([a, g]) => `
        <div class="kc-sub">${esc(ALC_T[a] || 'Asignadas a vos')} · ${g.length}</div>
        <div class="kc-list">${g.map(tarjeta).join('')}</div>`).join('')).join('');

    // Las categorías son los botones de arriba: se salta de una a otra
    // sin scrollear. El estado se filtra desde los contadores del
    // encabezado, que ya estaban ahí y no hacían nada.
    const cats = [['todas', 'Todas', form.length]].concat(
      EJE_ORDEN.map(e => [e, EJE_T[e], form.filter(x => x.eje === e).length])
               .filter(c => c[2] > 0));
    if (charlas.length) cats.push(['charla', 'Charlas', charlas.length]);

    return `<div class="kc-fil">${cats.map(([k, l, n]) => cont(k, l, n)).join('')}</div>` +
      (est ? `<div class="kc-filtro">Mostrando sólo las <b>${esc(EST_P[est] || est)}</b>
        <button type="button" id="kc-limpia">quitar filtro</button></div>` : '') +
      (lista.length ? cuerpo
        : `<p class="kc-vacio">${est ? 'No hay ' + (EST_P[est] || '') +
            ' en esta categoría.' : 'Nada en esta categoría.'}</p>`);
  }

  // Certificados: sólo lo certificable y cumplido. Las charlas quedan
  // en el pasaporte pero no emiten papel.
  let CERTS = null;
  function vistaCerts() {
    if (CERTS === null) {
      rpc('cap_mis_certificados').then(r => { CERTS = r || []; pintar(); })
        .catch(e => { CERTS = []; pintar(); });
      return '<div class="kc-carga">Buscando tus certificados…</div>';
    }
    if (!CERTS.length) return `<p class="kc-vacio">Todavía no tenés capacitaciones
      cumplidas que emitan certificado.<br><br>Las charlas y divulgaciones quedan en tu
      pasaporte, pero no certifican.</p>`;
    return '<div class="kc-list" style="padding-top:14px">' + CERTS.map(c => `
      <div class="kc-it" style="cursor:default">
        <div class="kc-st ${c.vigente ? 'al_dia' : 'vencida'}"></div>
        <div style="flex:1;min-width:0"><div class="kc-bd">
          <div class="kc-r1"><span class="kc-cd">${esc(c.codigo)}${
            c.consecutivo ? ' · ' + esc(c.consecutivo) : ''}</span>
            ${c.vigente ? '' : '<span class="kc-pill vencida">Vencido</span>'}</div>
          <div class="kc-tt">${esc(c.titulo)}</div>
          <div class="kc-mt">${c.fecha ? fecha(c.fecha) : ''}${
            c.horas ? ' · ' + Number(c.horas) + ' h' : ''}${
            c.nota != null ? ' · nota ' + Number(c.nota) + '%' : ''}${
            c.vence_el ? ' · vence ' + fecha(c.vence_el) : ' · no vence'}</div>
          <button class="kc-go" data-cert="${c.asistencia_id}">Descargar</button>
        </div></div>
      </div>`).join('') + '</div>';
  }

  function vistaCred() {
    const cls = port.vencidas > 0 ? 'cr' : (port.pendientes > 0 ? 'wa' : 'ok');
    const tot = (port.al_dia||0)+(port.pendientes||0)+(port.vencidas||0)+(port.por_vencer||0);
    return `<div class="kc-cred">
      <div class="kc-ctop">
        <div class="l" style="display:flex;align-items:center;gap:9px">${
          emp.logo ? `<img src="${esc(emp.logo)}" alt="" style="height:22px;width:auto;
            border-radius:3px;background:#fff;padding:2px">` : ''
        }<span>${esc(emp.nombre || (opt && opt.empresa) || 'KALU')}</span></div>
        <div class="r">Credencial SST</div></div>
      <div class="kc-cbody">
        <div class="kc-nom" style="font-size:21px;margin-bottom:3px">${esc(D.persona.nombre)}</div>
        <div style="font-size:13.5px;color:var(--kc-ink2)">${esc(D.persona.cargo)}</div>
        <div class="kc-cgrid">
          <div>
            <div class="kc-fld"><div class="k">Cédula</div><div class="v">${esc(D.persona.cedula||'—')}</div></div>
            <div class="kc-fld"><div class="k">Formación vigente</div>
              <div class="v">${port.al_dia ?? 0} de ${tot}</div></div>
            <div class="kc-fld"><div class="k">Emitida</div>
              <div class="v">${hoy().toLocaleDateString('es-CO')}</div></div>
          </div>
          <div class="kc-qr">${qrSvg(urlVerificar(D.persona.token))}</div>
        </div>
      </div>
      <div class="kc-cfoot"><span class="kc-dot ${cls}"></span><span>${
        port.vencidas > 0 ? port.vencidas + ' vencida(s)'
        : (port.pendientes > 0 ? 'Sin vencidas · ' + port.pendientes + ' pendientes'
                               : 'Formación al día')}</span></div>
    </div>
    <p class="kc-nota">El supervisor escanea el código con la cámara y se le abre tu estado
      de hoy. El código no guarda nada: lo consulta en el momento, así que una captura
      vieja no sirve.</p>`;
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
  const TOT = pant.length + Q.length;
  // Retoma donde dejó. El avance se guarda solo, así que puede cerrar
  // el celular en el bloque 9 y seguir mañana desde otro aparato.
  let resp = Object.assign({}, C.respuestas || {});
  let i = Math.min(Math.max(0, C.posicion | 0), Math.max(0, TOT - 1));
  let retomado = i > 0 || Object.keys(resp).length > 0;
  let fin = null, enviando = false, guardando = false;

  // Fire and forget: si falla, el curso sigue igual. Lo peor que puede
  // pasar es perder el último paso, no interrumpir a quien está leyendo.
  let ultimo = -1;
  function guardar() {
    if (!C.intento_id || i === ultimo) return;
    ultimo = i; guardando = true; sello();
    rpc('cap_guardar_avance', { p_intento: C.intento_id, p_posicion: i, p_respuestas: resp })
      .then(() => { guardando = false; C.guardado_en = new Date().toISOString(); sello(); })
      .catch(() => { guardando = false; sello(); });
  }
  function avisoRetomado() {
    if (!retomado) return '';
    retomado = false;
    return `<div class="kc-avi" style="background:var(--kc-acs);border-left-color:var(--kc-ac)">
      Seguís donde habías dejado${C.guardado_en
        ? ', el ' + new Date(C.guardado_en).toLocaleDateString('es-CO') : ''}.
      Podés salir cuando quieras: el avance se guarda solo.</div>`;
  }

  function sello() {
    const s = el.querySelector('#kc-sello');
    if (!s) return;
    s.textContent = guardando ? 'guardando…' : (C.guardado_en ? 'guardado' : '');
  }

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
        <div style="min-width:0"><div class="kc-cd">Autoestudio · intento ${C.numero} de 2
          <span id="kc-sello" style="color:var(--kc-ok)"></span></div>
        <div class="kc-tt" id="kc-ct"></div></div>
        <div style="margin-left:auto;text-align:right;flex:0 0 auto">
          <div class="kc-cd" id="kc-paso"></div>
          <button class="kc-mini" id="kc-salir" style="margin-top:5px">Salir</button></div></div>
        <div class="kc-bar"><i id="kc-bi"></i></div></div>
      <div class="kc-main" id="kc-m"></div>
      <div class="kc-foot"><button class="kc-btn" id="kc-b"></button></div></div>`;
    el.querySelector('#kc-salir').onclick = () => {
      guardar();
      if (opt && opt.volver) opt.volver(); else pasaporte(sel);
    };
    sello();
    render();
  }

  function render() {
    const m = el.querySelector('#kc-m'), b = el.querySelector('#kc-b');
    el.querySelector('#kc-bi').style.width = Math.round(100 * Math.min(i, TOT) / TOT) + '%';
    el.querySelector('#kc-ct').textContent = opt && opt.titulo || '';

    if (fin) return verFin();

    if (i < pant.length) {
      el.querySelector('#kc-paso').textContent = `Lectura ${i+1}/${pant.length}`;
      m.innerHTML = avisoRetomado() + pant[i].map(bloque).join('');
      b.disabled = false;
      b.textContent = i === pant.length - 1 ? 'Empezar las preguntas' : 'Seguir';
      b.onclick = () => { i++; guardar(); window.scrollTo(0,0); render(); };
      return;
    }
    const k = i - pant.length, q = Q[k];
    el.querySelector('#kc-paso').textContent = `Pregunta ${k+1}/${Q.length}`;
    m.innerHTML = avisoRetomado() +
      `<p class="kc-cd" style="margin-bottom:8px">PREGUNTA ${k+1} DE ${Q.length}</p>
      <p class="kc-q">${esc(q.enunciado)}</p><div class="kc-ops">` +
      q.opciones.map(o => `<button class="kc-op" type="button" data-o="${o.id}"
        aria-pressed="${resp[q.id]===o.id}">${esc(o.texto)}</button>`).join('') + '</div>';
    m.querySelectorAll('.kc-op').forEach(x => x.onclick = () => {
      resp[q.id] = x.dataset.o; ultimo = -1; guardar(); render(); });
    b.disabled = !resp[q.id] || enviando;
    b.textContent = k === Q.length - 1 ? 'Entregar' : 'Siguiente';
    b.onclick = async () => {
      if (k < Q.length - 1) { i++; guardar(); window.scrollTo(0,0); return render(); }
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
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}
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
    v.querySelectorAll('[data-des]').forEach(b => b.onclick = () => dlgDesempeno(b.dataset.des, b.dataset.nom));
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
    return '<div style="display:flex;flex-direction:column;gap:9px">' + P.map(x => {
      const av = x.tipo === 'aval';
      const eq = (D.equipo || []).find(q => q.persona_id === x.persona_id) || {};
      return `<div style="background:var(--kc-card);border:1px solid var(--kc-rule);
        border-left:3px solid ${av?'var(--kc-ac)':'var(--kc-wa)'};
        border-radius:8px;padding:12px 15px;display:flex;gap:12px;align-items:center;
        flex-wrap:wrap;box-shadow:var(--kc-sh)">
        <span class="kc-tag" style="background:${av?'var(--kc-acs)':'var(--kc-was)'};
          color:${av?'var(--kc-ac)':'var(--kc-wa)'}">${av?'Aval':'Desempeño'}</span>
        <b class="kc-tt" style="font-size:15px">${esc(x.persona)}</b>
        <span style="color:var(--kc-ink2);font-size:13.5px;flex:1">${esc(x.detalle)}</span>
        <button class="kc-mini p" ${av
          ? `data-aval="${x.persona_id}" data-ruta="${eq.ruta_id||''}" data-nom="${esc(x.persona)}"`
          : `data-des="${x.persona_id}" data-nom="${esc(x.persona)}"`}>${
          av ? 'Dar el aval' : 'Registrar'}</button></div>`;
    }).join('') + '</div>';
  }

  // La valoración de desempeño: lo que el sistema le reclama al supervisor
  // y hasta ahora no tenía dónde escribirse.
  function dlgDesempeno(persona, nombre) {
    const d = document.createElement('dialog');
    const p = hoy();
    const per = p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0');
    d.innerHTML = `<div class="kc-dlg"><h3>Desempeño de ${esc(nombre)}</h3>
      <p>Es la evaluación que pide el A.MA001 para asegurar la competencia de la línea.
         Queda firmada con tu nombre y la fecha, y es uno de los tres candados del ascenso.</p>
      <label for="kcp">Período</label>
      <input type="month" id="kcp" value="${per}">
      <label for="kcr">Resultado</label>
      <select id="kcr"><option value="aprobado">Aprobado — cumple lo esperado del cargo</option>
        <option value="con_reservas">Con reservas — cumple con seguimiento</option>
        <option value="no_aprobado">No aprobado — no cumple todavía</option></select>
      <label for="kco">Observación</label><textarea id="kco" rows="3"
        placeholder="Qué viste este período. Esto es lo que el sistema no puede escribir por vos."></textarea>
      <div class="kc-row"><button class="kc-b2" id="kcx">Cancelar</button>
        <button class="kc-btn" id="kck">Guardar</button></div></div>`;
    const w = el.querySelector('.kc-wide') || el;
    w.appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const btn = d.querySelector('#kck'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await rpc('cap_registrar_desempeno', { p_persona: persona,
          p_periodo: d.querySelector('#kcp').value,
          p_resultado: d.querySelector('#kcr').value,
          p_observacion: d.querySelector('#kco').value || null });
        d.close(); d.remove(); supervision(sel);
      } catch (e) { btn.disabled = false; btn.textContent = 'Guardar'; alert(e.message); }
    };
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
  let D, CAT = null, CRO = null;
  try { D = await rpc('cap_admin_datos'); } catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  let tab = 1, anio = hoy().getFullYear(), busca = '', filtro = 'todas';

  const MODAL = ['presencial','virtual','mixta','plataforma_arl','autoestudio'];
  const MODALN = { presencial:'Presencial', virtual:'Virtual', mixta:'Mixta',
                   plataforma_arl:'Plataforma ARL', autoestudio:'Autoestudio' };
  const BLOQN = { no:'No bloquea', operacion:'Bloquea la operación', ingreso:'Bloquea la vinculación' };
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                 'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const vig = d => d == null ? 'No vence' : (d % 365 === 0 ? (d/365) + (d===365?' año':' años')
                 : d % 30 === 0 ? (d/30) + ' meses' : d + ' días');

  async function traerCat() { if (!CAT) CAT = await rpc('cap_catalogo_datos'); return CAT; }
  async function traerCro() {
    if (!CRO || CRO.anio !== anio) CRO = await rpc('cap_cronograma_datos', { p_anio: anio });
    return CRO;
  }

  /* ------------------------------------------------------------- armazón */
  async function pintar() {
    const sm = (D.sinMapear || []).length;
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:24px 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:6px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · ADMINISTRACIÓN</div>
        <h1 style="font-size:30px;font-weight:700">Capacitador</h1></div>
      ${D.puede_editar === false ? `<div class="kc-cent" style="background:var(--kc-card2)">
        <div class="b" style="background:var(--kc-ink3)">👁</div><div>
        <div class="kc-tt" style="font-size:15px">Estás mirando, no editando</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Tu acceso al módulo es de sólo lectura.
          Para poder cambiar cosas, en <b>Accesos → HSE</b> hay que ponerte nivel
          «Ver y modificar».</div></div></div>` : ''}
      ${tab <= 2 ? `<div class="kc-cent ${sm?'mal':'ok'}"><div class="b">${sm||'✓'}</div><div>
        <div class="kc-tt" style="font-size:15px;color:${sm?'var(--kc-cr)':'var(--kc-ok)'}">${
          sm ? sm+' persona(s) con el cargo sin mapear' : 'Todos los cargos mapeados'}</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${sm
          ? 'A esta gente el sistema dejó de exigirle su formación por cargo. Mapealas antes de seguir.'
          : 'Si alguien escribe una variante nueva, aparece acá en rojo.'}</div></div></div>` : ''}
      ${avisoChequeo()}
      ${tab === 1 && sm ? vSinMapear() : ''}
      <div class="kc-tabs" style="margin:18px 0 20px">
        <button class="kc-tab" data-t="1" aria-selected="${tab===1}">Personas</button>
        <button class="kc-tab" data-t="2" aria-selected="${tab===2}">Cargos</button>
        <button class="kc-tab" data-t="3" aria-selected="${tab===3}">Capacitaciones</button>
        <button class="kc-tab" data-t="4" aria-selected="${tab===4}">Cronograma</button>
      </div>
      <div id="kc-v"><div class="kc-carga">Cargando…</div></div></div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => {
      if (+b.dataset.t !== tab) { tab = +b.dataset.t; busca = ''; filtro = 'todas'; pintar(); }
    });

    const v = el.querySelector('#kc-v');
    if (tab === 1)      v.innerHTML = vPers();
    else if (tab === 2) v.innerHTML = vCargos();
    else if (tab === 3) { await traerCat(); v.innerHTML = vCap(); }
    else                { await traerCro(); v.innerHTML = vCro(); }
    enganchar(v);
  }

  /* Lo que falta mapear, agrupado por cómo está escrito el cargo.
     Antes iba una fila por persona: en una empresa recién cargada eso son
     cien filas que dicen lo mismo, y empujan las pestañas tan abajo que la
     pantalla parece otra. Mapear trabaja sobre el texto del cargo, no
     sobre la persona, así que una fila por texto alcanza. */
  function vSinMapear() {
    const g = {};
    (D.sinMapear || []).forEach(s => {
      const k = s.cargo_texto || '—';
      (g[k] = g[k] || { txt: k, gente: 0, caps: 0 });
      g[k].gente++; g[k].caps += (s.capacitaciones_hoy || 0);
    });
    const filas = Object.values(g).sort((a, b) => b.gente - a.gente);
    const TOPE = 12, ver = filas.slice(0, TOPE), resto = filas.length - ver.length;

    return `${filas.length > 5 ? `<div class="kc-cent" style="background:var(--kc-was)">
        <div class="b" style="background:var(--kc-wa)">${filas.length}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-wa)">
          Esto es una empresa sin organigrama, no una lista de correcciones</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Mapear de a uno sirve cuando alguien
        escribe una variante nueva. Con ${filas.length} cargos sin definir conviene ir a
        <b>Puesta en marcha</b>, que los arma todos juntos y de paso agrupa las formas repetidas
        de escribir lo mismo.</div></div></div>` : ''}
      <div class="kc-sc"><table><thead><tr><th>Cargo escrito en el padrón</th>
        <th class="n">Personas</th><th class="n">Capacitaciones hoy</th><th></th></tr></thead><tbody>
        ${ver.map(f => `<tr><td class="k">${esc(f.txt)}</td>
          <td class="n">${f.gente}</td><td class="n">${f.caps}</td>
          <td><button class="kc-mini p" data-map="${esc(f.txt)}">Mapear</button></td></tr>`).join('')}
        ${resto > 0 ? `<tr><td colspan="4" style="color:var(--kc-ink3);font-size:13px">
          y ${resto} forma(s) más de escribir un cargo, sin mapear</td></tr>` : ''}
      </tbody></table></div>`;
  }

  function enganchar(v) {
    // Sólo lectura: se ven los datos, no los botones que escriben.
    if (D.puede_editar === false) {
      el.querySelectorAll('[data-a],[data-c],[data-e],[data-map]').forEach(b => {
        if (b.dataset.e === 'lista') { b.textContent = 'Ver lista'; return; }
        b.remove();
      });
    }
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => dlg(b.dataset.a, b.dataset.i));
    el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => dlgMapear(b.dataset.map));
    // la ficha se abre en lugar del panel y vuelve a esta misma pestaña
    el.querySelectorAll('[data-ficha]').forEach(b => b.onclick = () =>
      ficha(sel, b.dataset.ficha, { volver: () => admin(sel) }));
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => dlgCat(b.dataset.c, b.dataset.i));
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => dlgEv(b.dataset.e, b.dataset.i));

    const bus = v.querySelector('#kc-bus');
    if (bus) {
      bus.oninput = () => {
        busca = bus.value;
        const foco = document.activeElement === bus;
        const cur = bus.selectionStart;
        v.innerHTML = tab === 3 ? vCap() : vCro();
        enganchar(v);
        if (foco) { const n = v.querySelector('#kc-bus'); if (n) { n.focus(); n.setSelectionRange(cur, cur); } }
      };
    }
    v.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
      filtro = b.dataset.f; v.innerHTML = tab === 3 ? vCap() : vCro(); enganchar(v);
    });
    const sa = v.querySelector('#kc-anio');
    if (sa) sa.onchange = async () => { anio = +sa.value; await traerCro(); v.innerHTML = vCro(); enganchar(v); };
  }

  async function recargar(r) {
    CAT = null; CRO = null;
    try { D = await rpc('cap_admin_datos'); } catch (e) {}
    await pintar();
    if (r && r.aviso) toast(r.aviso);
  }

  function toast(txt) {
    const t = document.createElement('div');
    t.className = 'kc-toast'; t.textContent = txt;
    (el.querySelector('.kc-wide') || el).appendChild(t);
    setTimeout(() => t.remove(), 7000);
  }

  // Datos que tienen dos filas donde el sistema espera una. No rompen
  // nada — el módulo elige una y sigue — pero conviene verlos.
  function avisoChequeo() {
    const q = D.chequeo;
    if (!q || q.limpio || !(q.hallazgos || []).length) return '';
    const H = q.hallazgos;
    return `<div class="kc-cent mal"><div class="b">${H.length}</div><div>
      <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">Hay datos duplicados donde debería haber uno solo</div>
      <div style="font-size:13px;color:var(--kc-ink2)">${H.slice(0,4).map(h =>
        esc(h.caso) + ': <b>' + esc(h.detalle) + '</b>').join(' · ')}${
        H.length > 4 ? ' · y ' + (H.length - 4) + ' más' : ''}.
        El módulo sigue andando y elige una, pero mientras esté así los números pueden no cuadrar.</div></div></div>`;
  }

  /* ------------------------------------------------------- 1. personas */
  function vPers() {
    return '<div class="kc-sc"><table><thead><tr><th>Persona</th><th>Cargo</th>' +
      '<th>En el padrón</th><th>Desde</th><th>Meses</th><th>Apto</th><th>Venc.</th>' +
      '<th>Tramos</th><th></th></tr></thead><tbody>' +
      (D.personas||[]).map(p => `<tr>
        <td class="k">${esc(p.nombre)}</td>
        <td>${esc(p.cargo||'—')}${p.cargos > 1
            ? ` <span class="kc-tag no" title="Está mapeada a ${p.cargos} cargos">×${p.cargos}</span>` : ''}</td>
        <td style="color:var(--kc-ink3);font-size:13px">${esc(p.cargoTexto)}</td>
        <td class="n">${esc(p.desde||'—')}${p.tramosAbiertos > 1
            ? ' <span class="kc-tag no" title="Tiene dos tramos de cargo abiertos">×2</span>' : ''}</td>
        <td class="n">${p.meses ?? '—'}</td>
        <td><span class="kc-tag ${p.apto?'si':'no'}">${p.apto?'Sí':'No'}</span></td>
        <td class="n">${p.venc ?? 0}</td><td class="n">${p.tramos}</td>
        <td><div style="display:flex;gap:6px">
          <button class="kc-mini p" data-ficha="${p.id}">Ficha</button>
          <button class="kc-mini" data-a="corregir" data-i="${p.id}">Corregir</button>
          <button class="kc-mini" data-a="mover" data-i="${p.id}">Mover</button></div></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  /* --------------------------------------------------------- 2. cargos */
  function vCargos() {
    const C = D.cargos || [];
    // Un cargo con gente y sin capacitaciones asignadas es gente sin plan.
    const mudos = C.filter(c => c.activo && c.personas > 0 && !c.capacitaciones);
    const alerta = mudos.length ? `<div class="kc-cent mal"><div class="b">${mudos.length}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">${mudos.length} cargo(s) con gente y sin ninguna capacitación asignada</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${mudos.map(c => esc(c.nombre)).join(' · ')}.
          Quien los ocupa no tiene plan de formación: su pasaporte se ve tranquilo porque no se le exige nada.</div></div></div>` : '';

    return alerta + `<div class="kc-bar2">
        <button class="kc-mini p" data-a="crear-cargo">+ Crear cargo</button>
      </div>
      <div class="kc-sc"><table><thead><tr><th>Cargo</th><th>Área</th><th>Reporta a</th>` +
      '<th>Personas</th><th>Capacit.</th><th>Variantes</th><th>Rutas</th><th></th></tr></thead><tbody>' +
      C.map(c => `<tr${c.activo?'':' style="opacity:.5"'}>
        <td class="k">${esc(c.nombre)}${c.activo?'':' <span class="kc-tag g">Apagado</span>'}</td>
        <td style="color:var(--kc-ink3)">${esc(c.area||'—')}</td>
        <td style="color:var(--kc-ink3)">${esc(c.jefe||'—')}</td>
        <td class="n">${c.personas}</td>
        <td class="n"${c.activo && c.personas && !c.capacitaciones ? ' style="color:var(--kc-cr)"' : ''}>${c.capacitaciones}</td>
        <td class="n">${c.alias}</td>
        <td class="n">↑${c.rutasEntran} ↓${c.rutasSalen}</td>
        <td><div style="display:flex;gap:6px">
          <button class="kc-mini" data-a="editar-cargo" data-i="${c.id}">Editar</button>
          <button class="kc-mini${c.activo?'':' p'}" data-a="${c.activo?'desactivar':'activar'}" data-i="${c.id}">${
            c.activo ? 'Apagar' : 'Prender'}</button></div></td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  /* --------- crear y editar un cargo --------- */
  function dlgCargo(c) {
    const nuevo = !c;
    const A = D.areas || [];
    const otros = (D.cargos || []).filter(x => x.activo && (!c || x.id !== c.id));

    const d = abrir(`<h3>${nuevo ? 'Crear un cargo' : 'Editar ' + esc(c.nombre)}</h3>
      ${nuevo
        ? '<p>Un cargo nuevo nace sin plan de formación. Después de crearlo hay que asignarle sus capacitaciones desde la pestaña <b>Capacitaciones</b>.</p>'
        : `<p>${c.personas} persona(s) · ${c.capacitaciones} capacitación(es) asignadas</p>`}
      <label for="k1">Nombre</label>
      <input type="text" id="k1" value="${esc(nuevo ? '' : c.nombre)}"
             placeholder="Ej: Inspector END Nivel III">
      <label for="k2">Área</label>
      <input type="text" id="k2" list="kc-areas" value="${esc(nuevo ? '' : (c.area || ''))}"
             placeholder="Misional, Administrativa…">
      <datalist id="kc-areas">${A.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
      <label for="k3">Reporta a</label>
      <select id="k3"><option value="">— nadie —</option>${otros.map(x =>
        `<option value="${x.id}"${!nuevo && c.reporta_a === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
      ${nuevo ? '' : `
      <label>También se reconoce escrito como</label>
      <div class="kc-ros" style="max-height:26vh">${(c.variantes || []).length
        ? c.variantes.map(v => `<div class="kc-rw chk" style="grid-template-columns:1fr auto auto">
            <div class="nm">${esc(v.alias)}<span>${v.gente} en el padrón</span></div>
            <button type="button" class="kc-mini" data-q="${v.id}">Quitar</button>
          </div>`).join('')
        : '<div class="kc-rw"><div class="nm" style="color:var(--kc-cr)">Ninguna. Si el padrón lo escribe distinto, nadie queda ubicado en este cargo.</div></div>'}</div>
      <label for="k4">Agregar una variante</label>
      <div style="display:flex;gap:7px;margin-bottom:12px">
        <input type="text" id="k4" style="margin:0" placeholder="Cómo aparece escrito en el padrón">
        <button type="button" class="kc-mini p" id="kcadd">Agregar</button>
      </div>
      <p style="font-size:12.5px">Las variantes son lo que evita que «Auxiliar Tecnico I» sin tilde
         deje a alguien sin plan de formación.</p>`}`,
      dd => {
        const nom = dd.querySelector('#k1').value;
        const area = dd.querySelector('#k2').value;
        const jefe = dd.querySelector('#k3').value || null;
        return nuevo
          ? rpc('cap_crear_cargo', { p_nombre: nom, p_area: area || null, p_reporta_a: jefe })
          : rpc('cap_cargo_guardar', { p_cargo: c.id, p_nombre: nom, p_area: area,
              p_reporta_a: jefe, p_quitar_jefe: !jefe });
      }, nuevo ? 'Crear' : 'Guardar', !nuevo);

    if (nuevo) return;

    // Quitar una variante con gente detrás deja a esa gente sin plan de
    // formación. Se pregunta antes, no después.
    d.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {
      const v = (c.variantes || []).find(x => x.id === b.dataset.q) || {};
      if (v.gente > 0 && !confirm(
            v.gente + ' persona(s) tienen el cargo escrito exactamente «' + v.alias +
            '» en el padrón.\n\nSi quitás esta variante, el sistema deja de reconocerlas y ' +
            'quedan sin plan de formación por cargo hasta que las vuelvas a mapear.\n\n¿Seguimos?'))
        return;
      b.disabled = true; b.textContent = 'Quitando…';
      try { const r = await rpc('cap_alias_quitar', { p_alias_id: b.dataset.q });
        d.close(); d.remove(); await recargar(r); }
      catch (e) { b.disabled = false; b.textContent = 'Quitar'; alert(e.message); }
    });
    const add = d.querySelector('#kcadd');
    if (add) add.onclick = async () => {
      const val = d.querySelector('#k4').value;
      if (!val.trim()) return;
      add.disabled = true; add.textContent = 'Agregando…';
      try { const r = await rpc('cap_alias_agregar', { p_cargo: c.id, p_alias: val });
        d.close(); d.remove(); await recargar(r); }
      catch (e) { add.disabled = false; add.textContent = 'Agregar'; alert(e.message); }
    };
  }

  /* -------------------------------------------------- 3. capacitaciones */
  function vCap() {
    const C = CAT.catalogo || [], q = busca.trim().toLowerCase();
    const act = C.filter(c => c.activo);
    const huerf = act.filter(c => c.personas === 0);
    const n = {
      todas: C.length, activas: act.length,
      bloqueo: act.filter(c => c.bloqueo > 0).length,
      huerfanas: huerf.length,
      apagadas: C.length - act.length
    };
    const pasa = c => {
      if (q && !((c.codigo + ' ' + c.titulo).toLowerCase().includes(q))) return false;
      if (filtro === 'activas')   return c.activo;
      if (filtro === 'apagadas')  return !c.activo;
      if (filtro === 'bloqueo')   return c.activo && c.bloqueo > 0;
      if (filtro === 'huerfanas') return c.activo && c.personas === 0;
      return true;
    };
    const L = C.filter(pasa);
    const chip = (k, t) => `<button class="kc-chip" data-f="${k}" aria-pressed="${filtro===k}">${t} · ${n[k]}</button>`;

    const alerta = huerf.length ? `<div class="kc-cent mal"><div class="b">${huerf.length}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">${huerf.length} capacitación(es) activas que no le llegan a nadie</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Están en el catálogo pero ninguna persona las tiene asignada.
          O falta asignarles un cargo, o el comité o la actividad a la que apuntan todavía no tiene gente cargada.</div></div></div>` : '';

    return alerta + `
      <div class="kc-bar2">
        <input id="kc-bus" class="kc-bus" type="search" placeholder="Buscar por código o título…"
               value="${esc(busca)}" autocomplete="off">
        <button class="kc-mini p" data-c="ia">✦ Armar con IA</button>
        <button class="kc-mini" data-c="crear">+ Crear propia</button>
        <button class="kc-mini" data-c="sumar">Sumar de la biblioteca${
          (CAT.biblioteca||[]).length ? ' · ' + CAT.biblioteca.length : ''}</button>
      </div>
      <div class="kc-fil" style="padding:0 0 14px">
        ${chip('todas','Todas')}${chip('activas','Activas')}${chip('bloqueo','Bloqueantes')}
        ${chip('huerfanas','Sin gente')}${chip('apagadas','Apagadas')}
      </div>
      ${L.length ? `<div class="kc-sc"><table><thead><tr>
        <th>Código</th><th>Capacitación</th><th>Vigencia</th><th>Modalidad</th>
        <th>Le aplica a</th><th>Gente</th><th>${anio}</th><th></th></tr></thead><tbody>` +
      L.map(c => `<tr${c.activo?'':' style="opacity:.45"'}>
        <td class="k">${esc(c.codigo)}${c.bloqueo === 2
            ? ' <span class="kc-tag no" title="Bloquea la vinculación">ING</span>'
            : c.bloqueo === 1 ? ' <span class="kc-tag wa" title="Bloquea la operación">OPE</span>' : ''}</td>
        <td><div>${esc(c.titulo)}</div>
            <div class="kc-cd" style="margin-top:2px">${esc(c.eje)} · ${esc(c.tipo)}${
              c.autoestudio ? ' · autoestudio' : ''}${c.propia ? ' · propia' : ''}</div></td>
        <td class="n">${vig(c.vigencia_dias)}</td>
        <td style="font-size:13px;color:var(--kc-ink3)">${c.modalidad ? MODALN[c.modalidad] : '—'}</td>
        <td>${c.asignaciones.length
            ? '<div class="kc-chips">' + c.asignaciones.slice(0,3).map(a =>
                `<span class="kc-mch${a.bloqueante!=='no'?' b':''}">${esc(a.destino)}</span>`).join('') +
              (c.asignaciones.length > 3 ? `<span class="kc-mch">+${c.asignaciones.length-3}</span>` : '') + '</div>'
            : '<span style="color:var(--kc-cr);font-size:13px">nadie</span>'}</td>
        <td class="n"${c.personas===0?' style="color:var(--kc-cr)"':''}>${c.personas}</td>
        <td class="n">${c.hechos}/${c.eventos}</td>
        <td><div style="display:flex;gap:6px">
          <button class="kc-mini" data-c="editar" data-i="${c.id}">Editar</button>
          <button class="kc-mini" data-c="asignar" data-i="${c.id}">Asignar</button>
          ${c.activo ? `<button class="kc-mini" data-c="convalidar" data-i="${c.id}">Convalidar</button>` : ''}
          <button class="kc-mini${c.activo?'':' p'}" data-c="${c.activo?'apagar':'prender'}" data-i="${c.id}">${
            c.activo ? 'Apagar' : 'Prender'}</button></div></td>
      </tr>`).join('') + '</tbody></table></div>'
      : '<p class="kc-vacio">Nada con ese filtro.</p>'}`;
  }

  /* ------------------------------------------------------ 4. cronograma */
  function vCro() {
    const E = CRO.eventos || [], q = busca.trim().toLowerCase();
    const hoyS = iso();
    // el orden importa: las que no van por fecha no son «dictadas»,
    // son reglas permanentes que se disparan solas.
    const est = e => !e.fecha ? 'disparo'
                   : e.cancelado ? 'cancelado'
                   : e.ejecutado ? 'hecho'
                   : e.fecha < hoyS ? 'atrasado' : 'programado';
    const n = { todas:E.length, hecho:0, programado:0, atrasado:0, cancelado:0, disparo:0 };
    E.forEach(e => n[est(e)]++);

    const pasa = e => {
      if (q && !((e.codigo + ' ' + e.titulo + ' ' + (e.responsable||'')).toLowerCase().includes(q))) return false;
      return filtro === 'todas' ? true : est(e) === filtro;
    };
    const L = E.filter(pasa);
    const chip = (k, t) => `<button class="kc-chip" data-f="${k}" aria-pressed="${filtro===k}">${t} · ${n[k]}</button>`;

    const conFecha = L.filter(e => e.fecha), sinFecha = L.filter(e => !e.fecha);
    const porMes = {};
    conFecha.forEach(e => { (porMes[e.mes] = porMes[e.mes] || []).push(e); });

    const TAG = { hecho:['si','Dictado'], programado:['n','Programado'],
                  atrasado:['no','Sin dictar'], cancelado:['g','Cancelado'], disparo:['n','Se dispara solo'] };

    const fila = e => {
      const s = est(e);
      const desfase = e.fecha && (+e.fecha.slice(0,4) !== CRO.anio);
      return `<div class="kc-ev${s==='cancelado'?' off':''}">
        <div class="kc-evd">${e.fecha
            ? `<b>${e.fecha.slice(8,10)}</b><span>${e.fecha.slice(5,7)}${
                desfase ? '<i class="kc-mal"> ' + e.fecha.slice(0,4) + '</i>' : ''}</span>`
            : '<b>—</b><span>' + esc(e.disparador) + '</span>'}</div>
        <div class="kc-evb">
          <div class="kc-evt">${esc(e.codigo)} · ${esc(e.titulo)}</div>
          <div class="kc-cd">${[
              e.responsable ? esc(e.responsable) : null,
              e.modalidad ? MODALN[e.modalidad] : null,
              e.lugar ? esc(e.lugar) : null,
              e.ejecutado && e.fecha ? e.asistieron + ' de ' + (e.convocados || '?') + ' asistieron' : null,
              !e.ejecutado && e.fecha && e.convocados ? e.convocados + ' convocados' : null,
              e.reprogramado_de ? 'movida desde el ' + e.reprogramado_de : null,
              e.cancelado_motivo ? 'cancelada: ' + esc(e.cancelado_motivo) : null
            ].filter(Boolean).join(' · ')}</div>
        </div>
        <span class="kc-tag ${TAG[s][0]}">${TAG[s][1]}</span>
        <div class="kc-eva">${
          e.fecha && !e.cancelado && e.fecha <= hoyS
            ? `<button class="kc-mini${e.ejecutado ? '' : ' p'}" data-e="lista" data-i="${e.id}">${
                e.ejecutado ? 'Ver lista' : 'Pasar lista'}</button>` : ''}${
          e.ejecutado ? '' : `
          <button class="kc-mini" data-e="editar" data-i="${e.id}">Editar</button>
          <button class="kc-mini" data-e="mover" data-i="${e.id}">Mover</button>
          ${e.cancelado ? '' : `<button class="kc-mini" data-e="cancelar" data-i="${e.id}">Cancelar</button>`}`}</div>
      </div>`;
    };

    const opAnios = (CRO.anios||[CRO.anio]).includes(anio) ? (CRO.anios||[anio]) : (CRO.anios||[]).concat([anio]);

    return `<div class="kc-bar2">
        <select id="kc-anio" class="kc-sel">${opAnios.sort().reverse().map(a =>
          `<option value="${a}"${a===anio?' selected':''}>${a}</option>`).join('')}</select>
        <input id="kc-bus" class="kc-bus" type="search" placeholder="Buscar capacitación o responsable…"
               value="${esc(busca)}" autocomplete="off">
        <button class="kc-mini p" data-e="crear">+ Programar</button>
      </div>
      <div class="kc-fil" style="padding:0 0 14px">
        ${chip('todas','Todo el año')}${chip('hecho','Dictadas')}${chip('programado','Por dictar')}
        ${chip('atrasado','Sin dictar')}${chip('cancelado','Canceladas')}${chip('disparo','Sin fecha')}
      </div>
      ${n.atrasado && filtro === 'todas' ? `<div class="kc-cent mal"><div class="b">${n.atrasado}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">${n.atrasado} evento(s) pasaron de fecha sin dictarse</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Ante la ARL un cronograma incumplido pesa más que uno reprogramado.
          Movelos de fecha o cancelalos con el motivo.</div></div></div>` : ''}
      ${Object.keys(porMes).length === 0 && !sinFecha.length
        ? '<p class="kc-vacio">Nada con ese filtro.</p>'
        : Object.keys(porMes).sort((a,b)=>a-b).map(m =>
            `<div class="kc-mes">${MESES[m-1]}<span>${porMes[m].length}</span></div>` +
            porMes[m].map(fila).join('')).join('') +
          (sinFecha.length ? '<div class="kc-mes">No van por fecha<span>' + sinFecha.length + '</span></div>' +
            '<p class="kc-nota" style="text-align:left;margin:0 0 10px">Estas no se programan: las dispara un hecho — que entre alguien nuevo, o que ascienda.</p>' +
            sinFecha.map(fila).join('') : '')}`;
  }

  /* --------------------------------------------------------- diálogos */
  const opts = (sel2) => (D.cargos||[]).filter(c=>c.activo).map(c =>
    `<option value="${c.id}"${c.nombre===sel2?' selected':''}>${esc(c.nombre)}</option>`).join('');

  function abrir(html, onOk, okTxt, ancho) {
    const d = document.createElement('dialog');
    if (ancho) d.className = 'ancho';
    d.innerHTML = `<div class="kc-dlg">${html}<div class="kc-row">
      <button class="kc-b2" id="kcx">Cancelar</button>
      <button class="kc-btn" id="kck">${okTxt || 'Guardar'}</button></div></div>`;
    (el.querySelector('.kc-wide') || el).appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const b = d.querySelector('#kck'); b.disabled = true; b.textContent = 'Guardando…';
      try { const r = await onOk(d); d.close(); d.remove(); await recargar(r); }
      catch (e) { b.disabled = false; b.textContent = okTxt || 'Guardar'; alert(e.message); }
    };
    return d;
  }

  function dlg(accion, id) {
    const p = (D.personas||[]).find(x => x.id === id);
    const c = (D.cargos||[]).find(x => x.id === id);

    if (accion === 'crear-cargo')  return dlgCargo(null);
    if (accion === 'editar-cargo') return dlgCargo(c);
    if (accion === 'activar') {
      return abrir(`<h3>Prender “${esc(c.nombre)}”</h3>
        <p>Vuelve a aparecer en las listas y su plan de formación se le vuelve a exigir
           a quien lo ocupe.</p>`,
        () => rpc('cap_activar_cargo', { p_cargo: id }), 'Prender');
    }

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
        <input type="date" id="k3" value="${iso()}">
        <label for="k2">Motivo</label><input type="text" id="k2" placeholder="Ej: ascenso con aval">`,
        d => rpc('cap_mover_cargo', { p_persona: id, p_cargo: d.querySelector('#k1').value,
          p_fecha: d.querySelector('#k3').value, p_motivo: d.querySelector('#k2').value }));
    } else {
      abrir(`<h3>Apagar “${esc(c.nombre)}”</h3>
        <p>${c.personas ? `<b>${c.personas} persona(s)</b> tienen este cargo. Movelas primero:
          si lo apagás quedan sin plan de formación.` : 'Nadie ocupa este cargo.'}</p>
        <p>No se borra: queda apagado y se puede volver a prender.</p>`,
        () => rpc('cap_desactivar_cargo', { p_cargo: id }), 'Apagar');
    }
  }

  function dlgMapear(alias) {
    abrir(`<h3>Mapear “${esc(alias)}”</h3>
      <p>Elegí a qué cargo normalizado corresponde esta variante.</p>
      <label for="k1">Cargo</label><select id="k1">${opts()}</select>`,
      // la empresa sale del cargo, no del navegador
      d => rpc('cap_mapear', { p_alias: alias, p_cargo: d.querySelector('#k1').value }));
  }

  /* --------- capacitaciones --------- */
  function dlgCat(accion, id) {
    const c = (CAT.catalogo||[]).find(x => x.id === id);

    if (accion === 'editar') {
      abrir(`<h3>${esc(c.codigo)} · ${esc(c.titulo)}</h3>
        <p>Cambiar la vigencia no reescribe el pasado: lo ya cursado conserva su fecha de vencimiento.
           Aplica de la próxima en adelante.</p>
        <label for="k1">Título</label><input type="text" id="k1" value="${esc(c.titulo)}">
        <label for="k2">Cada cuánto se repite (en días · vacío = no vence)</label>
        <input type="number" id="k2" min="0" step="1" value="${c.vigencia_dias ?? ''}"
               placeholder="365 = una vez al año">
        <label for="k3">Horas</label>
        <input type="number" id="k3" min="0" step="0.5" value="${c.horas ?? ''}">
        <label for="k4">Modalidad</label>
        <select id="k4"><option value="">— sin definir —</option>${MODAL.map(m =>
          `<option value="${m}"${c.modalidad===m?' selected':''}>${MODALN[m]}</option>`).join('')}</select>
        <label for="k5">Proveedor</label>
        <input type="text" id="k5" value="${esc(c.proveedor||'')}" placeholder="Colmena, interno, cliente…">`,
        d => rpc('cap_cat_guardar', {
          p_catalogo: id,
          p_titulo: d.querySelector('#k1').value,
          p_vigencia_dias: d.querySelector('#k2').value === '' ? null : +d.querySelector('#k2').value,
          p_horas: d.querySelector('#k3').value === '' ? null : +d.querySelector('#k3').value,
          p_modalidad: d.querySelector('#k4').value || null,
          p_proveedor: d.querySelector('#k5').value || null }));

    } else if (accion === 'asignar') {
      const dest = a => a.alcance === 'cargo' ? (CAT.cargos||[])
                      : a === 'rol' ? (CAT.roles||[]) : (CAT.actividades||[]);
      const listado = c.asignaciones.length
        ? c.asignaciones.map(a => `<div class="kc-asig">
            <div><b>${esc(a.destino)}</b><span class="kc-cd"> · ${esc(a.alcance)} · ${BLOQN[a.bloqueante]}</span></div>
            <button class="kc-mini" data-q="${a.id}">Quitar</button></div>`).join('')
        : '<p style="color:var(--kc-cr);margin:0 0 12px">Hoy no le aplica a nadie.</p>';

      const d = abrir(`<h3>A quién le aplica ${esc(c.codigo)}</h3>
        <p>${esc(c.titulo)}</p>
        ${listado}
        <hr style="border:none;border-top:1px solid var(--kc-rule);margin:14px 0">
        <label for="k1">Agregar a</label>
        <select id="k1">
          <option value="todos">Toda la empresa</option>
          <option value="cargo" selected>Un cargo</option>
          <option value="rol">Un comité o rol</option>
          <option value="actividad">Quien haga una actividad</option>
        </select>
        <div id="kdest"></div>
        <label for="k3">Nivel</label>
        <select id="k3">
          <option value="no">No bloquea — informativa</option>
          <option value="operacion">Bloquea la operación — sin ella no puede hacer la tarea</option>
          <option value="ingreso">Bloquea la vinculación — sin ella no completa el ingreso</option>
        </select>
        <p style="font-size:12.5px">Poné <b>vinculación</b> sólo si KALU la dicta por autoestudio.
           Si depende de un proveedor externo, el ingreso queda varado esperándolo.</p>`,
        dd => {
          const al = dd.querySelector('#k1').value;
          const de = dd.querySelector('#k2');
          return rpc('cap_asig_agregar', { p_catalogo: id, p_alcance: al,
            p_destino: al === 'todos' ? null : (de ? de.value : null),
            p_bloqueante: dd.querySelector('#k3').value });
        }, 'Agregar');

      const pintarDest = () => {
        const al = d.querySelector('#k1').value;
        const box = d.querySelector('#kdest');
        if (al === 'todos') { box.innerHTML = ''; return; }
        const L = al === 'cargo' ? (CAT.cargos||[]) : al === 'rol' ? (CAT.roles||[]) : (CAT.actividades||[]);
        box.innerHTML = `<label for="k2">${al === 'cargo' ? 'Cargo' : al === 'rol' ? 'Comité o rol' : 'Actividad'}</label>
          <select id="k2">${L.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select>`;
      };
      pintarDest();
      d.querySelector('#k1').onchange = pintarDest;
      d.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {
        b.disabled = true; b.textContent = 'Quitando…';
        try { const r = await rpc('cap_asig_quitar', { p_asignacion: b.dataset.q, p_motivo: null });
          d.close(); d.remove(); await recargar(r); }
        catch (e) { b.disabled = false; b.textContent = 'Quitar'; alert(e.message); }
      });

    } else if (accion === 'apagar' || accion === 'prender') {
      const off = accion === 'apagar';
      abrir(`<h3>${off ? 'Apagar' : 'Prender'} ${esc(c.codigo)}</h3>
        <p>${esc(c.titulo)}</p>
        ${off ? `<p>Hoy le aplica a <b>${c.personas} persona(s)</b> y tiene
            <b>${c.eventos - c.hechos}</b> evento(s) sin dictar este año.
            No se borra nada: deja de aparecer en los pasaportes y lo ya cursado queda en la historia.</p>
          <label for="k1">Motivo</label>
          <input type="text" id="k1" placeholder="Ej: dejamos de hacer esa actividad">`
          : '<p>Vuelve a aparecer en los pasaportes de quien la tenga asignada.</p>'}`,
        d => rpc('cap_cat_activar', { p_catalogo: id, p_activo: !off,
          p_motivo: off ? d.querySelector('#k1').value : null }),
        off ? 'Apagar' : 'Prender');

    } else if (accion === 'ia') {
      // el generador se abre en lugar del panel y vuelve a esta pestaña
      generador(sel, { volver: () => admin(sel) });

    } else if (accion === 'convalidar') {
      // Dar por cumplido lo que se hizo antes de KALU y consta en papel.
      dlgConvalidar(id, c);

    } else if (accion === 'sumar') {
      const B = CAT.biblioteca || [];
      if (!B.length) {
        abrir(`<h3>Biblioteca</h3><p>Tu catálogo ya tiene todas las capacitaciones de la biblioteca global.
          Las que no usás están apagadas: filtralas con <b>Apagadas</b> y prendé la que necesites.</p>`,
          () => {}, 'Entendido');
        return;
      }
      abrir(`<h3>Sumar de la biblioteca</h3>
        <p>Son las capacitaciones que la plataforma ya tiene armadas y tu empresa todavía no usa.
           Se copian a tu catálogo: podés cambiarles vigencia y horas sin afectar a nadie más.</p>
        <label for="k1">Capacitación</label>
        <select id="k1">${B.map(b =>
          `<option value="${b.id}">${esc(b.codigo)} · ${esc(b.titulo)}</option>`).join('')}</select>`,
        d => rpc('cap_cat_sumar', { p_biblioteca: d.querySelector('#k1').value }), 'Sumar');

    } else if (accion === 'crear') {
      abrir(`<h3>Crear una capacitación propia</h3>
        <p>Para lo que es de tu empresa y no está en la biblioteca de la plataforma.</p>
        <label for="k1">Código</label><input type="text" id="k1" placeholder="Ej: P01">
        <label for="k2">Título</label><input type="text" id="k2">
        <label for="k3">Eje</label>
        <select id="k3"><option value="hse">HSE</option><option value="tecnica">Técnica</option>
          <option value="arl">ARL</option><option value="induccion">Inducción</option></select>
        <label for="k4">Tipo</label>
        <select id="k4"><option value="capacitacion">Capacitación</option><option value="charla">Charla</option>
          <option value="divulgacion">Divulgación</option><option value="campana">Campaña</option>
          <option value="curso_externo">Curso externo</option></select>
        <label for="k5">Cada cuánto se repite (días · vacío = no vence)</label>
        <input type="number" id="k5" min="0" step="1" placeholder="365">
        <label for="k6">Horas</label><input type="number" id="k6" min="0" step="0.5">`,
        d => rpc('cap_cat_crear', {
          p_codigo: d.querySelector('#k1').value, p_titulo: d.querySelector('#k2').value,
          p_eje: d.querySelector('#k3').value, p_tipo: d.querySelector('#k4').value,
          p_vigencia_dias: d.querySelector('#k5').value === '' ? null : +d.querySelector('#k5').value,
          p_horas: d.querySelector('#k6').value === '' ? null : +d.querySelector('#k6').value }), 'Crear');
    }
  }

  /* --------- convalidar: lo que se hizo antes de KALU --------- */
  const ESTN = { vencida:'Vencida', pendiente:'Sin registro',
                 por_vencer:'Por vencer', al_dia:'Al día', no_aplica:'No aplica' };

  async function dlgConvalidar(id, c) {
    let R;
    try { R = await rpc('cap_convalidar_datos', { p_catalogo: id }); }
    catch (e) { return alert(e.message); }

    const P = R.personas || [];
    const falta = p => p.estado === 'pendiente' || p.estado === 'vencida';
    const nf = P.filter(falta).length;

    const d = abrir(`<h3>Convalidar ${esc(c.codigo)}</h3>
      <p>${esc(c.titulo)}</p>
      <p>Para lo que la gente <b>ya hizo antes de KALU</b> y consta en un acta, una planilla
         o un certificado. No inventa cumplimiento: queda firmado con tu nombre y la fecha.</p>
      <label>A quién (${nf} sin registro o vencida${nf !== P.length ? ' de ' + P.length : ''})</label>
      <div class="kc-rap">
        <button type="button" class="kc-mini" id="kcs1">Los que faltan</button>
        <button type="button" class="kc-mini" id="kcs2">Todos</button>
        <button type="button" class="kc-mini" id="kcs0">Ninguno</button>
      </div>
      <div class="kc-ros">${P.map(p => `<div class="kc-rw chk">
          <input type="checkbox" class="kcp" value="${p.persona_id}"${falta(p)?' checked':''}
                 aria-label="${esc(p.nombre)}">
          <div class="nm">${esc(p.nombre)}<span>${esc(p.cargo || '')}</span></div>
          <span class="est ${p.estado}">${ESTN[p.estado] || p.estado}</span>
        </div>`).join('')}</div>
      <label for="k1">Fecha real en que se hizo</label>
      <input type="date" id="k1" max="${iso()}" value="${iso()}">
      <label for="k2">En qué consta</label>
      <input type="text" id="k2" placeholder="Ej: acta 31 de reinducción, marzo 2026">
      <label for="k3">Enlace al soporte (opcional)</label>
      <input type="text" id="k3" placeholder="Ruta del documento en KALU">
      <p id="kcav" style="font-size:12.5px"></p>`,
      dd => {
        const sel = [...dd.querySelectorAll('.kcp:checked')].map(x => x.value);
        if (!sel.length) throw new Error('No elegiste a nadie.');
        return rpc('cap_convalidar', { p_catalogo: id, p_personas: sel,
          p_fecha: dd.querySelector('#k1').value,
          p_soporte: dd.querySelector('#k3').value || null,
          p_motivo: dd.querySelector('#k2').value });
      }, 'Convalidar', true);

    const marcar = f => d.querySelectorAll('.kcp').forEach((x, i) => { x.checked = f(P[i]); });
    d.querySelector('#kcs1').onclick = () => marcar(falta);
    d.querySelector('#kcs2').onclick = () => marcar(() => true);
    d.querySelector('#kcs0').onclick = () => marcar(() => false);

    // Avisar en vivo si la fecha elegida deja a la gente vencida igual.
    const av = d.querySelector('#kcav'), inp = d.querySelector('#k1');
    const revisar = () => {
      if (!c.vigencia_dias || !inp.value) { av.textContent = ''; return; }
      const v = new Date(inp.value + 'T12:00:00');
      v.setDate(v.getDate() + c.vigencia_dias);
      const vencida = v < hoy();
      av.style.color = vencida ? 'var(--kc-cr)' : 'var(--kc-ink3)';
      av.textContent = vencida
        ? 'Con esa fecha vencería el ' + v.toLocaleDateString('es-CO') +
          ' — o sea, ya vencida. Queda el antecedente cargado, pero hay que reprogramarla. ' +
          'Si hubo reinducción más reciente, poné esa fecha.'
        : 'Con esa fecha quedan al día hasta el ' + v.toLocaleDateString('es-CO') + '.';
    };
    inp.oninput = revisar; revisar();
  }

  /* --------- cronograma --------- */
  function dlgEv(accion, id) {
    const e = (CRO.eventos||[]).find(x => x.id === id);

    if (accion === 'lista') {
      dlgLista(id, e);

    } else if (accion === 'crear') {
      abrir(`<h3>Programar una capacitación</h3>
        <p>Queda en el cronograma del año. Los convocados salen solos de a quién le aplica.</p>
        <label for="k1">Capacitación</label>
        <select id="k1">${(CRO.catalogo||[]).map(c =>
          `<option value="${c.id}">${esc(c.codigo)} · ${esc(c.titulo)}</option>`).join('')}</select>
        <label for="k2">Fecha</label><input type="date" id="k2" value="${iso()}">
        <label for="k3">Responsable</label><input type="text" id="k3" placeholder="Quién la dicta">
        <label for="k4">Lugar</label><input type="text" id="k4">
        <label for="k5">Modalidad</label>
        <select id="k5"><option value="">— sin definir —</option>${MODAL.map(m =>
          `<option value="${m}">${MODALN[m]}</option>`).join('')}</select>`,
        d => rpc('cap_evento_crear', {
          p_catalogo: d.querySelector('#k1').value, p_fecha: d.querySelector('#k2').value,
          p_responsable: d.querySelector('#k3').value || null,
          p_lugar: d.querySelector('#k4').value || null,
          p_modalidad: d.querySelector('#k5').value || null }), 'Programar');

    } else if (accion === 'mover') {
      abrir(`<h3>Mover de fecha</h3>
        <p>${esc(e.codigo)} · ${esc(e.titulo)}<br>Hoy está para el <b>${esc(e.fecha||'sin fecha')}</b>.</p>
        <label for="k1">Fecha nueva</label>
        <input type="date" id="k1" value="${esc(e.fecha||iso())}">
        <label for="k2">Motivo</label>
        <input type="text" id="k2" placeholder="Ej: se cruzaba con la parada de planta">
        <p style="font-size:12.5px">Queda registrada la fecha original. Ante la ARL un cronograma
           reprogramado con motivo pesa menos que uno incumplido en silencio.</p>`,
        d => rpc('cap_evento_mover', { p_evento: id,
          p_fecha: d.querySelector('#k1').value, p_motivo: d.querySelector('#k2').value }), 'Mover');

    } else if (accion === 'cancelar') {
      abrir(`<h3>Cancelar el evento</h3>
        <p>${esc(e.codigo)} · ${esc(e.titulo)} del ${esc(e.fecha||'—')}</p>
        <p>No se borra: queda tachado en el cronograma con el motivo.
           La capacitación sigue pendiente para quien la debía — si ya no va, apagala desde el catálogo.</p>
        <label for="k1">Motivo</label><input type="text" id="k1" placeholder="Ej: no vino el instructor">`,
        d => rpc('cap_evento_cancelar', { p_evento: id, p_motivo: d.querySelector('#k1').value }),
        'Cancelar el evento');

    } else if (accion === 'editar') {
      abrir(`<h3>${esc(e.codigo)} · ${esc(e.titulo)}</h3>
        <label for="k1">Responsable</label><input type="text" id="k1" value="${esc(e.responsable||'')}">
        <label for="k2">Lugar</label><input type="text" id="k2" value="${esc(e.lugar||'')}">
        <label for="k3">Modalidad</label>
        <select id="k3"><option value="">— sin definir —</option>${MODAL.map(m =>
          `<option value="${m}"${e.modalidad===m?' selected':''}>${MODALN[m]}</option>`).join('')}</select>
        <label for="k4">Horas</label><input type="number" id="k4" min="0" step="0.5" value="${e.horas ?? ''}">
        <label for="k5">Observaciones</label><textarea id="k5" rows="2">${esc(e.observaciones||'')}</textarea>`,
        d => rpc('cap_evento_guardar', { p_evento: id,
          p_responsable: d.querySelector('#k1').value || null,
          p_lugar: d.querySelector('#k2').value || null,
          p_modalidad: d.querySelector('#k3').value || null,
          p_horas: d.querySelector('#k4').value === '' ? null : +d.querySelector('#k4').value,
          p_observaciones: d.querySelector('#k5').value || null }));
    }
  }

  /* --------- pasar lista de un evento --------- */
  const MARCAS = [
    ['asistio',               'Asistió'],
    ['ausente_justificado',   'Faltó con justificación'],
    ['ausente_injustificado', 'Faltó'],
    ['no_aplica',             'No le aplica'],
    ['programado',            'Sin marcar']
  ];

  async function dlgLista(id, ev) {
    let R;
    try { R = await rpc('cap_evento_lista', { p_evento: id }); }
    catch (e) { return alert(e.message); }

    const P = R.personas || [], E = R.evento || {};
    if (!P.length) {
      abrir(`<h3>${esc(E.codigo || '')} · sin convocados</h3>
        <p>Esta capacitación no le aplica a nadie todavía, así que no hay lista que pasar.
           Asignala primero a un cargo, un comité o una actividad desde la pestaña
           <b>Capacitaciones</b>.</p>`, () => {}, 'Entendido');
      return;
    }

    const need = e => e === 'ausente_justificado' || e === 'no_aplica';

    const d = abrir(`<h3>Lista de ${esc(E.codigo || '')}</h3>
      <p>${esc(E.titulo || '')} · ${esc(E.fecha || '')}${
        E.responsable ? ' · ' + esc(E.responsable) : ''}</p>
      <div class="kc-rap">
        <button type="button" class="kc-mini" id="kct">Todos asistieron</button>
        <button type="button" class="kc-mini" id="kcn">Limpiar</button>
      </div>
      <div class="kc-ros">${P.map((p, i) => `<div class="kc-rw" data-i="${i}">
          <div class="nm">${esc(p.nombre)}<span>${esc(p.cargo || '')}</span></div>
          <select class="kce">${MARCAS.map(([v, t]) =>
            `<option value="${v}"${p.estado === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <input type="text" class="kcm mot" placeholder="Motivo"
                 value="${esc(p.motivo || '')}" style="display:${need(p.estado)?'block':'none'}">
        </div>`).join('')}</div>
      <label for="k1">Fecha en que se dictó</label>
      <input type="date" id="k1" max="${iso()}"
             value="${esc(E.realizada || E.fecha || iso())}">
      <p style="font-size:12.5px">Al guardar, el evento queda como dictado y a cada asistente se le
         actualiza el pasaporte con su fecha de vencimiento. Los que faltaron siguen debiéndola.</p>`,
      dd => {
        const marcas = [...dd.querySelectorAll('.kc-rw')].map(row => {
          const i = +row.dataset.i;
          return { persona_id: P[i].persona_id,
                   estado: row.querySelector('.kce').value,
                   motivo: row.querySelector('.kcm').value || null };
        });
        return rpc('cap_marcar', { p_evento: id, p_marcas: marcas,
          p_fecha: dd.querySelector('#k1').value });
      }, 'Guardar la lista', true);

    // el campo de motivo aparece sólo cuando el estado lo exige
    d.querySelectorAll('.kc-rw').forEach(row => {
      const s = row.querySelector('.kce'), m = row.querySelector('.kcm');
      s.onchange = () => { m.style.display = need(s.value) ? 'block' : 'none'; };
    });
    const todos = v => d.querySelectorAll('.kc-rw').forEach(row => {
      const s = row.querySelector('.kce'); s.value = v;
      row.querySelector('.kcm').style.display = need(v) ? 'block' : 'none';
    });
    d.querySelector('#kct').onclick = () => todos('asistio');
    d.querySelector('#kcn').onclick = () => todos('programado');
  }

  pintar();
}

/* =================================================================
   FICHA DE PERSONA — donde HSE valida y carga soportes
   ================================================================= */
async function ficha(sel, personaId, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Cargando la ficha…');
  let F;
  try { F = await rpc('cap_ficha_datos', { p_persona: personaId }); }
  catch (e) { return error(el, e); }
  if (!F || !F.persona) return error(el, new Error('Esa persona no está en tu padrón.'));

  const P = F.persona, H = F.habilitacion || {};
  const puede = F.puede_editar !== false;
  const BLQ = { ingreso: 'Vinculación', operacion: 'Operación', no: '' };

  async function recargar(r) {
    if (r && r.aviso) aviso(r.aviso);
    await ficha(sel, personaId, opt);
  }
  function aviso(txt) {
    const t = document.createElement('div');
    t.className = 'kc-toast'; t.textContent = txt;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 8000);
  }

  function pintar() {
    const apto = H.apto_operacion !== false;
    const cls  = P.vigente === false ? 'cr' : (apto ? 'ok' : 'cr');
    const tramo = (F.tramos || [])[0] || {};
    const prog = F.progreso || {};

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:20px 0 12px">
        <button class="kc-mini" id="kcvolver">← Volver</button>
      </div>

      <div style="border-bottom:2px solid var(--kc-ink);padding-bottom:16px;margin-bottom:18px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:8px">FICHA DE FORMACIÓN</div>
        <h1 style="font-size:30px;font-weight:700;line-height:1.05">${esc(P.nombre)}</h1>
        <p style="color:var(--kc-ink2);margin:6px 0 0">${esc(P.cargo || P.cargo_texto || '—')}${
          P.cedula ? ' · <span class="mono">' + esc(P.cedula) + '</span>' : ''}${
          P.vigente === false ? ' · <b style="color:var(--kc-cr)">no vigente</b>' : ''}</p>
      </div>

      <div class="kc-band ${cls}" style="margin-bottom:14px">
        <div class="m">${cls === 'ok' ? '✓' : '!'}</div>
        <div><div class="t1">${apto ? 'Apta para operar' : 'No apta para operar'}</div>
        <div class="t2">Vinculación ${H.ok_ingreso ?? 0} de ${H.req_ingreso ?? 0} ·
          Operación ${H.ok_operacion ?? 0} de ${H.req_operacion ?? 0}</div></div>
      </div>

      ${(F.faltante || []).length ? `<div class="kc-p1" style="margin-bottom:18px">
        <div style="padding:13px 16px 4px"><div class="kc-tt" style="font-size:15px">
          Qué le falta exactamente</div></div>
        <div style="padding:0 16px 14px">${F.faltante.map(f => `<div class="kc-asig">
          <div><b>${esc(f.codigo)}</b> · ${esc(f.titulo)}
            <span class="kc-cd"> · ${esc(EST[f.estado] || f.estado)}</span></div>
          <span class="kc-tag ${f.bloqueante === 'ingreso' ? 'no' : 'wa'}">${
            esc(BLQ[f.bloqueante] || f.bloqueante)}</span>
          ${puede ? `<button class="kc-mini p" data-val="${f.codigo}">Validar</button>` : ''}
        </div>`).join('')}</div></div>` : ''}

      <div class="kc-tabs" style="margin-bottom:18px">
        <button class="kc-tab" data-s="form" aria-selected="true">Formación</button>
        <button class="kc-tab" data-s="cargo" aria-selected="false">Cargo</button>
        <button class="kc-tab" data-s="grupos" aria-selected="false">Comités y actividades</button>
        <button class="kc-tab" data-s="puntual" aria-selected="false">Asignado a ella</button>
      </div>
      <div id="kc-fs"></div></div>`;

    el.querySelector('#kcvolver').onclick = () =>
      (opt && opt.volver) ? opt.volver() : admin(sel);
    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => {
      el.querySelectorAll('.kc-tab').forEach(x =>
        x.setAttribute('aria-selected', String(x === b)));
      seccion(b.dataset.s);
    });
    seccion('form');
  }

  function seccion(s) {
    const v = el.querySelector('#kc-fs');
    if (s === 'form')        v.innerHTML = vForm();
    else if (s === 'cargo')  v.innerHTML = vCargo();
    else if (s === 'grupos') v.innerHTML = vGrupos();
    else                     v.innerHTML = vPuntual();
    enganchar();
  }

  /* --- formación --- */
  function vForm() {
    const I = F.items || [];
    if (!I.length) return '<p class="kc-vacio">No tiene ninguna capacitación asignada.</p>';
    return '<div class="kc-sc"><table><thead><tr><th>Código</th><th>Capacitación</th>' +
      '<th>Estado</th><th>Última vez</th><th>Vence</th><th>Soporte</th><th></th>' +
      '</tr></thead><tbody>' + I.map(x => `<tr>
        <td class="k">${esc(x.codigo)}${x.bloqueante && x.bloqueante !== 'no'
          ? ` <span class="kc-tag ${x.bloqueante === 'ingreso' ? 'no' : 'wa'}">${
              x.bloqueante === 'ingreso' ? 'ING' : 'OPE'}</span>` : ''}</td>
        <td><div>${esc(x.titulo)}</div>
          <div class="kc-cd" style="margin-top:2px">${esc(x.por_que_aplica || '')}</div></td>
        <td><span class="kc-pill ${x.estado}">${esc(EST[x.estado] || x.estado)}</span></td>
        <td class="n">${x.ultima_vez ? fecha(x.ultima_vez) : '—'}</td>
        <td class="n">${x.vence_el ? fecha(x.vence_el) : (x.ultima_vez ? 'no vence' : '—')}</td>
        <td>${x.soporte
          ? `<button class="kc-mini" data-ver="${esc(x.soporte)}"
              title="${esc(x.soporte)}">Ver</button>`
          : '<span style="color:var(--kc-ink3);font-size:12.5px">—</span>'}</td>
        <td>${puede ? `<div style="display:flex;gap:6px">
          <button class="kc-mini${x.estado === 'al_dia' ? '' : ' p'}"
            data-v2="${x.catalogo_id}">Validar</button>
          <button class="kc-mini" data-sop="${x.catalogo_id}">Soporte</button></div>` : ''}</td>
      </tr>`).join('') + '</tbody></table></div>';
  }

  /* --- cargo y antigüedad --- */
  function vCargo() {
    const t = (F.tramos || [])[0] || {};
    const g = F.progreso || {};
    const EDU = { bachiller:'Bachiller', tecnico:'Técnico', tecnologo:'Tecnólogo',
                  profesional:'Profesional', especialista:'Especialista' };
    return `<div class="kc-p1" style="margin-bottom:14px"><div style="padding:16px 18px">
        <div class="kc-cd">TRAMO ABIERTO</div>
        <div class="kc-tt" style="font-size:19px;margin:4px 0 8px">${esc(t.cargo || '—')}</div>
        <p style="margin:0 0 4px;font-size:14.5px">Desde el <b>${
          t.desde ? fecha(t.desde) : '—'}</b>${
          g.meses_en_el_cargo != null ? ' · lleva <b>' + g.meses_en_el_cargo + ' meses</b>' : ''}</p>
        <p style="margin:0;font-size:14px;color:var(--kc-ink2)">Origen ${
          esc(t.origen || '—')} · Nivel educativo ${esc(EDU[t.educacion] || '—')}</p>
        ${t.observacion ? `<p class="kc-cd" style="margin-top:8px">${esc(t.observacion)}</p>` : ''}
        ${puede ? '<button class="kc-mini p" id="kcant" style="margin-top:12px">Corregir la antigüedad</button>' : ''}
      </div></div>
      ${g.cargo_siguiente ? `<div class="kc-p1" style="margin-bottom:14px"><div style="padding:16px 18px">
        <div class="kc-cd">PRÓXIMO PELDAÑO</div>
        <div class="kc-tt" style="font-size:17px;margin:4px 0 10px">${esc(g.cargo_siguiente)}</div>
        <div class="kc-lks">
          <div class="kc-lk ${g.candado_cursos?'on':'off'}"><div class="i">${g.candado_cursos?'✓':'○'}</div>
            <div class="l">${g.cursos_cumplidos ?? 0}/${g.cursos_requeridos ?? 0} cursos</div></div>
          <div class="kc-lk ${g.candado_tiempo?'on':'off'}"><div class="i">${g.candado_tiempo?'✓':'○'}</div>
            <div class="l">${g.meses_faltantes ? g.meses_faltantes + ' meses' : 'tiempo'}</div></div>
          <div class="kc-lk ${g.candado_aval?'on':'off'}"><div class="i">${g.candado_aval?'✓':'○'}</div>
            <div class="l">aval</div></div>
        </div></div></div>` : ''}
      <div class="kc-sc"><table><thead><tr><th>Cargo</th><th>Desde</th><th>Hasta</th>
        <th>Origen</th><th>Observación</th></tr></thead><tbody>${
        (F.tramos || []).map(x => `<tr><td class="k">${esc(x.cargo)}</td>
          <td class="n">${fecha(x.desde)}</td>
          <td class="n">${x.hasta ? fecha(x.hasta) : '—'}</td>
          <td>${esc(x.origen || '—')}</td>
          <td style="color:var(--kc-ink3);font-size:13px">${esc(x.observacion || '')}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  /* --- comités y actividades --- */
  function vGrupos() {
    const marc = (lista, actuales, clase) => lista.length
      ? '<div class="kc-ros">' + lista.map(x => `<div class="kc-rw chk">
          <input type="checkbox" class="${clase}" value="${x.id}"${
            actuales.includes(x.id) ? ' checked' : ''}${puede ? '' : ' disabled'}
            aria-label="${esc(x.nombre)}">
          <div class="nm">${esc(x.nombre)}<span>${x.gente} persona(s) hoy</span></div>
        </div>`).join('') + '</div>'
      : '<p class="kc-vacio">Nada cargado todavía.</p>';

    return `<div class="kc-p1" style="margin-bottom:14px"><div style="padding:16px 18px">
        <div class="kc-tt" style="font-size:17px;margin-bottom:4px">Comités y roles</div>
        <p style="margin:0 0 12px;font-size:13.5px;color:var(--kc-ink2)">De acá salen las
          capacitaciones que no dependen del cargo sino de estar en un comité.</p>
        ${marc(F.roles_todos || [], F.roles || [], 'kcrol')}
        ${puede ? '<button class="kc-btn" id="kcroles" style="margin-top:10px;font-size:14px;padding:9px">Guardar comités</button>' : ''}
      </div></div>
      <div class="kc-p1"><div style="padding:16px 18px">
        <div class="kc-tt" style="font-size:17px;margin-bottom:4px">Actividades de riesgo</div>
        <p style="margin:0 0 12px;font-size:13.5px;color:var(--kc-ink2)">Qué hace esta persona
          en la práctica. Soldar, operar el puente grúa, hacer videoscopía. Cada una arrastra
          su propia formación, aunque no esté en la descripción del cargo.</p>
        ${marc(F.actividades_todas || [], F.actividades || [], 'kcact')}
        ${puede ? '<button class="kc-btn" id="kcacts" style="margin-top:10px;font-size:14px;padding:9px">Guardar actividades</button>' : ''}
      </div></div>`;
  }

  /* --- asignado puntualmente --- */
  function vPuntual() {
    const M = F.manuales || [];
    return `<p style="font-size:14.5px;color:var(--kc-ink2);margin:0 0 14px;max-width:66ch">
        Para lo que le toca a <b>esta persona</b> y no a todo su cargo: va a una plataforma
        marina, reemplaza a alguien en el puente grúa, la piden con un curso puntual para un
        contrato. Lleva motivo, y si querés, plazo.</p>
      ${puede ? '<button class="kc-mini p" id="kcpunt" style="margin-bottom:14px">+ Asignar algo puntual</button>' : ''}
      ${M.length ? '<div class="kc-sc"><table><thead><tr><th>Código</th><th>Capacitación</th>' +
        '<th>Por qué</th><th>Plazo</th><th>Nivel</th><th></th></tr></thead><tbody>' +
        M.map(m => `<tr><td class="k">${esc(m.codigo)}</td><td>${esc(m.titulo)}</td>
          <td style="color:var(--kc-ink2);font-size:13.5px">${esc(m.motivo)}</td>
          <td class="n">${m.plazo ? fecha(m.plazo) : '—'}</td>
          <td>${m.bloqueante !== 'no'
            ? `<span class="kc-tag ${m.bloqueante === 'ingreso' ? 'no' : 'wa'}">${
                esc(BLQ[m.bloqueante])}</span>` : '—'}</td>
          <td>${puede ? `<button class="kc-mini" data-quit="${m.id}">Quitar</button>` : ''}</td>
        </tr>`).join('') + '</tbody></table></div>'
        : '<p class="kc-vacio">No tiene nada asignado a título personal.</p>'}`;
  }

  /* --- diálogos --- */
  function abrir(html, onOk, okTxt, ancho) {
    const d = document.createElement('dialog');
    if (ancho) d.className = 'ancho';
    d.innerHTML = `<div class="kc-dlg">${html}<div class="kc-row">
      <button class="kc-b2" id="kcx">Cancelar</button>
      <button class="kc-btn" id="kck">${okTxt || 'Guardar'}</button></div></div>`;
    (el.querySelector('.kc-wide') || el).appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const b = d.querySelector('#kck'); b.disabled = true; b.textContent = 'Guardando…';
      try { const r = await onOk(d); d.close(); d.remove(); await recargar(r); }
      catch (e) { b.disabled = false; b.textContent = okTxt || 'Guardar'; alert(e.message); }
    };
    return d;
  }

  function dlgValidar(catalogoId) {
    const it = (F.items || []).find(x => x.catalogo_id === catalogoId) || {};
    abrir(`<h3>Validar ${esc(it.codigo || '')}</h3>
      <p>${esc(it.titulo || '')}</p>
      <p>Para lo que <b>ya hizo</b> y consta en un acta, una planilla o un certificado.
         El vencimiento se calcula desde la fecha real, no desde hoy.</p>
      <label for="k1">Fecha en que la hizo</label>
      <input type="date" id="k1" max="${iso()}" value="${iso()}">
      <label for="k2">En qué consta</label>
      <input type="text" id="k2" placeholder="Ej: acta 31 de reinducción, marzo 2026">
      <label for="k3">Enlace o ruta del soporte (opcional)</label>
      <input type="text" id="k3" placeholder="Se puede cargar después con el botón Soporte">`,
      d => rpc('cap_convalidar', {
        p_catalogo: catalogoId, p_personas: [personaId],
        p_fecha: d.querySelector('#k1').value,
        p_soporte: d.querySelector('#k3').value || null,
        p_motivo: d.querySelector('#k2').value }), 'Validar');
  }

  function dlgSoporte(catalogoId) {
    const it = (F.items || []).find(x => x.catalogo_id === catalogoId) || {};
    if (!it.ultima_vez) {
      abrir(`<h3>Todavía no hay qué respaldar</h3>
        <p>${esc(it.codigo || '')} · ${esc(it.titulo || '')}</p>
        <p>Esta persona no tiene esa capacitación cumplida. Primero <b>Validar</b> con la
           fecha real, y después subir el soporte.</p>`, () => {}, 'Entendido');
      return;
    }
    const d = abrir(`<h3>Soporte de ${esc(it.codigo || '')}</h3>
      <p>${esc(it.titulo || '')} · hecha el ${fecha(it.ultima_vez)}</p>
      <label for="k0">Archivo</label>
      <input type="file" id="k0" accept=".pdf,.jpg,.jpeg,.png">
      <p id="kcsub" style="font-size:12.5px;margin:-6px 0 12px"></p>
      <label for="k1">O pegá la ruta / enlace donde ya está</label>
      <input type="text" id="k1" value="${esc(it.soporte || '')}" placeholder="documentos/…">
      <label for="k2">Nombre del documento</label>
      <input type="text" id="k2" value="${esc((it.codigo || '') + ' — ' + (it.titulo || ''))}">
      <label for="k3">Emitido por</label>
      <input type="text" id="k3" value="externo" placeholder="Colmena, Ingetest, interno…">`,
      async dd => {
        let ruta = dd.querySelector('#k1').value.trim();
        const f = dd.querySelector('#k0').files[0];
        if (f) ruta = await subir(f, it.codigo);
        if (!ruta) throw new Error('Elegí un archivo o pegá la ruta donde está el documento.');
        return rpc('cap_soporte', { p_persona: personaId, p_catalogo: catalogoId,
          p_storage_path: ruta, p_nombre: dd.querySelector('#k2').value,
          p_emitido_por: dd.querySelector('#k3').value });
      }, 'Guardar el soporte');

    // Subida al bucket de la plataforma. Si el bucket no deja escribir,
    // se dice qué pasó y queda la opción de pegar la ruta a mano.
    async function subir(file, codigo) {
      const nota = d.querySelector('#kcsub');
      nota.style.color = 'var(--kc-ink3)';
      nota.textContent = 'Subiendo el archivo…';
      // Ruta: empresa / módulo / persona / archivo.
      // La empresa va primera a propósito. Es la convención de QA/QC,
      // la única de las que hay en el bucket que separa por empresa
      // (`foldername(name)[1] = mi_empresa()`). Los módulos viejos
      // guardan en la raíz y sólo funcionan porque hay una política
      // abierta que los tapa; el día que se cierre, esto ya cumple.
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
        .replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
      const cod = String(codigo || 'doc').replace(/[^A-Za-z0-9_-]/g, '');
      if (!P.empresa_id) throw new Error('No se pudo determinar tu empresa para guardar el archivo.');
      const ruta = P.empresa_id + '/capacitador/' + personaId + '/' +
                   cod + '-' + iso().replace(/-/g, '') + '-' +
                   Math.random().toString(16).slice(2, 8) + '.' + ext;
      const st = sb && sb.storage;
      if (!st) throw new Error('No se puede subir desde acá. Pegá la ruta del documento.');
      const { error: e } = await st.from('documentos')
        .upload(ruta, file, { upsert: false, contentType: file.type || undefined });
      if (e) {
        nota.style.color = 'var(--kc-cr)';
        nota.textContent = 'No se pudo subir: ' + e.message +
          ' · Guardá el documento donde lo guardan siempre y pegá acá la ruta.';
        throw new Error('El archivo no se subió. Mirá el aviso de arriba.');
      }
      nota.style.color = 'var(--kc-ok)';
      nota.textContent = 'Archivo subido.';
      return ruta;
    }
  }

  function dlgAntiguedad() {
    const t = (F.tramos || [])[0] || {};
    abrir(`<h3>Antigüedad en el cargo</h3>
      <p>${esc(t.cargo || '')}. Usalo si la fecha estaba mal cargada. <b>No es un ascenso</b>:
         para eso está Mover, que cierra el tramo y abre uno nuevo.</p>
      <label for="k1">Desde cuándo está en este cargo</label>
      <input type="date" id="k1" max="${iso()}" value="${esc(t.desde || iso())}">
      <label for="k2">Origen</label>
      <select id="k2">
        <option value="interno"${t.origen === 'interno' ? ' selected' : ''}>Interno — venía de otro cargo en la empresa</option>
        <option value="externo"${t.origen === 'externo' ? ' selected' : ''}>Externo — entró directo a este cargo</option>
      </select>
      <label for="k3">Nivel educativo</label>
      <select id="k3"><option value="">— sin definir —</option>${
        ['bachiller','tecnico','tecnologo','profesional','especialista'].map(x =>
          `<option value="${x}"${t.educacion === x ? ' selected' : ''}>${
            x.charAt(0).toUpperCase() + x.slice(1)}</option>`).join('')}</select>
      <label for="k4">Motivo</label>
      <input type="text" id="k4" placeholder="Ej: la fecha real está en el contrato">
      <p style="font-size:12.5px">El origen y el nivel educativo cambian cuánto tiempo se le
         pide para el próximo peldaño, tal como lo define el A.MA001.</p>`,
      d => rpc('cap_persona_antiguedad', { p_persona: personaId,
        p_desde: d.querySelector('#k1').value,
        p_origen: d.querySelector('#k2').value || null,
        p_educacion: d.querySelector('#k3').value || null,
        p_motivo: d.querySelector('#k4').value || null }));
  }

  function dlgPuntual() {
    abrir(`<h3>Asignar algo puntual a ${esc(P.nombre)}</h3>
      <p>Le va a aparecer en el pasaporte como pendiente, con el motivo a la vista.</p>
      <label for="k1">Capacitación</label>
      <select id="k1">${(F.catalogo || []).map(c =>
        `<option value="${c.id}">${esc(c.codigo)} · ${esc(c.titulo)}</option>`).join('')}</select>
      <label for="k2">Por qué a ella</label>
      <input type="text" id="k2" placeholder="Ej: va a plataforma marina en septiembre">
      <label for="k3">Plazo (opcional)</label>
      <input type="date" id="k3">
      <label for="k4">Nivel</label>
      <select id="k4">
        <option value="no">No bloquea — informativa</option>
        <option value="operacion">Bloquea la operación</option>
        <option value="ingreso">Bloquea la vinculación</option>
      </select>`,
      d => rpc('cap_asignar_persona', { p_persona: personaId,
        p_catalogo: d.querySelector('#k1').value,
        p_motivo: d.querySelector('#k2').value,
        p_plazo: d.querySelector('#k3').value || null,
        p_bloqueante: d.querySelector('#k4').value }), 'Asignar');
  }

  function enganchar() {
    el.querySelectorAll('[data-v2]').forEach(b => b.onclick = () => dlgValidar(b.dataset.v2));
    el.querySelectorAll('[data-sop]').forEach(b => b.onclick = () => dlgSoporte(b.dataset.sop));

    // El bucket `documentos` es privado: para abrir un soporte hay que
    // pedir un enlace firmado, que dura un minuto.
    el.querySelectorAll('[data-ver]').forEach(b => b.onclick = async () => {
      const ruta = b.dataset.ver;
      if (/^https?:\/\//i.test(ruta)) { global.open(ruta, '_blank', 'noopener'); return; }
      b.disabled = true; b.textContent = 'Abriendo…';
      try {
        const { data, error: e } = await sb.storage.from('documentos')
          .createSignedUrl(ruta, 60);
        if (e || !data || !data.signedUrl) throw new Error((e && e.message) || 'sin enlace');
        global.open(data.signedUrl, '_blank', 'noopener');
      } catch (e) {
        alert('No se pudo abrir el documento.\n\n' + e.message +
              '\n\nRuta guardada: ' + ruta);
      }
      b.disabled = false; b.textContent = 'Ver';
    });
    el.querySelectorAll('[data-val]').forEach(b => b.onclick = () => {
      const it = (F.items || []).find(x => x.codigo === b.dataset.val);
      if (it) dlgValidar(it.catalogo_id);
    });
    el.querySelectorAll('[data-quit]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Quitando…';
      try { await rpc('cap_desasignar_persona', { p_id: b.dataset.quit });
        await recargar({ aviso: 'Asignación quitada. Lo ya cursado queda en su historia.' }); }
      catch (e) { b.disabled = false; b.textContent = 'Quitar'; alert(e.message); }
    });
    const ant = el.querySelector('#kcant'); if (ant) ant.onclick = dlgAntiguedad;
    const pun = el.querySelector('#kcpunt'); if (pun) pun.onclick = dlgPuntual;

    const gr = el.querySelector('#kcroles');
    if (gr) gr.onclick = async () => {
      gr.disabled = true; gr.textContent = 'Guardando…';
      const ids = [...el.querySelectorAll('.kcrol:checked')].map(x => x.value);
      try { const r = await rpc('cap_persona_roles', { p_persona: personaId, p_roles: ids });
        await recargar(r); }
      catch (e) { gr.disabled = false; gr.textContent = 'Guardar comités'; alert(e.message); }
    };
    const ga = el.querySelector('#kcacts');
    if (ga) ga.onclick = async () => {
      ga.disabled = true; ga.textContent = 'Guardando…';
      const ids = [...el.querySelectorAll('.kcact:checked')].map(x => x.value);
      try { const r = await rpc('cap_persona_actividades', { p_persona: personaId, p_act: ids });
        await recargar(r); }
      catch (e) { ga.disabled = false; ga.textContent = 'Guardar actividades'; alert(e.message); }
    };
  }

  pintar();
}

/* =================================================================
   GENERADOR — armar una capacitación con IA a partir de documentos
   ================================================================= */
async function generador(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Cargando…');
  let D, abierto = null, R = null, archivos = [], reloj = null;

  const EST_G = { pendiente:'En cola', procesando:'La IA está trabajando',
                  borrador:'Borrador listo para revisar', publicada:'Publicada',
                  error:'Falló', anulada:'Anulada' };
  const TIPOS = [['titulo','Título'],['texto','Párrafo'],['lista','Lista'],
                 ['aviso','Aviso destacado'],['separador','Separador']];

  async function traer(id) {
    D = await rpc('cap_generacion_datos', { p_id: id || null });
    if (D.uno && D.uno.resultado) R = JSON.parse(JSON.stringify(D.uno.resultado));
  }
  function toast(t) {
    const x = document.createElement('div');
    x.className = 'kc-toast'; x.textContent = t;
    document.body.appendChild(x); setTimeout(() => x.remove(), 7000);
  }
  function parar() { if (reloj) { clearInterval(reloj); reloj = null; } }

  try { await traer(null); } catch (e) { return error(el, e); }

  /* ---------------------------------------------------------- lista */
  function vLista() {
    const L = D.lista || [];
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:22px 0 12px">
        ${opt && opt.volver ? '<button class="kc-mini" id="kcv">← Volver</button>' : ''}
      </div>
      <div style="border-bottom:2px solid var(--kc-ink);padding-bottom:14px;margin-bottom:18px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:8px">KALU · CAPACITADOR</div>
        <h1 style="font-size:30px;font-weight:700">Armar una capacitación con IA</h1>
        <p style="color:var(--kc-ink2);margin:8px 0 0;max-width:66ch">Subís el procedimiento,
          las fotos, el instructivo — lo que tengas — y la IA arma el contenido y las preguntas.
          <b>Queda como borrador:</b> lo leés, lo corregís y recién ahí lo publicás. El contenido
          de una capacitación obligatoria lo firma una persona, no una máquina.</p>
      </div>
      ${D.puede_editar !== false
        ? '<button class="kc-mini p" id="kcnueva" style="margin-bottom:16px">+ Nueva</button>' : ''}
      ${L.length ? '<div class="kc-gen">' + L.map(g => `
        <div class="kc-gi ${esc(g.estado)}">
          <div class="n"><b>${esc(g.codigo ? g.codigo + ' · ' : '')}${esc(g.titulo)}</b>
            <span>${esc(EST_G[g.estado] || g.estado)}${
              g.bloques ? ' · ' + g.bloques + ' bloques y ' + g.preguntas + ' preguntas' : ''}${
              g.fuentes ? ' · ' + g.fuentes + ' archivo(s)' : ''}${
              g.pedido_por ? ' · pidió ' + esc(g.pedido_por) : ''}</span>
            ${g.error ? `<span style="color:var(--kc-cr)">${esc(g.error)}</span>` : ''}</div>
          ${g.estado === 'borrador'
            ? `<button class="kc-mini p" data-rev="${g.id}">Revisar y publicar</button>` : ''}
          ${g.estado === 'error'
            ? `<button class="kc-mini" data-rei="${g.id}">Reintentar</button>` : ''}
          ${g.estado === 'publicada' ? '<span class="kc-tag si">Publicada</span>' : ''}
          ${['pendiente','procesando'].includes(g.estado)
            ? '<span class="kc-tag n">Esperando</span>' : ''}
        </div>`).join('') + '</div>'
        : '<p class="kc-vacio">Todavía no armaste ninguna.</p>'}
    </div>`;

    const v = el.querySelector('#kcv'); if (v) v.onclick = () => { parar(); opt.volver(); };
    const n = el.querySelector('#kcnueva'); if (n) n.onclick = vNueva;
    el.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
      abierto = b.dataset.rev; await traer(abierto); vRevisar();
    });
    el.querySelectorAll('[data-rei]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await rpc('cap_generar_reintentar', { p_id: b.dataset.rei });
        await traer(null); vLista(); }
      catch (e) { b.disabled = false; alert(e.message); }
    });

    // mientras haya algo en la cola, refrescar solo
    parar();
    if (L.some(g => ['pendiente','procesando'].includes(g.estado))) {
      reloj = setInterval(async () => {
        try { await traer(null); if (!abierto) vLista(); } catch (e) {}
      }, 15000);
    }
  }

  /* ----------------------------------------------------------- nueva */
  function vNueva() {
    parar();
    archivos = [];
    el.innerHTML = `<div class="kc-wide" style="max-width:720px">
      <div style="padding:22px 0 12px"><button class="kc-mini" id="kcatras">← Volver</button></div>
      <h1 style="font-size:26px;font-weight:700;margin-bottom:16px">Nueva capacitación con IA</h1>

      <div class="kc-p1"><div style="padding:18px 20px">
        <label for="k1" class="kc-cd" style="display:block;margin-bottom:5px">De qué capacitación se trata</label>
        <select id="k1" style="width:100%;font:inherit;padding:9px 11px;border:1px solid var(--kc-rule2);
          border-radius:7px;background:var(--kc-card2);color:var(--kc-ink);margin-bottom:12px">
          <option value="">— es una nueva —</option>
          ${(D.catalogo || []).map(c =>
            `<option value="${c.id}">${esc(c.codigo)} · ${esc(c.titulo)}</option>`).join('')}
        </select>
        <div id="knueva">
          <label class="kc-cd">Código</label>
          <input type="text" id="k2" placeholder="Ej: T21" style="width:100%;font:inherit;
            padding:9px 11px;border:1px solid var(--kc-rule2);border-radius:7px;
            background:var(--kc-card2);color:var(--kc-ink);margin-bottom:12px">
        </div>
        <label class="kc-cd">Título</label>
        <input type="text" id="k3" style="width:100%;font:inherit;padding:9px 11px;
          border:1px solid var(--kc-rule2);border-radius:7px;background:var(--kc-card2);
          color:var(--kc-ink);margin-bottom:12px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
          <div><label class="kc-cd">Eje</label>
            <select id="k4" style="width:100%;font:inherit;padding:9px 11px;border:1px solid var(--kc-rule2);
              border-radius:7px;background:var(--kc-card2);color:var(--kc-ink)">
              <option value="hse">Seguridad y salud</option><option value="tecnica">Plan de carrera</option>
              <option value="arl">ARL</option><option value="induccion">Inducción</option></select></div>
          <div><label class="kc-cd">Vigencia (días)</label>
            <input type="number" id="k5" min="0" placeholder="365" style="width:100%;font:inherit;
              padding:9px 11px;border:1px solid var(--kc-rule2);border-radius:7px;
              background:var(--kc-card2);color:var(--kc-ink)"></div>
          <div><label class="kc-cd">Horas</label>
            <input type="number" id="k6" min="0" step="0.5" style="width:100%;font:inherit;
              padding:9px 11px;border:1px solid var(--kc-rule2);border-radius:7px;
              background:var(--kc-card2);color:var(--kc-ink)"></div>
          <div><label class="kc-cd">Preguntas</label>
            <input type="number" id="k7" min="4" max="30" value="8" style="width:100%;font:inherit;
              padding:9px 11px;border:1px solid var(--kc-rule2);border-radius:7px;
              background:var(--kc-card2);color:var(--kc-ink)"></div>
        </div>
      </div></div>

      <div class="kc-secc">El material</div>
      <div class="kc-drop" id="kcdrop">
        <b>Subí los documentos</b>
        Procedimientos, instructivos, matrices, fotos del equipo o del sitio.
        PDF, Word, imágenes.<br><br>
        <input type="file" id="kcfiles" multiple accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp">
      </div>
      <div class="kc-arch" id="kclista"></div>

      <label class="kc-cd">Qué querés que tenga en cuenta</label>
      <textarea id="k8" rows="4" placeholder="Ej: que quede claro cuándo se descarta un EPP y quién lo inspecciona antes de cada turno. Público: auxiliares técnicos, sin formación previa."
        style="width:100%;font:inherit;padding:10px 12px;border:1px solid var(--kc-rule2);
        border-radius:7px;background:var(--kc-card2);color:var(--kc-ink);margin-bottom:6px"></textarea>
      <p class="kc-nota" style="text-align:left;margin:0 0 16px">Cuanto más concreto, mejor sale.
        Si no subís nada, la IA escribe sólo con esto — y para una capacitación obligatoria eso
        no alcanza.</p>

      <div class="kc-row" style="max-width:420px">
        <button class="kc-b2" id="kccan">Cancelar</button>
        <button class="kc-btn" id="kcgen">Pedir el borrador</button>
      </div>
      <p id="kcest" style="font-size:13px;color:var(--kc-ink3);margin-top:12px"></p>
    </div>`;

    const sel1 = el.querySelector('#k1'), cajaN = el.querySelector('#knueva');
    sel1.onchange = () => {
      const c = (D.catalogo || []).find(x => x.id === sel1.value);
      cajaN.style.display = sel1.value ? 'none' : 'block';
      if (c) el.querySelector('#k3').value = c.titulo;
    };
    el.querySelector('#kcatras').onclick = async () => { await traer(null); vLista(); };
    el.querySelector('#kccan').onclick = async () => { await traer(null); vLista(); };

    const inp = el.querySelector('#kcfiles');
    inp.onchange = () => {
      [...inp.files].forEach(f => archivos.push(f));
      inp.value = ''; pintarArch();
    };
    function pintarArch() {
      el.querySelector('#kclista').innerHTML = archivos.map((f, i) =>
        `<div>${esc(f.name)}<span>${Math.round(f.size/1024)} KB</span>
          <button class="kc-mini" data-q="${i}">Quitar</button></div>`).join('');
      el.querySelectorAll('#kclista [data-q]').forEach(b => b.onclick = () => {
        archivos.splice(+b.dataset.q, 1); pintarArch();
      });
    }

    el.querySelector('#kcgen').onclick = async () => {
      const b = el.querySelector('#kcgen'), est = el.querySelector('#kcest');
      b.disabled = true;
      try {
        const subidas = [];
        for (let i = 0; i < archivos.length; i++) {
          const f = archivos[i];
          est.textContent = `Subiendo ${i+1} de ${archivos.length}: ${f.name}…`;
          subidas.push(await subir(f));
        }
        est.textContent = 'Encolando el pedido…';
        await rpc('cap_generar_pedir', {
          p_titulo: el.querySelector('#k3').value,
          p_instrucciones: el.querySelector('#k8').value || null,
          p_fuentes: subidas,
          p_catalogo: sel1.value || null,
          p_codigo: sel1.value ? null : el.querySelector('#k2').value,
          p_eje: el.querySelector('#k4').value,
          p_vigencia_dias: el.querySelector('#k5').value === '' ? null : +el.querySelector('#k5').value,
          p_horas: el.querySelector('#k6').value === '' ? null : +el.querySelector('#k6').value,
          p_n_preguntas: +el.querySelector('#k7').value || 8 });
        toast('Pedido encolado. Cuando el borrador esté listo aparece acá para revisar.');
        await traer(null); vLista();
      } catch (e) {
        b.disabled = false; est.textContent = '';
        alert(e.message);
      }
    };

    async function subir(file) {
      const emp = (D.lista || [])[0] ? null : null;   // la ruta no depende del listado
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
        .replace(/[^a-z0-9]/g,'').slice(0,5) || 'bin';
      const ruta = (D.empresa_id || 'empresa') + '/capacitador/fuentes/' +
        iso().replace(/-/g,'') + '-' + Math.random().toString(16).slice(2,8) + '.' + ext;
      const st = sb && sb.storage;
      if (!st) throw new Error('No se puede subir desde acá.');
      const { error: e } = await st.from('documentos')
        .upload(ruta, file, { upsert: false, contentType: file.type || undefined });
      if (e) throw new Error('No se pudo subir «' + file.name + '»: ' + e.message);
      return { nombre: file.name, storage_path: ruta, tipo_mime: file.type, bytes: file.size };
    }
  }

  /* -------------------------------------------------------- revisión */
  function vRevisar() {
    parar();
    const g = D.uno || {};
    R = R || { bloques: [], preguntas: [] };
    R.bloques = R.bloques || []; R.preguntas = R.preguntas || [];

    el.innerHTML = `<div class="kc-wide" style="max-width:820px">
      <div style="padding:22px 0 12px"><button class="kc-mini" id="kcatras">← Volver</button></div>
      <div style="border-bottom:2px solid var(--kc-ink);padding-bottom:14px;margin-bottom:8px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:8px">BORRADOR PARA REVISAR</div>
        <h1 style="font-size:26px;font-weight:700">${esc(g.codigo ? g.codigo + ' · ' : '')}${
          esc(g.titulo || '')}</h1>
      </div>
      ${g.resultado && g.resultado.resumen
        ? `<p style="color:var(--kc-ink2);margin:14px 0">${esc(g.resultado.resumen)}</p>` : ''}
      ${(g.resultado && (g.resultado.advertencias || []).length)
        ? `<div class="kc-cent mal"><div class="b">!</div><div>
            <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">La IA dejó avisos</div>
            <div style="font-size:13px;color:var(--kc-ink2)">${
              g.resultado.advertencias.map(esc).join(' · ')}</div></div></div>` : ''}
      <p class="kc-nota" style="text-align:left;margin:0 0 6px">Leelo completo antes de publicar.
        Lo que quede acá es lo que va a leer la gente y lo que se le va a evaluar.</p>

      <div class="kc-secc">Contenido<button class="kc-mini" id="kcaddb"
        style="margin-left:auto;order:3">+ Bloque</button></div>
      <div id="kcbl"></div>

      <div class="kc-secc">Preguntas<button class="kc-mini" id="kcaddp"
        style="margin-left:auto;order:3">+ Pregunta</button></div>
      <div id="kcpr"></div>

      <div class="kc-row" style="max-width:520px;margin-top:22px">
        <button class="kc-b2" id="kcguardar">Guardar sin publicar</button>
        <button class="kc-btn" id="kcpub">Revisado — publicar</button>
      </div>
      <p class="kc-nota" style="text-align:left">Al publicar queda registrado que lo aprobaste vos.</p>
    </div>`;

    el.querySelector('#kcatras').onclick = async () => {
      abierto = null; await traer(null); vLista();
    };
    pintarB(); pintarP();

    el.querySelector('#kcaddb').onclick = () => {
      R.bloques.push({ tipo:'texto', texto:'' }); pintarB();
    };
    el.querySelector('#kcaddp').onclick = () => {
      R.preguntas.push({ enunciado:'', opciones:[{texto:'',correcta:true},{texto:'',correcta:false}] });
      pintarP();
    };
    el.querySelector('#kcguardar').onclick = () => guardar(false);
    el.querySelector('#kcpub').onclick = () => {
      const mal = validar();
      if (mal) return alert(mal);
      if (!confirm('Publicar «' + (g.titulo || '') + '».\n\nDesde ese momento la gente que la ' +
                   'tenga pendiente la puede hacer, y lo que responda cuenta.\n\n¿Lo leíste todo?'))
        return;
      guardar(true);
    };

    function validar() {
      if (!R.bloques.length) return 'No puede quedar sin contenido.';
      if (R.bloques.some(b => !String(b.texto || '').trim() && b.tipo !== 'separador'))
        return 'Hay un bloque vacío.';
      if (!R.preguntas.length) return 'No puede quedar sin preguntas.';
      for (let i = 0; i < R.preguntas.length; i++) {
        const q = R.preguntas[i];
        if (!String(q.enunciado || '').trim()) return 'La pregunta ' + (i+1) + ' está vacía.';
        const ops = q.opciones || [];
        if (ops.length < 2) return 'La pregunta ' + (i+1) + ' necesita al menos dos opciones.';
        if (ops.some(o => !String(o.texto || '').trim()))
          return 'La pregunta ' + (i+1) + ' tiene una opción vacía.';
        if (ops.filter(o => o.correcta).length !== 1)
          return 'La pregunta ' + (i+1) + ' tiene que tener exactamente una respuesta correcta.';
      }
      return null;
    }

    async function guardar(publicar) {
      const b1 = el.querySelector('#kcguardar'), b2 = el.querySelector('#kcpub');
      b1.disabled = b2.disabled = true;
      try {
        await rpc('cap_borrador_guardar', { p_id: g.id, p_resultado: R });
        if (publicar) {
          const r = await rpc('cap_publicar', { p_id: g.id });
          toast((r && r.aviso) || 'Publicada.');
        } else toast('Borrador guardado.');
        abierto = null; await traer(null); vLista();
      } catch (e) { b1.disabled = b2.disabled = false; alert(e.message); }
    }

    function pintarB() {
      el.querySelector('#kcbl').innerHTML = R.bloques.map((b, i) => `
        <div class="kc-bl" data-i="${i}">
          <div class="top">
            <select class="bt">${TIPOS.map(([v,t]) =>
              `<option value="${v}"${b.tipo===v?' selected':''}>${t}</option>`).join('')}</select>
            <span class="kc-cd">${i+1} de ${R.bloques.length}</span>
            <div class="mv">
              <button class="kc-mini bu">↑</button><button class="kc-mini bd">↓</button>
              <button class="kc-mini bx">✕</button></div>
          </div>
          ${b.tipo === 'separador' ? ''
            : `<textarea class="bx1" rows="${b.tipo==='titulo'?1:3}"
                 placeholder="${b.tipo==='lista'
                   ? 'CASCO — protege de golpes|GAFAS — protege de proyección'
                   : 'Texto del bloque'}">${esc(b.texto || '')}</textarea>
               <input type="text" class="bx2" placeholder="Nota al pie (opcional)"
                 value="${esc(b.nota || '')}">`}
        </div>`).join('');
      el.querySelectorAll('#kcbl .kc-bl').forEach(d => {
        const i = +d.dataset.i;
        d.querySelector('.bt').onchange = e => { R.bloques[i].tipo = e.target.value; pintarB(); };
        const t1 = d.querySelector('.bx1'); if (t1) t1.oninput = e => R.bloques[i].texto = e.target.value;
        const t2 = d.querySelector('.bx2'); if (t2) t2.oninput = e => R.bloques[i].nota = e.target.value;
        d.querySelector('.bu').onclick = () => { if (i > 0) {
          [R.bloques[i-1], R.bloques[i]] = [R.bloques[i], R.bloques[i-1]]; pintarB(); } };
        d.querySelector('.bd').onclick = () => { if (i < R.bloques.length-1) {
          [R.bloques[i+1], R.bloques[i]] = [R.bloques[i], R.bloques[i+1]]; pintarB(); } };
        d.querySelector('.bx').onclick = () => { R.bloques.splice(i,1); pintarB(); };
      });
    }

    function pintarP() {
      el.querySelector('#kcpr').innerHTML = R.preguntas.map((q, i) => `
        <div class="kc-bl" data-i="${i}">
          <div class="top"><span class="kc-cd">PREGUNTA ${i+1}</span>
            <div class="mv"><button class="kc-mini qx">✕</button></div></div>
          <textarea class="qe" rows="2" placeholder="Enunciado">${esc(q.enunciado || '')}</textarea>
          <div class="qops">${(q.opciones || []).map((o, j) => `
            <div class="kc-op2" data-j="${j}">
              <input type="radio" name="q${i}" class="oc"${o.correcta?' checked':''}
                aria-label="Correcta">
              <input type="text" class="ot" value="${esc(o.texto || '')}" placeholder="Opción">
              <button class="kc-mini ox">✕</button>
            </div>`).join('')}</div>
          <div style="display:flex;gap:7px;margin:6px 0 8px">
            <button class="kc-mini qadd">+ Opción</button>
            <span class="kc-cd" style="align-self:center">La marcada es la correcta</span></div>
          <input type="text" class="qx1" placeholder="Explicación que se muestra al corregir"
            value="${esc(q.explicacion || '')}">
        </div>`).join('');
      el.querySelectorAll('#kcpr .kc-bl').forEach(d => {
        const i = +d.dataset.i;
        d.querySelector('.qe').oninput = e => R.preguntas[i].enunciado = e.target.value;
        d.querySelector('.qx1').oninput = e => R.preguntas[i].explicacion = e.target.value;
        d.querySelector('.qx').onclick = () => { R.preguntas.splice(i,1); pintarP(); };
        d.querySelector('.qadd').onclick = () => {
          (R.preguntas[i].opciones = R.preguntas[i].opciones || []).push({texto:'',correcta:false});
          pintarP(); };
        d.querySelectorAll('.kc-op2').forEach(o => {
          const j = +o.dataset.j;
          o.querySelector('.oc').onchange = () => {
            R.preguntas[i].opciones.forEach((x, k) => x.correcta = (k === j)); };
          o.querySelector('.ot').oninput = e => R.preguntas[i].opciones[j].texto = e.target.value;
          o.querySelector('.ox').onclick = () => {
            R.preguntas[i].opciones.splice(j,1); pintarP(); };
        });
      });
    }
  }

  if (abierto) vRevisar(); else vLista();
}

/* =================================================================
   CERTIFICADO — se imprime a PDF desde el navegador
   ================================================================= */
async function certificado(sel, asistenciaId, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Emitiendo el certificado…');
  let D;
  try { D = await rpc('cap_certificado_datos', { p_asistencia: asistenciaId }); }
  catch (e) { return error(el, e); }
  if (!D) return error(el, new Error('No se pudo emitir el certificado.'));

  const E = D.empresa || {}, P = D.persona || {}, C = D.capacitacion || {},
        A = D.asistencia || {}, V = D.evaluacion, CE = D.certificado || {},
        CT = D.control || {};
  const col = E.color || '#0B5D45';
  const nota = V && V.nota != null ? Number(V.nota) : null;
  const legal = (C.base_legal || []).filter(Boolean);

  el.className = 'kc';
  el.innerHTML = `
    <div class="kc-cacc">
      ${opt && opt.volver ? '<button class="kc-mini" id="kcv">← Volver</button>' : ''}
      <button class="kc-mini p" id="kcimp">Descargar o imprimir</button>
      <span class="kc-cd">Se abre el diálogo de impresión: elegí «Guardar como PDF».</span>
    </div>
    <div class="kc-cert" style="--kc-cert-color:${esc(col)}">
      <div class="kc-cbar"></div>
      <div class="kc-cin">

        <div class="kc-chead">
          ${E.logo ? `<img src="${esc(E.logo)}" alt="">` : ''}
          <div><div class="e">${esc(E.razon_social || E.nombre || '')}</div>
            ${E.nit ? `<div class="n">NIT ${esc(E.nit)}</div>` : ''}</div>
          <div class="d">${esc(CT.codigo || 'A.FR014')} · versión ${esc(CT.version || '001')}<br>
            ${esc(CE.consecutivo || '')}</div>
        </div>

        <p class="kc-ctit">Certificado de formación</p>
        <p class="kc-cque">La empresa hace constar que</p>
        <div class="kc-cnom">${esc(P.nombre || '')}</div>
        <div class="kc-cced">${P.cedula ? 'C.C. ' + esc(P.cedula) : ''}${
          P.cargo ? ' · ' + esc(P.cargo) : ''}</div>

        <div class="kc-ccur">
          <div class="k">${nota != null && V.aprobado ? 'Asistió y aprobó' : 'Asistió a'}</div>
          <div class="t">${esc(C.codigo || '')} · ${esc(C.titulo || '')}</div>
          ${C.objetivo ? `<p class="o">${esc(C.objetivo)}</p>` : ''}
        </div>

        <div class="kc-cdat">
          <div><div class="k">Fecha</div><div class="v">${A.fecha ? fecha(A.fecha) : '—'}</div></div>
          <div><div class="k">Intensidad</div><div class="v">${
            C.horas != null ? Number(C.horas) + ' h' : '—'}</div></div>
          <div><div class="k">Vigencia</div><div class="v">${
            A.vence_el ? 'hasta ' + fecha(A.vence_el) : 'No vence'}</div></div>
          <div><div class="k">${nota != null ? 'Calificación' : 'Modalidad'}</div>
            <div class="v">${nota != null ? nota + '%'
              : esc(C.modalidad || '—')}</div></div>
        </div>

        <div class="kc-cpie">
          <div class="kc-cfirma">
            <div class="l">${esc(D.responsable || E.razon_social || E.nombre || '')}</div>
            <div class="r">${D.responsable ? 'Responsable del SG-SST'
              : 'Emitido por ' + esc(CE.emitido_por || 'KALU')} ·
              ${CE.emitido_el ? new Date(CE.emitido_el).toLocaleDateString('es-CO') : ''}</div>
          </div>
          <div class="kc-cqr">${qrSvg(urlVerificar(P.token))}
            <span>Verificar</span></div>
        </div>

        <p class="kc-cleg">
          ${legal.length ? 'Marco legal: ' + esc(legal.join(' · ')) + '. ' : ''}Documento
          emitido electrónicamente por KALU; no requiere firma autógrafa. El código de arriba
          consulta el estado de formación vigente de la persona al momento de escanearlo.
          ${A.origen === 'historico'
            ? 'Formación acreditada con soporte documental anterior a la puesta en marcha del sistema.'
            : ''}
        </p>
      </div>
    </div>`;

  const v = el.querySelector('#kcv');
  if (v) v.onclick = () => opt.volver();
  el.querySelector('#kcimp').onclick = () => global.print();
}

/* =================================================================
   VERIFICAR CREDENCIAL — para el supervisor que escanea
   ================================================================= */
async function verificar(sel, token) {
  estilos(); const el = nodo(sel); if (!el) return;

  if (!token) {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wrap"><div class="kc-hero">
      <div class="kc-cargo">KALU · Verificación</div>
      <div class="kc-nom">Escaneá una credencial</div>
      <p style="color:var(--kc-ink2);font-size:14.5px;margin:14px 0 0">
        Esta página muestra si una persona está habilitada para operar. Se abre sola
        al escanear el código de su credencial con la cámara del celular.</p>
      <p class="kc-nota" style="text-align:left;margin:16px 0 0">No hace falta tener
        usuario de KALU.</p>
    </div></div>`;
    return;
  }

  cargando(el, 'Verificando…');
  let r;
  try { r = await rpc('cap_verificar', { p_token: token }); } catch (e) { return error(el, e); }

  if (!r || !r.valido) {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wrap"><div class="kc-hero">
      <div class="kc-band cr"><div class="m">!</div>
        <div><div class="t1">Credencial no válida</div>
        <div class="t2">Ese código no corresponde a ninguna persona.</div></div></div>
      <p class="kc-nota" style="text-align:left;margin-top:14px">Puede ser un código
        viejo, mal escaneado, o de otra plataforma. Pedí que abran la credencial de
        nuevo desde KALU.</p></div></div>`;
    return;
  }

  // La baja de la persona manda sobre cualquier otra cosa.
  const baja = !r.vigente;
  const cls  = baja ? 'cr' : (r.apto_operacion ? 'ok' : 'cr');
  const t1   = baja ? 'No vigente'
                    : (r.apto_operacion ? 'Apto para operar' : 'No apto para operar');
  const t2   = baja ? 'Esta persona ya no figura activa en la empresa.'
                    : (r.apto_operacion
                        ? 'Tiene al día toda la formación que su cargo exige.'
                        : [r.vencidas ? r.vencidas + ' vencida(s)' : null,
                           r.pendientes ? r.pendientes + ' sin registro' : null]
                          .filter(Boolean).join(' · ') || 'Le falta formación obligatoria.');

  const ct = (n, t, c) => `<div class="kc-ct ${c}"><b>${n}</b><span>${t}</span></div>`;

  el.className = 'kc';
  el.innerHTML = `<div class="kc-wrap">
    <div class="kc-hero">
      <div class="kc-cargo">${esc(r.empresa || '')}</div>
      <div class="kc-nom">${esc(r.nombre)}</div>
      <div style="font-size:14px;color:var(--kc-ink2);margin:-9px 0 15px">${
        esc(r.cargo || '')}${r.cedula ? ' · <span class="mono">' + esc(r.cedula) + '</span>' : ''}</div>
      <div class="kc-band ${cls}"><div class="m">${cls === 'ok' ? '✓' : '!'}</div>
        <div><div class="t1">${t1}</div><div class="t2">${esc(t2)}</div></div></div>
      <div class="kc-cts">
        ${ct(r.vencidas ?? 0,   'Vencidas',   'v')}
        ${ct(r.por_vencer ?? 0, 'Por vencer', 'x')}
        ${ct(r.pendientes ?? 0, 'Pendientes', '')}
        ${ct(r.al_dia ?? 0,     'Al día',     'a')}
      </div>
    </div>
    <p class="kc-nota" style="text-align:left">Consultado el ${
      new Date(r.verificado).toLocaleString('es-CO')}. Este estado se calcula en el
      momento: no es una captura ni un archivo guardado.</p>
    <p class="kc-nota" style="text-align:left;margin-top:-4px">«No apto» no significa que
      la persona no pueda estar en el sitio: significa que le falta formación que su
      cargo exige. La decisión de asignarle o no la tarea la toma quien supervisa.</p>
  </div>`;
}

/* ------------------------------------------------------------------ init

   KALU comparte la sesión entre todos los módulos: ingreso.html guarda
   el token en localStorage (el "cajón compartido") bajo la clave
   'sb-<ref>-auth-token', con el objeto crudo de auth de Supabase
   { access_token, refresh_token, expires_at, user, ... }.
   Antes capacitador leía su propio 'kalu_ses' en sessionStorage, por eso
   pedía re-loguear. Ahora lee el cajón compartido: si estás logueado en
   KALU, entrás acá sin volver a loguearte.

   Además respeta el candado del resto de la plataforma:
     · único por equipo  → poll de perfiles.sesion_id contra kalu_sid
     · auto-cierre        → por inactividad (15 min, 60 para gestores)
     · cierre en cadena   → si cerrás sesión en otra pestaña (kalu_logout)
   ------------------------------------------------------------------- */
const SB_REF     = 'nignqeipzlemwfrwmpip';
const SESS_KEY   = 'sb-' + SB_REF + '-auth-token';
const LOGOUT_KEY = 'kalu_logout';
let   _uid = null, _mySid = null, _idleMin = 15, _idleT = null, _pollT = null;

/* =================================================================
   ARRANQUE — poner una empresa en marcha

   La pantalla que faltaba. Hasta hoy una empresa entraba al módulo
   porque alguien leía sus documentos y escribía SQL; acá se carga
   sola, en el orden correcto, y en cada paso dice qué le falta.

   El paso difícil es el primero. El padrón trae el cargo como texto
   libre —«Ingeniero de Aseguramiento Calidad» y «Ingeniero de
   Aseguramiento de Calidad» son dos filas distintas para la base— así
   que la pantalla propone las agrupaciones y una persona las confirma.
   Nunca al revés: un cargo mal fusionado se lleva puesto el plan de
   formación de quien lo ocupa.
   ================================================================= */
async function arranque(sel) {
  estilos(); const el = nodo(sel); if (!el) return;
  cargando(el, 'Mirando cómo está la empresa…');

  let D, A = null, G = null, C = null, prop = null;
  try { D = await rpc('cap_arranque_datos'); } catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  let tab = 1;

  async function traerA() {
    if (!A) { A = await rpc('cap_arranque_cargos'); prop = null; }
    if (!prop) prop = (A.grupos || []).map(g => {
      // Un cargo puede estar resuelto de dos formas: porque existe con
      // ese mismo nombre, o porque el texto del padrón ya está mapeado a
      // un cargo que se llama distinto («Supervisor De División» ya
      // apunta a «Supervisor de División (Dimensional)»). Si no se mira
      // lo segundo, la pantalla ofrece crear un cargo que ya está, y
      // queda uno nuevo vacío al lado del que tiene la gente.
      const map = (g.variantes || []).map(v => v.ya_mapeado).filter(Boolean);
      const resuelto = g.ya_existe || (map.length ? map[0] : null);
      return {
        clave: g.clave,
        nombre: g.sugerido,
        area: '',
        variantes: (g.variantes || []).map(v => v.texto),
        gente: g.gente,
        juntar: !!g.juntar,
        parecidos: g.parecidos || [],
        yaExiste: resuelto,
        crear: !resuelto
      };
    });
    return A;
  }
  async function traerG() { if (!G) G = await rpc('cap_grupos_datos'); return G; }
  async function traerC() { if (!C) C = await rpc('cap_admin_datos'); return C; }

  async function recargar(r) {
    A = null; G = null; C = null; prop = null;
    try { D = await rpc('cap_arranque_datos'); } catch (e) {}
    await pintar();
    if (r && r.aviso) toast(r.aviso);
  }

  function toast(txt) {
    const t = document.createElement('div');
    t.className = 'kc-toast'; t.textContent = txt;
    (el.querySelector('.kc-wide') || el).appendChild(t);
    setTimeout(() => t.remove(), 8000);
  }

  function abrir(html, onOk, okTxt) {
    const d = document.createElement('dialog');
    d.innerHTML = `<div class="kc-dlg">${html}<div class="kc-row">
      <button class="kc-b2" id="kcx">Cancelar</button>
      <button class="kc-btn" id="kck">${okTxt || 'Guardar'}</button></div></div>`;
    (el.querySelector('.kc-wide') || el).appendChild(d); d.showModal();
    d.querySelector('#kcx').onclick = () => { d.close(); d.remove(); };
    d.querySelector('#kck').onclick = async () => {
      const b = d.querySelector('#kck'); b.disabled = true; b.textContent = 'Guardando…';
      try { const r = await onOk(d); d.close(); d.remove(); await recargar(r); }
      catch (e) { b.disabled = false; b.textContent = okTxt || 'Guardar'; alert(e.message); }
    };
    return d;
  }

  /* ------------------------------------------------------------- armazón */
  async function pintar() {
    const e = D.empresa || {};
    const faltan = (D.pasos || []).filter(p => !p.hecho && !p.opcional).length;

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:24px 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:16px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · PUESTA EN MARCHA</div>
        <h1 style="font-size:30px;font-weight:700">${esc(e.nombre || 'Esta empresa')}</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px">
          ${e.personas || 0} personas en el padrón · ${e.usuarios || 0} con usuario ·
          módulo <b>${e.modulo_encendido ? 'encendido' : 'apagado'}</b></div></div>

      <div class="kc-cent ${faltan ? 'mal' : 'ok'}">
        <div class="b">${faltan || '✓'}</div><div>
        <div class="kc-tt" style="font-size:15px;color:${faltan ? 'var(--kc-cr)' : 'var(--kc-ok)'}">
          ${faltan ? faltan + ' paso(s) sin hacer' : 'La empresa está lista'}</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${faltan
          ? 'Mientras falte alguno, encender el módulo le muestra a la gente una pantalla incompleta.'
          : 'Todo lo necesario está cargado.'}</div></div></div>

      <div class="kc-tabs" style="margin:18px 0 20px">
        <button class="kc-tab" data-t="1" aria-selected="${tab === 1}">Qué falta</button>
        <button class="kc-tab" data-t="2" aria-selected="${tab === 2}">Organigrama</button>
        <button class="kc-tab" data-t="3" aria-selected="${tab === 3}">Comités y actividades</button>
        <button class="kc-tab" data-t="4" aria-selected="${tab === 4}">Encender</button>
      </div>
      <div id="kc-v"><div class="kc-carga">Cargando…</div></div></div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => {
      if (+b.dataset.t !== tab) { tab = +b.dataset.t; pintar(); }
    });

    const v = el.querySelector('#kc-v');
    if (tab === 1)      v.innerHTML = vFalta();
    else if (tab === 2) { await traerA(); await traerC(); v.innerHTML = vOrg(); }
    else if (tab === 3) { await traerG(); v.innerHTML = vGrupos(); }
    else                v.innerHTML = vEncender();
    enganchar(v);
  }

  /* -------------------------------------------------------- 1. qué falta */
  const IR = { cargos:2, comites:3, encender:4 };

  function vFalta() {
    return `<div class="kc-pasos">${(D.pasos || []).map((p, i) => `
      <div class="kc-paso ${p.hecho ? 'ok' : (p.opcional ? 'opt' : 'no')}">
        <div class="n">${p.hecho ? '✓' : i + 1}</div>
        <div class="c">
          <div class="kc-tt">${esc(p.titulo)}${p.opcional
            ? ' <span style="font-weight:400;color:var(--kc-ink3);font-size:12px">· opcional</span>' : ''}</div>
          <div class="d">${esc(p.detalle || '')}</div>
          ${p.ojo ? `<div class="ojo">${esc(p.ojo)}</div>` : ''}
        </div>
        ${IR[p.clave] ? `<button class="kc-mini p" data-ir="${IR[p.clave]}">Ir</button>` : ''}
      </div>`).join('')}</div>
      <p class="kc-nota" style="margin-top:14px">Los pasos que no tienen botón se hacen en
      <b>Administración</b>: el catálogo y las asignaciones en «Capacitaciones», y lo ya dictado
      en «Cronograma».</p>`;
  }

  /* ------------------------------------------------------ 2. organigrama */
  function vOrg() {
    const cargos = (C && C.cargos || []).filter(c => c.activo);
    const pend = (prop || []).filter(p => p.crear).length;

    // Los que ya existen no se vuelven a listar: ocupan pantalla y no se
    // pueden tocar. Se cuentan en una línea y listo.
    const nuevos = (prop || []).map((p, i) => ({ p, i })).filter(x => !x.p.yaExiste);
    const yaHay  = (prop || []).length - nuevos.length;

    const propuesta = !(prop || []).length ? '' : (!nuevos.length ? `
      <h2 style="font-size:20px;margin:4px 0 4px">Del padrón al organigrama</h2>
      <div class="kc-cent ok"><div class="b">✓</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-ok)">
          Los ${yaHay} cargos del padrón ya están resueltos</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Cada forma de escribir el cargo que hay
        en el padrón apunta a un cargo que existe. Si mañana alguien carga a una persona con una
        escritura nueva, va a aparecer acá para agruparla.</div></div></div>` : `
      <h2 style="font-size:20px;margin:4px 0 4px">Del padrón al organigrama</h2>
      <p class="kc-nota">Estas son las formas en que el cargo aparece escrito en el padrón, ya
      agrupadas. Revisá los nombres —van a ser los definitivos— y destildá lo que no sea un cargo
      operativo.${yaHay ? ` Otros ${yaHay} ya están resueltos y no se tocan.` : ''}
      ${A.sin_cargo ? ` <b>${A.sin_cargo} persona(s)</b> no tienen cargo escrito: eso se arregla
      en el padrón de KALU.` : ''}</p>
      <div class="kc-sc"><table><thead><tr>
        <th style="width:34px"></th><th>Cargo</th><th>Área</th><th class="n">Gente</th>
        <th>Escrito en el padrón como</th></tr></thead><tbody>
        ${nuevos.map(({ p, i }) => `<tr class="${p.crear ? '' : 'kc-off'}">
          <td><input type="checkbox" data-chk="${i}" ${p.crear ? 'checked' : ''}></td>
          <td><input class="kc-in nom" data-nom="${i}" value="${esc(p.nombre)}">
              ${p.parecidos.length ? `<div class="kc-mch b" title="No los juntó: decidilo vos">
                 se parece a ${esc(p.parecidos.join(' · '))}</div>` : ''}</td>
          <td><input class="kc-in area" data-area="${i}" value="${esc(p.area)}" placeholder="—"></td>
          <td class="n">${p.gente}</td>
          <td>${p.variantes.map(t => `<span class="kc-chip2${p.juntar ? ' j' : ''}">${esc(t)}</span>`).join('')}</td>
        </tr>`).join('')}
      </tbody></table></div>
      <div class="kc-row" style="margin:14px 0 26px">
        <button class="kc-btn" id="kc-crear" ${pend ? '' : 'disabled'}>
          ${pend ? 'Crear ' + pend + ' cargo(s)' : 'No hay ninguno tildado'}</button></div>`);

    const jerarquia = !cargos.length ? '' : `
      <h2 style="font-size:20px;margin:26px 0 4px">Quién le reporta a quién</h2>
      <p class="kc-nota">De esto sale «Mi equipo»: un supervisor ve la formación de la gente cuyos
      cargos cuelgan del suyo. Un cargo sin jefe no es un error —el gerente no reporta a nadie—
      pero si están todos sin jefe, nadie supervisa a nadie.</p>
      <div class="kc-sc"><table><thead><tr><th>Cargo</th><th class="n">Gente</th>
        <th>Reporta a</th></tr></thead><tbody>
        ${cargos.map(c => `<tr>
          <td class="k">${esc(c.nombre)}</td>
          <td class="n">${c.personas || 0}</td>
          <td><select class="kc-in" data-jefe="${esc(c.nombre)}">
            <option value="">— nadie —</option>
            ${cargos.filter(o => o.id !== c.id).map(o =>
              `<option ${o.id === c.reporta_a ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}
          </select></td></tr>`).join('')}
      </tbody></table></div>
      <div class="kc-row" style="margin:14px 0 10px">
        <button class="kc-btn" id="kc-jer">Guardar la línea de reporte</button></div>`;

    return propuesta + jerarquia ||
      '<p class="kc-nota">No hay cargos escritos en el padrón todavía.</p>';
  }

  /* --------------------------------------------- 3. comités y actividades */
  function vGrupos() {
    const lista = (arr, tipo, vacio) => !arr.length
      ? `<p class="kc-nota">${vacio}</p>`
      : `<div class="kc-sc"><table><thead><tr><th>Nombre</th><th class="n">Gente</th>
          <th class="n">Capacit.</th><th></th></tr></thead><tbody>
          ${arr.map(x => `<tr class="${x.activo ? '' : 'kc-off'}">
            <td class="k">${esc(x.nombre)}
              ${x.descripcion || x.proceso
                ? `<div class="kc-mch">${esc(x.descripcion || x.proceso)}</div>` : ''}
              ${x.gente && !x.capacitaciones
                ? '<div class="kc-mch b">tiene gente y ninguna capacitación exigida</div>' : ''}</td>
            <td class="n">${x.gente}</td><td class="n">${x.capacitaciones}</td>
            <td><button class="kc-mini" data-ed="${tipo}:${x.id}">Editar</button>
                <button class="kc-mini" data-on="${tipo}:${x.id}">${x.activo ? 'Apagar' : 'Prender'}</button></td>
          </tr>`).join('')}</tbody></table></div>`;

    return `
      <h2 style="font-size:20px;margin:4px 0 4px">Comités y roles</h2>
      <p class="kc-nota">COPASST, comité de convivencia, brigada de emergencia. Pertenecer a uno
      obliga a formación propia —el COPASST tiene sus 50 horas— que no depende del cargo.</p>
      ${lista(G.comites, 'comite', 'Todavía no hay ninguno. Sin el comité creado no se le puede exigir su formación a nadie.')}
      <div class="kc-row" style="margin:12px 0 26px">
        <button class="kc-mini p" id="kc-ncom">+ Nuevo comité</button></div>

      <h2 style="font-size:20px;margin:0 0 4px">Actividades de riesgo</h2>
      <p class="kc-nota">Alturas, espacios confinados, izaje, radiación. No las hace todo el mundo,
      y quien las hace necesita formación aparte de la de su cargo.</p>
      ${lista(G.actividades, 'actividad', 'Todavía no hay ninguna.')}
      <div class="kc-row" style="margin:12px 0 10px">
        <button class="kc-mini p" id="kc-nact">+ Nueva actividad</button></div>`;
  }

  /* ---------------------------------------------------------- 4. encender */
  function vEncender() {
    const e = D.empresa || {};
    const paso = (D.pasos || []).find(p => p.clave === 'encender') || {};
    const faltan = (D.pasos || []).filter(p => !p.hecho && !p.opcional && p.clave !== 'encender');

    if (e.modulo_encendido) return `
      <div class="kc-cent ok" style="margin-bottom:16px"><div class="b">✓</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-ok)">El módulo está encendido</div>
        <div style="font-size:13px;color:var(--kc-ink2)">La tarjeta del Capacitador aparece en el
        menú de KALU para toda la empresa.</div></div></div>
      <p class="kc-nota">Apagarlo saca la tarjeta del menú. <b>No borra nada</b>: los pasaportes,
      las asistencias y los certificados quedan como están, sólo dejan de mostrarse.</p>
      <div class="kc-row" style="margin-top:14px">
        <button class="kc-b2" id="kc-apagar">Apagar el módulo</button></div>`;

    return `
      <div class="kc-cent" style="background:var(--kc-was);margin-bottom:16px">
        <div class="b" style="background:var(--kc-wa)">!</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-wa)">
          Esto lo ve ${paso.numero || 0} persona(s) al instante</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Encender el módulo hace aparecer la tarjeta
        en el menú de todos los que ya entran a KALU. No hay forma de mostrárselo a unos pocos
        primero.</div></div></div>

      ${faltan.length ? `<div class="kc-cent mal" style="margin-bottom:16px">
        <div class="b">${faltan.length}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">Todavía falta cargar cosas</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${esc(faltan.map(f => f.titulo).join(' · '))}.
        Si encendés ahora, la gente entra a un pasaporte incompleto y el módulo pierde credibilidad
        el primer día.</div></div></div>` : ''}

      <p class="kc-nota">Para confirmar, escribí el nombre corto de la empresa:
        <b>${esc(e.slug || e.nombre || '')}</b></p>
      <div class="kc-row" style="margin-top:10px">
        <input class="kc-in" id="kc-conf" placeholder="${esc(e.slug || '')}" style="flex:1 1 200px">
        <button class="kc-btn" id="kc-encender" style="flex:0 0 auto;width:auto;padding:0 22px">
          Encender el módulo</button></div>`;
  }

  /* ------------------------------------------------------------- eventos */
  function enganchar(v) {
    if (D.puede_editar === false) v.querySelectorAll('button:not([data-ir])').forEach(b => b.remove());

    v.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { tab = +b.dataset.ir; pintar(); });

    /* --- organigrama: la propuesta se edita en memoria, no se guarda sola --- */
    v.querySelectorAll('[data-chk]').forEach(c => c.onchange = () => {
      prop[+c.dataset.chk].crear = c.checked;
      const b = v.querySelector('#kc-crear');
      const n = prop.filter(p => p.crear).length;
      if (b) { b.disabled = !n; b.textContent = n ? `Crear ${n} cargo(s)` : 'No hay nada nuevo para crear'; }
      c.closest('tr').classList.toggle('kc-off', !c.checked);
    });
    v.querySelectorAll('[data-nom]').forEach(i =>
      i.oninput = () => { prop[+i.dataset.nom].nombre = i.value; });
    v.querySelectorAll('[data-area]').forEach(i =>
      i.oninput = () => { prop[+i.dataset.area].area = i.value; });

    const bc = v.querySelector('#kc-crear');
    if (bc) bc.onclick = async () => {
      const van = prop.filter(p => p.crear && p.nombre.trim());
      if (!van.length) return;
      bc.disabled = true; bc.textContent = 'Creando…';
      try {
        const r = await rpc('cap_cargos_crear_lote', { p_grupos: prop.map(p => ({
          nombre: p.nombre.trim(), area: p.area.trim(),
          variantes: p.variantes, omitir: !p.crear })) });
        if ((r.choques || []).length) {
          alert('Se crearon los cargos, pero estas formas de escribirlo ya apuntaban a otro ' +
                'cargo y no las moví:\n\n' +
                r.choques.map(c => `· «${c.variante}» → ${c.ya_apunta_a}`).join('\n'));
        }
        await recargar(r);
      } catch (e) {
        bc.disabled = false; bc.textContent = 'Crear cargos'; alert(e.message);
      }
    };

    const bj = v.querySelector('#kc-jer');
    if (bj) bj.onclick = async () => {
      const pares = [...v.querySelectorAll('[data-jefe]')].map(s => ({
        cargo: s.dataset.jefe, reporta_a: s.value }));
      bj.disabled = true; bj.textContent = 'Guardando…';
      try {
        const r = await rpc('cap_cargos_jerarquia', { p_pares: pares });
        if ((r.problemas || []).length)
          alert('No pude aplicar todo:\n\n' +
                r.problemas.map(p => `· ${p.cargo}: ${p.motivo}`).join('\n'));
        await recargar({ aviso: `Línea de reporte guardada en ${r.aplicados} cargo(s). ` +
          `Sin jefe: ${(r.sin_jefe || []).length}.` });
      } catch (e) {
        bj.disabled = false; bj.textContent = 'Guardar la línea de reporte'; alert(e.message);
      }
    };

    /* --- comités y actividades --- */
    const nc = v.querySelector('#kc-ncom');
    if (nc) nc.onclick = () => abrir(
      `<h3>Comité nuevo</h3>
       <p>Pertenecer a un comité obliga a formación propia. Después de crearlo hay que asignarle
          sus capacitaciones en Administración, y sumarle gente desde la ficha de cada persona.</p>
       <label for="k1">Nombre</label>
       <input type="text" id="k1" placeholder="Ej: COPASST">
       <label for="k2">Para qué es</label>
       <input type="text" id="k2" placeholder="Ej: Comité paritario de seguridad y salud">`,
      d => rpc('cap_comite_crear', { p_nombre: d.querySelector('#k1').value,
                                     p_descripcion: d.querySelector('#k2').value }), 'Crear');

    const na = v.querySelector('#kc-nact');
    if (na) na.onclick = () => abrir(
      `<h3>Actividad de riesgo nueva</h3>
       <p>Una tarea que no hace todo el mundo y que exige formación aparte de la del cargo.</p>
       <label for="k1">Nombre</label>
       <input type="text" id="k1" placeholder="Ej: Trabajo en alturas">
       <label for="k2">Proceso</label>
       <input type="text" id="k2" placeholder="Ej: Operaciones en campo">`,
      d => rpc('cap_actividad_crear', { p_nombre: d.querySelector('#k1').value,
                                        p_proceso: d.querySelector('#k2').value }), 'Crear');

    v.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
      const [tipo, id] = b.dataset.ed.split(':');
      const x = (tipo === 'comite' ? G.comites : G.actividades).find(y => y.id === id);
      abrir(`<h3>Editar “${esc(x.nombre)}”</h3>
        <label for="k1">Nombre</label><input type="text" id="k1" value="${esc(x.nombre)}">
        <label for="k2">${tipo === 'comite' ? 'Para qué es' : 'Proceso'}</label>
        <input type="text" id="k2" value="${esc(x.descripcion || x.proceso || '')}">`,
        d => tipo === 'comite'
          ? rpc('cap_comite_guardar', { p_id: id, p_nombre: d.querySelector('#k1').value,
                                        p_descripcion: d.querySelector('#k2').value })
          : rpc('cap_actividad_guardar', { p_id: id, p_nombre: d.querySelector('#k1').value,
                                           p_proceso: d.querySelector('#k2').value }));
    });

    v.querySelectorAll('[data-on]').forEach(b => b.onclick = () => {
      const [tipo, id] = b.dataset.on.split(':');
      const x = (tipo === 'comite' ? G.comites : G.actividades).find(y => y.id === id);
      abrir(`<h3>${x.activo ? 'Apagar' : 'Prender'} “${esc(x.nombre)}”</h3>
        <p>${x.activo
          ? (x.gente ? `<b>${x.gente} persona(s)</b> figuran acá. Apagándolo dejan de tener que
                        cumplir la formación que sale de esto.`
                     : 'No hay nadie asignado.') + ' No se borra: se puede volver a prender.'
          : 'Vuelve a aparecer y su formación se vuelve a exigir.'}</p>`,
        () => tipo === 'comite' ? rpc('cap_comite_activar', { p_id: id })
                                : rpc('cap_actividad_activar', { p_id: id }),
        x.activo ? 'Apagar' : 'Prender');
    });

    /* --- el interruptor --- */
    const be = v.querySelector('#kc-encender');
    if (be) be.onclick = async () => {
      const t = (v.querySelector('#kc-conf') || {}).value || '';
      be.disabled = true; be.textContent = 'Encendiendo…';
      try { await recargar(await rpc('cap_modulo_encender', { p_confirmar: t })); }
      catch (e) { be.disabled = false; be.textContent = 'Encender el módulo'; alert(e.message); }
    };
    const ba = v.querySelector('#kc-apagar');
    if (ba) ba.onclick = () => {
      const e = D.empresa || {};
      abrir(`<h3>Apagar el módulo</h3>
       <p>La tarjeta del Capacitador desaparece del menú de <b>toda la empresa</b>. Los datos
          quedan intactos —pasaportes, asistencias y certificados— y se puede volver a encender
          cuando quieras, pero mientras esté apagado nadie va a poder entrar.</p>
       <label for="k1">Escribí <b>${esc(e.slug || e.nombre || '')}</b> para confirmar</label>
       <input type="text" id="k1" placeholder="${esc(e.slug || '')}">
       <label for="k2">Motivo</label>
       <input type="text" id="k2" placeholder="Ej: falta terminar de cargar la matriz">`,
      d => rpc('cap_modulo_apagar', { p_confirmar: d.querySelector('#k1').value,
                                      p_motivo: d.querySelector('#k2').value }), 'Apagar');
    };
  }

  await pintar();
}

/* ---- cajón compartido (localStorage) ---- */
function _leerCajon()    { try { return JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch (e) { return null; } }
function _guardarCajon(d){ try { localStorage.setItem(SESS_KEY, JSON.stringify(d)); } catch (e) {} }
function _limpiarCajon() { try { localStorage.removeItem(SESS_KEY); localStorage.removeItem('kalu_sid'); } catch (e) {} }

/* Lee la sesión que dejó ingreso.html en el cajón compartido. El objeto
   guardado es el crudo de Supabase: { access_token, refresh_token,
   expires_at (epoch en SEGUNDOS), user{ id, email } }. */
function sesion() {
  try {
    const s = _leerCajon();
    if (!s || !s.access_token) return null;
    const now = Math.floor(Date.now() / 1000);
    return {
      token:   s.access_token,
      refresh: s.refresh_token || null,
      email:   (s.user && s.user.email) || '',
      uid:     (s.user && s.user.id) || null,
      expira:  s.expires_at || 0,
      vencida: s.expires_at ? (s.expires_at <= now) : false
    };
  } catch (e) { return null; }
}

/* Renueva el token sin re-loguear (usa el refresh_token del cajón). */
async function _refrescar(rt) {
  if (!rt) return null;
  const K = global.KALU || {};
  try {
    const r = await fetch(K.SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K.SB_KEY },
      body: JSON.stringify({ refresh_token: rt })
    });
    const d = await r.json();
    if (!r.ok || !d || !d.access_token) return null;
    _guardarCajon(d);
    return d;
  } catch (e) { return null; }
}

/* ---- candado: único por equipo + inactividad + cierre en cadena ---- */
function _cerrarLocal() {
  try { if (_idleT) clearTimeout(_idleT); if (_pollT) clearInterval(_pollT); } catch (e) {}
  location.href = 'index.html';
}
function _forzarSalida(msg) {
  _limpiarCajon();
  try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch (e) {}
  if (msg) { try { alert(msg); } catch (e) {} }
  _cerrarLocal();
}
function _resetIdle() {
  if (_idleT) clearTimeout(_idleT);
  _idleT = setTimeout(function () {
    _forzarSalida('Cerramos tu sesión por inactividad.');
  }, (_idleMin || 15) * 60000);
}
async function _chequearSesion() {
  if (!_uid || !_mySid) return;
  try {
    const r = await sb.from('perfiles').select('sesion_id').eq('id', _uid).maybeSingle();
    const sid = (r && r.data && r.data.sesion_id) || null;
    if (sid && _mySid && sid !== _mySid)
      _forzarSalida('Se inició sesión en otro equipo. Por seguridad, cerramos esta sesión.');
  } catch (e) {}
}
async function _armarGuards() {
  // el rol define cuánta inactividad se tolera (gestores 60, resto 15)
  try {
    const r = await sb.from('perfiles').select('rol,es_super').eq('id', _uid).maybeSingle();
    const p = (r && r.data) || {};
    const gestor = p.es_super === true || ['hse', 'supervisor', 'admin'].indexOf(p.rol) >= 0;
    _idleMin = gestor ? 60 : 15;
  } catch (e) { _idleMin = 15; }
  try { _mySid = localStorage.getItem('kalu_sid') || null; } catch (e) { _mySid = null; }
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (ev) {
    window.addEventListener(ev, _resetIdle, { passive: true });
  });
  _resetIdle();
  if (_pollT) clearInterval(_pollT);
  _pollT = setInterval(_chequearSesion, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) _chequearSesion(); });
  window.addEventListener('storage', function (e) { if (e.key === LOGOUT_KEY) _cerrarLocal(); });
}

/* Arma el cliente de Supabase con el token vigente en el header.
   SINCRÓNICO y retrocompatible: los hosts que ya lo llamaban así
   (p.ej. app.html) siguen funcionando sin cambios. */
function init(cfg) {
  cfg = cfg || {};
  if (cfg.client) { sb = cfg.client; return sesion(); }

  if (!global.supabase || !global.supabase.createClient)
    throw new Error('Falta supabase-js. Cargalo antes de capacitador.js');

  const K   = global.KALU || {};
  const url = cfg.url || K.SB_URL;
  const key = cfg.key || K.SB_KEY;
  if (!url || !key)
    throw new Error('No encontré la configuración. Cargá config.js antes, ' +
                    'o pasale { url, key } a KaluCap.init');

  const s = sesion();
  sb = global.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: (s && !s.vencida) ? { Authorization: 'Bearer ' + s.token } : {} }
  });
  return s;
}

/* Entrada recomendada para páginas standalone (capacitador.html):
   renueva el token si hace falta ANTES de armar el cliente, y prende el
   candado de sesión. Pasá { guardias:false } si el host ya lo maneja. */
async function iniciar(cfg) {
  cfg = cfg || {};
  let s = sesion();
  if (s && s.refresh) {
    const now = Math.floor(Date.now() / 1000);
    if (s.vencida || (s.expira && s.expira - now < 120)) {
      if (await _refrescar(s.refresh)) s = sesion();
    }
  }
  init(cfg);                       // arma el cliente leyendo el cajón ya renovado
  if (s && !s.vencida && cfg.guardias !== false) { _uid = s.uid; _armarGuards(); }
  return s;
}

global.KaluCap = { init, iniciar, sesion, pasaporte, curso, supervision, admin, ficha,
                   certificado, generador, verificar, arranque,
                   get cliente() { return sb; } };

})(typeof window !== 'undefined' ? window : this);
