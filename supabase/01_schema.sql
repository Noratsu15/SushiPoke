-- ============================================================================
-- SUSHI POKE MARACAY — Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar en: Supabase Dashboard → SQL Editor (en orden)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------------
create type public.user_role       as enum ('customer', 'admin');
create type public.order_status    as enum ('pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado');
create type public.order_type      as enum ('delivery', 'pickup', 'local');
create type public.product_category as enum ('rolls', 'entradas', 'poke', 'bebidas', 'postres');
create type public.promo_currency  as enum ('USD', 'BCV');

-- ---------------------------------------------------------------------------
-- 2. PERFILES (se enlaza 1:1 con auth.users de Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null check (char_length(full_name) between 2 and 120),
  phone          text not null check (phone ~ '^[+0-9][0-9 ()-]{6,19}$'),
  role           public.user_role not null default 'customer',
  accepts_promos boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (phone)
);

-- ---------------------------------------------------------------------------
-- 3. DIRECCIONES (guardadas del usuario para pedidos delivery)
-- ---------------------------------------------------------------------------
create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  label      text check (label is null or char_length(label) <= 60),
  address    text not null check (char_length(address) between 5 and 300),
  city       text not null default 'Maracay',
  state      text not null default 'Aragua',
  reference  text check (reference is null or char_length(reference) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);

-- Garantiza una sola dirección predeterminada por usuario
create unique index addresses_one_default_idx
  on public.addresses(user_id) where is_default;

-- ---------------------------------------------------------------------------
-- 4. PRODUCTOS DEL MENÚ
-- ---------------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    public.product_category not null,
  price       numeric(10,2) not null check (price >= 0),
  description text check (description is null or char_length(description) <= 500),
  image_url   text,
  is_active   boolean not null default true,
  is_featured boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. PROMOCIONES
-- ---------------------------------------------------------------------------
create table public.promotions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  badge       text check (badge is null or char_length(badge) <= 40),
  description text check (description is null or char_length(description) <= 500),
  includes    text,
  price       numeric(10,2) not null check (price >= 0),
  currency    public.promo_currency not null default 'USD',
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. PEDIDOS
-- ---------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1;

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique,
  user_id        uuid references public.profiles(id) on delete set null,
  status         public.order_status not null default 'pendiente',
  order_type     public.order_type not null default 'delivery',
  payment_method text check (payment_method is null or char_length(payment_method) <= 60),
  address_id     uuid references public.addresses(id) on delete set null,
  address_text   text,                      -- respaldo legible de la dirección al momento del pedido
  notes          text check (notes is null or char_length(notes) <= 500),
  subtotal       numeric(10,2) not null check (subtotal >= 0),
  delivery_fee   numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total          numeric(10,2) not null check (total >= 0),
  currency       text not null default 'USD' check (currency in ('USD', 'BCV')),
  whatsapp_sent  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index orders_user_idx    on public.orders(user_id);
create index orders_created_idx on public.orders(created_at desc);
create index orders_status_idx  on public.orders(status);

-- Número de pedido legible: SP-20261010-0001 (hora de Venezuela)
create or replace function public.set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'SP-'
      || to_char(now() at time zone 'America/Caracas', 'YYYYMMDD')
      || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end; $$;

create trigger trg_order_number before insert on public.orders
  for each row execute function public.set_order_number();

-- ---------------------------------------------------------------------------
-- 7. DETALLE DE PEDIDO
-- ---------------------------------------------------------------------------
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  quantity     int not null check (quantity > 0 and quantity <= 100),
  image_url    text
);
create index order_items_order_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- 8. SESIONES ACTIVAS (evita inicio de sesión duplicado)
-- ---------------------------------------------------------------------------
create table public.active_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  session_token text not null unique,
  user_agent   text,
  ip_address   inet,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index active_sessions_user_idx on public.active_sessions(user_id);

