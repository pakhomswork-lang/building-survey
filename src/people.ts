// Участники общих объектов: имя и код автора (шаг 16, Р-38).
// Берём с сервера (таблица profiles) и храним в телефоне, чтобы видеть и без сети:
// settings `person:<id аккаунта>` = {"name": "...", "code": "..."}.

import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMyIds, getUserProfile } from './db'
import { supabase } from './supabase'

interface Person {
  name: string
  code: string
}

/** Забрать с сервера имена и коды всех, с кем мы в общих объектах. */
export async function refreshPeople() {
  const { data: members, error } = await supabase.from('project_members').select('user_id')
  if (error) throw new Error(error.message)
  const ids = [...new Set((members as { user_id: string }[]).map(m => m.user_id))]
  if (!ids.length) return
  const { data, error: e2 } = await supabase.from('profiles').select('id, name, code').in('id', ids)
  if (e2) throw new Error(e2.message)
  await db.settings.bulkPut(
    (data as (Person & { id: string })[]).map(p => ({ key: `person:${p.id}`, value: JSON.stringify({ name: p.name, code: p.code }) })),
  )
}

export interface People {
  /** Свой ли это автор (этот телефон или аккаунт на нём). */
  isMine: (authorId: string) => boolean
  /** Код автора, например «ИВА». Пусто, если ещё неизвестен. */
  codeOf: (authorId: string) => string
  /** «Иванов И. (ИВА)», «вы» или «участник», если ещё неизвестен. */
  nameOf: (authorId: string) => string
}

/** Кто есть кто — для экранов. */
export function usePeople(): People | undefined {
  const data = useLiveQuery(async () => {
    const [myIds, me, rows] = await Promise.all([
      getMyIds(),
      getUserProfile(),
      db.settings.where('key').startsWith('person:').toArray(),
    ])
    const map = new Map<string, Person>()
    for (const r of rows) {
      try {
        map.set(r.key.slice('person:'.length), JSON.parse(r.value) as Person)
      } catch {
        // испорченная запись — пропускаем
      }
    }
    return { myIds, me, map }
  })
  if (!data) return undefined
  const { myIds, me, map } = data
  const isMine = (id: string) => myIds.has(id)
  return {
    isMine,
    codeOf: id => (isMine(id) ? (me?.code ?? '') : (map.get(id)?.code ?? '')),
    nameOf: id => {
      if (isMine(id)) return 'вы'
      const p = map.get(id)
      return p ? `${p.name} (${p.code})` : 'участник'
    },
  }
}
