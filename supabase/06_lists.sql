-- Шаг 24а. Свои списки, отметки на плане и шаблоны списков (Р-47, Р-48, Р-55).
-- Вставить целиком в SQL Editor и нажать Run. Запускать один раз, после 05_rooms.sql.
--
-- Правила (решения владельца 19.11.2026):
-- - список — одна характеристика объекта («Материал стен»), позиции лежат внутри списка:
--   [{"id": "…", "name": "Кирпичные", "color": "#e8590c"}, …];
-- - отметка — точка на листе без фото, одна позиция одного списка (шаг 25);
-- - списки и отметки объекта видят все участники и править может любой участник;
--   автор записи при правке не меняется;
-- - шаблоны списков — в аккаунте: видит и правит только владелец;
-- - если одну запись правили на двух устройствах без сети, остаётся более поздняя правка.

-- 1. Проверка позиций списка --------------------------------------------------
create function public.list_items_ok(items jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 300
    and not exists (
      select 1 from jsonb_array_elements(items) as e
      where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'id') <> 'string'
        or jsonb_typeof(e -> 'name') <> 'string'
        or jsonb_typeof(e -> 'color') <> 'string'
        or length(e ->> 'name') > 200
        or length(e ->> 'color') > 20
    )
$$;

-- 2. Таблицы ------------------------------------------------------------------
create table public.lists (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 200),
  items jsonb not null default '[]' check (public.list_items_ok(items)),
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create index lists_project on public.lists (project_id, server_updated_at);

create table public.marks (
  id uuid primary key,
  project_id uuid not null,
  sheet_id uuid not null,
  list_id uuid not null,
  -- id позиции внутри списка
  item_id text not null check (length(item_id) between 1 and 64),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  x real not null check (x between 0 and 100),
  y real not null check (y between 0 and 100),
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  -- отметка лежит на листе того же объекта и относится к списку того же объекта
  foreign key (sheet_id, project_id) references public.sheets (id, project_id),
  foreign key (list_id, project_id) references public.lists (id, project_id)
);
create index marks_project on public.marks (project_id, server_updated_at);

create table public.list_templates (
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 200),
  items jsonb not null default '[]' check (public.list_items_ok(items)),
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);
create index list_templates_author on public.list_templates (author_id, server_updated_at);

-- более поздняя правка побеждает (функция из 02_sync.sql)
create trigger lists_keep_latest before insert or update on public.lists
  for each row execute function public.keep_latest();
create trigger marks_keep_latest before insert or update on public.marks
  for each row execute function public.keep_latest();
create trigger list_templates_keep_latest before insert or update on public.list_templates
  for each row execute function public.keep_latest();

-- Список и отметку правит любой участник, но автор записи остаётся прежним.
create function public.keep_author() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.author_id := old.author_id;
  return new;
end $$;

create trigger lists_keep_author before update on public.lists
  for each row execute function public.keep_author();
create trigger marks_keep_author before update on public.marks
  for each row execute function public.keep_author();

-- 3. Правила доступа (RLS) ----------------------------------------------------
alter table public.lists enable row level security;
alter table public.marks enable row level security;
alter table public.list_templates enable row level security;
grant select, insert, update, delete on public.lists, public.marks, public.list_templates to authenticated;

create policy "lists: видят участники" on public.lists
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "lists: добавляет участник" on public.lists
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "lists: меняет участник" on public.lists
  for update to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));
create policy "lists: удаляет участник" on public.lists
  for delete to authenticated using (public.is_member(project_id));

create policy "marks: видят участники" on public.marks
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "marks: добавляет участник" on public.marks
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "marks: меняет участник" on public.marks
  for update to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));
create policy "marks: удаляет участник" on public.marks
  for delete to authenticated using (public.is_member(project_id));

create policy "templates: видит владелец" on public.list_templates
  for select to authenticated using (author_id = (select auth.uid()));
create policy "templates: создаёт владелец" on public.list_templates
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "templates: меняет владелец" on public.list_templates
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "templates: удаляет владелец" on public.list_templates
  for delete to authenticated using (author_id = (select auth.uid()));

-- 4. Мгновенные обновления на других устройствах ------------------------------
alter publication supabase_realtime add table public.lists, public.marks, public.list_templates;
