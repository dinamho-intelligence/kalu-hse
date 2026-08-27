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

/* La versión del archivo. Tiene que coincidir con el ?v=N del HTML.
   Se muestra en las pantallas de administración para poder comprobar,
   sin abrir nada, que lo que está arriba es lo que se subió — el error
   más común del módulo es subir el JS y olvidarse del ?v=, y entonces
   el navegador sigue usando la copia vieja sin avisar. */
const KC_VER = '40';

let sb = null;


/* Las palabras con peso de un nombre de cargo: sin tildes, sin
   mayúsculas y sin relleno. Es la misma regla que usa la base para
   decidir si dos cargos son el mismo, escrita también acá para poder
   avisar mientras la persona escribe, en vez de después de guardar. */
const KC_RELLENO = ['de','del','la','el','los','las','y','e','en','a','al',
                    'para','con','por','un','una','sr','sra'];
function kcPalabras(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(w => w && KC_RELLENO.indexOf(w) < 0);
}
/* Qué tan parecidos son dos nombres: 'igual' si son la misma palabra a
   palabra, 'contenido' si uno dice todo lo que dice el otro y algo más,
   'parecido' si comparten dos palabras o más. */
function kcParecido(a, b) {
  const A = kcPalabras(a), B = kcPalabras(b);
  if (!A.length || !B.length) return null;
  const sa = A.slice().sort().join(' '), sb = B.slice().sort().join(' ');
  if (sa === sb) return 'igual';
  const comunes = A.filter(w => B.indexOf(w) >= 0);
  if (comunes.length === A.length || comunes.length === B.length) return 'contenido';
  if (comunes.length >= 2) return 'parecido';
  return null;
}

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
 text-transform:uppercase;color:var(--kc-ink3);text-align:left;padding:10px 10px;
 background:var(--kc-card2);border-bottom:1px solid var(--kc-rule2);white-space:nowrap}
.kc td{padding:9px 10px;border-bottom:1px solid var(--kc-rule);vertical-align:middle}
/* La columna de botones del final. Sin esto el navegador reparte el ancho
   como quiere: le da de más a la fila de botones —que igual se desborda y
   se corta— y le quita al título, que termina partido en cuatro renglones.
   width:1% pide exactamente lo que ocupa el contenido y deja el resto para
   el texto; si aun así no entra, la tabla scrollea dentro de .kc-sc. */
.kc td.acc,.kc th.acc{width:1%;white-space:nowrap}
.kc td.acc>div{flex-wrap:nowrap}
/* Cinco botones a tamaño normal se comían 375px y empujaban la tabla
   113px afuera de la caja: el último quedaba cortado contra el borde.
   Acá van más apretados —siguen siendo del tamaño que se puede tocar en
   un teléfono— y la fila entra entera. Se probó fijar la columna al
   borde derecho: no sirve, tapa Gente y 2026. */
.kc td.acc .kc-mini{padding:5px 7px;gap:5px}
.kc td.acc>div{gap:5px!important}
.kc td.tit{min-width:200px}

/* ---- barras del tablero ----------------------------------------------
   Un solo color por serie: la longitud ya dice el tamaño, teñirlas
   además sería contar dos veces lo mismo. El valor va escrito al lado,
   nunca sólo en el globito: si el dato depende del mouse, no existe
   para quien usa teclado ni para quien imprime.
   La fila entera es el botón, y mide 30px: un objetivo de 8px que hay
   que acertar al centro no es un control, es una trampa.             */
.kc-bars{display:flex;flex-direction:column;gap:2px;margin-bottom:4px}
.kc-bar{display:flex;align-items:center;gap:10px;width:100%;min-height:30px;
 padding:3px 8px;border:1px solid transparent;border-radius:7px;background:none;
 font:inherit;color:inherit;text-align:left;cursor:pointer}
.kc-bar:hover{background:var(--kc-card2)}
.kc-bar:focus-visible{outline:2px solid var(--kc-ac);outline-offset:1px}
.kc-bar.on{background:var(--kc-card2);border-color:var(--kc-rule2)}
/* La cola no lleva barra: su suma supera al máximo de las visibles, así
   que la barra se saldría de la caja y el número quedaría montado encima.
   Es un total, no una categoría comparable. */
.kc-bar.otras{cursor:default;opacity:.6}
.kc-bar.otras .p{background:none}
.kc-bar .t{flex:0 0 34%;font-size:13px;color:var(--kc-ink);
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kc-bar.on .t{font-weight:600}
.kc-bar .p{flex:1 1 auto;height:9px;background:var(--kc-card2);border-radius:5px}
.kc-bar:hover .p,.kc-bar.on .p{background:var(--kc-rule)}
.kc-bar .p i{display:block;height:9px;border-radius:5px;background:var(--kc-ac)}
.kc-bar .v{flex:0 0 auto;min-width:34px;text-align:right;font-family:var(--kc-fm);
 font-size:12.5px;color:var(--kc-ink2);font-variant-numeric:tabular-nums}

/* ---- indicadores del programa (para proyectar en una reunión) -------
   Número grande sin tabular-nums: a tamaño display los dígitos de ancho
   fijo se ven sueltos. El estado va con signo Y palabra, nunca sólo con
   color: proyectado en un salón, el rojo y el verde de un daltónico son
   el mismo gris.                                                       */
.kc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));
 gap:12px;margin-bottom:14px}
.kc-kpix{background:var(--kc-card);border:1px solid var(--kc-rule);border-radius:11px;
 box-shadow:var(--kc-sh);padding:15px 17px 13px;border-left:4px solid var(--kc-rule2)}
.kc-kpix.ok{border-left-color:var(--kc-ok)}
.kc-kpix.no{border-left-color:var(--kc-cr)}
.kc-kpix.nd{border-left-color:var(--kc-ink3)}
.kc-kpix .n{font-family:var(--kc-fd);font-weight:600;font-size:14px;color:var(--kc-ink2)}
.kc-kpix .g{font-family:var(--kc-fd);font-weight:700;font-size:40px;line-height:1.05;
 margin:4px 0 2px;color:var(--kc-ink)}
.kc-kpix .g span{font-size:20px;font-weight:600;color:var(--kc-ink2);margin-left:1px}
.kc-kpix .g .nd{font-size:22px;color:var(--kc-ink3);font-weight:600}
.kc-kpix .me{position:relative;height:7px;background:var(--kc-card2);border-radius:4px;
 margin:9px 0 9px;overflow:visible}
.kc-kpix .me i{display:block;height:7px;border-radius:4px;background:var(--kc-ink3)}
.kc-kpix.ok .me i{background:var(--kc-ok)}
.kc-kpix.no .me i{background:var(--kc-cr)}
.kc-kpix .me u{position:absolute;top:-3px;width:2px;height:13px;background:var(--kc-ink);
 opacity:.55;border-radius:1px}
.kc-kpix .e{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--kc-ink2)}
.kc-kpix .f{font-family:var(--kc-fm);font-size:12px;color:var(--kc-ink2);margin-top:7px}
.kc-kpix .f2{font-size:11.5px;color:var(--kc-ink3);margin-top:2px}
.kc-kpix .sug{margin-top:9px;padding-top:9px;border-top:1px dashed var(--kc-rule2);
 font-size:12px;color:var(--kc-ink2)}
/* En una columna de 215px no entran tres controles en fila: se apilan.
   Un formulario que se sale de su tarjeta no se usa, se esquiva. */
.kc-kpix .ad{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.kc-kpix .ad .kc-in{font-size:13px;padding:6px 9px;width:100%;box-sizing:border-box}
.kc-kpix .ad button{width:100%}

.kc-bar3{height:7px;background:var(--kc-rule);border-radius:4px;margin-top:9px;
 max-width:420px}
.kc-bar3 i{display:block;height:7px;border-radius:4px;background:var(--kc-ac)}
.kc-cols{columns:260px 4;column-gap:22px;font-size:13px;color:var(--kc-ink2);
 max-height:300px;overflow-y:auto;border:1px solid var(--kc-rule);border-radius:8px;
 padding:11px 13px;background:var(--kc-card)}
.kc-cols div{break-inside:avoid;padding:1px 0}

/* ---- asignar desde el documento ------------------------------------- */
.kc-dest{display:flex;flex-direction:column;gap:9px}
.kc-dest .kc-p1.pend{border-left:3px solid var(--kc-cr)}
.kc-dest .cab{display:flex;align-items:center;gap:12px;width:100%;padding:12px 15px;
 background:none;border:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.kc-dest .cab:hover{background:var(--kc-card2)}
.kc-dest .cab .i{flex:0 0 auto;min-width:38px;height:34px;border-radius:8px;
 background:var(--kc-card2);display:grid;place-items:center;font-family:var(--kc-fd);
 font-weight:700;font-size:15px;color:var(--kc-ink2)}
.kc-dest .cab .c{flex:1 1 auto;min-width:0}
.kc-dest .cab .fl{color:var(--kc-ink3);font-size:11px}
.kc-dest .cue{padding:4px 15px 15px;border-top:1px solid var(--kc-rule)}
.kc-dest .lis{margin:0 0 12px}
.kc-dest .lis summary{cursor:pointer;font-family:var(--kc-fm);font-size:11px;
 letter-spacing:.05em;text-transform:uppercase;color:var(--kc-ink3);padding:5px 0}
.kc-dest .lis summary:hover{color:var(--kc-ac)}
.kc-dest .cgs2{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
 gap:1px 14px;max-height:230px;overflow-y:auto;padding:6px 2px 2px;
 border-top:1px solid var(--kc-rule)}
.kc-dest .cgs2 .li{font-size:13px;color:var(--kc-ink);padding:3px 0}
.kc-dest .cgs2 .li b{font-family:var(--kc-fm);font-size:11.5px;color:var(--kc-ink2);
 margin-right:5px}
.kc-dest .cgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));
 gap:2px;max-height:250px;overflow-y:auto;padding:2px}
.kc-op{display:flex;align-items:center;gap:7px;font-size:13.5px;padding:5px 7px;
 border-radius:6px;cursor:pointer}
.kc-op:hover{background:var(--kc-card2)}
.kc-lb{display:block;font-family:var(--kc-fm);font-size:10px;letter-spacing:.07em;
 text-transform:uppercase;color:var(--kc-ink3);margin-bottom:4px}

/* ---- la fila de filtros: una sola, arriba de todo lo que alcanza ---- */
.kc-filtros{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
 background:var(--kc-card);border:1px solid var(--kc-rule);border-radius:9px;
 padding:9px 12px}
.kc-chipf{font:inherit;font-size:13px;background:var(--kc-acs);color:var(--kc-ac);
 border:1px solid var(--kc-ac);border-radius:20px;padding:4px 11px;cursor:pointer}
.kc-chipf:hover{background:var(--kc-ac);color:var(--kc-ground)}
.kc-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
/* Un nombre largo no puede empujar el resto de la tabla afuera de la caja:
   que se parta en dos renglones antes que eso. */
.kc td.nom>div{max-width:300px;white-space:normal}
.kc td.est{white-space:nowrap}
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
.kc-guardar{position:sticky;bottom:0;display:none;gap:14px;align-items:center;justify-content:flex-end;
 background:var(--kc-card);border-top:1px solid var(--kc-rule2);padding:12px 16px;margin-top:14px;
 border-radius:0 0 10px 10px;box-shadow:0 -6px 18px -14px rgba(0,0,0,.5)}
.kc-guardar span{font-size:13.5px;color:var(--kc-ink2)}
.kc-lista{max-height:240px;overflow-y:auto;border:1px solid var(--kc-rule2);border-radius:8px;
 padding:6px 10px;margin-top:4px;background:var(--kc-card)}
.kc-dlg .kc-dst{display:flex;gap:10px;align-items:center;padding:5px 2px;
 font-family:var(--kc-fb);font-size:14px;letter-spacing:0;text-transform:none;
 color:var(--kc-ink);margin:0;cursor:pointer}
.kc-dlg .kc-dst input{width:auto;flex:0 0 auto;margin:0;padding:0}
.kc-dlg .kc-dst.ya{opacity:.5;cursor:default}
.kc-dlg .kc-dst:hover{background:var(--kc-card2);border-radius:5px}
.kc-vq{display:flex;gap:13px;align-items:flex-start;background:var(--kc-card);
 border:1px solid var(--kc-rule);border-left:3px solid var(--kc-ok);border-radius:10px;
 padding:14px 16px;margin-bottom:9px}
.kc-vq.mal{border-left-color:var(--kc-cr)}
.kc-vq .n{flex:0 0 auto;font-family:var(--kc-fm);font-size:11px;color:var(--kc-ink3);
 padding-top:3px;white-space:nowrap}
.kc-vq .q{flex:1 1 auto;min-width:0}
.kc-vo{list-style:none;margin:9px 0 0;padding:0}
.kc-vo li{display:flex;gap:9px;align-items:flex-start;font-size:14px;color:var(--kc-ink2);
 padding:4px 0}
.kc-vo li.ok{color:var(--kc-ok);font-weight:600}
.kc-vo li .m{flex:0 0 14px;color:var(--kc-ok);font-weight:700}
.kc-vexp{margin-top:9px;font-size:13.5px;color:var(--kc-ink2);background:var(--kc-card2);
 border-radius:8px;padding:9px 12px}
/* ---- matriz de peligros ---- */
.kc-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.kc-kpi{background:var(--kc-card);border:1px solid var(--kc-rule);border-left:3px solid var(--kc-rule2);
 border-radius:10px;padding:14px 16px}
.kc-kpi.ok{border-left-color:var(--kc-ok)} .kc-kpi.mal{border-left-color:var(--kc-cr)}
.kc-kpi b{display:block;font-family:var(--kc-fd);font-weight:700;font-size:30px;line-height:1}
.kc-kpi span{display:block;font-size:12.5px;color:var(--kc-ink2);margin-top:4px}
.kc-h3{font-family:var(--kc-fd);font-weight:600;font-size:17px;margin:0 0 8px}
.kc-dos2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}
.kc-lin{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:13.5px;
 border-bottom:1px solid var(--kc-rule);color:var(--kc-ink2)}
.kc-lin b{color:var(--kc-ink)}
.kc-chips2{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:6px}
.kc-chip3{font-size:12.5px;border-radius:999px;padding:4px 12px;border:1px solid var(--kc-rule2);
 background:var(--kc-card)}
.kc-chip3.ok{background:var(--kc-oks);border-color:var(--kc-ok);color:var(--kc-ok)}
.kc-chip3.mal{background:var(--kc-crs);border-color:var(--kc-cr);color:var(--kc-cr)}
.kc-exp{background:var(--kc-card);border:1px solid var(--kc-rule);border-left:3px solid var(--kc-ok);
 border-radius:10px;padding:14px 16px;margin-bottom:10px}
.kc-exp.pend{border-left-color:var(--kc-wa)}
.kc-exp.abierta{border-left-color:var(--kc-ac);box-shadow:var(--kc-sh)}
.kc-exp.listo{border-left-color:var(--kc-ok)}

