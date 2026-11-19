-- Шаг 19а. Помещения на листах (Р-46, Р-48).
-- Вставить целиком в SQL Editor и нажать Run. Запускать один раз, после 04_invites.sql.
--
-- Правила (решение владельца 19.11.2026):
-- - помещения видят все участники объекта;
-- - рисует, правит и удаляет помещения только создатель объекта;
-- - помещение лежит на листе того же объекта;
-- - контур — список углов [[x, y], …] в процентах от ширины и высоты листа (0–100), от 3 углов;
--   прямоугольник — это просто 4 угла;
-- - если одно помещение правили на двух устройствах без сети, остаётся более поздняя правка.
--
-- Помещение у точки сервер не хранит отдельно: телефон определяет его по контуру (Р-48).
-- Ручной выбор лежит в уже существующем поле points.room_id (id помещения или 'none').

-- 1. Проверка контура ---------------------------------------------------------
create function public.contour_ok(c jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(c) = 'array'
    and jsonb_array_length(c) between 3 and 500
    and not exists (
      select 1 from jsonb_array_elements(c) as e
      where jsonb_typeof(e) <> 'array'
        or jsonb_array_length(e) <> 2
        or jsonb_typeof(e -> 0) <> 'number'
        or jsonb_typeof(e -> 1) <> 'number'
        or (e ->> 0)::real not between 0 and 100
        or (e ->> 1)::real not between 0 and 100
    )
$$;

-- 2. Таблица ------------------------------------------------------------------
create table public.rooms (
  id uuid primary key,
  project_id uuid not null,
  sheet_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contour jsonb not null check (public.contour_ok(contour)),
  -- номер текстом: «1», «А1», «Б3»
  number text not null default '' check (length(number) <= 20),
  name text not null default '' check (length(name) <= 200),
  comment text not null default '' check (length(comment) <= 2000),
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  -- помещение лежит на листе того же объекта
  foreign key (sheet_id, project_id) references public.sheets (id, project_id)
);
create index rooms_project on public.rooms (project_id, server_updated_at);
create index rooms_sheet on public.rooms (sheet_id);

create trigger rooms_keep_latest before insert or update on public.rooms
  for each row execute function public.keep_latest();

-- 3. Создатель ли вошедший у объекта ------------------------------------------
-- security definer — чтобы проверка не упиралась в правила таблицы объектов.
create function public.is_project_owner(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects
    where id = p_project and author_id = (select auth.uid())
  )
$$;

-- 4. Правила доступа (RLS) ----------------------------------------------------
alter table public.rooms enable row level security;
grant select, insert, update, delete on public.rooms to authenticated;

create policy "rooms: видят участники" on public.rooms
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "rooms: добавляет создатель объекта" on public.rooms
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_project_owner(project_id) and public.is_member(project_id));
create policy "rooms: меняет создатель объекта" on public.rooms
  for update to authenticated
  using (public.is_project_owner(project_id))
  with check (author_id = (select auth.uid()) and public.is_project_owner(project_id) and public.is_member(project_id));
create policy "rooms: удаляет создатель объекта" on public.rooms
  for delete to authenticated using (public.is_project_owner(project_id));

-- 5. Мгновенные обновления на других телефонах --------------------------------
alter publication supabase_realtime add table public.rooms;