-- Cierra automáticamente todas las sesiones anteriores al crear una nueva
create or replace function public.register_session(p_token text, p_user_agent text default null, p_ip inet default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.active_sessions
     set is_active = false
   where user_id = auth.uid() and is_active;

  insert into public.active_sessions (user_id, session_token, user_agent, ip_address)
  values (auth.uid(), p_token, p_user_agent, p_ip)
  returning id into v_session_id;

  insert into public.audit_logs (user_id, action, metadata)
  values (auth.uid(), 'session_started', jsonb_build_object('session_id', v_session_id));

  return v_session_id;
end; $$;

-- Valida que la sesión actual siga siendo la única activa
create or replace function public.validate_session(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select exists (
    select 1 from public.active_sessions
     where user_id = auth.uid() and session_token = p_token and is_active
  ) into v_ok;

  if v_ok then
    update public.active_sessions set last_seen_at = now()
     where user_id = auth.uid() and session_token = p_token;
  end if;

  return v_ok;
end; $$;

create or replace function public.close_session(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.active_sessions set is_active = false
   where user_id = auth.uid() and session_token = p_token and is_active;
end; $$;

-- ---------------------------------------------------------------------------
-- 9. CREACIÓN ATÓMICA DE PEDIDO (pedido + ítems en una sola transacción)
--    NOTA FASE 2: validar unit_price contra public.products para evitar
--    manipulación desde el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_items jsonb,
  p_order_type public.order_type default 'delivery',
  p_address_id uuid default null,
  p_payment_method text default null,
  p_notes text default null,
  p_currency text default 'USD'
)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_order     public.orders;
  v_item      jsonb;
  v_subtotal  numeric(10,2) := 0;
  v_delivery  numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar el pedido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'quantity')::int, 0) <= 0
       or coalesce((v_item->>'unit_price')::numeric, -1) < 0
       or coalesce(v_item->>'product_name', '') = '' then
      raise exception 'Ítem de pedido inválido';
    end if;
    v_subtotal := v_subtotal + (v_item->>'unit_price')::numeric * (v_item->>'quantity')::int;
  end loop;

  v_delivery := coalesce((select (value->>'delivery_fee_usd')::numeric
                            from public.site_settings
                           where key = 'delivery'), 0);

  insert into public.orders (user_id, order_type, address_id, payment_method, notes,
                             subtotal, delivery_fee, total, currency)
  values (auth.uid(), p_order_type, p_address_id, p_payment_method, p_notes,
          v_subtotal, case when p_order_type = 'delivery' then v_delivery else 0 end,
          v_subtotal + case when p_order_type = 'delivery' then v_delivery else 0 end,
          case when p_currency in ('USD','BCV') then p_currency else 'USD' end)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (order_id, product_name, unit_price, quantity, image_url)
    values (v_order.id, v_item->>'product_name', (v_item->>'unit_price')::numeric,
            (v_item->>'quantity')::int, v_item->>'image_url');
  end loop;

  insert into public.audit_logs (user_id, action, metadata)
  values (auth.uid(), 'order_created', jsonb_build_object('order_id', v_order.id,
          'order_number', v_order.order_number, 'total', v_order.total));

  return v_order;
end; $$;

-- ---------------------------------------------------------------------------
-- 10. BITÁCORA DE AUDITORÍA
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  action     text not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs (user_id, action, metadata)
    values (auth.uid(), 'order_status_changed',
            jsonb_build_object('order_id', new.id, 'from', old.status, 'to', new.status));
  end if;
  return new;
end; $$;

create trigger trg_order_status after update on public.orders
  for each row execute function public.log_order_status_change();

-- ---------------------------------------------------------------------------
-- 11. CONFIGURACIÓN DEL SITIO (tasa BCV, tarifa de delivery, etc.)
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 12. UTILIDADES
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Crea el perfil automáticamente cuando se registra un usuario en Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger trg_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 13. ROW LEVEL SECURITY (seguridad a nivel de fila)
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.addresses       enable row level security;
alter table public.products        enable row level security;
alter table public.promotions      enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.active_sessions enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.site_settings   enable row level security;

-- profiles: cada usuario solo ve/edita su perfil; el admin ve todos
create policy profiles_select on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());
-- (el INSERT lo hace el trigger handle_new_user como definer)

-- addresses: propietario únicamente
create policy addresses_all on public.addresses for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- products / promotions: lectura pública, escritura solo admin
create policy products_read  on public.products   for select to anon, authenticated using (true);
create policy products_write on public.products   for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy promos_read    on public.promotions for select to anon, authenticated using (true);
create policy promos_write   on public.promotions for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders: el cliente crea y lee los suyos; el admin gestiona todos
create policy orders_insert on public.orders for insert to authenticated
  with check (auth.uid() = user_id);
create policy orders_select on public.orders for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy orders_update on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- order_items: acceso vía la propiedad del pedido
create policy items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy items_insert on public.order_items for insert to authenticated
  with check (exists (select 1 from public.orders o
                       where o.id = order_id and o.user_id = auth.uid()));

-- active_sessions: el usuario solo ve sus sesiones activas
create policy sessions_select on public.active_sessions for select to authenticated
  using (auth.uid() = user_id);

-- audit_logs: solo lectura admin
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- site_settings: lectura pública (tasa BCV, tarifa), escritura admin
create policy settings_read  on public.site_settings for select to anon, authenticated using (true);
create policy settings_write on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 14. PERMISOS DE FUNCIONES (solo usuarios autenticados)
-- ---------------------------------------------------------------------------
revoke all on function public.register_session(text, text, inet) from public;
revoke all on function public.validate_session(text)            from public;
revoke all on function public.close_session(text)               from public;
revoke all on function public.create_order(jsonb, public.order_type, uuid, text, text, text) from public;
revoke all on function public.is_admin() from public;

grant execute on function public.register_session(text, text, inet) to authenticated;
grant execute on function public.validate_session(text)             to authenticated;
grant execute on function public.close_session(text)                to authenticated;
grant execute on function public.create_order(jsonb, public.order_type, uuid, text, text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ⚠️ Para crear el primer administrador, tras registrarte en la app ejecuta:
-- update public.profiles set role = 'admin' where phone = '+584243678252';