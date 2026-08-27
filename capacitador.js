-- =====================================================================
--  KALU Capacitador — cap_53: las metas son de la empresa, no del código
--
--  EL PROBLEMA
--
--  En cap_52 la meta era un parámetro con 90 por defecto. Para Total QC
--  daba bien de casualidad —su PG-HUM-001 dice 90%—, pero cualquier otra
--  empresa iba a ver «meta 90%» sin que nadie se la hubiera puesto.
--
--  En una auditoría eso es indefendible. El auditor pregunta quién fijó
--  la meta y la respuesta honesta sería «el que programó el sistema».
--  Y no hay norma que la fije: la Res. 0312/2019 exige tener indicadores
--  y medirlos, no dice cuánto. El 90 es de Total QC, no de la ley.
--
--  CÓMO QUEDA
--
--  KALU **sugiere**, la empresa **adopta**. Y son dos estados distintos:
--
--    · sin adoptar → se muestra el indicador y la sugerencia, SIN
--      veredicto. Decir «no cumple» contra una meta que nadie eligió no
--      significa nada.
--    · adoptada → aparece la rayita de la meta y el cumple / no cumple,
--      con quién la adoptó, cuándo y de dónde la sacó.
--
--  POR AÑO, Y NO SE PISA
--
--  La meta se guarda por empresa, año e indicador. Si el año que viene
--  Total QC sube al 95%, el informe de 2026 tiene que seguir mostrando
--  90%: una meta que se reescribe hacia atrás vuelve irreproducible todo
--  lo ya presentado.
--
--  Correr después de cap_52.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------
create table if not exists cap_meta (
  id          uuid primary key default uuid_generate_v4(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  anio        int  not null,
  indicador   text not null
              check (indicador in ('cumplimiento','cobertura','eficacia','al_dia')),
  valor       numeric(5,2) not null check (valor > 0 and valor <= 100),
  nota_min    numeric(5,2) check (nota_min > 0 and nota_min <= 100),
  fuente      text,
  adoptada_por uuid references personas(id) on delete set null,
  adoptada_en  timestamptz not null default now(),
  unique (empresa_id, anio, indicador)
);

comment on table cap_meta is
  'La meta de cada indicador, por empresa y por año. Existe para que el número no lo ponga el software: en una auditoría, «quién fijó esta meta» tiene que tener una respuesta con nombre, fecha y documento.';
comment on column cap_meta.fuente is
  'De dónde sale. Idealmente el documento y su versión — «PG-HUM-001 v004». Si se adoptó la sugerencia de KALU, queda dicho así.';
comment on column cap_meta.anio is
  'Por año a propósito: subir la meta del año que viene no puede cambiar el informe del año pasado.';

alter table cap_meta enable row level security;
drop policy if exists cap_meta_sel on cap_meta;
create policy cap_meta_sel on cap_meta for select
  using (cap_es_servicio() or empresa_id = cap_empresa_id());
drop policy if exists cap_meta_wri on cap_meta;
create policy cap_meta_wri on cap_meta for all
  using      (cap_es_servicio() or (empresa_id = cap_empresa_id() and cap_es_admin()))
  with check (cap_es_servicio() or (empresa_id = cap_empresa_id() and cap_es_admin()));

grant select on cap_meta to authenticated;

-- ---------------------------------------------------------------------
-- 2. Lo que KALU sugiere — y por qué
--
--    Se dice de dónde sale cada sugerencia. «Valor habitual» es honesto;
--    «exigido por norma» sería mentira y alguien lo repetiría en una
--    reunión creyendo que es cierto.
-- ---------------------------------------------------------------------
create or replace function cap_meta_sugerida(p_indicador text) returns jsonb
language sql immutable as $$
  select case p_indicador
    when 'cumplimiento' then jsonb_build_object('valor', 90, 'nota_min', null,
      'por_que', 'Valor habitual en programas de SG-SST. Ninguna norma lo fija: la Res. 0312/2019 exige medir el indicador, no dice cuánto.')
    when 'cobertura' then jsonb_build_object('valor', 90, 'nota_min', null,
      'por_que', 'Valor habitual. Por debajo del 90% suele haber personal que quedó sistemáticamente afuera de las convocatorias.')
    when 'eficacia' then jsonb_build_object('valor', 90, 'nota_min', 80,
      'por_que', 'La nota mínima de 80 es el corte más usado para dar una evaluación por aprobada.')
    when 'al_dia' then jsonb_build_object('valor', 95, 'nota_min', null,
      'por_que', 'Más exigente que las otras a propósito: acá no se mide una actividad, se mide gente habilitada para trabajar.')
    else jsonb_build_object('valor', 90, 'nota_min', null, 'por_que', null) end;
$$;

-- ---------------------------------------------------------------------
-- 3. Adoptar una meta
-- ---------------------------------------------------------------------
create or replace function cap_meta_guardar(
  p_anio int, p_indicador text, p_valor numeric,
  p_fuente text default null, p_nota_min numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_yo uuid;
begin
  perform cap_exigir_gestor();
  v_emp := cap_empresa_id();
  v_yo  := cap_persona_id();

  if p_valor is null or p_valor <= 0 or p_valor > 100 then
    raise exception 'La meta tiene que ser un porcentaje entre 1 y 100.';
  end if;

  insert into cap_meta (empresa_id, anio, indicador, valor, nota_min, fuente, adoptada_por)
  values (v_emp, p_anio, p_indicador, p_valor, p_nota_min,
          nullif(btrim(coalesce(p_fuente,'')),''), v_yo)
  on conflict (empresa_id, anio, indicador) do update
    set valor = excluded.valor,
        nota_min = excluded.nota_min,
        fuente = excluded.fuente,
        adoptada_por = excluded.adoptada_por,
        adoptada_en = now();

  perform cap_log('guardar', 'meta', null::uuid, null::jsonb,
    jsonb_build_object('anio', p_anio, 'indicador', p_indicador,
                       'valor', p_valor, 'fuente', p_fuente),
    'Meta del indicador', v_emp);

  return jsonb_build_object('aviso',
    'Meta guardada: ' || p_indicador || ' ' || p_valor || '% para ' || p_anio || '.');
end $$;

grant execute on function cap_meta_guardar(int, text, numeric, text, numeric) to authenticated;
grant execute on function cap_meta_sugerida(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Los indicadores, ahora contra la meta de la empresa
-- ---------------------------------------------------------------------
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
       'actividades ejecutadas ÷ actividades programadas','actividades',
       'Las canceladas con motivo no cuentan en el denominador.', c_ejec, c_prog),
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
                     else v_val >= m.valor end);
  end loop;

  return jsonb_build_object(
    'anio', v_anio, 'nota_min', v_nota,
    'puede_editar', cap_puede_editar(),
    'indicadores', v_out);
end $$;

grant execute on function cap_indicadores(int, numeric, numeric) to authenticated;

commit;

-- =====================================================================
--  COMPROBACIÓN — qué metas hay adoptadas hoy
-- =====================================================================
select e.razon_social as empresa, m.anio, m.indicador, m.valor, m.nota_min,
       coalesce(m.fuente,'— sin fuente —') as fuente
from cap_meta m join empresas e on e.id = m.empresa_id
order by e.razon_social, m.anio, m.indicador;
