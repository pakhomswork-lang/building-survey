// Получение общих объектов с сервера (шаг 14в, Р-33).
//
// Сервер помечает каждую запись временем server_updated_at. Телефон помнит, до какого
// времени уже всё забрал (settings `pull:<таблица>`), и спрашивает только то, что новее.
// Берём с запасом в 2 минуты назад: повторно пришедшая запись ничего не портит.
// Сервер отдаёт только объекты, где мы участники (правила базы, Р-30).
//
// Своя правка, которая ещё не ушла на сервер и новее серверной, не затирается:
// остаётся более поздняя правка (Р-14).

import type { EntityTable } from 'dexie'
import { db, type Photo, type PhotoType, type Point, type Project, type Sheet, type SyncFields } from './db'
import { sheetImageFromBlob } from './sheetImport'
import { refreshPeople } from './people'
import { supabase } from './supabase'

const OVERLAP_MS = 2 * 60_000
const PAGE = 1000
/** Запасная проверка, если мгновенные обновления молчат (например, телефон спал). */
const FALLBACK_MS = 5 * 60_000

type Row = Record<string, unknown> & { id: string; server_updated_at: string }

/** Все записи таблицы, изменённые на сервере после прошлого раза. */
async function fetchChanged(table: string): Promise<{ rows: Row[]; cursor: string | null }> {
  const saved = (await db.settings.get(`pull:${table}`))?.value
  let from = saved ? new Date(Date.parse(saved) - OVERLAP_MS).toISOString() : null
  const rows: Row[] = []
  for (;;) {
    let query = supabase.from(table).select('*').order('server_updated_at').limit(PAGE)
    if (from) query = query.gte('server_updated_at', from)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows.push(...(data as Row[]))
    if (data.length < PAGE) break
    from = (data[data.length - 1] as Row).server_updated_at
  }
  return { rows, cursor: rows.length ? rows[rows.length - 1].server_updated_at : saved ?? null }
}

const saveCursor = (table: string, cursor: string | null) =>
  cursor ? db.settings.put({ key: `pull:${table}`, value: cursor }) : Promise.resolve()

// --- записи сервера → записи телефона ---

const common = (r: Row): SyncFields => {
  const updatedAt = Number(r.updated_at)
  return {
    id: r.id,
    authorId: String(r.author_id),
    createdAt: Number(r.created_at),
    updatedAt,
    deleted: Boolean(r.deleted),
    // эта правка уже на сервере — отправлять не нужно
    pushedAt: updatedAt,
  }
}
const toProject = (r: Row): Project => ({ ...common(r), name: String(r.name), shared: true })
const toSheet = (r: Row): Sheet => ({
  ...common(r),
  projectId: String(r.project_id),
  name: String(r.name),
  order: Number(r.sort_order),
  imagePushed: Boolean(r.image_path),
})
const toPoint = (r: Row): Point => ({
  ...common(r),
  projectId: String(r.project_id),
  sheetId: String(r.sheet_id),
  x: Number(r.x),
  y: Number(r.y),
  comment: String(r.comment ?? ''),
  roomId: (r.room_id as string | null) ?? null,
})
const toPhoto = (r: Row): Photo => ({
  ...common(r),
  projectId: String(r.project_id),
  sheetId: String(r.sheet_id),
  pointId: String(r.point_id),
  type: r.type as PhotoType,
  fileName: String(r.file_name),
  takenAt: Number(r.taken_at),
})

/** Кладём пришедшие записи в базу телефона. Возвращает те, что действительно поменялись. */
async function applyRows<T extends SyncFields>(table: EntityTable<T, 'id'>, rows: Row[], toLocal: (r: Row) => T): Promise<T[]> {
  const changed: T[] = []
  await db.transaction('rw', table, async () => {
    for (const row of rows) {
      const remote = toLocal(row)
      const local = (await table.where('id').equals(remote.id).first()) as T | undefined
      if (local) {
        // своя правка новее серверной — она уйдёт на сервер сама
        if (local.updatedAt > remote.updatedAt) continue
        // ровно эта правка уже есть
        if (local.updatedAt === remote.updatedAt && local.pushedAt === local.updatedAt) continue
      }
      await table.put(remote)
      changed.push(remote)
    }
  })
  return changed
}

