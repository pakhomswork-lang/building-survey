-- Исправление к 06_lists.sql (19.11.2026): сервер принимал позицию списка без цвета.
-- Вставить целиком в SQL Editor и нажать Run. Запускать один раз, после 06_lists.sql.
--
-- Причина: если у позиции нет поля (id, name или color), проверка получала «пусто» (NULL)
-- вместо «нет», и правило не срабатывало. «is distinct from» считает пустое тоже ошибкой.
-- Правило таблиц lists и list_templates само берёт исправленную функцию.

create or replace function public.list_items_ok(items jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 300
    and not exists (
      select 1 from jsonb_array_elements(items) as e
      where jsonb_typeof(e) is distinct from 'object'
        or jsonb_typeof(e -> 'id') is distinct from 'string'
        or jsonb_typeof(e -> 'name') is distinct from 'string'
        or jsonb_typeof(e -> 'color') is distinct from 'string'
        or length(e ->> 'name') > 200
        or length(e ->> 'color') > 20
    )
$$;
