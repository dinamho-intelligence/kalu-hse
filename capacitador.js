-- =====================================================================
--  cap_73 · «Cumplimiento del programa» dejaba de cumplir por lo que
--           todavía no había pasado
--
--  LO QUE ESTABA MAL
--
--  El indicador dividía las actividades ejecutadas por TODAS las del año,
--  incluidas las programadas para octubre y noviembre. En agosto eso da
--  un número bajo que no significa nada — y encima se lo compara contra
--  una meta y se le pone «no cumple».
--
--  Total QC, medido hoy: 73 jornadas en 2026 · 61 dictadas · 12 por
--  dictar · **cero vencidas sin dictar**. La pantalla decía **83,6%**
--  contra una meta de 90. Lo cierto es que no incumplieron nada: a la
--  fecha llevan **61 de 61 · 100%**.
--
--  QUÉ CAMBIA
--
--  Se mide dos veces, porque son dos preguntas distintas:
--
--    · A LA FECHA — sólo lo que ya tenía que haber pasado. Es la de
--      gestión: ¿vamos bien? **Es la que lleva el veredicto.**
--    · DEL AÑO — el programa completo. Es la de cierre, y va al lado sin
--      semáforo.
--
--  El 31 de diciembre los dos números son el mismo, así que no hay nada
--  que cambiar al cerrar el año.
--
--  LO QUE NO CAMBIA, Y POR QUÉ
--
--  **Cobertura ya estaba bien**: cuenta sólo sobre actividades ejecutadas,
--  no tiene futuro adentro. Su 46,3% es real y es de otra clase — de las
--  3.103 personas convocadas a jornadas que sí se dictaron, sólo 1.438
--  tienen la asistencia cargada. Eso no se arregla con una fórmula.
--
--  Eficacia y «personal al día» se miden contra hoy por naturaleza.
--
--  OJO — SE ESCRIBE SOBRE cap_53, NO SOBRE cap_52.
--
--  `cap_indicadores` está definida dos veces: en cap_52 y otra vez en
--  cap_53, que es la que agrega las metas adoptadas y el veredicto. La
--  que está viva es la de cap_53. Armar este arreglo sobre el cuerpo de
--  cap_52 —que fue lo primero que hice— habría borrado las metas sin
--  que nada avisara: la función sigue existiendo y devolviendo números.
--
--  DEPENDE DE: cap_53. SE PUEDE CORRER DOS VECES.
-- =====================================================================

begin;