.kc-exp .top{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.kc-exp .dest{margin-top:10px}
.kc-exp .dest > label:first-child{display:block;font-family:var(--kc-fm);font-size:9.5px;
 letter-spacing:.07em;text-transform:uppercase;color:var(--kc-ink3);margin-bottom:5px}
.kc-exp .kc-dst{display:flex;gap:10px;align-items:center;padding:4px 2px;font-size:13.5px;cursor:pointer}
.kc-exp .kc-dst input{width:auto;margin:0}
.kc-alerta{display:block;white-space:normal;font-size:12.5px;line-height:1.45;border-radius:7px;
 padding:8px 11px;margin-top:6px}
.kc-alerta.cr{background:var(--kc-crs);color:var(--kc-cr)}
.kc-alerta.wa{background:var(--kc-was);color:var(--kc-wa)}
.kc-alerta b{color:inherit}






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
// Sin tildes, sin mayúsculas, sin espacios de más: para comparar dos textos
// escritos por manos distintas. «Auxiliar de Inspección» y «AUXILIAR DE
// INSPECCION» son el mismo cargo aunque no sean la misma cadena.
const llano = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------- historial

   Dos preguntas distintas, dos tablas distintas: el pasaporte responde
   «¿qué le falta?» y mira sólo lo que se le exige; el historial
   responde «¿qué hizo?» y muestra todo, aplique o no hoy y esté la
   capacitación activa o apagada.

   Sin esto, la historia importada de una empresa —capacitaciones de
   años anteriores que ya salieron del plan, charlas que no se le
   exigen a nadie— queda guardada y muda. Y el registro de charlas es
   lo primero que pide un cliente en una auditoría.                     */
const ASIS = {
  asistio:               ['Asistió',   'si'],
  ausente_justificado:   ['Faltó · justificada', 'wa'],
  ausente_injustificado: ['Faltó',     'no']
};

function tablaHistorial(H, opt) {
  H = H || []; opt = opt || {};
  if (!H.length) return `<p class="kc-vacio">${esc(opt.vacio ||
    'Todavía no hay nada registrado.')}</p>`;

  const hs = H.reduce((a, x) => a + (Number(x.horas) || 0), 0);
  const con = H.filter(x => x.estado === 'asistio').length;
  const viejas = H.filter(x => !x.se_le_exige_hoy).length;

  return `<div class="kc-grid3" style="margin-bottom:14px">
      <div class="kc-kpi"><b>${con}</b><span>asistencias</span></div>
      <div class="kc-kpi"><b>${hs ? (Math.round(hs * 10) / 10) : '—'}</b><span>horas</span></div>
      <div class="kc-kpi"><b>${viejas}</b><span>de temas que hoy no se le exigen</span></div>
    </div>
    <div class="kc-sc"><table><thead><tr><th>Fecha</th><th>Código</th>
      <th>Capacitación</th><th>Resultado</th><th class="n">Nota</th>
      <th class="n">Horas</th><th>Vence</th><th></th></tr></thead><tbody>${
    H.map(x => {
      const a = ASIS[x.estado] || [x.estado, 'n'];
      return `<tr>
        <td class="n">${x.fecha ? fecha(x.fecha) : '—'}</td>
        <td class="k">${esc(x.codigo || '')}</td>
        <td class="tit">${esc(x.titulo || '')}
          <div class="kc-cd" style="margin-top:2px">${esc(x.eje || '')} · ${esc(x.tipo || '')}${
            x.se_le_exige_hoy ? '' : ' · ya no se le exige'}${
            x.capacitacion_activa ? '' : ' · apagada'}</div></td>
        <td><span class="kc-tag ${a[1]}">${esc(a[0])}</span></td>
        <td class="n">${x.nota != null ? Number(x.nota) : '—'}</td>
        <td class="n">${x.horas != null ? Number(x.horas) : '—'}</td>
        <td class="n">${x.vence_el ? fecha(x.vence_el) : 'no vence'}</td>
        <td>${x.soporte ? `<a class="kc-mini" href="${esc(x.soporte)}"
              target="_blank" rel="noopener">Soporte</a>` : ''}</td>
      </tr>`; }).join('')}</tbody></table></div>
    <p class="kc-nota" style="text-align:left;margin-top:10px">Esto es lo que
      <b>pasó</b>, no lo que se exige. Una línea marcada «ya no se le exige» es un
      registro válido de algo que hizo: la empresa cambió su plan, no la historia.</p>`;
}

/* ---------------------------------------------------- estado de formación

   El módulo dice el estado de la FORMACIÓN, nunca un juicio sobre la
   persona. «Apto» está ocupada dos veces y ninguna es esta: aptitud
   médica ocupacional (Res. 2346/2007), que firma un médico laboral, y
   calificación técnica (Inspector Nivel II, montacarguista, alturas),
   que emite un tercero y el módulo ni siquiera guarda. Un Inspector II
   con certificado vigente al que le falta una charla de ergonomía puede
   inspeccionar; decirle NO APTO en una credencial que lee el cliente lo
   baja del pozo por una charla.

   Y «al día» se mide contra HOY. Lo que está agendado más adelante en
   el cronograma no es una falta: es el plan andando, y va aparte.       */
const FORM = {
  al_dia:   { tag:'Al día',   tcls:'si', band:'ok',
              t1:'Al día con su formación' },
  en_falta: { tag:'No al día', tcls:'no', band:'cr',
              t1:'No está al día con su formación' },
  sin_plan: { tag:'Sin plan', tcls:'n',  band:'wa',
              t1:'Sin plan de formación definido' }
};
const estadoForm = f => FORM[f] || FORM.sin_plan;
// «Resto del año: X en el cronograma». Nunca en rojo: no es una falta.
const cola = n => n > 0
  ? `Resto del año: ${n} en el cronograma.` : '';
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
  // El historial puede ser largo (en una empresa con años cargados, cientos
  // de líneas). Se pide sólo cuando alguien abre esa pestaña, no en cada
  // apertura del pasaporte.
  let HIST = null;
  const items = D.items || [], port = D.portada || {}, emp = D.empresa || {};
  marca(el, emp);
  const form = items.filter(x => x.tipo !== 'charla');
  const charlas = items.filter(x => x.tipo === 'charla');

  /* Esta pantalla y el QR hablan de la misma persona el mismo día: tienen
     que decir lo mismo. Antes acá decía «18 pendientes · ninguna vencida»
     en ámbar —que se lee como «tranquilo»— y el QR devolvía «no está al
     día · 18 atrasadas» en rojo. La misma tarjeta contradecía a su propio
     código. Ahora las dos leen `formacion`, que la calcula el servidor. */
  function pintar() {
    const F1 = estadoForm(D.formacion);
    const cls = D.formacion === 'al_dia' ? 'ok'
              : D.formacion === 'sin_plan' ? 'wa' : 'cr';
    const t1 = D.formacion === 'al_dia' ? 'Al día'
             : D.formacion === 'sin_plan' ? 'Sin plan de formación'
             : port.vencidas > 0
               ? (port.vencidas === 1 ? 'Tenés 1 vencida' : `Tenés ${port.vencidas} vencidas`)
               : (port.atrasadas === 1 ? 'Tenés 1 atrasada' : `Tenés ${port.atrasadas} atrasadas`);
    // El «resto del año» va una sola vez, en el botón de abajo, que
    // además filtra la lista. Repetirlo en el titular era ruido.
    const t2 = D.formacion === 'al_dia'
                 ? 'Toda tu formación está vigente.'
             : D.formacion === 'sin_plan'
                 ? 'Todavía no se definió qué formación te exige tu cargo. No es que estés al día: es que no hay nada cargado.'
             : (port.vencidas > 0 ? 'Hablá con el área HSE para reprogramarla. ' : '') +
               (port.atrasadas > 0
                 ? port.atrasadas + ' están sin dictar y sin fecha en el cronograma. ' : '') +
               '';

    const base = cat === 'charla' ? charlas
      : form.filter(x => cat === 'todas' || (EJE_ORDEN.includes(x.eje) ? x.eje : 'otro') === cat);
    const lista = base.filter(x => !est ? true
      : est === 'atrasada'      ? x.atrasada === true
      : est === 'en_cronograma' ? x.en_cronograma === true
      : x.estado === est);

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
            ['atrasada','','Atrasadas',port.atrasadas],
            ['al_dia','a','Al día',port.al_dia]
          ].map(([k,c,t,n]) => `<button class="kc-ct ${c}" type="button" data-e="${k}"
            aria-pressed="${est===k}"><b>${n ?? 0}</b><span>${t}</span></button>`).join('')}</div>
        ${port.en_cronograma ? `<button class="kc-mini" type="button" data-e="en_cronograma"
          aria-pressed="${est==='en_cronograma'}" style="margin-top:9px">${
          cola(port.en_cronograma)}</button>` : ''}
      </div>
      <div class="kc-tabs" role="tablist">
        <button class="kc-tab" data-t="pas" role="tab" aria-selected="${tab==='pas'}">Capacitaciones</button>
        <button class="kc-tab" data-t="cred" role="tab" aria-selected="${tab==='cred'}">Credencial</button>
        <button class="kc-tab" data-t="certs" role="tab" aria-selected="${tab==='certs'}">Certificados</button>
        <button class="kc-tab" data-t="hist" role="tab" aria-selected="${tab==='hist'}">Historial</button>
      </div>
      ${tab === 'pas'  ? vistaLista(lista)
      : tab === 'cred' ? vistaCred()
      : tab === 'hist' ? (HIST === null
          ? '<div class="kc-carga">Buscando tu historial…</div>'
          : tablaHistorial(HIST, { vacio: 'Todavía no hay ninguna capacitación registrada a tu nombre.' }))
      : vistaCerts()}
    </div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = async () => {
      tab = b.dataset.t; pintar();
      if (tab === 'hist' && HIST === null) {
        try { HIST = await rpc('cap_mi_historial') || []; }
        catch (e) { HIST = []; }
        if (tab === 'hist') pintar();
      }
    });
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
    // El mismo criterio que usa el QR al que apunta esta tarjeta. Si acá
    // dijera una cosa y el código escaneado otra, la credencial no sirve
    // para nada: es justamente lo que el supervisor va a cotejar.
    const cls = D.formacion === 'al_dia' ? 'ok'
              : D.formacion === 'sin_plan' ? 'wa' : 'cr';
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
        esc(estadoForm(D.formacion).t1)}${
        port.vencidas ? ' · ' + port.vencidas + ' vencida(s)' : ''}${
        port.atrasadas ? ' · ' + port.atrasadas + ' atrasada(s)' : ''}</span></div>
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
          <span class="kc-tag ${estadoForm(p.formacion).tcls}" style="margin-left:auto;align-self:start"
            title="Estado de la formación interna al día de hoy">
            ${estadoForm(p.formacion).tag}</span></div>
        <div class="kc-cts" style="border:none;border-radius:0;margin:0">
          <div class="kc-ct v"><b>${p.vencidas??0}</b><span>Vencidas</span></div>
          <div class="kc-ct x"><b>${p.por_vencer??0}</b><span>Por vencer</span></div>
          <div class="kc-ct"><b>${p.atrasadas??0}</b><span>Atrasadas</span></div>
          <div class="kc-ct a"><b>${p.al_dia??0}</b><span>Al día</span></div></div>
        ${p.en_cronograma ? `<div style="padding:8px 15px 0;font-size:12.5px;
          color:var(--kc-ink3)">${cola(p.en_cronograma)}</div>` : ''}
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
    // Sólo cuentan como «sin mapear» los que tienen un cargo escrito que
    // no se reconoce. Quien no tiene cargo escrito no es un problema de
    // mapeo — es un dato que falta en el padrón de KALU — y mezclarlos
    // hace que el cartel pida algo que no se puede hacer desde acá.
    const sm = (D.sinMapear || []).filter(x => (x.cargo_texto || '').trim()).length;
    const smTotal = (D.sinMapear || []).length;
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <div style="padding:24px 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:6px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · ADMINISTRACIÓN <span style="opacity:.45">· v${KC_VER}</span></div>
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
    // La lista de sin mapear vive DENTRO de Personas, no arriba de las
    // pestañas: si va arriba, en una empresa nueva empuja la navegación
    // fuera de la pantalla y parece que las pestañas no existen.
    if (tab === 1)      v.innerHTML = (smTotal ? vSinMapear() : '') + vPers();
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
    // Quien no tiene NINGÚN cargo escrito en el padrón no es un caso de
    // mapeo: no hay texto que mapear. Se cuenta aparte y se dice dónde
    // se arregla, en vez de ofrecer un botón que no puede hacer nada.
    const sinCargo = (D.sinMapear || []).filter(s => !(s.cargo_texto || '').trim()).length;
    const g = {};
    (D.sinMapear || []).forEach(s => {
      const k = (s.cargo_texto || '').trim();
      if (!k) return;
      (g[k] = g[k] || { txt: k, gente: 0, caps: 0 });
      g[k].gente++; g[k].caps += (s.capacitaciones_hoy || 0);
    });
    const filas = Object.values(g).sort((a, b) => b.gente - a.gente);
    const TOPE = 12, ver = filas.slice(0, TOPE), resto = filas.length - ver.length;

    // Decir cuántas son y no quiénes es pedir una tarea que no se puede
    // hacer: para ponerle el cargo a alguien en el padrón hay que saber
    // a quién. Van los nombres, y la cédula para encontrarlos.
    const quienes = (D.sinMapear || [])
      .filter(x => !(x.cargo_texto || '').trim())
      .map(x => esc(x.nombre) + (x.cedula ? ' <span class="mono">· ' + esc(x.cedula) + '</span>' : ''));
    const avisoSinCargo = sinCargo ? `<div class="kc-cent" style="background:var(--kc-card2)">
      <div class="b" style="background:var(--kc-ink3)">${sinCargo}</div><div>
      <div class="kc-tt" style="font-size:15px">${sinCargo === 1
        ? 'Una persona no tiene cargo escrito en el padrón'
        : sinCargo + ' personas no tienen cargo escrito en el padrón'}</div>
      <div style="font-size:13.5px;color:var(--kc-ink);margin:5px 0 4px">${
        quienes.slice(0, 10).join(' · ')}${quienes.length > 10
          ? ' · y ' + (quienes.length - 10) + ' más' : ''}</div>
      <div style="font-size:13px;color:var(--kc-ink2)">No se arregla acá: el Capacitador lee el
        padrón y no lo escribe. Ponele el cargo en KALU y desaparece sola de esta lista.</div>
      </div></div>` : '';

    if (!filas.length) return avisoSinCargo;

    return avisoSinCargo + `${filas.length > 5 ? `<div class="kc-cent" style="background:var(--kc-was)">
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
    el.querySelectorAll('[data-plan]').forEach(b => b.onclick = () =>
      planCargo(sel, b.dataset.plan, { volver: () => admin(sel) }));
    el.querySelectorAll('[data-ver]').forEach(b => b.onclick = () =>
      verCurso(sel, b.dataset.ver, { volver: () => admin(sel) }));
    el.querySelectorAll('[data-asigdoc]').forEach(b => b.onclick = () =>
      destinos(sel, { volver: () => admin(sel) }));
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
    // «Cargo» y «En el padrón» eran dos columnas que casi siempre dicen lo
    // mismo, y entre las dos se llevaban 400px que le faltaban al resto de
    // la tabla. Van juntas: arriba el cargo del organigrama, y abajo, en
    // gris, el texto crudo del padrón sólo cuando no coinciden — que es
    // justo cuando hay algo para mirar.
    const igual = (a, b) => llano(a) === llano(b);
    return '<div class="kc-sc"><table><thead><tr><th>Persona</th><th>Cargo</th>' +
      '<th>Desde</th><th>Meses</th><th>Formación</th><th>Atras.</th>' +
      '<th>Tramos</th><th class="acc"></th></tr></thead><tbody>' +
      (D.personas||[]).map(p => `<tr>
        <td class="k nom"><div>${esc(p.nombre)}</div></td>
        <td class="tit">${esc(p.cargo||'—')}${p.cargos > 1
            ? ` <span class="kc-tag no" title="Está mapeada a ${p.cargos} cargos">×${p.cargos}</span>` : ''}${
            p.cargoTexto && !igual(p.cargoTexto, p.cargo)
              ? `<div class="kc-cd" style="margin-top:2px"
                   title="Así está escrito en el padrón">${esc(p.cargoTexto)}</div>` : ''}</td>
        <td class="n">${esc(p.desde||'—')}${p.tramosAbiertos > 1
            ? ' <span class="kc-tag no" title="Tiene dos tramos de cargo abiertos">×2</span>' : ''}</td>
        <td class="n">${p.meses ?? '—'}</td>
        <td class="est"><span class="kc-tag ${estadoForm(p.formacion).tcls}" title="${
            p.formacion === 'sin_plan'
              ? (p.determinado === false
                  ? 'No tiene cargo en el organigrama: se arregla en el padrón'
                  : 'Su cargo todavía no tiene capacitaciones asignadas')
              : 'Estado de la formación al día de hoy'
          }">${estadoForm(p.formacion).tag}</span>${p.cola
            ? ` <span class="kc-tag g" title="En el cronograma para más adelante: no es una falta">+${p.cola}</span>` : ''}</td>
        <td class="n">${p.atrasadas ?? 0}</td><td class="n">${p.tramos}</td>
        <td class="acc"><div style="display:flex;gap:6px">
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
      '<th>Personas</th><th>Capacit.</th><th>Variantes</th><th>Rutas</th><th class="acc"></th></tr></thead><tbody>' +
      C.map(c => `<tr${c.activo?'':' style="opacity:.5"'}>
        <td class="k">${esc(c.nombre)}${c.activo?'':' <span class="kc-tag g">Apagado</span>'}</td>
        <td style="color:var(--kc-ink3)">${esc(c.area||'—')}</td>
        <td style="color:var(--kc-ink3)">${esc(c.jefe||'—')}</td>
        <td class="n">${c.personas}</td>
        <td class="n"${c.activo && c.personas && !c.capacitaciones ? ' style="color:var(--kc-cr)"' : ''}>${c.capacitaciones}</td>
        <td class="n">${c.alias}</td>
        <td class="n">↑${c.rutasEntran} ↓${c.rutasSalen}</td>
        <td class="acc"><div style="display:flex;gap:6px">
          <button class="kc-mini${c.activo && c.personas && !c.capacitaciones ? ' p' : ''}" data-plan="${c.id}">Plan${
            c.capacitaciones ? ' · ' + c.capacitaciones : ''}</button>
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
      <input type="text" id="k1" list="kc-cargos" value="${esc(nuevo ? '' : c.nombre)}"
             placeholder="Ej: Inspector END Nivel III" autocomplete="off">
      <datalist id="kc-cargos">${otros.map(x => `<option value="${esc(x.nombre)}">`).join('')}</datalist>
      <div id="kc-choque" style="margin:-6px 0 12px"></div>
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

      // Avisar mientras se escribe, no después de guardar. El servidor
      // igual rechaza un nombre repetido, pero para entonces la persona
      // ya decidió; y los que se PARECEN el servidor no los rechaza —
      // no puede, porque a veces son cargos distintos de verdad.
      const inp = d.querySelector('#k1'), aviso = d.querySelector('#kc-choque');
      if (inp && aviso) {
        const revisar = () => {
          const v = inp.value.trim();
          if (!v) { aviso.innerHTML = ''; return; }
          const igual = otros.filter(x => kcParecido(v, x.nombre) === 'igual');
          const cerca = otros.filter(x => {
            const p = kcParecido(v, x.nombre);
            return p === 'contenido' || p === 'parecido';
          });
          // Ojo: hay que escapar cada nombre por separado. Escapar el
          // texto ya armado convierte las negritas en código a la vista.
          const nombres = xs => xs.map(x => '<b>' + esc(x.nombre) + '</b>').join(', ');
          if (igual.length) {
            aviso.innerHTML = `<div class="kc-alerta cr">Ya existe ${nombres(igual.slice(0,1))}.
              Es el mismo cargo escrito distinto: no se puede crear otro. Si el padrón lo escribe
              así, abrí ese cargo y sumale esta escritura como variante.</div>`;
          } else if (cerca.length) {
            aviso.innerHTML = `<div class="kc-alerta wa">Se parece a ${nombres(cerca.slice(0,3))}.
              Si es el mismo cargo, no lo crees: abrí ese y sumale esta escritura como
              variante.</div>`;
          } else { aviso.innerHTML = ''; }
        };
        inp.oninput = revisar;
        revisar();
      }

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
    // Una columna entera de guiones no dice nada y le roba el ancho al
    // título. Si ninguna capacitación tiene modalidad cargada, no se
    // muestra; en cuanto una la tenga, vuelve sola.
    const hayMod = C.some(c => c.modalidad);
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

    // Si vinieron de un documento que ya dice a quién van dirigidas, no
    // hay que asignarlas una por una: hay que traducir los pocos textos
    // distintos que ese documento usa. La pantalla dirá cuántos son.
    const conTexto = huerf.length;
    const alerta = huerf.length ? `<div class="kc-cent mal"><div class="b">${huerf.length}</div>
        <div style="flex:1">
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">${huerf.length} capacitación(es) activas que no le llegan a nadie</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Están en el catálogo pero ninguna persona las tiene asignada.
          O falta asignarles un cargo, o el comité o la actividad a la que apuntan todavía no tiene gente cargada.</div>
        ${conTexto ? `<div style="font-size:13px;color:var(--kc-ink);margin-top:7px">
          Si las importaste de un documento que ya dice a quién van dirigidas, no hace falta
          asignarlas una por una.
          <button class="kc-mini p" data-asigdoc="1" style="margin-left:6px">Asignar desde el documento</button></div>` : ''}
        </div></div>` : '';

    return alerta + `
      <div class="kc-bar2">
        <input id="kc-bus" class="kc-bus" type="search" placeholder="Buscar por código o título…"
               value="${esc(busca)}" autocomplete="off">
        <button class="kc-mini p" data-c="ia">✦ Armar con IA</button>
        <button class="kc-mini" data-c="crear">+ Crear propia</button>
        ${(CAT.biblioteca||[]).length
          ? `<button class="kc-mini p" data-c="traer">Traer la biblioteca entera · ${CAT.biblioteca.length}</button>
             <button class="kc-mini" data-c="sumar">Sumar una</button>`
          : ''}
        ${n.activas ? `<button class="kc-mini" data-c="apagartodas">Apagar todas</button>` : ''}
        ${n.apagadas ? `<button class="kc-mini" data-c="prendertodas">Prender todas · ${n.apagadas}</button>` : ''}
      </div>
      <div class="kc-fil" style="padding:0 0 14px">
        ${chip('todas','Todas')}${chip('activas','Activas')}${chip('bloqueo','Bloqueantes')}
        ${chip('huerfanas','Sin gente')}${chip('apagadas','Apagadas')}
      </div>
      ${L.length ? `<div class="kc-sc"><table><thead><tr>
        <th>Código</th><th>Capacitación</th><th>Vigencia</th>${hayMod ? '<th>Modalidad</th>' : ''}
        <th>Le aplica a</th><th>Gente</th><th>${anio}</th><th class="acc"></th></tr></thead><tbody>` +
      L.map(c => `<tr${c.activo?'':' style="opacity:.45"'}>
        <td class="k">${esc(c.codigo)}${c.bloqueo === 2
            ? ' <span class="kc-tag no" title="Bloquea la vinculación">ING</span>'
            : c.bloqueo === 1 ? ' <span class="kc-tag wa" title="Bloquea la operación">OPE</span>' : ''}</td>
        <td class="tit"><div>${esc(c.titulo)}</div>
            <div class="kc-cd" style="margin-top:2px">${esc(c.eje)} · ${esc(c.tipo)}${
              c.autoestudio ? ' · autoestudio' : ''}${c.propia ? ' · propia' : ''}</div></td>
        <td class="n">${vig(c.vigencia_dias)}</td>
        ${hayMod ? `<td style="font-size:13px;color:var(--kc-ink3)">${
          c.modalidad ? MODALN[c.modalidad] : '—'}</td>` : ''}
        <td>${c.asignaciones.length
            ? '<div class="kc-chips">' + c.asignaciones.slice(0,3).map(a =>
                `<span class="kc-mch${a.bloqueante!=='no'?' b':''}">${esc(a.destino)}</span>`).join('') +
              (c.asignaciones.length > 3 ? `<span class="kc-mch">+${c.asignaciones.length-3}</span>` : '') + '</div>'
            : '<span style="color:var(--kc-cr);font-size:13px">nadie</span>'}</td>
        <td class="n"${c.personas===0?' style="color:var(--kc-cr)"':''}>${c.personas}</td>
        <td class="n">${c.hechos}/${c.eventos}</td>
        <td class="acc"><div style="display:flex;gap:6px">
          <button class="kc-mini" data-ver="${c.id}">Ver</button>
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

    if (accion === 'traer') {
      return abrir(`<h3>Traer la biblioteca entera</h3>
        <p>Suma a esta empresa las <b>${(CAT.biblioteca||[]).length}</b> capacitaciones de la
           biblioteca que todavía no tiene, y las deja prendidas.</p>
        <p>La mayoría son exigidas por norma —Decreto 1072, Resolución 0312, Ley 1010— así que
           lo raro no es tenerlas: es no tenerlas. Después se apaga una por una lo que no aplique,
           o todas de golpe con «Apagar todas».</p>
        <p>Estar en el catálogo <b>no se lo exige a nadie todavía</b>: eso se define en el plan de
           cada cargo.</p>`,
        () => rpc('cap_biblioteca_traer'), 'Traer todas');
    }

    if (accion === 'apagartodas') {
      // El servidor apaga SÓLO las que vinieron de la biblioteca
      // (cap_catalogo_masivo tiene p_solo_biblioteca en true por
      // defecto). Decir «afecta a las 294 prendidas» cuando toca 67 es
      // pedirle a alguien que apriete un botón que no entiende: o no lo
      // aprieta, o cree que borró el catálogo entero de su empresa.
      const deBiblio = (CAT.catalogo || []).filter(c => c.activo && !c.propia).length;
      const propias  = (CAT.catalogo || []).filter(c => c.activo &&  c.propia).length;
      return abrir(`<h3>Apagar las de la biblioteca</h3>
        <p>Apaga las <b>${deBiblio}</b> capacitaciones que vinieron de la biblioteca de KALU y
           están prendidas.${propias ? ` Las <b>${propias}</b> propias de la empresa
           <b>no se tocan</b>.` : ''}</p>
        <p><b>No se borra nada.</b> Las asistencias, los certificados y el historial quedan como
           están; esas capacitaciones dejan de exigirse, nada más. Se puede volver a prender.</p>
        <label for="k1">Motivo</label>
        <input type="text" id="k1" placeholder="Ej: HSE arma la matriz propia de la empresa">`,
        dd => rpc('cap_catalogo_masivo', { p_prender: false,
          p_motivo: dd.querySelector('#k1').value }), 'Apagar todas');
    }

    if (accion === 'prendertodas') {
      const apagBib = (CAT.catalogo || []).filter(c => !c.activo && !c.propia).length;
      return abrir(`<h3>Prender las de la biblioteca</h3>
        <p>Vuelve a prender las <b>${apagBib}</b> de la biblioteca que están apagadas. Las propias
           de la empresa y las que ya estaban prendidas quedan como están.</p>`,
        () => rpc('cap_catalogo_masivo', { p_prender: true }), 'Prender todas');
    }

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
          const dest = [...dd.querySelectorAll('.kdst:checked')].map(x => x.value);
          if (al !== 'todos' && !dest.length)
            throw new Error('Marcá al menos uno. Podés marcar varios de una vez.');
          return rpc('cap_asig_varios', { p_catalogo: id, p_alcance: al,
            p_destinos: al === 'todos' ? null : dest,
            p_bloqueante: dd.querySelector('#k3').value });
        }, 'Agregar');

      // Una misma capacitación casi nunca le toca a un solo cargo. Con un
      // desplegable había que repetir el diálogo una vez por cargo, y en el
      // medio es fácil saltearse uno — que es peor que no asignarla, porque
      // el tablero se ve verde igual.
      const pintarDest = () => {
        const al = d.querySelector('#k1').value;
        const box = d.querySelector('#kdest');
        if (al === 'todos') { box.innerHTML = ''; return; }
        const L = al === 'cargo' ? (CAT.cargos||[]) : al === 'rol' ? (CAT.roles||[]) : (CAT.actividades||[]);
        const tit = al === 'cargo' ? 'Cargos' : al === 'rol' ? 'Comités y roles' : 'Actividades';
        const ya = new Set((c.asignaciones||[]).filter(a => a.alcance === al).map(a => a.destino));

        box.innerHTML = !L.length
          ? `<p style="color:var(--kc-cr);margin:10px 0 0">Todavía no hay ${tit.toLowerCase()}
             cargados en esta empresa.</p>`
          : `<label>${tit} — marcá todos los que correspondan</label>
             <div class="kc-lista">${L.map(x => `<label class="kc-dst${ya.has(x.nombre) ? ' ya' : ''}">
               <input type="checkbox" class="kdst" value="${x.id}" ${ya.has(x.nombre) ? 'disabled' : ''}>
               <span>${esc(x.nombre)}${ya.has(x.nombre) ? ' · ya la tiene' : ''}</span></label>`).join('')}</div>
             <div class="kc-row" style="margin:7px 0 0;gap:7px">
               <button type="button" class="kc-mini" id="kdall">Marcar todos</button>
               <button type="button" class="kc-mini" id="kdnone">Ninguno</button></div>`;

        const todos = box.querySelector('#kdall'), nada = box.querySelector('#kdnone');
        if (todos) todos.onclick = () =>
          box.querySelectorAll('.kdst:not(:disabled)').forEach(x => x.checked = true);
        if (nada) nada.onclick = () =>
          box.querySelectorAll('.kdst').forEach(x => x.checked = false);
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
  try { F = await rpc('cap_ficha_mas', { p_persona: personaId }); }
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
    const F1  = estadoForm(H.formacion);
    const cls = P.vigente === false ? 'cr' : F1.band;
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
        <div><div class="t1">${F1.t1}</div>
        <div class="t2">${H.formacion === 'sin_plan'
          ? (H.determinado === false
              ? 'No tiene cargo en el organigrama, así que el módulo no le exige nada. Se arregla en el padrón.'
              : 'A su cargo todavía no se le asignaron capacitaciones.')
          : [ H.vencidas  ? H.vencidas  + ' vencida(s)'  : null,
              H.atrasadas ? H.atrasadas + ' atrasada(s)' : null,
              'Vinculación ' + (H.ok_ingreso ?? 0) + ' de ' + (H.req_ingreso ?? 0),
              'Operación '   + (H.ok_operacion ?? 0) + ' de ' + (H.req_operacion ?? 0)
            ].filter(Boolean).join(' · ')}</div>
        ${H.en_cronograma ? `<div class="t2" style="color:var(--kc-ink3)">${
          cola(H.en_cronograma)}</div>` : ''}</div>
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
        <button class="kc-tab" data-s="hist" aria-selected="false">Historial${
          (F.historial || []).length ? ' · ' + F.historial.length : ''}</button>
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
    else if (s === 'hist')   v.innerHTML = tablaHistorial(F.historial,
      { vacio: 'No hay ninguna asistencia registrada para esta persona.' });
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
  const F1   = estadoForm(r.formacion);
  const cls  = baja ? 'cr' : F1.band;
  const t1   = baja ? 'No vigente' : F1.t1;
  const t2   = baja ? 'Esta persona ya no figura activa en la empresa.'
             : r.formacion === 'al_dia'
               ? 'Tiene al día toda la formación que su cargo exige.'
             : r.formacion === 'sin_plan'
               ? 'Su empresa todavía no definió qué formación exige este cargo. ' +
                 'El módulo no está afirmando que le falte ni que esté al día.'
               : [r.vencidas  ? r.vencidas  + ' vencida(s)'  : null,
                  r.atrasadas ? r.atrasadas + ' atrasada(s)' : null]
                 .filter(Boolean).join(' · ') || 'Le falta formación que su cargo exige.';

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
        ${ct(r.atrasadas ?? 0,  'Atrasadas',  '')}
        ${ct(r.al_dia ?? 0,     'Al día',     'a')}
      </div>
      ${r.en_cronograma ? `<p style="font-size:13px;color:var(--kc-ink3);
        margin:11px 0 0;text-align:center">${cola(r.en_cronograma)} No cuentan como
        falta: todavía no les llegó la fecha.</p>` : ''}
    </div>
    <p class="kc-nota" style="text-align:left">Consultado el ${
      new Date(r.verificado).toLocaleString('es-CO')}. Este estado se calcula en el
      momento: no es una captura ni un archivo guardado.</p>
    <p class="kc-nota" style="text-align:left;margin-top:-4px"><b>Qué informa esta
      credencial:</b> el estado de la formación interna que su empresa le exige.
      <b>No certifica calificaciones técnicas</b> —Inspector Nivel II, montacarguista,
      trabajo en alturas— <b>ni aptitud médica ocupacional</b>. Esas las emiten terceros
      y no se consultan acá. Que falte formación no significa que la persona no pueda
      estar en el sitio: la decisión de asignarle o no la tarea la toma quien supervisa.</p>
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
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">KALU · PUESTA EN MARCHA <span style="opacity:.45">· v${KC_VER}</span></div>
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
        ${IR[p.clave] ? `<button class="kc-mini p" data-ir="${IR[p.clave]}">Ir</button>`
          : p.clave === 'peligros' ? `<button class="kc-mini p" data-matriz="1">Ir</button>`
          : p.clave === 'catalogo' ? `<button class="kc-mini p" data-cat="1">Ir</button>` : ''}
      </div>`).join('')}</div>
      <p class="kc-nota" style="margin-top:14px">Los pasos que no tienen botón se hacen en
      <b>Administración</b>: el catálogo en «Capacitaciones», las asignaciones con el botón
      «Plan» de cada cargo, y lo ya dictado en «Cronograma».</p>`;
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
    v.querySelectorAll('[data-matriz]').forEach(b => b.onclick = () =>
      matriz(sel, { volver: () => arranque(sel) }));

    v.querySelectorAll('[data-cat]').forEach(b => b.onclick = () =>
      impCatalogo(sel, { volver: () => arranque(sel) }));

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

/* =================================================================
   PLAN DE UN CARGO — qué formación se le exige a quien lo ocupa

   Se abre desde Cargos. Muestra todo el catálogo activo de la empresa
   con una casilla por capacitación: se tilda lo que le toca y se guarda
   una sola vez. Antes esto era un diálogo por capacitación; con 67
   capacitaciones y 34 cargos, nadie lo hacía.

   El botón de copiar es lo que hace llevaderos 34 cargos. Dos cargos
   parecidos comparten casi todo, así que se arma uno y se copia. Copiar
   no confirma nada solo: deja el plan cargado para que alguien lo
   revise, y lo dice en el aviso.
   ================================================================= */
async function planCargo(sel, cargoId, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  cargando(el, 'Cargando el plan…');

  let P, cambios = {}, q = '', filtro = 'todas';
  try { P = await rpc('cap_plan_cargo_datos', { p_cargo: cargoId }); }
  catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  const EJEN = { hse:'HSE', tecnica:'Técnica', arl:'ARL', induccion:'Inducción' };
  const vig = d => d == null ? 'No vence' : (d % 365 === 0 ? (d/365) + (d===365?' año':' años')
                 : d % 30 === 0 ? (d/30) + ' meses' : d + ' días');

  // estado de una fila: lo guardado, salvo que se haya tocado en pantalla
  const puesta = i => cambios[i.id] ? cambios[i.id].poner : i.asignada;
  const bloq   = i => cambios[i.id] ? cambios[i.id].bloqueante : (i.bloqueante || 'no');
  const tocado = () => Object.keys(cambios).filter(k =>
    cambios[k].poner !== cambios[k].era || cambios[k].bloqueante !== cambios[k].eraB).length;

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
      try {
        const r = await onOk(d); d.close(); d.remove();
        P = await rpc('cap_plan_cargo_datos', { p_cargo: cargoId });
        cambios = {}; pintar();
        if (r && r.aviso) toast(r.aviso);
      } catch (e) { b.disabled = false; b.textContent = okTxt || 'Guardar'; alert(e.message); }
    };
    return d;
  }

  function pintar() {
    const c = P.cargo || {}, items = P.items || [];
    const puestas = items.filter(puesta).length;
    const n = {
      todas: items.length,
      tildadas: puestas,
      sin: items.length - puestas,
      llegan: items.filter(i => i.ya_le_llega).length
    };
    const pasa = i => {
      if (q && !((i.codigo + ' ' + i.titulo).toLowerCase().includes(q))) return false;
      if (filtro === 'tildadas') return puesta(i);
      if (filtro === 'sin')      return !puesta(i);
      if (filtro === 'llegan')   return !!i.ya_le_llega;
      return true;
    };
    const L = items.filter(pasa);
    const chip = (k, t) => `<button class="kc-chip" data-f="${k}" aria-pressed="${filtro===k}">${t} · ${n[k]}</button>`;

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      <button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver a Cargos</button>
      <div style="padding:0 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:14px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">PLAN DE FORMACIÓN DEL CARGO</div>
        <h1 style="font-size:28px;font-weight:700">${esc(c.nombre || '')}</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px">
          ${c.gente || 0} persona(s) ocupan este cargo${c.area ? ' · ' + esc(c.area) : ''}</div></div>

      ${!c.gente ? `<div class="kc-cent" style="background:var(--kc-card2)">
        <div class="b" style="background:var(--kc-ink3)">0</div><div>
        <div class="kc-tt" style="font-size:15px">Todavía no lo ocupa nadie</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Podés dejar el plan armado igual: cuando
        entre alguien con este cargo, le va a aplicar desde el primer día.</div></div></div>` : ''}

      <div class="kc-bar2">
        <input id="kc-bus" class="kc-bus" type="search" placeholder="Buscar por código o título…"
               value="${esc(q)}" autocomplete="off">
        ${P.puede_editar === false ? '' :
          `<button class="kc-mini" id="kc-copiar">Copiar de otro cargo</button>`}
      </div>
      <div class="kc-fil" style="padding:0 0 14px">
        ${chip('todas','Todas')}${chip('tildadas','Le tocan')}${chip('sin','No le tocan')}
        ${chip('llegan','Ya le llegan por otro lado')}
      </div>

      ${L.length ? `<div class="kc-sc"><table><thead><tr>
        <th style="width:34px"></th><th>Código</th><th>Capacitación</th><th>Vigencia</th>
        <th>Nivel</th><th>Otros cargos</th></tr></thead><tbody>
        ${L.map(i => `<tr class="${puesta(i) ? '' : 'kc-off'}">
          <td><input type="checkbox" data-chk="${i.id}" ${puesta(i) ? 'checked' : ''}></td>
          <td class="k">${esc(i.codigo)}</td>
          <td><div>${esc(i.titulo)}</div>
              <div class="kc-cd" style="margin-top:2px">${esc(EJEN[i.eje] || i.eje)} · ${esc(i.tipo)}${
                i.propia ? ' · propia' : ''}${i.certificable ? ' · certifica' : ''}</div>
              ${i.ya_le_llega ? `<div class="kc-mch b">ya le llega por ${esc(i.ya_le_llega)}</div>` : ''}
              ${(i.base_legal || []).length ? `<div class="kc-cd" style="margin-top:3px;color:var(--kc-ink3)">${esc((i.base_legal||[]).join(' · '))}</div>` : ''}</td>
          <td class="n">${vig(i.vigencia_dias)}</td>
          <td>${puesta(i) ? `<select class="kc-in" data-bloq="${i.id}">
              <option value="no" ${bloq(i)==='no'?'selected':''}>Informativa</option>
              <option value="operacion" ${bloq(i)==='operacion'?'selected':''}>Bloquea la operación</option>
              <option value="ingreso" ${bloq(i)==='ingreso'?'selected':''}>Bloquea la vinculación</option>
            </select>` : '<span style="color:var(--kc-ink3)">—</span>'}</td>
          <td class="n" style="color:var(--kc-ink3)">${i.otros_cargos}</td>
        </tr>`).join('')}
      </tbody></table></div>` : '<p class="kc-nota">Nada con ese filtro.</p>'}

      ${P.puede_editar === false ? '' : `<div class="kc-guardar" id="kc-gb">
        <span id="kc-cuenta"></span>
        <button class="kc-btn" id="kc-guardar" style="width:auto;padding:0 24px">Guardar el plan</button>
      </div>`}
      </div>`;

    el.querySelector('#kc-volver').onclick = () => {
      if (tocado() && !confirm('Hay cambios sin guardar. ¿Salís igual?')) return;
      if (opt.volver) opt.volver(); else admin(sel);
    };

    enganchar();
    refrescarBarra();
  }

  function refrescarBarra() {
    // los contadores de los filtros tienen que seguir lo tildado en pantalla,
    // no lo último guardado: si no, dicen una cosa y la tabla muestra otra
    const items = P.items || [], puestas = items.filter(puesta).length;
    const cuenta = { todas: items.length, tildadas: puestas, sin: items.length - puestas,
                     llegan: items.filter(i => i.ya_le_llega).length };
    const TXT = { todas:'Todas', tildadas:'Le tocan', sin:'No le tocan',
                  llegan:'Ya le llegan por otro lado' };
    el.querySelectorAll('[data-f]').forEach(x => {
      x.textContent = TXT[x.dataset.f] + ' · ' + cuenta[x.dataset.f];
    });

    const b = el.querySelector('#kc-gb'), cta = el.querySelector('#kc-cuenta');
    if (!b) return;
    const n = tocado();
    b.style.display = n ? 'flex' : 'none';
    if (cta) cta.textContent = n === 1 ? '1 cambio sin guardar' : n + ' cambios sin guardar';
  }

  function enganchar() {
    const marcarCambio = (id, poner, bl) => {
      const it = (P.items || []).find(x => x.id === id);
      if (!it) return;
      cambios[id] = {
        poner: poner, bloqueante: bl,
        era: it.asignada, eraB: it.bloqueante || 'no'
      };
    };

    el.querySelectorAll('[data-chk]').forEach(ch => ch.onchange = () => {
      const id = ch.dataset.chk;
      const it = (P.items || []).find(x => x.id === id);
      marcarCambio(id, ch.checked, bloq(it));
      // redibujo la fila para mostrar u ocultar el selector de nivel
      const fila = ch.closest('tr');
      fila.classList.toggle('kc-off', !ch.checked);
      const celda = fila.children[4];
      celda.innerHTML = ch.checked
        ? `<select class="kc-in" data-bloq="${id}">
             <option value="no">Informativa</option>
             <option value="operacion">Bloquea la operación</option>
             <option value="ingreso">Bloquea la vinculación</option></select>`
        : '<span style="color:var(--kc-ink3)">—</span>';
      const s = celda.querySelector('select');
      if (s) { s.value = bloq(it); s.onchange = () => marcarCambio(id, true, s.value); }
      refrescarBarra();
    });

    el.querySelectorAll('[data-bloq]').forEach(s => s.onchange = () => {
      marcarCambio(s.dataset.bloq, true, s.value); refrescarBarra();
    });

    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; pintar(); });

    const bus = el.querySelector('#kc-bus');
    if (bus) bus.oninput = () => {
      const cur = bus.selectionStart; q = bus.value.trim().toLowerCase(); pintar();
      const nn = el.querySelector('#kc-bus'); if (nn) { nn.focus(); nn.setSelectionRange(cur, cur); }
    };

    const gb = el.querySelector('#kc-guardar');
    if (gb) gb.onclick = async () => {
      const items = Object.keys(cambios).map(id => ({
        catalogo_id: id, poner: cambios[id].poner, bloqueante: cambios[id].bloqueante }));
      if (!items.length) return;
      gb.disabled = true; gb.textContent = 'Guardando…';
      try {
        const r = await rpc('cap_plan_cargo_guardar', { p_cargo: cargoId, p_items: items });
        P = await rpc('cap_plan_cargo_datos', { p_cargo: cargoId });
        cambios = {}; pintar(); toast(r.aviso);
      } catch (e) { gb.disabled = false; gb.textContent = 'Guardar el plan'; alert(e.message); }
    };

    const cp = el.querySelector('#kc-copiar');
    if (cp) cp.onclick = () => {
      const otros = (P.otros_cargos || []).filter(o => o.cuantas > 0);
      if (!otros.length) return alert(
        'Todavía no hay ningún otro cargo con plan armado para copiar.');
      abrir(`<h3>Copiar el plan de otro cargo</h3>
        <p>Trae las capacitaciones de otro cargo a <b>${esc((P.cargo||{}).nombre||'')}</b>.
           Sólo aparecen los que ya tienen algo asignado.</p>
        <label for="k1">Copiar desde</label>
        <select id="k1">${otros.map(o =>
          `<option value="${o.id}">${esc(o.nombre)} · ${o.cuantas} capacitación(es)</option>`).join('')}</select>
        <label for="k2" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px">
          <input type="checkbox" id="k2" style="margin-top:4px">
          <span>Dejarlo <b>idéntico</b> al origen — quita lo que este cargo tenga y el otro no.
          Sin tildar, sólo agrega lo que falte.</span></label>`,
        d => rpc('cap_plan_copiar', {
          p_desde: d.querySelector('#k1').value, p_hacia: cargoId,
          p_reemplazar: d.querySelector('#k2').checked }), 'Copiar');
    };
  }

  pintar();
}

/* =================================================================
   VER UNA CAPACITACIÓN — lo que publicaste, tal como se ve

   Antes de esto, quien publicaba una capacitación no la volvía a ver:
   el contenido sólo se abría desde el pasaporte de un trabajador al
   que le aplicara, y sólo si era de autoestudio.

   Muestra el material como lo ve el trabajador, y abajo la evaluación
   con la respuesta correcta marcada y la explicación — que el
   trabajador no ve. Eso último es lo que importa cuando el borrador lo
   escribió una máquina: si la IA se equivocó en cuál opción es la
   buena, acá se ve antes de que alguien repruebe una pregunta que
   contestó bien.

   Mirar no es cursar: no abre ningún intento ni registra nada.
   ================================================================= */
async function verCurso(sel, catalogoId, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  cargando(el, 'Abriendo la capacitación…');

  let V;
  try { V = await rpc('cap_ver_curso', { p_catalogo: catalogoId }); }
  catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  const EJEN = { hse:'HSE', tecnica:'Técnica', arl:'ARL', induccion:'Inducción' };
  const vig = d => d == null ? 'No vence' : (d % 365 === 0 ? (d/365) + (d===365?' año':' años')
                 : d % 30 === 0 ? (d/30) + ' meses' : d + ' días');

  // mismo dibujo que usa el trabajador, para que lo que se ve acá sea
  // exactamente lo que va a ver él
  function bloque(b) {
    if (b.tipo === 'titulo') return `<h2 class="kc-h2">${esc(b.texto)}</h2>`;
    if (b.tipo === 'aviso')  return `<div class="kc-avi">${esc(b.texto)}</div>` +
      (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
    if (b.tipo === 'lista')  return '<ul class="kc-ul">' + String(b.texto||'').split('|').map(x => {
        const m = x.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)\s—\s(.*)$/);
        return `<li>${m ? '<b>'+esc(m[1])+'</b> — '+esc(m[2]) : esc(x)}</li>`;
      }).join('') + '</ul>' + (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
    if (b.tipo === 'imagen') return `<img src="${esc(b.url)}" alt="${esc(b.nota||'')}"
      style="width:100%;border-radius:8px;margin-bottom:14px">`;
    if (b.tipo === 'separador') return '<hr style="border:none;border-top:1px solid var(--kc-rule);margin:20px 0">';
    return `<p class="kc-p">${esc(b.texto)}</p>` + (b.nota ? `<p class="kc-pie">${esc(b.nota)}</p>` : '');
  }

  const c = V.capacitacion || {}, a = V.alcance || {};
  const avisos = V.avisos || [], cont = V.contenido || [], preg = V.preguntas || [];

  const chip = t => `<span class="kc-chip2">${esc(t)}</span>`;

  el.className = 'kc';
  el.innerHTML = `<div class="kc-wide">
    <button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver a Capacitaciones</button>

    <div style="padding:0 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:14px">
      <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">
        ASÍ SE VE ${esc(c.codigo || '')}</div>
      <h1 style="font-size:27px;font-weight:700">${esc(c.titulo || '')}</h1>
      ${c.objetivo ? `<p style="color:var(--kc-ink2);font-size:14.5px;margin:8px 0 0;max-width:70ch">${esc(c.objetivo)}</p>` : ''}
      <div style="margin-top:11px">
        ${chip(EJEN[c.eje] || c.eje || '—')}${chip(c.tipo || '—')}
        ${chip(vig(c.vigencia_dias))}${c.horas ? chip(c.horas + ' h') : ''}
        ${c.certificable ? chip('Certifica') : chip('No certifica')}
        ${c.autoestudio ? chip('Autoestudio') : chip('No es autoestudio')}
        ${c.propia ? chip('Propia de la empresa') : chip('De la biblioteca')}
        ${c.activo ? '' : chip('Apagada')}
        ${chip('versión ' + (c.version ?? 1))}
      </div>
      <div style="color:var(--kc-ink2);font-size:13.5px;margin-top:10px">
        Le aplica a <b>${a.personas || 0}</b> persona(s) · ${a.asignaciones || 0} asignación(es) ·
        ${a.asistencias || 0} asistencia(s) registradas</div>
    </div>

    ${avisos.map(t => `<div class="kc-cent" style="background:var(--kc-was);margin-bottom:9px">
      <div class="b" style="background:var(--kc-wa)">!</div>
      <div style="font-size:13.5px;color:var(--kc-ink2)">${esc(t)}</div></div>`).join('')}

    <h2 style="font-size:20px;margin:22px 0 4px">El material</h2>
    <p class="kc-nota">Tal cual lo ve el trabajador en el teléfono.</p>
    ${cont.length
      ? `<div class="kc-bl" style="margin-top:12px">${cont.map(bloque).join('')}</div>`
      : `<p class="kc-nota" style="color:var(--kc-cr)">No tiene contenido cargado. Se puede
         registrar como charla presencial, pero nadie la puede hacer desde el teléfono.</p>`}

    <h2 style="font-size:20px;margin:30px 0 4px">La evaluación</h2>
    <p class="kc-nota">La respuesta correcta y la explicación <b>sólo las ves vos</b>. El
    trabajador ve las opciones sin marcar, y la explicación recién cuando termina.</p>
    ${preg.length ? preg.map((q, i) => `
      <div class="kc-vq ${q.correctas === 1 ? '' : 'mal'}">
        <div class="n">${i + 1}${q.activa ? '' : ' · apagada'}</div>
        <div class="q">
          <div class="kc-tt" style="font-size:15.5px">${esc(q.enunciado)}</div>
          ${q.correctas !== 1 ? `<div class="kc-mch b">${q.correctas === 0
            ? 'ninguna opción está marcada como correcta — esta pregunta no se puede aprobar'
            : q.correctas + ' opciones marcadas como correctas — el sistema sólo espera una'}</div>` : ''}
          <ul class="kc-vo">${(q.opciones || []).map(o =>
            `<li class="${o.correcta ? 'ok' : ''}">
               <span class="m">${o.correcta ? '✓' : ''}</span>${esc(o.texto)}</li>`).join('')}</ul>
          ${q.explicacion ? `<div class="kc-vexp"><b>Por qué:</b> ${esc(q.explicacion)}</div>` : ''}
        </div>
      </div>`).join('')
      : `<p class="kc-nota" style="color:var(--kc-cr)">No tiene preguntas. Sin evaluación no se
         puede aprobar por autoestudio.</p>`}

    <p class="kc-nota" style="margin:26px 0 10px">Mirar esto <b>no cuenta</b> como haber hecho la
    capacitación: no se abrió ningún intento y no quedó registrado nada a tu nombre.</p>
    </div>`;

  el.querySelector('#kc-volver').onclick = () => {
    if (opt.volver) opt.volver(); else admin(sel);
  };
}

/* =================================================================
   MATRIZ DE PELIGROS — importarla y conectarla con los cargos

   Es la pieza que le da sentido al resto del módulo. Sin matriz,
   alguien decide de memoria qué capacitación le toca a cada cargo, y
   cuando la ARL pregunta por qué, no hay respuesta escrita. Con
   matriz, la respuesta es: porque este peligro exige este control.

   DOS REGLAS QUE ESTA PANTALLA RESPETA

   El Excel no sale del equipo. Se abre en el navegador, se convierte
   en filas, y al servidor viaja el resultado — no el archivo.

   Y la máquina propone, no resuelve. Puede corregir la escritura de
   una clasificación contra la norma, porque eso es ortografía. No
   puede decidir que «Auxiliares END» es «Auxiliar de Inspección»,
   porque eso es criterio. Lo pregunta.
   ================================================================= */

/* La librería que lee Excel pesa casi un mega. Se baja sólo cuando
   alguien va a importar de verdad, no en cada carga del módulo. */
let _xlsxCargando = null;
function cargarXLSX() {
  if (global.XLSX) return Promise.resolve(global.XLSX);
  if (_xlsxCargando) return _xlsxCargando;
  _xlsxCargando = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => global.XLSX ? ok(global.XLSX)
                                  : mal(new Error('La librería cargó pero no quedó disponible'));
    s.onerror = () => mal(new Error('No se pudo bajar el lector de Excel. ' +
      'Revisá la conexión: se baja de internet la primera vez que importás.'));
    document.head.appendChild(s);
  });
  return _xlsxCargando;
}

/* Lo que buscamos en el Excel y con qué palabras reconocerlo. */
const MZ_CAMPOS = [
  ['proceso',           ['PROCESO']],
  ['zona',              ['ZONA', 'LUGAR']],
  ['actividad',         ['ACTIVIDAD']],
  ['tarea',             ['TAREA']],
  ['rutinaria',         ['RUTINARIA']],
  ['descripcion',       ['DESCRPCIÓN DEL PELIGRO', 'DESCRIPCIÓN DEL PELIGRO', 'DESCR']],
  ['clasificacion',     ['CLASIFICACIÓN']],
  ['efectos',           ['EFECTOS']],
  ['control_fuente',    ['FUENTE']],
  ['control_medio',     ['MEDIO']],
  ['control_individuo', ['INDIVIDUO']],
  ['nd',                ['NIVEL DE DEFICIENCIA']],
  ['ne',                ['NIVEL DE EXPOSICIÓN']],
  ['np',                ['NIVEL DE PROBABILIDAD']],
  ['interpretacion_np', ['INTERPRETACIÓN DEL']],
  ['nc',                ['NIVEL DE CONSECUENCIA']],
  ['nr',                ['NIVEL DE RIESGO']],
  ['nivel_riesgo',      ['INTERPRETACIÓN NR']],
  ['aceptabilidad',     ['ACEPTABILIDAD']],
  ['cargos_expuestos',  ['CARGOS EXPUESTOS']],
  ['peor_consecuencia', ['PEOR CONSECUENCIA']],
  ['control_admin',     ['CONTROLES ADMINISTRATIVOS']],
  ['control_epp',       ['EPP', 'EQUIPOS']]
];
const MZ_NORMA = ['BIOLOGICO','FISICO','QUIMICO','PSICOSOCIAL','BIOMECANICO',
                  'CONDICIONES DE SEGURIDAD','FENOMENOS NATURALES'];

const mzTxt = v => v === null || v === undefined ? '' : String(v).replace(/\s+/g,' ').trim();
const mzMay = v => mzTxt(v).toUpperCase();
const mzSinTilde = s => mzTxt(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const mzEsNorma = c => MZ_NORMA.indexOf(mzSinTilde(c)) >= 0 ||
                       MZ_NORMA.indexOf(mzSinTilde(c).replace(/S$/,'')) >= 0;

/* Una hoja como cuadrícula, con los rangos combinados ya rellenados.
   Es lo que hace que un peligro conserve su proceso y su actividad
   aunque en el Excel esas celdas estén vacías. */
function mzCeldas(XLSX, ws) {
  if (!ws || !ws['!ref']) return [];
  const R = XLSX.utils.decode_range(ws['!ref']), M = [];
  for (let r = R.s.r; r <= R.e.r; r++) {
    const fila = [];
    for (let c = R.s.c; c <= R.e.c; c++) {
      const cel = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      fila.push(cel ? cel.v : null);
    }
    M.push(fila);
  }
  (ws['!merges'] || []).forEach(m => {
    const v = M[m.s.r] ? M[m.s.r][m.s.c] : null;
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) if (M[r]) M[r][c] = v;
  });
  return M;
}

/* Dónde empieza la tabla. Arriba puede haber logos, títulos y filas
   vacías: en la matriz de una empresa real el encabezado estaba en la
   fila 35. */
function mzFilaEncabezado(M) {
  for (let i = 0; i < Math.min(M.length, 60); i++) {
    const f = (M[i] || []).map(mzMay);
    if (f.some(x => x.includes('PELIGRO')) &&
        f.some(x => x.includes('PROCESO') || x.includes('ACTIVIDAD') || x.includes('TAREA')))
      return i;
  }
  return -1;
}

/* Cada campo se busca en la fila de detalle primero y en la de grupo
   después: el detalle es más específico. */
function mzMapear(M, hr) {
  const g = (M[hr] || []).map(mzMay), d = (M[hr+1] || []).map(mzMay);
  const idx = {}, usadas = {};
  MZ_CAMPOS.forEach(par => {
    const campo = par[0], claves = par[1];
    for (let k = 0; k < claves.length; k++) {
      const filas = [d, g];
      for (let ff = 0; ff < filas.length; ff++) {
        for (let i = 0; i < filas[ff].length; i++) {
          if (usadas[i]) continue;
          if (filas[ff][i] && filas[ff][i].includes(claves[k])) {
            idx[campo] = i; usadas[i] = true; return;
          }
        }
      }
    }
  });
  return idx;
}

function mzLeer(XLSX, buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const hojas = []; let filas = [];
  wb.SheetNames.forEach(nombre => {
    const M = mzCeldas(XLSX, wb.Sheets[nombre]);
    const hr = mzFilaEncabezado(M);
    const idx = hr < 0 ? {} : mzMapear(M, hr);
    // Sin columna de descripción no hay matriz: las hojas de referencia
    // —el catálogo de la norma, el historial de versiones— tienen
    // encabezados parecidos y ninguna fila útil.
    if (hr < 0 || idx.descripcion === undefined) {
      hojas.push({ nombre: nombre, filas: M.length, peligros: 0, tiene_tabla: false });
      return;
    }
    const propias = [];
    for (let i = hr + 2; i < M.length; i++) {
      const r = M[i] || [];
      if (!mzTxt(r[idx.descripcion])) continue;
      const f = { hoja: nombre, fila: i + 1 };
      Object.keys(idx).forEach(k => { f[k] = mzTxt(r[idx[k]]); });
      propias.push(f);
    }
    hojas.push({ nombre: nombre, filas: M.length, peligros: propias.length,
      tiene_tabla: true, encabezado_en: hr + 1,
      reconocidas: Object.keys(idx).length,
      faltantes: MZ_CAMPOS.map(c => c[0]).filter(c => idx[c] === undefined) });
    filas = filas.concat(propias);
  });
  return { hojas: hojas, filas: filas };
}

function mzResumen(filas) {
  const cuenta = campo => {
    const m = {};
    filas.forEach(f => { const v = f[campo] || '—'; m[v] = (m[v]||0) + 1; });
    return Object.keys(m).sort((a,b) => m[b]-m[a]).map(k => ({ valor:k, n:m[k] }));
  };
  return {
    peligros: filas.length,
    clasificaciones: cuenta('clasificacion').map(c => ({ valor:c.valor, n:c.n, norma:mzEsNorma(c.valor) })),
    zonas: cuenta('zona'),
    cargos: cuenta('cargos_expuestos'),
    sin_cargo: filas.filter(f => !f.cargos_expuestos).length,
    con_capacitacion: filas.filter(f => (f.control_admin||'').toLowerCase().indexOf('apacit') >= 0).length
  };
}


/* =================================================================
   LEER EL CATÁLOGO DESDE EL PROCEDIMIENTO DE LA EMPRESA

   Una empresa que lleva años haciendo esto no necesita inventar su
   catálogo: ya lo tiene escrito. Total QC lo tenía en tres libros
   distintos, y de ahí salió la forma de esta pantalla.

   TRES FORMAS DE HOJA, Y HAY QUE DISTINGUIRLAS

   1. El PROGRAMA del año: una fila por tema, con objetivo, temario,
      a quién va dirigida, modalidad, duración y —lo más valioso— a qué
      programa de riesgo responde. Esto es el catálogo.

   2. El REGISTRO de lo dictado: una fila por persona por evento. Acá
      el tema se repite cientos de veces. De esto sale UNA ficha por
      tema, no una por fila.

   3. Las CHARLAS diarias: igual que el registro, pero son charlas.

   LO QUE APRENDIMOS Y NO ERA OBVIO

   «Lo que se exige» y «lo que pasó» no son la misma lista. En Total QC
   sólo 11 de los 56 temas dictados en 2025 seguían en el plan 2026. Si
   los otros 45 no existen en el catálogo, 3.030 asistencias no tienen
   dónde aterrizar. Por eso entran, pero APAGADOS: existen y sostienen
   su historia, sin exigirle nada a nadie.
   ================================================================= */

/* Qué buscamos en una hoja de programa, y con qué palabras. */
const CT_CAMPOS = [
  ['titulo',          ['TEMA CHARLA', 'NOMBRE DE LA CAPACIT', 'TEMA']],
  ['objetivo',        ['OBJETIVO']],
  ['temario',         ['TEMAS']],
  ['programa_riesgo', ['PG RIESGO', 'SVE ASOC']],
  ['dirigida_a',      ['DIRIGIDA A', 'DIRIGIDO A']],
  ['modalidad',       ['MODALIDAD', 'METODOLOG']],
  ['horas',           ['DURACIÓN', 'DURACION']],
  ['frecuencia',      ['FRECU']],
  ['responsable',     ['RESPONSABLE']],
  ['persona',         ['APELLIDOS']]
];

/* De qué hoja viene, para el prefijo del código y para saber si lo que
   entra exige algo o sólo sostiene historia. */
function ctOrigen(nombreHoja) {
  const H = mzMay(nombreHoja);
  if (H.indexOf('HSEQ') >= 0)      return 'HSEQ';
  if (H.indexOf('INSP') >= 0)      return 'INSP';
  if (H.indexOf('QAQC') >= 0)      return 'QAQC';
  if (H.indexOf('FORMACI') >= 0)   return 'FORMACION';
  return null;
}

const CT_MODAL = { PRESENCIAL:'presencial', VIRTUAL:'virtual', MIXTA:'mixta' };
function ctModalidad(v) { return CT_MODAL[mzMay(v)] || null; }

/* «1 Hora», «1h», «2,5 horas» → número. Si no dice horas, no inventa. */
function ctHoras(v) {
  const m = mzTxt(v).match(/(\d+(?:[.,]\d+)?)\s*h/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/* «5 años o actualización de la norma» → 1825 días. Es la única hoja
   que declara cada cuánto se repite; las demás no dicen nada, y no
   decir nada NO es «no vence»: es una decisión que le falta a HSE. */
function ctVigencia(v) {
  const t = mzTxt(v).toLowerCase();
  const m = t.match(/(\d+)\s*a[\u00f1n]o/);
  if (m) return Number(m[1]) * 365;
  if (t.indexOf('anual') >= 0)     return 365;
  if (t.indexOf('semestral') >= 0) return 182;
  return null;
}

/* Los encabezados se reconocen por CÓMO EMPIEZAN, no por lo que
   contienen. Buscando «TEMA» adentro de la celda, la palabra SISTEMA
   daba positivo: una hoja que era sólo el texto del procedimiento
   —objetivo, alcance, criterios de evaluación, control de versiones—
   entró como si tuviera 17 capacitaciones, y una de ellas se llamaba
   «001». Un importador que se equivoca así no avisa: crea basura con
   cara de dato. */
function ctEmpieza(celda, clave) {
  return !!celda && celda.indexOf(clave) === 0;
}

function ctFilaEncabezado(M) {
  for (let i = 0; i < Math.min(M.length, 40); i++) {
    const f = (M[i] || []).map(mzMay);
    const tieneTema = f.some(x => ctEmpieza(x, 'TEMA') ||
                                  ctEmpieza(x, 'NOMBRE DE LA CAPACIT'));
    const tieneAlgo = f.some(x => ctEmpieza(x, 'OBJETIVO') ||
                                  ctEmpieza(x, 'APELLIDOS') ||
                                  ctEmpieza(x, 'DIRIGID'));
    if (tieneTema && tieneAlgo) return i;
  }
  return -1;
}

function ctMapear(M, hr) {
  const f = (M[hr] || []).map(mzMay), idx = {}, usadas = {};
  CT_CAMPOS.forEach(par => {
    const campo = par[0], claves = par[1];
    for (let k = 0; k < claves.length; k++) {
      for (let i = 0; i < f.length; i++) {
        if (usadas[i]) continue;
        if (ctEmpieza(f[i], claves[k])) { idx[campo] = i; usadas[i] = true; return; }
      }
    }
  });
  return idx;
}

/* Lee un libro entero. No decide nada: devuelve qué encontró en cada
   hoja para que una persona lo confirme. */
function ctLeer(XLSX, buf, archivo) {
  const wb = XLSX.read(buf, { type: 'array' });
  const hojas = [], filas = [];

  wb.SheetNames.forEach(nombre => {
    const M = mzCeldas(XLSX, wb.Sheets[nombre]);
    const hr = ctFilaEncabezado(M);
    const idx = hr < 0 ? {} : ctMapear(M, hr);

    if (hr < 0 || idx.titulo === undefined) {
      hojas.push({ archivo: archivo, nombre: nombre, clase: 'ignorada', temas: 0 });
      return;
    }

    // Una hoja con columna de personas es un REGISTRO de lo dictado:
    // el tema se repite una vez por asistente. Sin ella, es el PROGRAMA.
    const esRegistro = idx.persona !== undefined;
    const org = ctOrigen(nombre);
    const esCharla = mzMay((M[hr]||[])[idx.titulo]).indexOf('CHARLA') >= 0;
    const origen = esCharla ? 'CHARLA' : (esRegistro ? 'HIST' : (org || 'PROGRAMA'));
    const clase  = esCharla ? 'charlas' : (esRegistro ? 'registro' : 'programa');

    const vistos = {}, propias = [];
    for (let i = hr + 1; i < M.length; i++) {
      const r = M[i] || [];
      const t = mzTxt(r[idx.titulo]);
      if (!t || mzMay(t) === 'ANALISIS' || mzMay(t) === 'TEMA') continue;
      const k = mzMay(t);
      if (vistos[k]) continue;      // el mismo tema repetido en la hoja
      vistos[k] = 1;
      const g = c => idx[c] !== undefined ? mzTxt(r[idx[c]]) : '';
      propias.push({
        origen: origen,
        titulo: t,
        objetivo: g('objetivo'),
        temario: g('temario'),
        programa_riesgo: g('programa_riesgo'),
        dirigida_a: g('dirigida_a'),
        responsable: g('responsable'),
        frecuencia: g('frecuencia'),
        modalidad: idx.modalidad !== undefined ? ctModalidad(r[idx.modalidad]) : null,
        horas: idx.horas !== undefined ? ctHoras(r[idx.horas]) : null,
        vigencia_dias: idx.frecuencia !== undefined ? ctVigencia(r[idx.frecuencia]) : null,
        eje: (origen === 'INSP' || origen === 'QAQC' || origen === 'FORMACION') ? 'tecnica' : 'hse',
        tipo: esCharla ? 'charla' : (origen === 'FORMACION' ? 'curso_externo' : 'capacitacion'),
        certificable: !esCharla,
        // Lo que ya no está en el plan del año entra apagado: sostiene
        // su historia y no le exige nada a nadie.
        activo: clase === 'programa'
      });
    }
    hojas.push({ archivo: archivo, nombre: nombre, clase: clase, origen: origen,
                 temas: propias.length, filas: M.length,
                 columnas: Object.keys(idx).length });
    propias.forEach(p => filas.push(p));
  });

  return { hojas: hojas, filas: filas };
}

/* Junta varios libros en una sola lista. El plan del año manda: si un
   tema está en el programa Y en el registro, la ficha se crea activa y
   con los datos del programa, no del registro. */
function ctUnir(lecturas) {
  const orden = { HSEQ:1, INSP:1, QAQC:1, FORMACION:1, PROGRAMA:1, HIST:2, CHARLA:3 };
  const todas = [];
  lecturas.forEach(L => L.filas.forEach(f => todas.push(f)));
  todas.sort((a, b) => (orden[a.origen]||9) - (orden[b.origen]||9));
  const visto = {}, out = [];
  todas.forEach(f => {
    const k = llano(f.titulo);
    if (!k || visto[k]) return;
    visto[k] = 1; out.push(f);
  });
  return out;
}


/* =================================================================
   LA PANTALLA
   ================================================================= */
async function matriz(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  cargando(el, 'Mirando la matriz…');

  let D, E = null, L = null, R = null, tab = 1, abierto = null, buscaDest = '';
  try { D = await rpc('cap_matriz_datos'); } catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  async function traerE() { if (!E) E = await rpc('cap_expuestos_datos'); return E; }

  function toast(t) {
    const d = document.createElement('div');
    d.className = 'kc-toast'; d.textContent = t;
    (el.querySelector('.kc-wide') || el).appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  async function recargar(msg) {
    D = await rpc('cap_matriz_datos'); E = null; L = null; R = null;
    await pintar(); if (msg) toast(msg);
  }

  /* ------------------------------------------------------- armazón */
  async function pintar() {
    const m = D.matriz || {};
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      ${opt.volver ? '<button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver</button>' : ''}
      <div style="padding:${opt.volver?'0':'24px'} 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:16px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">MATRIZ DE PELIGROS · GTC 45</div>
        <h1 style="font-size:28px;font-weight:700">${D.hay_matriz
          ? esc(m.codigo_doc || 'Matriz cargada') + (m.version ? ' · v' + esc(m.version) : '')
          : 'Todavía no hay matriz'}</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px">${D.hay_matriz
          ? D.peligros + ' peligros' + (m.fecha_version ? ' · versión del ' + fecha(m.fecha_version) : '')
          : 'Sin ella, el plan de formación de cada cargo lo decide alguien de memoria.'}</div></div>

      <div class="kc-tabs" style="margin:0 0 20px">
        <button class="kc-tab" data-t="1" aria-selected="${tab===1}">La matriz</button>
        <button class="kc-tab" data-t="2" aria-selected="${tab===2}">Cargos expuestos${
          D.expuestos_sin_resolver ? ' · ' + D.expuestos_sin_resolver : ''}</button>
      </div>
      <div id="kc-v"><div class="kc-carga">Cargando…</div></div></div>`;

    el.querySelectorAll('.kc-tab').forEach(b => b.onclick = () => {
      if (+b.dataset.t !== tab) { tab = +b.dataset.t; pintar(); }
    });
    const bv = el.querySelector('#kc-volver');
    if (bv) bv.onclick = () => opt.volver();

    const v = el.querySelector('#kc-v');
    if (tab === 1) v.innerHTML = L ? vRevision() : vEstado();
    else { await traerE(); v.innerHTML = vExpuestos(); }
    enganchar(v);
  }

  /* --------------------------------------------- 1a · sin archivo */
  function vEstado() {
    const clas = D.por_clasificacion || {}, zonas = D.por_zona || {};
    const sinPel = D.cargos_sin_peligros || [];

    return `${D.hay_matriz ? `
      <div class="kc-grid3">
        <div class="kc-kpi"><b>${D.peligros}</b><span>peligros</span></div>
        <div class="kc-kpi ${D.expuestos_sin_resolver ? 'mal':'ok'}">
          <b>${D.expuestos_sin_resolver}</b><span>cargos expuestos sin resolver</span></div>
        <div class="kc-kpi ${D.peligros_sin_capacitacion ? 'mal':'ok'}">
          <b>${D.peligros_sin_capacitacion}</b><span>peligros sin capacitación</span></div>
      </div>

      ${sinPel.length ? `<div class="kc-cent" style="background:var(--kc-was);margin-top:14px">
        <div class="b" style="background:var(--kc-wa)">${sinPel.length}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-wa)">
          ${sinPel.length} cargo(s) no aparecen en ningún peligro</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${esc(sinPel.slice(0,8).join(' · '))}${
          sinPel.length > 8 ? ' y ' + (sinPel.length-8) + ' más' : ''}.
        O están escondidos detrás de otro nombre en la matriz, o de verdad no tienen peligros
        identificados. Lo segundo se lo tiene que responder HSE a sí mismo.</div></div></div>` : ''}

      ${(D.fuera_de_la_norma||[]).length ? `<div class="kc-cent mal" style="margin-top:10px">
        <div class="b">!</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">Clasificaciones que no son GTC 45</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${esc(D.fuera_de_la_norma.join(' · '))}</div></div></div>` : ''}

      <div class="kc-dos2" style="margin-top:18px">
        <div><h3 class="kc-h3">Por clasificación</h3>${
          Object.keys(clas).sort((a,b)=>clas[b]-clas[a]).map(k =>
            `<div class="kc-lin"><span>${esc(k)}</span><b>${clas[k]}</b></div>`).join('')}</div>
        <div><h3 class="kc-h3">Por zona</h3>${
          Object.keys(zonas).sort((a,b)=>zonas[b]-zonas[a]).map(k =>
            `<div class="kc-lin"><span>${esc(k)}</span><b>${zonas[k]}</b></div>`).join('')}</div>
      </div>` : `
      <p class="kc-nota">Subí el Excel de la matriz tal como está. No hace falta reordenar
      columnas ni separar hojas: la pantalla resuelve las celdas combinadas, encuentra la fila de
      encabezado aunque esté en la 35, y busca cada columna por su nombre.</p>`}

      <div class="kc-cent" style="background:var(--kc-card2);margin-top:22px">
        <div class="b" style="background:var(--kc-ac)">↑</div><div style="flex:1">
        <div class="kc-tt" style="font-size:15px">${D.hay_matriz ? 'Reemplazar la matriz' : 'Cargar la matriz'}</div>
        <div style="font-size:13px;color:var(--kc-ink2)">${D.hay_matriz
          ? 'La anterior deja de ser la vigente pero no se borra: es la justificación escrita de por qué se le exigió una capacitación a alguien.'
          : 'El archivo no sale de tu equipo: se lee acá y al servidor viaja sólo el resultado.'}</div>
        <div style="margin-top:10px">
          <input type="file" id="kc-arch" accept=".xlsx,.xlsm,.xls"
                 style="font-size:13.5px;max-width:100%"></div></div></div>`;
  }

  /* --------------------------------------- 1b · archivo ya leído */
  function vRevision() {
    const conPel = L.hojas.filter(h => h.peligros > 0);
    const aCorregir = R.clasificaciones.filter(c => c.norma &&
      c.valor !== c.valor.normalize('NFC') ? false : false);
    const fuera = R.clasificaciones.filter(c => !c.norma);
    const faltan = conPel.reduce((a,h) => a.concat(h.faltantes||[]), []);

    return `
      <div class="kc-grid3">
        <div class="kc-kpi"><b>${R.peligros}</b><span>peligros encontrados</span></div>
        <div class="kc-kpi"><b>${conPel.length}</b><span>hojas con peligros</span></div>
        <div class="kc-kpi"><b>${R.cargos.length}</b><span>cargos expuestos distintos</span></div>
      </div>

      <h3 class="kc-h3" style="margin-top:20px">Las hojas del archivo</h3>
      <div class="kc-sc"><table><thead><tr><th>Hoja</th><th class="n">Filas</th>
        <th class="n">Peligros</th><th>Columnas reconocidas</th></tr></thead><tbody>
        ${L.hojas.map(h => `<tr class="${h.peligros ? '' : 'kc-off'}">
          <td class="k">${esc(h.nombre)}</td><td class="n">${h.filas}</td>
          <td class="n">${h.peligros || '—'}</td>
          <td>${h.tiene_tabla
            ? h.reconocidas + ' de ' + MZ_CAMPOS.length +
              (h.faltantes.length ? ` <span class="kc-mch b">falta ${esc(h.faltantes.join(', '))}</span>` : '')
            : '<span style="color:var(--kc-ink3)">hoja de referencia, sin peligros</span>'}</td>
        </tr>`).join('')}
      </tbody></table></div>

      <h3 class="kc-h3" style="margin-top:22px">Clasificaciones encontradas</h3>
      <p class="kc-nota">GTC 45 define siete. Las que están bien escritas entran tal cual; las que
      difieren sólo en tildes se corrigen solas. <b>Lo que no sea ninguna de las siete se guarda
      como está y queda marcado</b> — no se inventa una equivalencia.</p>
      <div class="kc-chips2">${R.clasificaciones.map(c =>
        `<span class="kc-chip3 ${c.norma ? 'ok':'mal'}">${esc(c.valor)} · ${c.n}</span>`).join('')}</div>
      ${fuera.length ? `<p class="kc-nota" style="color:var(--kc-cr)">
        ${fuera.length} clasificación(es) fuera de la norma. Se van a importar igual, marcadas.</p>` : ''}

      <h3 class="kc-h3" style="margin-top:22px">Cargos expuestos que trae la matriz</h3>
      <p class="kc-nota">Después de importar hay que decir qué es cada uno. Acá se ve cuánto
      arrastra cada texto.</p>
      <div class="kc-sc"><table><thead><tr><th>Texto en la matriz</th>
        <th class="n">Peligros</th></tr></thead><tbody>
        ${R.cargos.map(c => `<tr><td class="k">${esc(c.valor)}</td>
          <td class="n">${c.n}</td></tr>`).join('')}
      </tbody></table></div>
      ${R.sin_cargo ? `<p class="kc-nota" style="color:var(--kc-cr)">
        ${R.sin_cargo} peligro(s) no dicen a quién exponen. Van a entrar igual, pero no le van a
        exigir formación a nadie hasta que la matriz lo diga.</p>` : ''}

      <p class="kc-nota" style="margin-top:16px"><b>${R.con_capacitacion}</b> de ${R.peligros}
      peligros mencionan capacitación en sus controles administrativos, pero ninguno dice cuál.
      Ese es el paso siguiente.</p>

      <div class="kc-row" style="margin:20px 0 10px;gap:9px">
        <button class="kc-b2" id="kc-cancelar" style="flex:0 0 auto">Cancelar</button>
        <button class="kc-btn" id="kc-importar" style="flex:1 1 auto">
          Importar ${R.peligros} peligro(s)</button></div>

      <label style="display:flex;gap:9px;align-items:flex-start;font-size:13px;color:var(--kc-ink2)">
        <input type="checkbox" id="kc-conf" style="margin-top:3px">
        <span>Revisé las hojas y las clasificaciones de arriba${D.hay_matriz
          ? ', y entiendo que esto reemplaza la matriz vigente' : ''}.</span></label>`;
  }

  /* ---------------------------------------- 2 · cargos expuestos */
  function vExpuestos() {
    const exp = E.expuestos || [];
    if (!exp.length) return `<p class="kc-nota">Todavía no hay ningún «cargo expuesto»:
      aparecen cuando se importa la matriz.</p>`;

    const pend = exp.filter(e => e.clase === 'sin_definir').length;

    /* Una tarjeta abierta por vez. Con nueve textos y treinta y pico de
       cargos en cada lista, tenerlas todas abiertas convierte la pantalla
       en algo por donde hay que scrollear a ciegas. */
    return `<p class="kc-nota">La matriz no dice cargos: dice textos. Algunos son un cargo, otros
    son varios juntos, otros no son personal de la empresa. <b>Esto no se puede adivinar</b> —
    «Auxiliares END» y «Auxiliar de Inspección» no comparten una sola palabra y son el mismo
    cargo. Por eso lo decidís vos, de a uno.</p>

    ${pend ? `<div class="kc-cent" style="background:var(--kc-was)">
      <div class="b" style="background:var(--kc-wa)">${pend}</div><div>
      <div class="kc-tt" style="font-size:15px;color:var(--kc-wa)">Faltan ${pend} de ${exp.length}</div>
      <div style="font-size:13px;color:var(--kc-ink2)">Mientras alguno quede sin definir, esos
      peligros no le exigen formación a nadie.</div></div></div>` : ''}

    ${exp.map(e => e.id === abierto ? tarjetaAbierta(e) : tarjetaCerrada(e)).join('')}`;
  }

  const CLASES = [
    ['cargo',      'Es un cargo del padrón'],
    ['varios',     'Son varios cargos en una celda'],
    ['colectivo',  'Es un colectivo — aplica a varios'],
    ['tercero',    'No es personal propio (proveedor, visitante, vecino)'],
    ['ignorar',    'Dejarlo fuera del cálculo'],
    ['sin_definir','Sin definir todavía']
  ];
  const nombreClase = c => (CLASES.find(x => x[0] === c) || ['','—'])[1];

  function tarjetaCerrada(e) {
    const listo = e.clase !== 'sin_definir';
    const resumen = e.clase === 'tercero' ? 'No es personal propio'
      : e.clase === 'ignorar' ? 'Fuera del cálculo'
      : e.destinos.length ? e.destinos.map(d => esc(d.nombre)).join(' · ')
      : nombreClase(e.clase);
    return `<div class="kc-exp ${listo ? 'listo' : 'pend'}">
      <div class="top">
        <div style="flex:1 1 auto;min-width:0">
          <div class="kc-tt" style="font-size:15.5px">${esc(e.texto)}</div>
          <div class="kc-cd" style="margin-top:3px">${e.peligros} peligro(s) dependen de esto</div>
          <div style="font-size:13.5px;margin-top:5px;color:${listo ? 'var(--kc-ok)' : 'var(--kc-wa)'}">
            ${listo ? '✓ ' + resumen : 'Sin definir'}</div>
        </div>
        <button class="kc-mini${listo ? '' : ' p'}" data-abrir="${e.id}">
          ${listo ? 'Cambiar' : 'Resolver'}</button>
      </div></div>`;
  }

  function tarjetaAbierta(e) {
    return `<div class="kc-exp abierta">
      <div class="top">
        <div style="flex:1 1 auto;min-width:0">
          <div class="kc-tt" style="font-size:15.5px">${esc(e.texto)}</div>
          <div class="kc-cd" style="margin-top:3px">${e.peligros} peligro(s) dependen de esto</div>
        </div>
        <select class="kc-in" data-clase="${e.id}" style="max-width:290px">
          ${CLASES.map(c => `<option value="${c[0]}" ${e.clase===c[0]?'selected':''}>${c[1]}</option>`).join('')}
        </select>
      </div>
      <div class="dest" data-dest="${e.id}"></div>
      <div class="kc-row" style="margin-top:12px;gap:8px;justify-content:flex-end">
        <button class="kc-b2" data-cerrar="1" style="flex:0 0 auto">Cancelar</button>
        <button class="kc-btn" data-guardar="${e.id}" style="flex:0 0 auto;width:auto;padding:0 22px">
          Guardar y cerrar</button>
      </div></div>`;
  }

  function pintarDestinos(id) {
    const e = (E.expuestos || []).find(x => x.id === id);
    const box = el.querySelector(`[data-dest="${id}"]`);
    const sel = el.querySelector(`[data-clase="${id}"]`);
    if (!e || !box || !sel) return;
    const clase = sel.value;

    if (['tercero','ignorar','sin_definir'].indexOf(clase) >= 0) {
      box.innerHTML = `<p class="kc-nota" style="text-align:left;margin:10px 0 0">${
        clase === 'tercero'
          ? 'No hace falta elegir a nadie: esos peligros quedan registrados pero no le exigen formación a ningún cargo.'
          : clase === 'ignorar'
          ? 'Queda fuera del cálculo.'
          : 'Elegí arriba qué es este texto.'}</p>`;
      return;
    }

    const sug = {}; (e.sugerencias || []).forEach(s2 => { sug[s2.cargo_id] = s2.palabras; });
    const yaC = {}; (e.destinos || []).forEach(d => { if (d.cargo_id) yaC[d.cargo_id] = 1; });
    const yaR = {}; (e.destinos || []).forEach(d => { if (d.rol_id) yaR[d.rol_id] = 1; });

    const q = buscaDest.trim().toLowerCase();
    const pasa = n => !q || n.toLowerCase().indexOf(q) >= 0;
    const cargos = (E.cargos || []).slice()
      .sort((a, b) => (sug[b.id]||0) - (sug[a.id]||0) || a.nombre.localeCompare(b.nombre))
      .filter(c => pasa(c.nombre) || yaC[c.id]);
    const comites = (E.comites || []).filter(r => pasa(r.nombre) || yaR[r.id]);

    box.innerHTML = `<label>Marcá a quién corresponde</label>
      <input type="search" class="kc-in" id="kc-bd" placeholder="Buscar un cargo…"
             value="${esc(buscaDest)}" autocomplete="off" style="width:100%;margin-bottom:6px">
      <div class="kc-lista">
        ${cargos.length || comites.length ? '' :
          '<p class="kc-nota" style="text-align:left;margin:6px 0">Ningún cargo con ese texto.</p>'}
        ${cargos.map(c => `<label class="kc-dst">
          <input type="checkbox" class="kdc-${id}" value="${c.id}" ${yaC[c.id]?'checked':''}>
          <span>${esc(c.nombre)}${sug[c.id] ? ' <span class="kc-mch">sugerido</span>' : ''}</span>
        </label>`).join('')}
        ${comites.map(r => `<label class="kc-dst">
          <input type="checkbox" class="kdr-${id}" value="${r.id}" ${yaR[r.id]?'checked':''}>
          <span>${esc(r.nombre)} <span class="kc-mch">comité</span></span>
        </label>`).join('')}
      </div>
      <div id="kc-cuenta-dest" class="kc-cd" style="margin-top:6px"></div>`;

    const contar = () => {
      const n = box.querySelectorAll('input[type=checkbox]:checked').length;
      const c = box.querySelector('#kc-cuenta-dest');
      if (c) c.textContent = n === 0 ? 'Todavía no marcaste ninguno'
                           : n === 1 ? '1 marcado' : n + ' marcados';
    };
    box.querySelectorAll('input[type=checkbox]').forEach(x => x.onchange = contar);
    contar();

    const bd = box.querySelector('#kc-bd');
    if (bd) bd.oninput = () => {
      const cur = bd.selectionStart;
      buscaDest = bd.value;
      pintarDestinos(id);
      const nn = el.querySelector('#kc-bd');
      if (nn) { nn.focus(); nn.setSelectionRange(cur, cur); }
    };
  }

  /* ------------------------------------------------------ eventos */
  function enganchar(v) {
    if (D.puede_editar === false) v.querySelectorAll('button:not(.kc-tab)').forEach(b => b.remove());

    const arch = v.querySelector('#kc-arch');
    if (arch) arch.onchange = async () => {
      const f = arch.files && arch.files[0];
      if (!f) return;
      cargando(el, 'Abriendo el archivo…');
      try {
        const XLSX = await cargarXLSX();
        const buf = await f.arrayBuffer();
        L = mzLeer(XLSX, new Uint8Array(buf));
        R = mzResumen(L.filas);
        if (!R.peligros) {
          L = null; R = null;
          await pintar();
          return alert('No encontré ninguna fila de peligro en ese archivo.\n\n' +
            'La pantalla busca una hoja con una columna de descripción del peligro. ' +
            'Si el archivo la tiene con otro nombre, decímelo y la agrego.');
        }
        await pintar();
      } catch (e) { await pintar(); alert(e.message); }
    };

    const bc = v.querySelector('#kc-cancelar');
    if (bc) bc.onclick = () => { L = null; R = null; pintar(); };

    const bi = v.querySelector('#kc-importar');
    if (bi) bi.onclick = async () => {
      if (!(v.querySelector('#kc-conf') || {}).checked)
        return alert('Marcá la casilla de abajo cuando hayas revisado las hojas y las clasificaciones.');
      bi.disabled = true; bi.textContent = 'Importando…';
      try {
        const r = await rpc('cap_matriz_importar', {
          p_matriz: { codigo_doc: null, version: null, fecha_version: null, metodologia: 'GTC 45' },
          p_filas: L.filas });
        tab = 2;
        await recargar(r.aviso);
      } catch (e) {
        bi.disabled = false; bi.textContent = 'Importar ' + R.peligros + ' peligro(s)';
        alert(e.message);
      }
    };

    // cargos expuestos: una tarjeta abierta por vez
    v.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      abierto = b.dataset.abrir; buscaDest = '';
      v.innerHTML = vExpuestos(); enganchar(v);
      const card = v.querySelector('.kc-exp.abierta');
      if (card) card.scrollIntoView({ block: 'nearest' });
    });
    v.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = () => {
      abierto = null; buscaDest = '';
      v.innerHTML = vExpuestos(); enganchar(v);
    });
    v.querySelectorAll('[data-clase]').forEach(s2 => {
      pintarDestinos(s2.dataset.clase);
      s2.onchange = () => { buscaDest = ''; pintarDestinos(s2.dataset.clase); };
    });
    v.querySelectorAll('[data-guardar]').forEach(b => b.onclick = async () => {
      const id = b.dataset.guardar;
      const clase = (v.querySelector(`[data-clase="${id}"]`) || {}).value;
      const dest = [];
      v.querySelectorAll('.kdc-' + id + ':checked').forEach(x => dest.push({ cargo_id: x.value }));
      v.querySelectorAll('.kdr-' + id + ':checked').forEach(x => dest.push({ rol_id: x.value }));
      b.disabled = true; b.textContent = 'Guardando…';
      try {
        const r = await rpc('cap_expuesto_mapear', {
          p_expuesto: id, p_clase: clase, p_destinos: dest });
        abierto = null; buscaDest = '';
        await recargar(r.aviso);
      } catch (e2) {
        b.disabled = false; b.textContent = 'Guardar y cerrar'; alert(e2.message);
      }
    });
  }

  await pintar();
}

