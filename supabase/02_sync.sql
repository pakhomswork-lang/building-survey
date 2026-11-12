-- Шаг 14а. Общие объекты бригады: объекты, участники, листы, точки, записи о фото,
-- хранилище картинок листов (Р-28, Р-30).
-- Вставить целиком в SQL Editor проекта и нажать Run. Запускать один раз, после 01_profiles.sql.
--
-- Правила:
-- - на сервер попадают только объекты, для которых включено «Работать с бригадой»;
-- - видят объект и всё в нём только участники объекта (и автор записи — свои записи);
-- - менять и удалять запись может только её автор (Р-14);
-- - лист с точками других участников удалить нельзя;
-- - если одну запись правили на двух устройствах без сети, остаётся более поздняя правка;
-- - сами фото на сервер не идут, только записи о них (Р-13).
--
-- Время created_at, updated_at, taken_at — как в телефоне: миллисекунды с 1970 года.
-- server_updated_at ставит сервер: по нему телефон спрашивает «что изменилось с прошлого раза».

-- 1. Уборка после теста шага 12 ----------------------------------------------
drop table if exists public.spike_points;
drop policy if exists "spike files: читают все вошедшие" on storage.objects;
drop policy if exists "spike files: загрузка в свою папку" on storage.objects;
drop policy if exists "spike files: замена своих" on storage.objects;
drop policy if exists "spike files: удаление своих" on storage.objects;
-- Само хранилище spike удаляется руками: Storage → spike → Delete bucket
-- (Supabase не даёт удалять файлы командами SQL).

-- 2. Таблицы ------------------------------------------------------------------
create table public.projects (
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);

-- Кто участвует в объекте. Создатель добавляется сам (триггер ниже),
-- остальные — по приглашению в шаге 15.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user on public.project_members (user_id);

create table public.sheets (
  id uuid primary key,
  project_id uuid not null references public.projects (id),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  sort_order integer not null default 0,
  -- размер картинки листа в пикселях
  width integer,
  height integer,
  -- где картинка в хранилище sheets: <id объекта>/<id листа>; пусто, пока не загружена
  image_path text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create index sheets_project on public.sheets (project_id, server_updated_at);

create table public.points (
  id uuid primary key,
  project_id uuid not null,
  sheet_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  x real not null check (x between 0 and 100),
  y real not null check (y between 0 and 100),
  comment text not null default '',
  room_id text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  -- точка стоит на листе того же объекта
  foreign key (sheet_id, project_id) references public.sheets (id, project_id),
  unique (id, sheet_id, project_id)
);
create index points_project on public.points (project_id, server_updated_at);
create index points_sheet on public.points (sheet_id);

create table public.photos (
  id uuid primary key,
  project_id uuid not null,
  sheet_id uuid not null,
  point_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('general', 'defect', 'measure', 'node', 'opening')),
  file_name text not null check (length(file_name) between 1 and 200),
  taken_at bigint not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  -- фото относится к точке того же листа и объекта
  foreign key (point_id, sheet_id, project_id) references public.points (id, sheet_id, project_id)
);
create index photos_project on public.photos (project_id, server_updated_at);

-- 3. Вспомогательные функции --------------------------------------------------
-- Участник ли вошедший в объекте. security definer — чтобы проверка не упиралась
-- в правила самой таблицы участников.
create function public.is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project and user_id = (select auth.uid())
  )
$$;

-- То же по тексту (папка в хранилище), без ошибки на кривом имени.
create function public.is_member_text(p_project text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members
    where project_id::text = p_project and user_id = (select auth.uid())
  )
$$;

-- Создатель объекта сразу становится его участником.
create function public.add_project_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.author_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner();

-- Более поздняя правка побеждает: правку со старым временем сервер молча пропускает.
-- Заодно сервер отмечает, когда запись у него поменялась.
create function public.keep_latest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := now();
  return new;
end $$;

create trigger projects_keep_latest before insert or update on public.projects
  for each row execute function public.keep_latest();