create or replace function cap_indicadores(
  p_anio     int     default null,
  p_meta     numeric default null,   -- se ignora: queda por compatibilidad
  p_nota_min numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_emp  uuid := cap_empresa_id();
  v_anio int  := coalesce(p_anio, extract(year from current_date)::int);
  v_nota numeric;
  c_prog int; c_ejec int;
  h_prog int; h_ejec int;          -- el mismo cumplimiento, medido hasta hoy
  v_hoy  date := current_date;
  b_conv int; b_asis int;
  e_eval int; e_aprob int;
  p_con_plan int; p_al_dia int;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_val numeric; v_num int; v_den int;
  m cap_meta; sug jsonb;
begin
  if v_emp is null then
    raise exception 'No se pudo determinar tu empresa';
  end if;
  if coalesce(cap_rol_modulo(),'trabajador') = 'trabajador' then
    raise exception 'Los indicadores son para quien coordina o supervisa.';
  end if;

  -- la nota de corte sale de la meta de eficacia si está adoptada
  select nota_min into v_nota from cap_meta
   where empresa_id = v_emp and anio = v_anio and indicador = 'eficacia';
  v_nota := coalesce(p_nota_min, v_nota,
                     (cap_meta_sugerida('eficacia') ->> 'nota_min')::numeric, 80);

  select count(*) filter (where not e.cancelado),
         count(*) filter (where e.ejecutado)
    into c_prog, c_ejec
  from cap_evento e where e.empresa_id = v_emp and e.anio = v_anio;

  -- …Y OTRA VEZ, SÓLO HASTA HOY.
  -- Dividir en agosto por las actividades de noviembre castiga a una
  -- empresa por no haber hecho todavía lo que no le tocaba hacer. Total
  -- QC tenía 61 de 73 y la pantalla decía 83,6% contra una meta de 90
  -- —«no cumple»— cuando no tenía una sola actividad vencida sin dictar:
  -- a la fecha era 61 de 61. El veredicto va sobre éste; el del año
  -- entero viaja al lado, sin semáforo. El 31 de diciembre son iguales.
  select count(*) filter (where not e.cancelado),
         count(*) filter (where e.ejecutado)
    into h_prog, h_ejec
  from cap_evento e
  where e.empresa_id = v_emp and e.anio = v_anio
    -- Una actividad sin fecha —de las que dispara un hecho— no tiene
    -- vencimiento, así que no entra ni a favor ni en contra.
    and coalesce(e.fecha_realizada, e.fecha_programada) is not null
    and coalesce(e.fecha_realizada, e.fecha_programada) <= v_hoy;

  select coalesce(sum(greatest(
           coalesce(e.n_programados, 0),
           (select count(*) from cap_asistencia s where s.evento_id = e.id))), 0),
         coalesce(sum((select count(*) from cap_asistencia s
                        where s.evento_id = e.id and s.estado = 'asistio')), 0)
    into b_conv, b_asis
  from cap_evento e
  where e.empresa_id = v_emp and e.anio = v_anio and e.ejecutado;

  select count(*), count(*) filter (where s.nota >= v_nota)
    into e_eval, e_aprob
  from cap_asistencia s
  where s.empresa_id = v_emp and s.nota is not null
    and extract(year from s.fecha)::int = v_anio;

  select count(*) filter (where h.formacion <> 'sin_plan'),
         count(*) filter (where h.formacion = 'al_dia')
    into p_con_plan, p_al_dia
  from cap_v_habilitacion h where h.empresa_id = v_emp;

  for r in
    select * from (values
      ('cumplimiento','Cumplimiento del programa',
       'actividades ejecutadas ÷ programadas hasta hoy','actividades',
       'Las canceladas con motivo no cuentan en el denominador. '
       || 'Lo programado para más adelante en el año tampoco: todavía no le tocaba.',
       h_ejec, h_prog),
      ('cobertura','Cobertura del personal',
       'personas que asistieron ÷ personas convocadas','asistencias',
       'Sobre las actividades ya ejecutadas del año.', b_asis, b_conv),
      ('eficacia','Eficacia de la formación',
       'aprobados ÷ evaluados (nota ≥ ' || v_nota || ')','evaluaciones',
       'Sólo cuenta quien tiene nota cargada.', e_aprob, e_eval),
      ('al_dia','Personal con formación al día',
       'personas al día ÷ personas con plan definido','personas',
       'Quien todavía no tiene plan queda fuera del denominador.', p_al_dia, p_con_plan)
    ) as t(clave, nombre, formula, unidad, nota, num, den)
  loop
    v_num := r.num; v_den := r.den;
    v_val := case when v_den = 0 then null else round(100.0 * v_num / v_den, 1) end;

    select * into m from cap_meta
     where empresa_id = v_emp and anio = v_anio and indicador = r.clave;
    sug := cap_meta_sugerida(r.clave);

    v_out := v_out || jsonb_build_object(
      'clave', r.clave, 'nombre', r.nombre, 'formula', r.formula,
      'unidad', r.unidad, 'nota', r.nota,
      'num', v_num, 'den', v_den, 'valor', v_val,
      'meta',           m.valor,
      'meta_adoptada',  m.id is not null,
      'meta_fuente',    m.fuente,
      'meta_cuando',    m.adoptada_en,
      'meta_quien',     (select p.nombre from personas p where p.id = m.adoptada_por),
      'sugerida',       (sug ->> 'valor')::numeric,
      'sugerida_por_que', sug ->> 'por_que',
      -- Sin meta adoptada NO hay veredicto: «no cumple» contra un número
      -- que nadie eligió no dice nada.
      'cumple', case when m.id is null or v_val is null then null
                     else v_val >= m.valor end)
      -- El año completo va SÓLO en cumplimiento, y sin veredicto: sirve
      -- para reportar el avance del programa, no para juzgarlo a mitad
      -- de camino.
      || case when r.clave = 'cumplimiento' then jsonb_build_object(
                'anual_num', c_ejec, 'anual_den', c_prog,
                'anual_valor', case when c_prog = 0 then null
                                    else round(100.0 * c_ejec / c_prog, 1) end)
              else '{}'::jsonb end;
  end loop;

  return jsonb_build_object(
    'anio', v_anio, 'nota_min', v_nota,
    'puede_editar', cap_puede_editar(),
    'indicadores', v_out);
end $$;

comment on function cap_indicadores is
  'Los cuatro indicadores del programa. «Cumplimiento» se mide a la fecha —sólo lo que ya tenía que haber pasado— y trae al lado el del año completo, sin veredicto: dividir en agosto por las actividades de noviembre castiga a una empresa por no haber hecho todavía lo que no le tocaba.';

commit;

-- =====================================================================
--  COMPROBACIÓN — los dos números, uno al lado del otro
--
--  «a_la_fecha» es el que va a mostrar la pantalla. «del_anio» es el que
--  mostraba antes. La diferencia entre los dos son las actividades que
--  todavía no llegaron.
-- =====================================================================
select em.slug as empresa,
       count(*) filter (where not e.cancelado
                          and coalesce(e.fecha_realizada, e.fecha_programada) <= current_date) as programadas_a_hoy,
       count(*) filter (where e.ejecutado
                          and coalesce(e.fecha_realizada, e.fecha_programada) <= current_date) as ejecutadas_a_hoy,
       count(*) filter (where not e.cancelado)                                                 as programadas_del_anio,
       count(*) filter (where e.ejecutado)                                                     as ejecutadas_del_anio,
       count(*) filter (where not e.cancelado and not e.ejecutado
                          and coalesce(e.fecha_realizada, e.fecha_programada) > current_date)  as todavia_no_les_toca
from cap_evento e
join empresas em on em.id = e.empresa_id
where e.anio = extract(year from current_date)::int
group by em.slug
order by em.slug;
