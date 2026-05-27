-- 1) Crea esta tabla en Supabase SQL Editor.
create table if not exists public.rsvp_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  has_companion boolean not null default false,
  companion_name text,
  dietary_restrictions text,
  comments text,
  user_agent text
);

-- 2) Activa Row Level Security.
alter table public.rsvp_confirmations enable row level security;

-- 3) Invitados anonimos solo pueden insertar confirmaciones.
drop policy if exists "Invitados pueden confirmar" on public.rsvp_confirmations;
create policy "Invitados pueden confirmar"
on public.rsvp_confirmations
for insert
to anon
with check (true);

-- 4) Solo tu usuario admin autenticado puede leer/exportar.
-- Cambia TU_CORREO_ADMIN por el correo con el que iniciaras sesion en /admin.html.
drop policy if exists "Admin puede leer confirmaciones" on public.rsvp_confirmations;
create policy "Admin puede leer confirmaciones"
on public.rsvp_confirmations
for select
to authenticated
using (auth.email() = 'TU_CORREO_ADMIN');

