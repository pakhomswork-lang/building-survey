-- Шаг 14а, исправление (Р-30). Вставить целиком в SQL Editor и нажать Run. Запускать один раз, после 02_sync.sql.
--
-- 1. В правилах загрузки картинки листа слово name внутри проверки читалось как
--    название листа, а не имя файла, поэтому сервер не давал загрузить картинку
--    даже автору листа. Пишем objects.name — имя файла.
-- 2. Убираем записи, которые оставила неудачная проверка (объекты «ТЕСТ проверки…»).

drop policy "sheets files: загружает автор листа" on storage.objects;
drop policy "sheets files: заменяет автор" on storage.objects;

create policy "sheets files: загружает автор листа" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sheets' and exists (
    select 1 from public.sheets s
    where s.project_id::text = (storage.foldername(objects.name))[1]
      and s.id::text = storage.filename(objects.name)
      and s.author_id = (select auth.uid())
  ));
create policy "sheets files: заменяет автор" on storage.objects
  for update to authenticated
  using (bucket_id = 'sheets' and owner_id = (select auth.jwt() ->> 'sub'))
  with check (bucket_id = 'sheets' and exists (
    select 1 from public.sheets s
    where s.project_id::text = (storage.foldername(objects.name))[1]
      and s.id::text = storage.filename(objects.name)
      and s.author_id = (select auth.uid())
  ));

-- уборка тестовых записей (сверху вниз нельзя, поэтому снизу вверх)
delete from public.photos where project_id in (select id from public.projects where name like 'ТЕСТ проверки%');
delete from public.points where project_id in (select id from public.projects where name like 'ТЕСТ проверки%');
delete from public.sheets where project_id in (select id from public.projects where name like 'ТЕСТ проверки%');
delete from public.projects where name like 'ТЕСТ проверки%';
