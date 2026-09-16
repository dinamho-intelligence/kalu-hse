-- ============================================================
--  KALU · Módulo HORAS EXTRA — Esquema Fase 1
--  Convenciones (arquitectura maestra):
--   * Multiempresa: toda tabla lleva empresa_id + RLS por empresa.
--   * Reusar personas (padrón) y perfiles (login). No crear otra tabla de gente.
--   * Roles del módulo van en 'accesos' (modulo='hhee'), no acá.
--   * RLS resuelve la empresa del usuario por lookup a perfiles (mismo mecanismo
--     que el resto; NO se inventan helpers auth_*()).
--   * Nada se borra: baja lógica (activo/estado).
--  Correr en Supabase SQL editor. Idempotente donde se puede.
-- ============================================================

-- ---------- 0. Helper de empresa del usuario (SECURITY DEFINER, estable) ----------
-- Se usa en todas las políticas. Si ya existe uno equivalente en el core, reusar ese
-- y borrar esta función.
create or replace function he_empresa_actual()
returns uuid language sql stable security definer set search_path=public as $$
  select empresa_id from perfiles where id = auth.uid()
$$;

create or replace function he_es_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    (select (rol in ('hse','supervisor','admin') or acceso_consola or es_super)
       from perfiles where id = auth.uid()), false)
$$;

-- ---------- 1. Turnos (definición) ----------
create table if not exists he_turnos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  nombre        text not null,                    -- 'Turno día', 'Turno noche'
  tipo          text not null check (tipo in ('dia','noche')),
  -- horarios como jsonb: { "L-V":[["07:30","12:00"],["13:00","16:00"]], "sab":[["07:30","12:00"]], "dom":[] }
  horarios      jsonb not null default '{}'::jsonb,
  tiene_almuerzo boolean not null default true,
  activo        boolean not null default true,
  creado_at     timestamptz not null default now()
);

-- ---------- 2. Cuadrilla / asignación semanal (base del almanaque) ----------
create table if not exists he_cuadrilla (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  persona_id    uuid not null references personas(id),
  fecha_desde   date not null,
  fecha_hasta   date not null,
  turno_id      uuid references he_turnos(id),
  color         text,                             -- para la vista visual del almanaque
  nota          text,
  creado_por    uuid,                             -- perfiles.id de quien asignó
  creado_at     timestamptz not null default now()
);
create index if not exists he_cuadrilla_idx on he_cuadrilla(empresa_id, persona_id, fecha_desde, fecha_hasta);

-- ---------- 3. Autorizaciones de horas extra ----------
create table if not exists he_autorizacion (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  fecha         date not null,
  persona_id    uuid references personas(id),     -- null = aplica a grupo/cargo
  cargo         text,                             -- opcional: autorizar por cargo
  horas         numeric,                          -- horas autorizadas (opcional)
  cliente_id    integer,                          -- ref a clientes (interno si null + es_interno)
  es_interno    boolean not null default false,
  foto_correo_url text,                           -- evidencia del correo del cliente
  nota          text,
  creado_por    uuid,
  creado_at     timestamptz not null default now()
);
create index if not exists he_autorizacion_idx on he_autorizacion(empresa_id, fecha, persona_id);

-- ---------- 4. Reportes (lo que carga el trabajador) ----------
create table if not exists he_reporte (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  persona_id    uuid not null references personas(id),
  fecha         date not null,
  hora_inicio   text,                             -- 'HH:MM'
  hora_fin      text,                             -- 'HH:MM'
  lugar         text,                             -- ej. 'Base BH, Villavicencio'
  cliente_id    integer,
  es_interno    boolean not null default false,
  justificacion text,
  tipo_dia      text check (tipo_dia in ('semanal','dominical','festivo')),
  es_jornada_ordinaria boolean not null default false,  -- true=turno normal (RNOCT), false=extra
  -- categorías calculadas por el motor (he_motor.js): {HED,HEN,DOMD,DOMN,HEFD,HEFN,RNOCT}
  categorias    jsonb not null default '{}'::jsonb,
  estado        text not null default 'reportado'
                 check (estado in ('borrador','reportado','autorizado','no_autorizado','rechazado','cerrado')),
  fuera_de_plan boolean not null default false,   -- reportado sin coincidir con autorización/almanaque
  nro_form      text,                             -- FHA/FIE nn (consecutivo del formato legal)
  origen        text not null default 'app' check (origen in ('app','historico','manual')),
  cierre_id     uuid,                             -- se setea al cerrar el período
  creado_at     timestamptz not null default now(),
  aprobado_por  uuid,
  aprobado_at   timestamptz
);
create index if not exists he_reporte_idx on he_reporte(empresa_id, persona_id, fecha);
create index if not exists he_reporte_estado_idx on he_reporte(empresa_id, estado);

-- ---------- 5. Cierres de período ----------
create table if not exists he_cierre (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id),
  persona_id    uuid not null references personas(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  totales       jsonb not null default '{}'::jsonb,   -- suma por categoría
  pdf_url       text,                                 -- FHA-95 generado (bucket documentos)
  aprobado_por  uuid,
  aprobado_at   timestamptz,
  creado_at     timestamptz not null default now()
);
create index if not exists he_cierre_idx on he_cierre(empresa_id, periodo_desde, periodo_hasta);

