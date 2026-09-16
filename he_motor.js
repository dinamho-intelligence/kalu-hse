/* ============================================================
 *  KALU · Motor de categorización de Horas Extra y Recargos
 *  ------------------------------------------------------------
 *  Función PURA (sin dependencias) que dado un segmento de tiempo
 *  trabajado lo clasifica en las 7 categorías legales colombianas.
 *
 *  Categorías:
 *    HED   Hora extra diurna            (semanal, 06:00–19:00)
 *    HEN   Hora extra nocturna          (semanal, 19:00–06:00)
 *    DOMD  Recargo dominical/festivo diurno   (domingo/festivo, 06:00–19:00)
 *    DOMN  Recargo dominical/festivo nocturno (domingo/festivo, 19:00–06:00)
 *    HEFD  Hora extra diurna dominical/festiva
 *    HEFN  Hora extra nocturna dominical/festiva
 *    RNOCT Recargo nocturno             (horas ORDINARIAS de turno noche en franja nocturna)
 *
 *  Distinción clave:
 *    - "esJornadaOrdinaria=true"  → horas del turno normal (ej. cuadrilla noche).
 *         En franja nocturna generan RNOCT (semanal) o DOMN/DOMD (domingo/festivo).
 *    - "esJornadaOrdinaria=false" → horas EXTRA (más allá del turno).
 *         Semanal → HED/HEN.  Domingo/festivo → HEFD/HEFN.
 *
 *  El corte nocturno es PARAMETRIZABLE (default 19:00, ley vigente 2026).
 *  El motor SUGIERE la categoría; Antonella puede sobrescribir (es la autoridad).
 * ============================================================ */

var HE_CFG = {
  nocturnoInicio: '19:00',   // inicio de franja nocturna
  nocturnoFin:    '06:00'    // fin de franja nocturna (= inicio diurna)
};

function _toMin(hhmm){ var p=String(hhmm).split(':'); return (parseInt(p[0],10)||0)*60 + (parseInt(p[1],10)||0); }
function _overlap(a0,a1,b0,b1){ return Math.max(0, Math.min(a1,b1) - Math.max(a0,b0)); }

/* Parte un segmento [ini,fin) en minutos diurnos y nocturnos.
   Soporta cruce de medianoche (si fin<=ini se asume que termina al día siguiente).
   Franja diurna = [nocturnoFin, nocturnoInicio); el resto es nocturna. */
function _splitDiurnoNocturno(iniMin, finMin, cfg){
  cfg = cfg || HE_CFG;
  var dIni=_toMin(cfg.nocturnoFin), dFin=_toMin(cfg.nocturnoInicio); // ventana diurna del día
  if(finMin<=iniMin) finMin += 1440;                                 // cruza medianoche
  var total=finMin-iniMin;
  // ventanas diurnas para hoy y mañana (por si el segmento cruza)
  var diur = _overlap(iniMin,finMin,dIni,dFin) + _overlap(iniMin,finMin,dIni+1440,dFin+1440);
  return { diurMin:diur, noctMin: total-diur, totalMin: total };
}

/* ¿La fecha es domingo o festivo? festivos = Set de 'YYYY-MM-DD' (o array). */
function _esDomFest(fechaISO, festivos){
  var set = (festivos instanceof Set) ? festivos : new Set(festivos||[]);
  var d = new Date(fechaISO + 'T00:00:00');
  return d.getDay()===0 || set.has(fechaISO);
}

/* Clasifica UN segmento. Devuelve horas (no minutos) por categoría.
   rep = { fecha, horaInicio, horaFin, esJornadaOrdinaria }
   festivos = Set/array de 'YYYY-MM-DD'
*/
function heCategorizar(rep, festivos, cfg){
  cfg = cfg || HE_CFG;
  var cats = {HED:0,HEN:0,DOMD:0,DOMN:0,HEFD:0,HEFN:0,RNOCT:0};
  if(!rep || !rep.fecha || !rep.horaInicio || !rep.horaFin) return cats;
  var sp = _splitDiurnoNocturno(_toMin(rep.horaInicio), _toMin(rep.horaFin), cfg);
  var diurH = sp.diurMin/60, noctH = sp.noctMin/60;
  var domFest = _esDomFest(rep.fecha, festivos);
  var ordinaria = !!rep.esJornadaOrdinaria;

  if(domFest){
    if(ordinaria){ cats.DOMD = diurH; cats.DOMN = noctH; }   // recargo dominical/festivo
    else         { cats.HEFD = diurH; cats.HEFN = noctH; }   // hora extra dominical/festiva
  } else {
    if(ordinaria){ cats.RNOCT = noctH; /* diurno ordinario = sin recargo */ }
    else         { cats.HED = diurH; cats.HEN = noctH; }     // hora extra semanal
  }
  // redondeo a 2 decimales
  for(var k in cats){ cats[k] = Math.round(cats[k]*100)/100; }
  return cats;
}

/* Suma varias categorizaciones (para totales de período). */
function heSumar(lista){
  var t={HED:0,HEN:0,DOMD:0,DOMN:0,HEFD:0,HEFN:0,RNOCT:0};
  (lista||[]).forEach(function(c){ for(var k in t){ t[k]+=(c[k]||0); } });
  for(var k in t){ t[k]=Math.round(t[k]*100)/100; }
  return t;
}

/* Total de horas de una categorización. */
function heTotalHoras(c){ var s=0; for(var k in c){ s+=(c[k]||0); } return Math.round(s*100)/100; }

if(typeof module!=='undefined' && module.exports){
  module.exports = { heCategorizar, heSumar, heTotalHoras, _splitDiurnoNocturno, _esDomFest, HE_CFG };
}
