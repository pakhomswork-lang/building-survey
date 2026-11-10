-- Шаг 13. Профили участников: имя и код автора (Р-18, Р-29).
-- Вставить целиком в SQL Editor проекта и нажать Run. Запускать один раз.
-- Читать профили могут все вошедшие (видно, кто снимал), менять — только свой.
-- Код уникален только внутри объекта, это проверяется в шаге 15.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  code text not null check (code ~ '^[A-Z0-9]{2,5}$'),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

create policy "profiles: читают все вошедшие" on public.profiles
  for select to authenticated using (true);
create policy "profiles: создаёт только владелец" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: меняет только владелец" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