/* =================================================================
   LEER LAS ASISTENCIAS DE UN REGISTRO

   Una hoja de registro tiene una fila por PERSONA por evento: el mismo
   tema repetido cientos de veces. De ahí no sale catálogo —eso ya se
   hizo— sino la historia: quién, qué, cuándo, con qué nota.

   La fecha es el dato que no se puede perder: de ella sale el
   vencimiento. Por eso se lee con cellDates y se rechaza la fila que
   no la tenga, en vez de inventarle una.
   ================================================================= */
const AS_CAMPOS = [
  ['capacitacion', ['TEMA CHARLA', 'NOMBRE DE LA CAPACIT', 'TEMA']],
  ['persona',      ['APELLIDOS']],
  ['fecha',        ['FECHA']],
  ['nota',         ['PUNTAJE', 'NOTA', 'CALIFICA']],
  ['horas',        ['DURACIÓN', 'DURACION']]
];

function asMapear(M, hr) {
  const f = (M[hr] || []).map(mzMay), idx = {}, usadas = {};
  AS_CAMPOS.forEach(par => {
    const campo = par[0], claves = par[1];
    for (let k = 0; k < claves.length; k++) {
      for (let i = 0; i < f.length; i++) {
        if (usadas[i]) continue;
        if (ctEmpieza(f[i], claves[k])) { idx[campo] = i; usadas[i] = true; return; }
      }
    }
  });
  return idx;
}

