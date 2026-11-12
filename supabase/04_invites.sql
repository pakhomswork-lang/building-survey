-- Шаг 15а. Приглашение коллеги в общий объект по ссылке (Р-35).
-- Вставить целиком в SQL Editor и нажать Run. Запускать один раз, после 03_fix_sheet_files.sql.
--
-- Правила (решение владельца 13.11.2026):
-- - у каждого общего объекта одна ссылка; показать её может любой участник;
-- - ссылка работает, пока кто-нибудь из участников не нажмёт «Новая ссылка»;
-- - по ссылке вошедший человек становится участником объекта;
-- - код автора уникален внутри объекта (Р-18, Р-29): если код уже занят, вступить нельзя;
-- - убрать участника нельзя, выйти можно только самому.
--
-- С таблицей приглашений приложение напрямую не работает: только через три функции ниже,
-- они сами проверяют права.

create table public.project_invites (
  project_id uuid primary key references public.projects (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.project_invites enable row level security;
-- прав на таблицу не даём никому: доступ только через функции

-- Ссылка объекта для участника. p_new = true — старая ссылка перестаёт работать, создаётся новая.
create function public.invite_token(p_project uuid, p_new boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t uuid;
begin
  if not public.is_member(p_project) then
    raise exception 'Вы не участник этого объекта' using errcode = '42501';
  end if;
  if exists (select 1 from public.projects where id = p_project and deleted) then
    raise exception 'Объект удалён' using errcode = 'P0002';
  end if;
  if p_new then
    delete from public.project_invites where project_id = p_project;
  end if;
  insert into public.project_invites (project_id) values (p_project) on conflict (project_id) do nothing;
  select token into t from public.project_invites where project_id = p_project;
  return t;
end $$;

-- Что за объект по ссылке: чтобы показать «Вас приглашают в объект …» до вступления.
-- Пусто, если ссылка не работает.
create function public.invite_info(p_token uuid)
returns table (project_id uuid, project_name text, members integer, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name,
         (select count(*)::integer from public.project_members m where m.project_id = p.id),
         exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()))
  from public.project_invites i
  join public.projects p on p.id = i.project_id
  where i.token = p_token and not p.deleted and (select auth.uid()) is not null
$$;

-- Вступить в объект по ссылке. Возвращает id объекта.
create function public.join_project(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pid uuid;
  my_code text;
  clash text;
begin
  if me is null then
    raise exception 'Войдите в аккаунт' using errcode = '42501';
  end if;
  select i.project_id into pid
  from public.project_invites i join public.projects p on p.id = i.project_id
  where i.token = p_token and not p.deleted;
  if pid is null then
    raise exception 'Ссылка не работает: её заменили на новую или объект удалён' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.project_members where project_id = pid and user_id = me) then
    return pid;
  end if;
  select code into my_code from public.profiles where id = me;
  if my_code is null then
    raise exception 'Имя и код ещё не дошли до сервера. Подождите минуту и попробуйте снова' using errcode = 'P0001';
  end if;
  select pr.name into clash
  from public.project_members m join public.profiles pr on pr.id = m.user_id
  where m.project_id = pid and pr.code = my_code
  limit 1;
  if clash is not null then
    raise exception 'Код % уже занят в этом объекте (%). Поменяйте код в профиле и попробуйте снова', my_code, clash
      using errcode = 'P0001';
  end if;
  insert into public.project_members (project_id, user_id, role) values (pid, me, 'member');
  return pid;
end $$;

-- вызывать функции могут только вошедшие
revoke execute on function public.invite_token(uuid, boolean) from public, anon;
revoke execute on function public.invite_info(uuid) from public, anon;
revoke execute on function public.join_project(uuid) from public, anon;
grant execute on function public.invite_token(uuid, boolean) to authenticated;
grant execute on function public.invite_info(uuid) to authenticated;
grant execute on function public.join_project(uuid) to authenticated;
