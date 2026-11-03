-- Тест Supabase (шаг 12). Вставить целиком в SQL Editor проекта и нажать Run.
-- Создаёт тестовую таблицу точек и тестовое хранилище файлов.
-- Правило Р-14: читать могут все вошедшие, менять — только автор.

-- Таблица точек
create table public.spike_points (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  x real not null,
  y real not null,
  comment text,
  created_at timestamptz not null default now()
);

alter table public.spike_points enable row level security;
-- доступ к таблице через приложение; что именно можно, решают правила ниже
grant select, insert, update, delete on public.spike_points to authenticated;

create policy "spike_points: читают все вошедшие" on public.spike_points
  for select to authenticated using (true);
create policy "spike_points: добавляет только автор" on public.spike_points
  for insert to authenticated with check (author = (select auth.uid()));
create policy "spike_points: меняет только автор" on public.spike_points
  for update to authenticated using (author = (select auth.uid())) with check (author = (select auth.uid()));
create policy "spike_points: удаляет только автор" on public.spike_points
  for delete to authenticated using (author = (select auth.uid()));

-- Мгновенные обновления на других телефонах
alter publication supabase_realtime add table public.spike_points;

-- Хранилище файлов (листы). Каждый пишет только в свою папку <id пользователя>/
insert into storage.buckets (id, name, public) values ('spike', 'spike', false);

create policy "spike files: читают все вошедшие" on storage.objects
  for select to authenticated using (bucket_id = 'spike');
create policy "spike files: загрузка в свою папку" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'spike' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));
create policy "spike files: замена своих" on storage.objects
  for update to authenticated
  using (bucket_id = 'spike' and owner_id = (select auth.jwt() ->> 'sub'))
  with check (bucket_id = 'spike' and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub'));
create policy "spike files: удаление своих" on storage.objects
  for delete to authenticated
  using (bucket_id = 'spike' and owner_id = (select auth.jwt() ->> 'sub'));