/* AAAA-MM-DD sin pasar por UTC: toISOString() sobre una fecha local
   corre un día para atrás en Colombia y arruinaría el vencimiento. */
function asFecha(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') +
           '-' + String(v.getDate()).padStart(2, '0');
  }
  const t = mzTxt(v);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  return '';
}

function asNum(v) {
  const t = mzTxt(v).replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function asLeer(XLSX, buf, archivo) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const hojas = [], filas = [];

  wb.SheetNames.forEach(nombre => {
    const M = mzCeldas(XLSX, wb.Sheets[nombre]);
    const hr = ctFilaEncabezado(M);
    const idx = hr < 0 ? {} : asMapear(M, hr);

    // Sin columna de personas no es un registro de asistencia: es otra
    // cosa —el plan del año, una hoja de referencia— y no se toca.
    if (hr < 0 || idx.persona === undefined || idx.capacitacion === undefined) {
      hojas.push({ archivo: archivo, nombre: nombre, clase: 'ignorada', filas: 0 });
      return;
    }

    let sinFecha = 0;
    const propias = [];
    for (let i = hr + 1; i < M.length; i++) {
      const r = M[i] || [];
      const cap = mzTxt(r[idx.capacitacion]), per = mzTxt(r[idx.persona]);
      if (!cap || !per) continue;
      const fec = idx.fecha !== undefined ? asFecha(r[idx.fecha]) : '';
      if (!fec) { sinFecha++; continue; }
      propias.push({
        capacitacion: cap, persona: per, fecha: fec,
        nota:  idx.nota  !== undefined ? asNum(r[idx.nota])  : null,
        horas: idx.horas !== undefined ? asNum(r[idx.horas]) : null
      });
    }
    hojas.push({ archivo: archivo, nombre: nombre, clase: 'registro',
                 filas: propias.length, sin_fecha: sinFecha,
                 con_nota: propias.filter(x => x.nota != null).length });
    propias.forEach(x => filas.push(x));
  });

  return { hojas: hojas, filas: filas };
}