create trigger sheets_keep_latest before insert or update on public.sheets
  for each row execute function public.keep_latest();
create trigger points_keep_latest before insert or update on public.points
  for each row execute function public.keep_latest();
create trigger photos_keep_latest before insert or update on public.photos
  for each row execute function public.keep_latest();

-- Лист, на котором есть точки других участников, удалить нельзя.
-- security definer — чтобы увидеть все точки листа.
create function public.check_sheet_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted and not old.deleted and exists (
    select 1 from public.points
    where sheet_id = new.id and not deleted and author_id <> new.author_id
  ) then
    raise exception 'На листе есть точки других участников' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger sheets_check_delete before update on public.sheets
  for each row execute function public.check_sheet_delete();

-- 4. Правила доступа (RLS) ----------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sheets enable row level security;
alter table public.points enable row level security;
alter table public.photos enable row level security;

grant select, insert, update, delete on public.projects, public.sheets, public.points, public.photos to authenticated;
grant select, delete on public.project_members to authenticated;

-- Объект: видят участники; переименовывает и удаляет создатель.
create policy "projects: видят участники" on public.projects
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(id));
create policy "projects: создаёт сам автор" on public.projects
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "projects: меняет создатель" on public.projects
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "projects: удаляет создатель" on public.projects
  for delete to authenticated using (author_id = (select auth.uid()));

-- Участники: видят друг друга внутри объекта; выйти из объекта можно самому.
create policy "members: видят участники объекта" on public.project_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_member(project_id));
create policy "members: выйти самому" on public.project_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- Листы, точки, фото: видят участники; добавляет участник от своего имени;
-- меняет и удаляет только автор.
create policy "sheets: видят участники" on public.sheets
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "sheets: добавляет участник" on public.sheets
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "sheets: меняет автор" on public.sheets
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "sheets: удаляет автор" on public.sheets
  for delete to authenticated using (author_id = (select auth.uid()));

create policy "points: видят участники" on public.points
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "points: добавляет участник" on public.points
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "points: меняет автор" on public.points
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "points: удаляет автор" on public.points
  for delete to authenticated using (author_id = (select auth.uid()));

create policy "photos: видят участники" on public.photos
  for select to authenticated using (author_id = (select auth.uid()) or public.is_member(project_id));
create policy "photos: добавляет участник" on public.photos
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "photos: меняет автор" on public.photos
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.is_member(project_id));
create policy "photos: удаляет автор" on public.photos
  for delete to authenticated using (author_id = (select auth.uid()));

-- 5. Мгновенные обновления на других телефонах --------------------------------
alter publication supabase_realtime add table
  public.projects, public.project_members, public.sheets, public.points, public.photos;

-- 6. Хранилище картинок листов ------------------------------------------------
-- Путь файла: <id объекта>/<id листа>. До 50 МБ (предел бесплатного тарифа), только картинки.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheets', 'sheets', false, 52428800, array['image/jpeg', 'image/png', 'image/webp']);

create policy "sheets files: видят участники" on storage.objects
  for select to authenticated
  using (bucket_id = 'sheets' and (owner_id = (select auth.jwt() ->> 'sub')
         or public.is_member_text((storage.foldername(name))[1])));
-- загрузить картинку может только автор листа, и только в папку его объекта
create policy "sheets files: загружает автор листа" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sheets' and exists (
    select 1 from public.sheets s
    where s.project_id::text = (storage.foldername(name))[1]
      and s.id::text = storage.filename(name)
      and s.author_id = (select auth.uid())
  ));
create policy "sheets files: заменяет автор" on storage.objects
  for update to authenticated
  using (bucket_id = 'sheets' and owner_id = (select auth.jwt() ->> 'sub'))
  with check (bucket_id = 'sheets' and exists (
    select 1 from public.sheets s
    where s.project_id::text = (storage.foldername(name))[1]
      and s.id::text = storage.filename(name)
      and s.author_id = (select auth.uid())
  ));
create policy "sheets files: удаляет автор" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sheets' and owner_id = (select auth.jwt() ->> 'sub'));