-- ---------- 6. Festivos (calendario Colombia) ----------
create table if not exists he_festivos (
  fecha   date primary key,
  nombre  text not null,
  pais    text not null default 'CO'
);

-- ============================================================
--  RLS — por empresa (lookup a perfiles vía he_empresa_actual())
-- ============================================================
alter table he_turnos       enable row level security;
alter table he_cuadrilla    enable row level security;
alter table he_autorizacion enable row level security;
alter table he_reporte      enable row level security;
alter table he_cierre       enable row level security;
alter table he_festivos     enable row level security;

-- Lectura por empresa; escritura por empresa (afinar por rol en front/n8n si hace falta)
do $$
declare t text;
begin
  foreach t in array array['he_turnos','he_cuadrilla','he_autorizacion','he_reporte','he_cierre']
  loop
    execute format('drop policy if exists %I_sel on %I', t, t);
    execute format('drop policy if exists %I_mod on %I', t, t);
    execute format($p$create policy %I_sel on %I for select using (empresa_id = he_empresa_actual())$p$, t, t);
    execute format($p$create policy %I_mod on %I for all
        using (empresa_id = he_empresa_actual())
        with check (empresa_id = he_empresa_actual())$p$, t, t);
  end loop;
end $$;

-- Festivos: lectura para todos los autenticados; escritura solo admin
drop policy if exists he_festivos_sel on he_festivos;
drop policy if exists he_festivos_mod on he_festivos;
create policy he_festivos_sel on he_festivos for select using (true);
create policy he_festivos_mod on he_festivos for all using (he_es_admin()) with check (he_es_admin());

-- ============================================================
--  SEED — festivos Colombia 2026 (18, con ley Emiliani)
-- ============================================================
insert into he_festivos (fecha, nombre) values
  ('2026-01-01','Año Nuevo'),
  ('2026-01-12','Reyes Magos'),
  ('2026-03-23','San José'),
  ('2026-04-02','Jueves Santo'),
  ('2026-04-03','Viernes Santo'),
  ('2026-05-01','Día del Trabajo'),
  ('2026-05-18','Ascensión del Señor'),
  ('2026-06-08','Corpus Christi'),
  ('2026-06-15','Sagrado Corazón'),
  ('2026-06-29','San Pedro y San Pablo'),
  ('2026-07-20','Día de la Independencia'),
  ('2026-08-07','Batalla de Boyacá'),
  ('2026-08-17','Asunción de la Virgen'),
  ('2026-10-12','Día de la Raza'),
  ('2026-11-02','Todos los Santos'),
  ('2026-11-16','Independencia de Cartagena'),
  ('2026-12-08','Inmaculada Concepción'),
  ('2026-12-25','Navidad')
on conflict (fecha) do nothing;

-- ============================================================
--  SEED — turnos confirmados por Marcelo (15-sep-2026)
--  Resuelve el empresa_id SOLO (no hay que pegar el uuid).
--  Ajustá el filtro ilike si la razón social de Dinamho es otra.
-- ============================================================
-- Para ver las empresas y elegir bien:  select id, razon_social, nit from empresas order by razon_social;

do $$
declare emp uuid;
begin
  select id into emp from empresas
   where razon_social ilike '%dinamho%'   -- <-- ajustar si hace falta (es el tenant dueño, DNM)
   order by razon_social limit 1;
  if emp is null then
    raise notice 'No se encontró la empresa por razon_social ilike %%dinamho%%. Ajustá el filtro y volvé a correr solo este bloque.';
  else
    insert into he_turnos (empresa_id, nombre, tipo, horarios, tiene_almuerzo)
    select emp,'Turno día','dia',
       '{"L-V":[["07:30","12:00"],["13:00","16:00"]],"sab":[["07:30","12:00"]],"dom":[]}'::jsonb, true
    where not exists (select 1 from he_turnos where empresa_id=emp and nombre='Turno día');
    insert into he_turnos (empresa_id, nombre, tipo, horarios, tiene_almuerzo)
    select emp,'Turno noche','noche',
       '{"L-V":[["13:00","20:30"]],"sab":[["13:00","17:30"]],"dom":[]}'::jsonb, false
    where not exists (select 1 from he_turnos where empresa_id=emp and nombre='Turno noche');
    raise notice 'Turnos sembrados para empresa %', emp;
  end if;
end $$;

-- Recordá: agregar 'hhee' al catálogo de empresas.modulos y a empresas.modulos[]
-- de la(s) empresa(s) que contraten el módulo; y branding.docs['hhee']={codigo:'A.FR009',version:'002',fecha:...}.
-- Para habilitarlo en la empresa Dinamho (ajustá el ilike si hace falta):
--   update empresas set modulos = (coalesce(modulos,'[]'::jsonb) || '["hhee"]'::jsonb)
--    where razon_social ilike '%dinamho%' and not (modulos ? 'hhee');