/* =================================================================
   PANTALLA · IMPORTAR EL CATÁLOGO

   El archivo no sale del equipo: se lee acá, y al servidor viaja sólo
   el resultado. Y antes de escribir nada se hace un SIMULACRO: el
   servidor devuelve qué crearía y qué reusaría, sin tocar un dato.
   Recién si una persona lo aprueba, se importa.
   ================================================================= */
async function impCatalogo(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  let HOJAS = null, FILAS = null, PLAN = null, leyendo = false;

  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  function toast(t) {
    const d = document.createElement('div');
    d.className = 'kc-toast'; d.textContent = t;
    (el.querySelector('.kc-wide') || el).appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  const CLASE = {
    programa: ['Plan del año',   'Entra activo: esto exige, vence y bloquea.'],
    registro: ['Registro de lo dictado', 'Entra apagado: sostiene la historia y no exige nada.'],
    charlas:  ['Charlas diarias', 'Entran apagadas: el pasaporte no cuenta charlas.'],
    ignorada: ['Sin tabla de temas', 'No se reconoció ninguna columna de tema. Se saltea.']
  };

  function pintar() {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      ${opt.volver ? '<button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver</button>' : ''}
      <div style="padding:${opt.volver?'0':'24px'} 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:16px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">CATÁLOGO · IMPORTAR</div>
        <h1 style="font-size:28px;font-weight:700">El catálogo de tu empresa</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px;max-width:72ch">
          Si ya tenés un programa de capacitación escrito, no hace falta cargarlo a mano.
          Subí el archivo tal como está.</div></div>
      <div id="kc-v"></div></div>`;

    const bv = el.querySelector('#kc-volver');
    if (bv) bv.onclick = () => opt.volver();
    const v = el.querySelector('#kc-v');
    v.innerHTML = leyendo ? '<div class="kc-carga">Leyendo el archivo…</div>'
                : PLAN ? vPlan() : HOJAS ? vLectura() : vPedir();
    enganchar(v);
  }

  /* ---------------------------------------------------- 1. el archivo */
  function vPedir() {
    return `<p class="kc-nota" style="text-align:left;max-width:74ch">
      Podés subir varios libros a la vez: el programa del año, el consolidado de lo
      dictado y las charlas. La pantalla los distingue sola — una hoja con una columna
      de personas es un registro de asistencia, no un plan.</p>

      <div class="kc-cent" style="background:var(--kc-card2);margin-top:16px">
        <div class="b" style="background:var(--kc-ac)">↑</div><div style="flex:1">
        <div class="kc-tt" style="font-size:15px">Elegí uno o varios archivos</div>
        <div style="font-size:13px;color:var(--kc-ink2)">No salen de tu equipo: se leen
          acá y al servidor viaja sólo la lista de temas.</div>
        <div style="margin-top:10px">
          <input type="file" id="kc-arch" accept=".xlsx,.xlsm,.xls" multiple
                 style="font-size:13.5px;max-width:100%"></div></div></div>`;
  }

  /* ------------------------------------------- 2. qué se leyó, por hoja */
  function vLectura() {
    const porOrigen = {};
    FILAS.forEach(f => { porOrigen[f.origen] = (porOrigen[f.origen] || 0) + 1; });
    const activas = FILAS.filter(f => f.activo).length;

    return `<div class="kc-grid3">
        <div class="kc-kpi"><b>${FILAS.length}</b><span>temas distintos</span></div>
        <div class="kc-kpi ok"><b>${activas}</b><span>entran activos</span></div>
        <div class="kc-kpi"><b>${FILAS.length - activas}</b><span>entran apagados</span></div>
      </div>

      <h3 class="kc-h3" style="margin-top:20px">Qué encontré en cada hoja</h3>
      <div class="kc-sc"><table><thead><tr><th>Archivo</th><th>Hoja</th>
        <th>Qué es</th><th class="n">Temas</th></tr></thead><tbody>${
        HOJAS.map(h => `<tr${h.clase === 'ignorada' ? ' style="opacity:.5"' : ''}>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(h.archivo)}</td>
          <td class="k">${esc(h.nombre)}</td>
          <td><b>${esc((CLASE[h.clase] || ['—'])[0])}</b>
            <div class="kc-cd" style="margin-top:2px">${esc((CLASE[h.clase] || ['','—'])[1])}</div></td>
          <td class="n">${h.temas}</td></tr>`).join('')}</tbody></table></div>

      <h3 class="kc-h3" style="margin-top:18px">De dónde viene cada uno</h3>
      ${Object.keys(porOrigen).sort().map(k =>
        `<div class="kc-lin"><span>${esc(k)}</span><b>${porOrigen[k]}</b></div>`).join('')}

      <div class="kc-row" style="margin-top:18px">
        <button class="kc-btn" id="kc-sim" style="flex:0 0 auto;width:auto;padding:0 22px">
          Ver qué pasaría</button>
        <button class="kc-mini" id="kc-otro">Elegir otros archivos</button></div>
      <p class="kc-nota" style="text-align:left;margin-top:10px">Todavía no se guardó nada.</p>`;
  }

  /* ----------------------------------------- 3. el simulacro del servidor */
  function vPlan() {
    const nuevas = PLAN.det_nuevas || [], reuso = PLAN.det_reusadas || [];
    const sinVig = FILAS.filter(f => f.activo && !f.vigencia_dias).length;

    return `<div class="kc-grid3">
        <div class="kc-kpi ok"><b>${PLAN.nuevas}</b><span>se crearían</span></div>
        <div class="kc-kpi"><b>${PLAN.reusadas}</b><span>ya existen, se completan</span></div>
        <div class="kc-kpi"><b>${PLAN.repetidas}</b><span>repetidas en el archivo</span></div>
      </div>

      ${sinVig ? `<div class="kc-cent" style="background:var(--kc-was);margin-top:14px">
        <div class="b" style="background:var(--kc-wa)">${sinVig}</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-wa)">
          ${sinVig} no dicen cada cuánto se repiten</div>
        <div style="font-size:13px;color:var(--kc-ink2)">El archivo trae la duración pero no la
          vigencia. Sin vigencia una capacitación no vence nunca: hecha una vez, queda al día
          para siempre. Se puede importar igual y ponérsela después, capacitación por
          capacitación — pero es una decisión de HSE, no del importador.</div></div></div>` : ''}

      ${reuso.length ? `<h3 class="kc-h3" style="margin-top:18px">Ya existen · se completan los campos vacíos</h3>
        <div class="kc-sc"><table><thead><tr><th>Código</th><th>Capacitación</th>
          <th>Origen</th></tr></thead><tbody>${reuso.map(r => `<tr>
          <td class="k">${esc(r.codigo)}</td><td class="tit">${esc(r.titulo)}</td>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(r.origen||'')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}

      <h3 class="kc-h3" style="margin-top:18px">Se crearían ${nuevas.length}</h3>
      <div class="kc-sc" style="max-height:420px;overflow-y:auto"><table><thead><tr>
        <th>Capacitación</th><th>Origen</th><th>Tipo</th><th>Entra</th></tr></thead><tbody>${
        nuevas.map(n => `<tr>
          <td class="tit">${esc(n.titulo)}</td>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(n.origen||'')}</td>
          <td style="font-size:13px">${esc(n.tipo||'')}</td>
          <td><span class="kc-tag ${n.activa ? 'si' : 'g'}">${n.activa ? 'Activa' : 'Apagada'}</span></td>
        </tr>`).join('')}</tbody></table></div>

      <div class="kc-row" style="margin-top:18px">
        <button class="kc-btn" id="kc-imp" style="flex:0 0 auto;width:auto;padding:0 22px">
          Importar ${PLAN.nuevas} capacitación(es)</button>
        <button class="kc-mini" id="kc-otro">Empezar de nuevo</button></div>
      <p class="kc-nota" style="text-align:left;margin-top:10px">Hasta que aprietes Importar,
        no se guardó nada.</p>`;
  }

  /* ------------------------------------------------------------ eventos */
  function enganchar(v) {
    const arch = v.querySelector('#kc-arch');
    if (arch) arch.onchange = async () => {
      const fs = Array.prototype.slice.call(arch.files || []);
      if (!fs.length) return;
      leyendo = true; pintar();
      try {
        const XLSX = await cargarXLSX();
        const lecturas = [];
        for (let i = 0; i < fs.length; i++) {
          const buf = await fs[i].arrayBuffer();
          lecturas.push(ctLeer(XLSX, new Uint8Array(buf), fs[i].name));
        }
        HOJAS = []; lecturas.forEach(L => L.hojas.forEach(h => HOJAS.push(h)));
        FILAS = ctUnir(lecturas);
        if (!FILAS.length) {
          HOJAS = null; FILAS = null;
          toast('No encontré ninguna hoja con una columna de tema. ¿Es el archivo correcto?');
        }
      } catch (e) {
        HOJAS = null; FILAS = null; toast(e.message);
      }
      leyendo = false; pintar();
    };

    const sim = v.querySelector('#kc-sim');
    if (sim) sim.onclick = async () => {
      sim.disabled = true; sim.textContent = 'Consultando…';
      try {
        PLAN = await rpc('cap_catalogo_importar', { p_filas: FILAS, p_confirmar: false });
      } catch (e) { alert(e.message); }
      sim.disabled = false; pintar();
    };

    const imp = v.querySelector('#kc-imp');
    if (imp) imp.onclick = async () => {
      imp.disabled = true; imp.textContent = 'Importando…';
      try {
        const r = await rpc('cap_catalogo_importar', { p_filas: FILAS, p_confirmar: true });
        HOJAS = null; FILAS = null; PLAN = null;
        pintar(); toast(r.aviso);
      } catch (e) {
        imp.disabled = false; imp.textContent = 'Importar'; alert(e.message);
      }
    };

    const otro = v.querySelector('#kc-otro');
    if (otro) otro.onclick = () => { HOJAS = null; FILAS = null; PLAN = null; pintar(); };
  }

  pintar();
}

/* =================================================================
   CONSOLA · VER SIN ADMINISTRAR

   Lo que pidió el cliente en la reunión: mirar el cumplimiento sin
   tener que entrar a la administración, y que esa misma pantalla se
   pueda colgar de la consola de KALU.

   No tiene un solo botón que escriba. Y no muestra el número solo:
   muestra POR QUÉ. «251 atrasadas» no le sirve a nadie para actuar;
   «17 capacitaciones que nadie programó, 16 de ellas frenando gente»
   se convierte en una tarde de trabajo concreta.

   La distinción que ordena todo:

     nunca se programó  → el agujero está en el cronograma
     se dictó y no se
     registró           → el agujero está en el registro de asistencia

   Son dos problemas distintos, se arreglan en lugares distintos, y
   hasta hoy ninguna pantalla los separaba.
   ================================================================= */
async function consola(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  cargando(el, 'Calculando el cumplimiento…');

  let D, K = null, anio = (opt && opt.anio) || new Date().getFullYear();
  // El filtro vive acá: una sola cosa, compartida por todos los cortes.
  let filtro = {};   // { estado, causa, cargo, codigo, eje }

  try { D = await rpc('cap_consola', { p_anio: anio }); } catch (e) { return error(el, e); }
  try { K = await rpc('cap_casos'); } catch (e) { K = null; }
  let I = null;
  try { I = await rpc('cap_indicadores', { p_anio: anio }); } catch (e) { I = null; }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  const MES = ['sin fecha','enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];

  // Estado: colores reservados. Nunca se reusan como paleta de series.
  const EDO = {
    vencida:       ['Vencida',        'cr'],
    atrasada:      ['Atrasada',       'cr'],
    por_vencer:    ['Por vencer',     'wa'],
    en_cronograma: ['En el cronograma','n'],
    al_dia:        ['Al día',         'ok']
  };
  const CAUSA = {
    sin_programar: ['Nunca se programó este año',
      'Estas capacitaciones no están en el cronograma. No es que la gente faltara: no se dictaron.',
      'Se arregla programándolas.'],
    sin_registrar: ['Se dictó y no quedó registro',
      'Hay eventos de estas capacitaciones en el año, pero esas personas no figuran en ninguno.',
      'Se arregla cargando la asistencia.']
  };
  const ETIQ = { estado:'Estado', causa:'Causa', cargo:'Cargo', codigo:'Capacitación', eje:'Eje' };

  const CASOS = (K && !K.demasiado && K.casos) ? K.casos : [];

  /* Los casos que pasan el filtro, ignorando opcionalmente una dimensión:
     un panel se dibuja con todo lo demás filtrado menos él mismo, así
     nunca se convierte en una sola barra que no se puede soltar. */
  function pasan(salvo) {
    return CASOS.filter(c => Object.keys(filtro).every(k =>
      k === salvo || c[k] === filtro[k]));
  }

  function contar(campo, lista) {
    const m = new Map();
    lista.forEach(c => {
      const v = c[campo] == null ? '—' : c[campo];
      m.set(v, (m.get(v) || 0) + 1);
    });
    return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  }

  /* Una lista de barras horizontales. Un solo color para toda la serie:
     pintarlas más oscuras cuanto más largas codificaría dos veces el
     mismo dato y gastaría el único canal libre que queda. El valor va
     escrito al lado, así que nunca depende del mouse. */
  function barras(campo, filas, opt2) {
    opt2 = opt2 || {};
    if (!filas.length) return '<p class="kc-vacio">Nada con este filtro.</p>';
    const max = Math.max.apply(null, filas.map(f => f.n)) || 1;
    const tope = opt2.tope || filas.length;
    const vis = filas.slice(0, tope);
    const resto = filas.slice(tope).reduce((a, f) => a + f.n, 0);
    return `<div class="kc-bars">${vis.map(f => {
      const act = filtro[campo] === f.k;
      const et = opt2.etiqueta ? opt2.etiqueta(f.k) : [String(f.k), null];
      return `<button type="button" class="kc-bar${act ? ' on' : ''}"
          data-campo="${campo}" data-valor="${esc(String(f.k))}"
          aria-pressed="${act}"
          title="${esc(et[0])} · ${f.n} caso(s)${act ? ' · tocá para soltar el filtro' : ''}">
        <span class="t">${esc(et[0])}</span>
        <span class="p"><i style="width:${Math.max(2, Math.round(100 * f.n / max))}%${
          et[1] ? ';background:var(--kc-' + et[1] + ')' : ''}"></i></span>
        <span class="v">${f.n}</span></button>`;
    }).join('')}${resto ? `<div class="kc-bar otras">
        <span class="t">otras ${filas.length - tope}</span>
        <span class="p"></span>
        <span class="v">${resto}</span></div>` : ''}</div>`;
  }

  function pintar() {
    const R = D.resumen || {}, C = D.causas || [];
    const conPlan = (R.personas || 0) - (R.sin_plan || 0);
    const pct = R.pct_al_dia;
    const L = pasan();                       // los casos del corte actual
    const cuenta = e => L.filter(c => c.estado === e).length;
    const chips = Object.keys(filtro);

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      ${opt.volver ? '<button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver</button>' : ''}
      <div style="padding:${opt.volver?'0':'24px'} 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:18px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">CONSOLA · FORMACIÓN ${anio}</div>
        <h1 style="font-size:28px;font-weight:700">Cumplimiento</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px;max-width:70ch">
          Sólo lectura. Es la foto de hoy, calculada en el momento.</div></div>

      <!-- ---------- los indicadores del programa · para proyectar ----------
           Cada uno con su meta, su numerador y su denominador a la vista:
           en una reunión la primera pregunta es siempre de dónde sale el
           número. Sin denominador dice «sin datos», no 0% — un indicador
           que no se puede calcular no vale cero. -->
      ${I ? `<div class="kc-kpis">${(I.indicadores || []).map(x => {
        const hay = x.valor != null;
        // Sin meta adoptada no hay veredicto. «No cumple» contra un número
        // que nadie eligió no significa nada, y en una reunión alguien lo
        // va a repetir como si significara algo.
        const cls = !x.meta_adoptada ? 'nd' : (x.cumple === true ? 'ok' : x.cumple === false ? 'no' : 'nd');
        const ref = x.meta_adoptada ? Number(x.meta) : Number(x.sugerida);
        return `<div class="kc-kpix ${cls}">
          <div class="n">${esc(x.nombre)}</div>
          <div class="g">${hay ? x.valor + '<span>%</span>' : '<span class="nd">sin datos</span>'}</div>
          <div class="me"><i style="width:${hay ? Math.min(100, x.valor) : 0}%"></i>
            ${x.meta_adoptada ? `<u style="left:${Math.min(100, ref)}%"></u>` : ''}</div>
          <div class="e">${!x.meta_adoptada
            ? `<span class="kc-tag n">sin meta</span>
               <span>KALU sugiere ${x.sugerida}%</span>`
            : x.cumple === null
              ? `<span class="kc-tag n">— sin calcular</span> <span>meta ${x.meta}%</span>`
              : `<span class="kc-tag ${x.cumple ? 'si' : 'no'}">${
                  x.cumple ? '✓ cumple' : '! no cumple'}</span>
                 <span>meta ${x.meta}%</span>`}</div>
          <div class="f">${x.num} de ${x.den} ${esc(x.unidad)}</div>
          <div class="f2">${esc(x.formula)}</div>
          ${x.meta_adoptada
            ? `<div class="f2" title="${esc(x.meta_cuando || '')}">Meta de la empresa${
                x.meta_fuente ? ' · ' + esc(x.meta_fuente) : ''}${
                x.meta_quien ? ' · adoptada por ' + esc(x.meta_quien) : ''}</div>`
            : `<div class="sug"><div>${esc(x.sugerida_por_que || '')}</div>
               ${I.puede_editar ? `<div class="ad">
                 <input class="kc-in" type="number" min="1" max="100" step="1"
                        value="${x.sugerida}" data-val="${x.clave}" aria-label="Meta en %">
                 <input class="kc-in" type="text" placeholder="De dónde sale · documento y versión"
                        data-fue="${x.clave}" aria-label="Fuente de la meta">
                 <button class="kc-mini p" data-meta="${x.clave}">Adoptar meta</button></div>`
               : '<div style="margin-top:5px">La define quien administra el módulo.</div>'}</div>`}
        </div>`; }).join('')}</div>
      <p class="kc-nota" style="text-align:left;margin:-4px 0 16px">KALU sugiere, la empresa
        adopta. Hasta que alguien la adopte no hay «cumple / no cumple»: el indicador se ve
        igual, pero sin veredicto. Y un indicador sin denominador dice «sin datos», no 0%.</p>` : ''}
      <div class="kc-grid3" style="margin-bottom:20px">
        <div class="kc-kpi ${(R.sin_plan||0) ? 'mal' : 'ok'}">
          <b>${R.sin_plan ?? 0}</b><span>personas sin plan de formación</span></div>
        <div class="kc-kpi ${(R.sin_cargo||0) ? 'mal' : 'ok'}">
          <b>${R.sin_cargo ?? 0}</b><span>personas sin cargo en el organigrama</span></div>
        <div class="kc-kpi ${(D.eventos && D.eventos.sin_asistencia) ? 'mal' : 'ok'}">
          <b>${(D.eventos && D.eventos.sin_asistencia) ?? 0}</b>
          <span>eventos dictados sin asistencia cargada</span></div>
      </div>

      ${!CASOS.length ? (K && K.demasiado
        ? `<div class="kc-cent mal"><div class="b">!</div><div>
           <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">Son ${K.casos} casos</div>
           <div style="font-size:13px;color:var(--kc-ink2)">Demasiados para filtrarlos en el
             navegador sin que la pantalla se trabe. Avisame y lo paso al servidor.</div></div></div>`
        : '<p class="kc-vacio">Todavía no hay ninguna capacitación exigida a nadie.</p>') : `

      <!-- ---------- la fila de filtros: una sola, arriba de todo lo que alcanza ---------- -->
      <div class="kc-filtros">
        <span class="kc-cd">Filtro</span>
        ${chips.length ? chips.map(k => `<button type="button" class="kc-chipf" data-quitar="${k}"
            title="Quitar este filtro">${esc(ETIQ[k] || k)}: <b>${esc(String(
            k === 'estado' ? (EDO[filtro[k]] || [filtro[k]])[0]
          : k === 'causa'  ? (CAUSA[filtro[k]] || [filtro[k]])[0]
          : filtro[k]))}</b> ✕</button>`).join('')
          : '<span style="color:var(--kc-ink3);font-size:13.5px">todo · tocá cualquier barra para filtrar</span>'}
        ${chips.length ? '<button type="button" class="kc-mini" id="kc-limpiar">Limpiar</button>' : ''}
        <span style="margin-left:auto;font-size:13.5px;color:var(--kc-ink2)">
          <b style="font-family:var(--kc-fd);font-size:17px;color:var(--kc-ink)">${L.length}</b>
          de ${CASOS.length} casos</span>
      </div>

      <div class="kc-grid4" style="margin:14px 0 22px">
        ${[['vencida','Vencidas'],['atrasada','Atrasadas'],['por_vencer','Por vencer'],
           ['al_dia','Al día']].map(([k,t]) => `
          <div class="kc-kpi ${k==='al_dia' ? (cuenta(k)?'ok':'') : (cuenta(k)?'mal':'ok')}">
            <b>${cuenta(k)}</b><span>${t}</span></div>`).join('')}
      </div>

      <div class="kc-dos2">
        <div><h3 class="kc-h3">Por estado</h3>
          ${barras('estado', contar('estado', pasan('estado')),
            { etiqueta: k => EDO[k] || [k, null] })}</div>
        <div><h3 class="kc-h3">Por qué está atrasado</h3>
          ${barras('causa', contar('causa', pasan('causa').filter(c => c.causa)),
            { etiqueta: k => [(CAUSA[k] || [k])[0], null] })}</div>
      </div>

      <div class="kc-dos2" style="margin-top:18px">
        <div><h3 class="kc-h3">Por cargo</h3>
          ${barras('cargo', contar('cargo', pasan('cargo')), { tope: 12 })}</div>
        <div><h3 class="kc-h3">Por capacitación</h3>
          ${barras('codigo', contar('codigo', pasan('codigo')), { tope: 12,
            etiqueta: k => {
              const c = CASOS.find(x => x.codigo === k);
              return [k + ' · ' + (c ? c.titulo : ''), null];
            } })}</div>
      </div>

      <h3 class="kc-h3" style="margin-top:22px">El detalle${
        chips.length ? ' · ' + L.length + ' caso(s)' : ''}</h3>
      <div class="kc-sc" style="max-height:520px;overflow-y:auto"><table><thead><tr>
        <th>Persona</th><th>Cargo</th><th>Código</th><th>Capacitación</th>
        <th>Estado</th><th>Por qué</th><th>Vence</th></tr></thead><tbody>${
        L.slice(0, 400).map(c => `<tr>
          <td class="k nom"><div>${esc(c.persona)}</div></td>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(c.cargo)}</td>
          <td class="k">${esc(c.codigo)}</td>
          <td class="tit">${esc(c.titulo)}</td>
          <td><span class="kc-tag ${(EDO[c.estado]||['','n'])[1] === 'ok' ? 'si'
            : (EDO[c.estado]||['','n'])[1] === 'cr' ? 'no'
            : (EDO[c.estado]||['','n'])[1] === 'wa' ? 'wa' : 'n'}">${
            esc((EDO[c.estado] || [c.estado])[0])}</span>${
            c.bloqueante !== 'no' ? ' <span class="kc-tag no" title="Le impide ' +
            (c.bloqueante === 'ingreso' ? 'ingresar' : 'operar sola') + '">!</span>' : ''}</td>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(c.porque || '')}</td>
          <td class="n">${c.vence_el ? fecha(c.vence_el) : '—'}</td>
        </tr>`).join('')}</tbody></table></div>
      ${L.length > 400 ? `<p class="kc-nota" style="text-align:left">Se muestran los primeros
        400 de ${L.length}. Filtrá para acortar la lista.</p>` : ''}`}

      <h3 class="kc-h3" style="margin-top:22px">El cronograma ${anio}</h3>
      ${(D.eventos && D.eventos.sin_asistencia) ? `
        <div class="kc-cent mal" style="margin-bottom:12px">
          <div class="b">${D.eventos.sin_asistencia}</div><div>
          <div class="kc-tt" style="font-size:15px;color:var(--kc-cr)">
            ${D.eventos.sin_asistencia} evento(s) dictados sin una sola asistencia cargada</div>
          <div style="font-size:13px;color:var(--kc-ink2)">De los ${D.eventos.ejecutados}
            marcados como dictados este año, ${D.eventos.sin_asistencia} no tienen registrada
            ni una persona. La capacitación ocurrió; para un auditor, no. <b>Marcar el evento
            como dictado y registrar quién fue son dos cosas distintas</b>, y sólo se hizo la
            primera. Este número no se filtra con lo de arriba: vive a nivel de evento, no de
            persona.</div></div></div>` : ''}
      ${!(D.anio_meses || []).length
        ? `<p class="kc-vacio">No hay ningún evento cargado en el cronograma ${anio}.
           Sin cronograma, todo lo exigido queda atrasado.</p>`
        : `<div class="kc-sc"><table><thead><tr><th>Mes</th><th class="n">Programados</th>
            <th class="n">Ejecutados</th><th class="n">Cancelados</th></tr></thead><tbody>${
            D.anio_meses.map(m => `<tr>
              <td class="k">${esc(MES[m.mes] || m.mes)}</td>
              <td class="n">${m.programados}</td>
              <td class="n">${m.ejecutados}</td>
              <td class="n">${m.cancelados}</td>
            </tr>`).join('')}</tbody></table></div>`}

      <p class="kc-nota" style="text-align:left;margin-top:16px">Los porcentajes de personas se
        calculan sobre quien <b>tiene plan</b>. Contar en el denominador a la gente a la que
        todavía no se le definió nada no mide cumplimiento: mide cuánto falta del montaje.</p>
    </div>`;

    const bv = el.querySelector('#kc-volver');
    if (bv) bv.onclick = () => opt.volver();
    el.querySelectorAll('[data-campo]').forEach(b => b.onclick = () => {
      const campo = b.dataset.campo, valor = b.dataset.valor;
      // Tocar el que ya está puesto lo suelta: sin esto hay que buscar
      // el chip de arriba para volver, y nadie lo encuentra.
      if (filtro[campo] === valor) delete filtro[campo]; else filtro[campo] = valor;
      pintar();
    });
    el.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => {
      delete filtro[b.dataset.quitar]; pintar();
    });
    const lim = el.querySelector('#kc-limpiar');
    if (lim) lim.onclick = () => { filtro = {}; pintar(); };
    el.querySelectorAll('[data-meta]').forEach(b => b.onclick = async () => {
      const k = b.dataset.meta;
      const v = Number((el.querySelector('[data-val="' + k + '"]') || {}).value);
      const f = ((el.querySelector('[data-fue="' + k + '"]') || {}).value || '').trim();
      if (!v || v <= 0 || v > 100) { alert('La meta tiene que ser un porcentaje entre 1 y 100.'); return; }
      b.disabled = true; b.textContent = 'Guardando…';
      try {
        await rpc('cap_meta_guardar', { p_anio: anio, p_indicador: k, p_valor: v,
          p_fuente: f || 'Sugerida por KALU y adoptada sin documento de respaldo' });
        I = await rpc('cap_indicadores', { p_anio: anio });
        pintar();
      } catch (e) { b.disabled = false; b.textContent = 'Adoptar'; alert(e.message); }
    });
  }

  pintar();
}


