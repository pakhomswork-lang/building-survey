// Свои списки, позиции и шаблоны (шаг 24, Р-47, Р-48, Р-55).
//
// Позиции лежат внутри списка. У позиции постоянный id: по нему отметки (шаг 25) ссылаются
// на позицию, поэтому переименование и смена цвета отметки не ломают.

import { useLiveQuery } from 'dexie-react-hooks'
import { db, getAccountId, getMyIds, getUserId, newRecordFields, type List, type ListItem, type ListTemplate } from './db'

/** Цвета позиций: хорошо различимые на белом чертеже. */
export const LIST_COLORS = [
  '#e03131', '#1c7ed6', '#2f9e44', '#f08c00', '#7048e8', '#0c8599',
  '#c2255c', '#5c940d', '#e8590c', '#3b5bdb', '#868e96', '#212529',
]

/** Цвет для новой позиции: первый ещё не занятый, иначе по кругу. */
export function nextColor(items: ListItem[]): string {
  const used = new Set(items.map(i => i.color))
  return LIST_COLORS.find(c => !used.has(c)) ?? LIST_COLORS[items.length % LIST_COLORS.length]
}

export const newItem = (items: ListItem[], name = ''): ListItem => ({ id: crypto.randomUUID().slice(0, 8), name, color: nextColor(items) })

/** Копия позиций с новыми id — для списка из шаблона и шаблона из списка. */
const copyItems = (items: ListItem[]): ListItem[] => items.map(i => ({ ...i, id: crypto.randomUUID().slice(0, 8) }))

// --- списки объекта ---

export async function listsOfProject(projectId: string): Promise<List[]> {
  return (await db.lists.where('projectId').equals(projectId).sortBy('createdAt')).filter(l => !l.deleted)
}

export async function createList(projectId: string, name: string, items: ListItem[] = []): Promise<List> {
  const list: List = { ...(await newRecordFields()), projectId, name, items: copyItems(items) }
  await db.lists.add(list)
  return list
}

export async function updateList(listId: string, changes: Partial<Pick<List, 'name' | 'items'>>) {
  await db.lists.update(listId, { ...changes, updatedAt: Date.now() })
}

/** Удалить список вместе с его отметками. */
export async function deleteList(listId: string) {
  const now = Date.now()
  await db.transaction('rw', db.lists, db.marks, async () => {
    await db.lists.update(listId, { deleted: true, updatedAt: now })
    await db.marks.where('listId').equals(listId).modify({ deleted: true, updatedAt: now })
  })
}

/** Сколько живых отметок у каждой позиции списка. */
export async function markCounts(listId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const m of await db.marks.where('listId').equals(listId).toArray()) {
    if (!m.deleted) counts.set(m.itemId, (counts.get(m.itemId) ?? 0) + 1)
  }
  return counts
}

/**
 * Удалить позицию (Р-55): её отметки удалить (moveTo = null) или перенести в другую позицию.
 */
export async function deleteItem(list: List, itemId: string, moveTo: string | null) {
  const now = Date.now()
  await db.transaction('rw', db.lists, db.marks, async () => {
    const marks = db.marks.where('listId').equals(list.id).filter(m => m.itemId === itemId && !m.deleted)
    if (moveTo) await marks.modify({ itemId: moveTo, updatedAt: now })
    else await marks.modify({ deleted: true, updatedAt: now })
    await db.lists.update(list.id, { items: list.items.filter(i => i.id !== itemId), updatedAt: now })
  })
}

// --- шаблоны ---

/** Свои шаблоны (этого телефона и аккаунта, в который вошли), по алфавиту. */
export async function allTemplates(): Promise<ListTemplate[]> {
  // сначала читаем сами шаблоны: тогда экран сам обновляется, когда шаблоны меняются
  const [all, mine] = await Promise.all([db.listTemplates.toArray(), getMyIds()])
  return all
    .filter(t => !t.deleted && mine.has(t.authorId))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function createTemplate(name: string, items: ListItem[] = []): Promise<ListTemplate> {
  const t: ListTemplate = { ...(await newRecordFields()), name, items: copyItems(items) }
  await db.listTemplates.add(t)
  return t
}

export async function updateTemplate(id: string, changes: Partial<Pick<ListTemplate, 'name' | 'items'>>) {
  await db.listTemplates.update(id, { ...changes, updatedAt: Date.now() })
}

export async function deleteTemplate(id: string) {
  await db.listTemplates.update(id, { deleted: true, updatedAt: Date.now() })
}

/** Шаблоны, сделанные без входа, после входа подписываем аккаунтом — тогда они уйдут на сервер. */
export async function adoptDeviceTemplates() {
  const [deviceId, accountId] = await Promise.all([getUserId(), getAccountId()])
  if (!accountId || deviceId === accountId) return
  await db.listTemplates.filter(t => t.authorId === deviceId).modify({ authorId: accountId })
}

/** Сколько списков в объекте — для пункта на экране объекта. */
export function useListCount(projectId: string) {
  return useLiveQuery(async () => (await db.lists.where('projectId').equals(projectId).toArray()).filter(l => !l.deleted).length, [projectId])
}
