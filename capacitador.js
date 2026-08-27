-- =====================================================================
--  KALU Capacitador — cap_52: los indicadores del programa
--
--  DE DÓNDE SALEN LAS METAS
--
--  No las inventé. Están escritas en el procedimiento de la empresa
--  —Total QC, PG-HUM-001 versión 004 del 10-Jun-2026—:
--
--    · Cumplimiento mínimo del 90% de las actividades programadas
--    · Cobertura mínima del 90% del personal programado
--    · Eficacia mínima del 90% en las actividades de formación
--    · Aprobación individual superior al 80%
--
--  En una reunión con el cliente, el número que vale es el de él contra
--  la meta que él mismo se puso. Por eso la meta es un parámetro y no
--  una constante escondida: otra empresa tendrá otras.
--
--  LO QUE NO HACE
--
--  No devuelve 0% cuando no hay datos. Un indicador sin denominador no
--  vale cero: no se puede calcular, y decirlo así evita que alguien
--  presente un rojo que no significa nada. Cada indicador viene con su
--  numerador y su denominador a la vista, porque en una reunión la
--  primera pregunta siempre es de dónde sale.
--
--  Correr después de cap_51.
-- =====================================================================

begin;

create or replace function cap_indicadores(
  p_anio     int     default null,
  p_meta     numeric default 90,
  p_nota_min numeric default 80)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_emp  uuid := cap_empresa_id();
  v_anio int  := coalesce(p_anio, extract(year from current_date)::int);
  -- cumplimiento
  c_prog int; c_ejec int;
  -- cobertura
  b_conv int; b_asis int;
  -- eficacia
  e_eval int; e_aprob int;
  -- personal
  p_con_plan int; p_al_dia int;
begin
  if v_emp is null then
    raise exception 'No se pudo determinar tu empresa';
  end if;
  if coalesce(cap_rol_modulo(),'trabajador') = 'trabajador' then
    raise exception 'Los indicadores son para quien coordina o supervisa.';
  end if;

  -- 1 · CUMPLIMIENTO — actividades ejecutadas sobre programadas.
  --     Las canceladas salen del denominador: una actividad que se
  --     dio de baja con motivo no es un incumplimiento, es una decisión.
  select count(*) filter (where not e.cancelado),
         count(*) filter (where e.ejecutado)
    into c_prog, c_ejec
  from cap_evento e where e.empresa_id = v_emp and e.anio = v_anio;

  -- 2 · COBERTURA — personal que asistió sobre personal convocado.
  --     El convocado sale de n_programados si está cargado; si no, de
  --     la cantidad de personas que quedaron enganchadas al evento.
  select coalesce(sum(greatest(
           coalesce(e.n_programados, 0),
           (select count(*) from cap_asistencia s where s.evento_id = e.id))), 0),
         coalesce(sum((select count(*) from cap_asistencia s
                        where s.evento_id = e.id and s.estado = 'asistio')), 0)
    into b_conv, b_asis
  from cap_evento e
  where e.empresa_id = v_emp and e.anio = v_anio and e.ejecutado;

  -- 3 · EFICACIA — aprobados sobre evaluados. Sólo cuenta quien tiene
  --     nota: sin evaluación no hay eficacia que medir.
  select count(*), count(*) filter (where s.nota >= p_nota_min)
    into e_eval, e_aprob
  from cap_asistencia s
  where s.empresa_id = v_emp
    and s.nota is not null
    and extract(year from s.fecha)::int = v_anio;

  -- 4 · PERSONAL AL DÍA — lo que sólo sabe este módulo.
  select count(*) filter (where h.formacion <> 'sin_plan'),
         count(*) filter (where h.formacion = 'al_dia')
    into p_con_plan, p_al_dia
  from cap_v_habilitacion h where h.empresa_id = v_emp;

  return jsonb_build_object(
    'anio', v_anio,
    'meta', p_meta,
    'nota_min', p_nota_min,
    'fuente', 'Metas del programa de capacitación de la empresa',
    'indicadores', jsonb_build_array(
      jsonb_build_object(
        'clave','cumplimiento', 'nombre','Cumplimiento del programa',
        'formula','actividades ejecutadas ÷ actividades programadas',
        'num', c_ejec, 'den', c_prog,
        'valor', case when c_prog = 0 then null else round(100.0*c_ejec/c_prog, 1) end,
        'unidad','actividades',
        'nota','Las canceladas con motivo no cuentan en el denominador.'),
      jsonb_build_object(
        'clave','cobertura', 'nombre','Cobertura del personal',
        'formula','personas que asistieron ÷ personas convocadas',
        'num', b_asis, 'den', b_conv,
        'valor', case when b_conv = 0 then null else round(100.0*b_asis/b_conv, 1) end,
        'unidad','asistencias',
        'nota','Sobre las actividades ya ejecutadas del año.'),
      jsonb_build_object(
        'clave','eficacia', 'nombre','Eficacia de la formación',
        'formula','aprobados ÷ evaluados (nota ≥ ' || p_nota_min || ')',
        'num', e_aprob, 'den', e_eval,
        'valor', case when e_eval = 0 then null else round(100.0*e_aprob/e_eval, 1) end,
        'unidad','evaluaciones',
        'nota','Sólo cuenta quien tiene nota cargada.'),
      jsonb_build_object(
        'clave','al_dia', 'nombre','Personal con formación al día',
        'formula','personas al día ÷ personas con plan definido',
        'num', p_al_dia, 'den', p_con_plan,
        'valor', case when p_con_plan = 0 then null else round(100.0*p_al_dia/p_con_plan, 1) end,
        'unidad','personas',
        'nota','Quien todavía no tiene plan queda fuera del denominador.')
    ));
end $$;

comment on function cap_indicadores is
  'Los indicadores del programa contra la meta que la empresa se puso, con numerador y denominador a la vista. Sin denominador devuelve null, no cero: un indicador que no se puede calcular no vale cero.';

grant execute on function cap_indicadores(int, numeric, numeric) to authenticated;

commit;

-- =====================================================================
--  COMPROBACIÓN
-- =====================================================================
-- select jsonb_pretty(cap_indicadores());