/** Картинки листов, которых ещё нет в телефоне, скачиваем с сервера. */
async function downloadSheetImages() {
  const sheets = await db.sheets.filter(s => !s.deleted && !!s.imagePushed).toArray()
  const have = await db.sheetImages.bulkGet(sheets.map(s => s.id))
  for (const [i, s] of sheets.entries()) {
    if (have[i]) continue
    const { data, error } = await supabase.storage.from('sheets').download(`${s.projectId}/${s.id}`)
    if (error || !data) continue // попробуем в следующий раз
    const { thumb, width, height } = await sheetImageFromBlob(data)
    await db.sheetImages.put({ sheetId: s.id, blob: data, thumb, width, height })
  }
}

/**
 * Объекты, которых для нас на сервере больше нет (их стёрли или мы вышли из них),
 * убираем и из телефона. Иначе они висят «призраками»: в списке есть, а сервер их не знает (Р-36).
 * Трогаем только объекты, которые уже были на сервере (pushedAt есть).
 */
async function dropGhostProjects(userId: string) {
  const { data, error } = await supabase.from('project_members').select('project_id').eq('user_id', userId)
  if (error) throw new Error(error.message)
  const mine = new Set((data as { project_id: string }[]).map(r => r.project_id))
  const candidates = (await db.projects.toArray()).filter(
    p => p.shared && !p.deleted && p.pushedAt !== undefined && !mine.has(p.id),
  )
  if (!candidates.length) return
  // переспрашиваем: объект мог только что уйти на сервер, пока мы читали список
  const { data: still, error: e2 } = await supabase.from('projects').select('id').in('id', candidates.map(p => p.id))
  if (e2) throw new Error(e2.message)
  const visible = new Set((still as { id: string }[]).map(r => r.id))
  for (const p of candidates) {
    if (visible.has(p.id)) continue
    // помечаем удалённым только в телефоне: на сервер это не отправляется (pushedAt = updatedAt)
    await db.projects.update(p.id, { deleted: true, pushedAt: p.updatedAt })
    const sheetIds = await db.sheets.where('projectId').equals(p.id).primaryKeys()
    await db.sheetImages.bulkDelete(sheetIds)
  }
}

async function pullOnce(userId: string) {
  await dropGhostProjects(userId)

  const projects = await fetchChanged('projects')
  const sheets = await fetchChanged('sheets')
  const points = await fetchChanged('points')
  const photos = await fetchChanged('photos')

  await applyRows(db.projects, projects.rows, toProject)
  const changedSheets = await applyRows(db.sheets, sheets.rows, toSheet)
  await applyRows(db.points, points.rows, toPoint)
  const changedPhotos = await applyRows(db.photos, photos.rows, toPhoto)

  // удалённое на другом устройстве убираем и тут, как при удалении в телефоне
  await db.sheetImages.bulkDelete(changedSheets.filter(s => s.deleted).map(s => s.id))
  await db.photoFiles.bulkDelete(changedPhotos.filter(p => p.deleted).map(p => p.fileName))

  // запоминаем, докуда забрали, только после того, как всё легло в базу
  await saveCursor('projects', projects.cursor)
  await saveCursor('sheets', sheets.cursor)
  await saveCursor('points', points.cursor)
  await saveCursor('photos', photos.cursor)

  await downloadSheetImages()
  await refreshPeople()
}

let running = false
let again = false

/** Забрать с сервера всё новое. */
export async function pullAll() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      if (!navigator.onLine) return
      const { data } = await supabase.auth.getSession()
      if (!data.session) return
      await pullOnce(data.session.user.id)
    } while (again)
  } catch (e) {
    // не страшно: попробуем при следующем событии или через несколько минут
    console.warn('Получение с сервера не удалось:', e)
  } finally {
    running = false
  }
}

const TABLES = ['projects', 'sheets', 'points', 'photos']

/**
 * Получает изменения сам: при входе и запуске, сразу после изменения на сервере
 * (мгновенные обновления), когда появилась сеть, когда приложение снова на экране,
 * и раз в 5 минут на всякий случай.
 */
export function startAutoPull(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const kick = (delay = 300) => {
    clearTimeout(timer)
    timer = setTimeout(pullAll, delay)
  }
  kick(0)

  const channel = supabase.channel('team-changes')
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => kick())
  }
  // после переподключения забираем то, что пропустили, пока связи не было
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') kick()
  })

  const onOnline = () => kick(500)
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const fallback = setInterval(() => kick(0), FALLBACK_MS)

  return () => {
    clearTimeout(timer)
    clearInterval(fallback)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    supabase.removeChannel(channel)
  }
}