/* =================================================================
   PANTALLA · CARGAR LA HISTORIA

   Sin esto el módulo le muestra rojo a una empresa que sí capacita, y
   todo lo demás —consola, indicadores, semáforo— dice cosas falsas por
   falta de dato, no por error de cálculo.

   Viaja por partes: diez mil filas en una sola llamada es un paquete
   que puede no llegar. Como el servidor no carga dos veces la misma
   persona-capacitación-fecha, reenviar una parte no duplica nada.
   ================================================================= */
async function historia(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  let HOJAS = null, FILAS = null, PLAN = null, leyendo = false, avance = null;

  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  function toast(t) {
    const d = document.createElement('div');
    d.className = 'kc-toast'; d.textContent = t;
    (el.querySelector('.kc-wide') || el).appendChild(d);
    setTimeout(() => d.remove(), 10000);
  }

  const TROZO = 800;

  /* Manda todo por partes y suma los resultados. Las listas de lo que no
     cruzó se juntan sin repetir: son para que una persona las lea. */
  async function correr(confirmar) {
    const tot = { cargadas:0, repetidas:0, sin_capacitacion:0, sin_persona:0, sin_fecha:0,
                  faltan_capacitaciones:[], faltan_personas:[] };
    for (let i = 0; i < FILAS.length; i += TROZO) {
      avance = { hechas: i, total: FILAS.length, confirmar: confirmar };
      pintar();
      const r = await rpc('cap_asistencias_importar', {
        p_filas: FILAS.slice(i, i + TROZO), p_confirmar: confirmar,
        p_motivo: 'Carga histórica desde los registros de la empresa' });
      ['cargadas','repetidas','sin_capacitacion','sin_persona','sin_fecha']
        .forEach(k => { tot[k] += (r[k] || 0); });
      ['faltan_capacitaciones','faltan_personas'].forEach(k =>
        (r[k] || []).forEach(x => { if (tot[k].indexOf(x) < 0) tot[k].push(x); }));
    }
    avance = null;
    return tot;
  }

  function pintar() {
    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      ${opt.volver ? '<button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver</button>' : ''}
      <div style="padding:${opt.volver?'0':'24px'} 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:16px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">HISTORIA · ASISTENCIAS</div>
        <h1 style="font-size:28px;font-weight:700">Cargar lo que ya se hizo</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px;max-width:74ch">
          Los registros de asistencia que la empresa ya lleva. Cada uno entra con
          <b>su fecha real</b>, y de ahí sale el vencimiento — no desde hoy.</div></div>
      <div id="kc-v"></div></div>`;
    const bv = el.querySelector('#kc-volver');
    if (bv) bv.onclick = () => opt.volver();
    const v = el.querySelector('#kc-v');
    v.innerHTML = avance ? vAvance()
                : leyendo ? '<div class="kc-carga">Leyendo los archivos…</div>'
                : PLAN ? vPlan() : HOJAS ? vLectura() : vPedir();
    enganchar(v);
  }

  function vAvance() {
    const pct = Math.round(100 * avance.hechas / Math.max(1, avance.total));
    return `<div class="kc-cent" style="background:var(--kc-card2)">
      <div class="b" style="background:var(--kc-ac)">${pct}%</div><div style="flex:1">
      <div class="kc-tt" style="font-size:15px">${avance.confirmar
        ? 'Cargando…' : 'Revisando…'}</div>
      <div style="font-size:13px;color:var(--kc-ink2)">${avance.hechas} de ${avance.total}
        registros. Va por partes; si se corta, se puede volver a empezar sin duplicar nada.</div>
      <div class="kc-bar3"><i style="width:${pct}%"></i></div></div></div>`;
  }

  function vPedir() {
    return `<p class="kc-nota" style="text-align:left;max-width:74ch">
      Subí los libros de registro — el consolidado de capacitaciones y el de charlas.
      Una hoja con una columna de personas es un registro de asistencia; las demás se
      saltean solas.</p>
      <div class="kc-cent" style="background:var(--kc-card2);margin-top:16px">
        <div class="b" style="background:var(--kc-ac)">↑</div><div style="flex:1">
        <div class="kc-tt" style="font-size:15px">Elegí uno o varios archivos</div>
        <div style="font-size:13px;color:var(--kc-ink2)">No salen de tu equipo: se leen acá.</div>
        <div style="margin-top:10px">
          <input type="file" id="kc-arch" accept=".xlsx,.xlsm,.xls" multiple
                 style="font-size:13.5px;max-width:100%"></div></div></div>`;
  }

  function vLectura() {
    const conNota = FILAS.filter(f => f.nota != null).length;
    const fechas = FILAS.map(f => f.fecha).sort();
    return `<div class="kc-grid3">
        <div class="kc-kpi"><b>${FILAS.length}</b><span>asistencias leídas</span></div>
        <div class="kc-kpi"><b>${conNota}</b><span>con nota</span></div>
        <div class="kc-kpi"><b>${fechas.length ? fecha(fechas[0]) + ' → ' + fecha(fechas[fechas.length-1]) : '—'}</b>
          <span>rango de fechas</span></div>
      </div>
      <h3 class="kc-h3" style="margin-top:18px">Qué encontré en cada hoja</h3>
      <div class="kc-sc"><table><thead><tr><th>Archivo</th><th>Hoja</th><th>Qué es</th>
        <th class="n">Filas</th><th class="n">Sin fecha</th></tr></thead><tbody>${
        HOJAS.map(h => `<tr${h.clase === 'ignorada' ? ' style="opacity:.5"' : ''}>
          <td style="font-size:13px;color:var(--kc-ink3)">${esc(h.archivo)}</td>
          <td class="k">${esc(h.nombre)}</td>
          <td>${h.clase === 'registro' ? 'Registro de asistencia'
             : 'Sin columna de personas · se saltea'}</td>
          <td class="n">${h.filas}</td>
          <td class="n"${h.sin_fecha ? ' style="color:var(--kc-cr)"' : ''}>${h.sin_fecha || 0}</td>
        </tr>`).join('')}</tbody></table></div>
      <div class="kc-row" style="margin-top:18px">
        <button class="kc-btn" id="kc-sim" style="flex:0 0 auto;width:auto;padding:0 22px">
          Ver qué pasaría</button>
        <button class="kc-mini" id="kc-otro">Elegir otros archivos</button></div>
      <p class="kc-nota" style="text-align:left;margin-top:10px">Todavía no se guardó nada.</p>`;
  }

  function vPlan() {
    const P = PLAN, fc = P.faltan_capacitaciones || [], fp = P.faltan_personas || [];
    return `<div class="kc-grid4">
        <div class="kc-kpi ok"><b>${P.cargadas}</b><span>${P.confirmado ? 'cargadas' : 'entrarían'}</span></div>
        <div class="kc-kpi"><b>${P.repetidas}</b><span>ya estaban</span></div>
        <div class="kc-kpi ${P.sin_persona ? 'mal' : ''}"><b>${P.sin_persona}</b>
          <span>sin persona en el padrón</span></div>
        <div class="kc-kpi ${P.sin_capacitacion ? 'mal' : ''}"><b>${P.sin_capacitacion}</b>
          <span>sin capacitación en el catálogo</span></div>
      </div>

      ${fp.length ? `<h3 class="kc-h3" style="margin-top:20px">Nombres que no están en el padrón · ${fp.length}</h3>
        <p class="kc-nota" style="text-align:left;margin:0 0 8px">Casi siempre son personas que ya
          no trabajan en la empresa. Su historia no entra: para que entre, tienen que estar en el
          padrón. No los creo yo — el Capacitador lee el padrón, no lo escribe.</p>
        <div class="kc-cols">${fp.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}

      ${fc.length ? `<h3 class="kc-h3" style="margin-top:20px">Capacitaciones que no están en el catálogo · ${fc.length}</h3>
        <p class="kc-nota" style="text-align:left;margin:0 0 8px">Se escriben distinto que en el
          catálogo, o nunca se importaron. Con el título exacto se pueden agregar y volver a correr
          esto: lo ya cargado no se duplica.</p>
        <div class="kc-cols">${fc.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}

      ${P.confirmado ? `<div class="kc-cent" style="background:var(--kc-oks);margin-top:20px">
        <div class="b" style="background:var(--kc-ok)">✓</div><div>
        <div class="kc-tt" style="font-size:15px;color:var(--kc-ok)">Listo</div>
        <div style="font-size:13px;color:var(--kc-ink2)">Cada asistencia quedó con su fecha real y
          su vencimiento calculado desde ahí. Mirá la consola: los indicadores cambian solos.</div>
        </div></div>`
      : `<div class="kc-row" style="margin-top:20px">
        <button class="kc-btn" id="kc-imp" style="flex:0 0 auto;width:auto;padding:0 22px">
          Cargar ${P.cargadas} asistencia(s)</button>
        <button class="kc-mini" id="kc-otro">Empezar de nuevo</button></div>
        <p class="kc-nota" style="text-align:left;margin-top:10px">Hasta que aprietes Cargar,
          no se guardó nada.</p>`}`;
  }

  function enganchar(v) {
    const arch = v.querySelector('#kc-arch');
    if (arch) arch.onchange = async () => {
      const fs = Array.prototype.slice.call(arch.files || []);
      if (!fs.length) return;
      leyendo = true; pintar();
      try {
        const XLSX = await cargarXLSX();
        HOJAS = []; FILAS = [];
        for (let i = 0; i < fs.length; i++) {
          const buf = await fs[i].arrayBuffer();
          const L = asLeer(XLSX, new Uint8Array(buf), fs[i].name);
          L.hojas.forEach(h => HOJAS.push(h));
          L.filas.forEach(x => FILAS.push(x));
        }
        if (!FILAS.length) {
          HOJAS = null; FILAS = null;
          toast('No encontré ninguna hoja con columna de personas y fecha.');
        }
      } catch (e) { HOJAS = null; FILAS = null; toast(e.message); }
      leyendo = false; pintar();
    };

    const sim = v.querySelector('#kc-sim');
    if (sim) sim.onclick = async () => {
      try { PLAN = await correr(false); PLAN.confirmado = false; }
      catch (e) { avance = null; alert(e.message); }
      pintar();
    };

    const imp = v.querySelector('#kc-imp');
    if (imp) imp.onclick = async () => {
      try {
        const r = await correr(true); r.confirmado = true; PLAN = r;
        toast(r.cargadas + ' asistencia(s) cargadas.');
      } catch (e) { avance = null; alert(e.message); }
      pintar();
    };

    const otro = v.querySelector('#kc-otro');
    if (otro) otro.onclick = () => { HOJAS = null; FILAS = null; PLAN = null; pintar(); };
  }

  pintar();
}


/* =================================================================
   PANTALLA · ASIGNAR DESDE EL DOCUMENTO

   El plan de la empresa ya dice a quién va dirigida cada capacitación.
   Lo que no dice es cómo se traduce a los cargos y roles de KALU — y
   esa traducción NO se hace por capacitación: se hace por texto.

   En Total QC, 107 capacitaciones usan 31 textos distintos, y seis de
   ellos cubren 80. Resolver «Personal Operativo» una vez asigna 35.

   Lo que se puede deducir, ya viene deducido. Lo que no, se propone y
   espera confirmación: «Personal Operativo» no es un cargo, es un grupo
   que sólo la empresa sabe cómo se compone, y arrastra 35. Equivocarse
   ahí le exige trabajo en alturas a la asistente administrativa.
   ================================================================= */
async function destinos(sel, opt) {
  estilos(); const el = nodo(sel); if (!el) return;
  opt = opt || {};
  cargando(el, 'Leyendo a quién va dirigida cada capacitación…');

  let D, abierto = null, busca = '';
  try { await rpc('cap_destinos_sembrar'); } catch (e) {}
  try { D = await rpc('cap_destinos_datos'); } catch (e) { return error(el, e); }
  try { marca(el, (await rpc('cap_mi_pasaporte')).empresa); } catch (e) {}

  const BLQ = [['no','No bloquea'], ['ingreso','Sin esto no se completa la vinculación'],
               ['operacion','Sin esto no puede operar sola']];

  function toast(t) {
    const d = document.createElement('div');
    d.className = 'kc-toast'; d.textContent = t;
    (el.querySelector('.kc-wide') || el).appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  async function recargar(msg) {
    D = await rpc('cap_destinos_datos');
    abierto = null; busca = '';
    pintar(); if (msg) toast(msg);
  }

  function pintar() {
    const L = D.destinos || [];
    const sinRes = L.filter(d => !d.resuelto);
    const cubre = sinRes.reduce((a, d) => a + Number(d.capacitaciones), 0);
    const puede = D.puede_editar !== false;

    el.className = 'kc';
    el.innerHTML = `<div class="kc-wide">
      ${opt.volver ? '<button class="kc-mini" id="kc-volver" style="margin:18px 0 12px">← Volver</button>' : ''}
      <div style="padding:${opt.volver?'0':'24px'} 0 14px;border-bottom:2px solid var(--kc-ink);margin-bottom:16px">
        <div class="kc-cd" style="color:var(--kc-ac);margin-bottom:9px">A QUIÉN LE LLEGA</div>
        <h1 style="font-size:28px;font-weight:700">Asignar desde el documento</h1>
        <div style="color:var(--kc-ink2);font-size:14px;margin-top:6px;max-width:74ch">
          Tu programa ya dice a quién va dirigida cada capacitación. Acá se traduce ese texto a
          los cargos y roles de KALU — <b>una vez por texto</b>, no una vez por capacitación.</div></div>

      <div class="kc-grid3" style="margin-bottom:16px">
        <div class="kc-kpi"><b>${L.length}</b><span>textos distintos</span></div>
        <div class="kc-kpi ${sinRes.length ? 'mal' : 'ok'}">
          <b>${sinRes.length}</b><span>sin resolver</span></div>
        <div class="kc-kpi ${cubre ? 'mal' : 'ok'}">
          <b>${cubre}</b><span>capacitaciones esperando</span></div>
      </div>

      ${!L.length ? `<p class="kc-vacio">Ninguna capacitación activa trae escrito a quién va
        dirigida. Eso se carga al importar el catálogo desde el procedimiento de la empresa.</p>`
      : `<div class="kc-dest">${L.map(d => tarjeta(d, puede)).join('')}</div>`}
    </div>`;

    const bv = el.querySelector('#kc-volver');
    if (bv) bv.onclick = () => opt.volver();
    enganchar();
  }

  function tarjeta(d, puede) {
    const ab = abierto === d.id;
    const prop = d.cargos_mencionados || [];
    const eleg = (d.elegidos || []).map(x => x.cargo_id || x.rol_id);
    // Si nunca se resolvió, la propuesta viene pre-marcada: el trabajo de
    // la persona es revisar, no cargar de cero.
    const marcados = d.resuelto ? eleg : prop.map(p => p.cargo_id);
    // Cuando NO hay propuesta no se preselecciona nada. Caer en «a todo el
    // personal» por descarte es el peor default posible: «Personal
    // Operativo» no es todo el personal, y apretar Guardar sin mirar le
    // asignaría 34 capacitaciones a la empresa entera. Que no haya una
    // respuesta obvia tiene que verse, no taparse con una por defecto.
    const alc = d.alcance || (d.rol_propuesto ? 'rol' : prop.length ? 'cargo' : null);

    return `<article class="kc-p1 ${d.resuelto ? '' : 'pend'}">
      <button type="button" class="cab" data-abrir="${d.id}" aria-expanded="${ab}">
        <div class="i">${d.capacitaciones}</div>
        <div class="c">
          <div class="kc-tt" style="font-size:15px">${esc(d.texto)}</div>
          <div class="kc-cd" style="margin-top:3px">${d.resuelto
            ? (d.alcance === 'todos'   ? 'A todo el personal'
             : d.alcance === 'ignorar' ? 'Marcado para ignorar'
             : (d.elegidos || []).map(x => esc(x.nombre)).join(' · ') || 'sin destino')
            : (d.rol_propuesto ? 'Se propone el rol «' + esc(d.rol_propuesto) + '»'
             : prop.length ? 'Se proponen ' + prop.length + ' cargo(s)'
             : 'Sin propuesta: hay que decidirlo')}</div>
        </div>
        <span class="kc-tag ${d.resuelto ? 'si' : 'no'}">${d.resuelto ? 'Resuelto' : 'Pendiente'}</span>
        <span class="fl">${ab ? '▲' : '▼'}</span>
      </button>
      ${!ab ? '' : `<div class="cue">
        <!-- Cuáles son. Sin esto la decisión es a ciegas: nadie puede
             decir quién es «Personal Operativo» sin ver qué se le
             estaría exigiendo. -->
        ${(d.lista || []).length ? `<details class="lis" ${d.resuelto ? '' : 'open'}>
          <summary>Las ${d.lista.length} capacitaciones de este texto</summary>
          <div class="cgs2">${d.lista.map(c => `<div class="li">
            <b>${esc(c.codigo)}</b> ${esc(c.titulo)}
            <span class="kc-cd">· ${esc(c.tipo || '')}</span></div>`).join('')}</div>
        </details>` : ''}

        ${alc ? '' : `<p class="kc-nota" style="text-align:left;margin:0 0 9px;color:var(--kc-wa)">
          Este texto no coincide con ningún cargo del organigrama, así que no hay nada que
          proponer. Mirá la lista de arriba —qué se les estaría exigiendo— y decidí a quién
          le llega.</p>`}
        <div class="kc-row" style="margin-bottom:10px">
          ${[['todos','A todo el personal'],['cargo','A ciertos cargos'],
             ['rol','A un rol'],['ignorar','No asignar a nadie']].map(o =>
            `<label class="kc-op"><input type="radio" name="alc-${d.id}" value="${o[0]}"
               data-alc="${d.id}" ${alc === o[0] ? 'checked' : ''}> ${o[1]}</label>`).join('')}
        </div>

        <div class="zona" data-zona="cargo-${d.id}" ${alc === 'cargo' ? '' : 'hidden'}>
          <input class="kc-in" type="search" placeholder="Buscar cargo…" data-bus="${d.id}"
                 style="margin-bottom:8px">
          ${prop.length ? `<p class="kc-nota" style="text-align:left;margin:0 0 8px">
            Vienen marcados los que el texto menciona. Revisá antes de guardar.</p>` : ''}
          <div class="cgs" data-cgs="${d.id}">${(D.cargos || []).map(c =>
            `<label class="kc-op" data-nom="${esc(c.nombre.toLowerCase())}">
               <input type="checkbox" class="kcd-${d.id}" value="${c.id}"
                 ${marcados.indexOf(c.id) >= 0 ? 'checked' : ''}>
               ${esc(c.nombre)} <span class="kc-cd">· ${c.personas}</span></label>`).join('')}</div>
        </div>

        <div class="zona" data-zona="rol-${d.id}" ${alc === 'rol' ? '' : 'hidden'}>
          <label class="kc-lb" for="rol-${d.id}">Rol</label>
          <input class="kc-in" id="rol-${d.id}" data-rol="${d.id}" list="roles-${d.id}"
                 value="${esc(d.rol_propuesto || (d.elegidos||[]).map(x=>x.nombre)[0] || '')}"
                 placeholder="Ej: Conductor">
          <datalist id="roles-${d.id}">${(D.roles || []).map(r =>
            `<option value="${esc(r.nombre)}">`).join('')}</datalist>
          <p class="kc-nota" style="text-align:left;margin:6px 0 0">Si el rol no existe se crea
            solo. Después hay que afiliarle la gente desde la ficha de cada persona: el
            documento dice qué rol, no quién lo tiene.</p>
        </div>

        <div style="margin-top:12px">
          <label class="kc-lb" for="blq-${d.id}">¿Bloquea?</label>
          <select class="kc-in" id="blq-${d.id}" data-blq="${d.id}">${BLQ.map(b =>
            `<option value="${b[0]}" ${d.bloqueante === b[0] ? 'selected' : ''}>${b[1]}</option>`).join('')}</select>
          <p class="kc-nota" style="text-align:left;margin:6px 0 0">Bloquear tiene que ser raro.
            Inducción o alturas, sí; una charla de ergonomía, no. Si todo bloquea, el sistema
            deja a todo el mundo trabado y deja de servir.</p>
        </div>

        ${puede ? `<div class="kc-row" style="margin-top:14px">
          <button class="kc-btn" data-guardar="${d.id}" style="flex:0 0 auto;width:auto;padding:0 20px">
            Guardar y asignar ${d.capacitaciones}</button>
          <button class="kc-mini" data-cerrar="1">Cancelar</button></div>`
        : '<p class="kc-nota" style="text-align:left">Sólo lectura.</p>'}
      </div>`}
    </article>`;
  }

  function enganchar() {
    el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      abierto = (abierto === b.dataset.abrir) ? null : b.dataset.abrir;
      pintar();
    });
    el.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = () => { abierto = null; pintar(); });
    el.querySelectorAll('[data-alc]').forEach(r => r.onchange = () => {
      const id = r.dataset.alc, v = r.value;
      ['cargo','rol'].forEach(z => {
        const box = el.querySelector(`[data-zona="${z}-${id}"]`);
        if (box) box.hidden = (v !== z);
      });
    });
    el.querySelectorAll('[data-bus]').forEach(i => i.oninput = () => {
      const q = i.value.trim().toLowerCase();
      el.querySelectorAll(`[data-cgs="${i.dataset.bus}"] [data-nom]`).forEach(lb => {
        lb.hidden = !!q && lb.dataset.nom.indexOf(q) < 0;
      });
    });
    el.querySelectorAll('[data-guardar]').forEach(b => b.onclick = async () => {
      const id = b.dataset.guardar;
      const alc = (el.querySelector(`[data-alc="${id}"]:checked`) || {}).value;
      if (!alc) { alert('Elegí a quién le llega antes de guardar.'); return; }
      const dest = [];
      if (alc === 'cargo') {
        el.querySelectorAll('.kcd-' + id + ':checked').forEach(x => dest.push({ cargo_id: x.value }));
        if (!dest.length) { alert('Elegí al menos un cargo, o cambiá el alcance.'); return; }
      }
      const rol = alc === 'rol'
        ? ((el.querySelector(`[data-rol="${id}"]`) || {}).value || '').trim() : null;
      if (alc === 'rol' && !rol) { alert('Escribí el nombre del rol.'); return; }
      const blq = (el.querySelector(`[data-blq="${id}"]`) || {}).value || 'no';
      b.disabled = true; b.textContent = 'Guardando…';
      try {
        const r = await rpc('cap_destino_resolver', { p_destino: id, p_alcance: alc,
          p_destinos: dest, p_rol_nuevo: rol, p_bloqueante: blq });
        await recargar(r.aviso);
      } catch (e) {
        b.disabled = false; b.textContent = 'Guardar'; alert(e.message);
      }
    });
  }

  pintar();
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
                   certificado, generador, verificar, arranque, planCargo, verCurso,
                   matriz, impCatalogo, consola, destinos, historia,
                   version: KC_VER,
                   get cliente() { return sb; } };

})(typeof window !== 'undefined' ? window : this);
