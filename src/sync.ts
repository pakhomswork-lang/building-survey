// Отправка общих объектов на сервер (шаг 14б, Р-32).
//
// Какая правка записи уже на сервере, помнит поле pushedAt: если оно не равно updatedAt,
// запись ждёт отправки. Поэтому ничего не теряется без сети: всё, что изменилось,
// так и остаётся «ждёт», пока не уйдёт. Отправляем только свои записи.
// Порядок важен: объект → листы (с картинками) → точки → записи о фото.

import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { adoptDeviceRecords, db, getAccountId, getMyIds, type Photo, type Point, type Project, type Sheet, type SheetImage, type SyncFields } from './db'
import { supabase } from './supabase'

const BUCKET = 'sheets'
/** Сколько записей отправлять за один запрос. */
const CHUNK = 200
/** Если отправка не удалась, пробуем снова через столько миллисекунд. */
const RETRY_MS = 60_000

export const sheetImagePath = (s: Sheet) => `${s.projectId}/${s.id}`

const waits = (r: SyncFields) => r.pushedAt !== r.updatedAt
const sheetWaits = (s: Sheet) => waits(s) || (!s.deleted && !s.imagePushed)

interface Pending {
  project: Project | null
  sheets: Sheet[]
  points: Point[]
  photos: Photo[]
}

/** Что из объекта ждёт отправки. myIds — аккаунт и id телефона (записи, сделанные без входа). */
async function pendingIn(project: Project, myIds: Set<string>): Promise<Pending> {
  const mine = (r: SyncFields) => myIds.has(r.authorId)
  const [sheets, points, photos] = await Promise.all([
    db.sheets.where('projectId').equals(project.id).toArray(),
    db.points.where('projectId').equals(project.id).toArray(),
    db.photos.where('projectId').equals(project.id).toArray(),
  ])
  return {
    project: mine(project) && waits(project) ? project : null,
    sheets: sheets.filter(s => mine(s) && sheetWaits(s)),
    points: points.filter(p => mine(p) && waits(p)),
    photos: photos.filter(p => mine(p) && waits(p)),
  }
}

const countOf = (p: Pending) => (p.project ? 1 : 0) + p.sheets.length + p.points.length + p.photos.length

/** Сколько записей объекта ждёт отправки. Для строки на экране объекта. */
export async function countPending(projectId: string): Promise<number> {
  const [project, myIds] = await Promise.all([db.projects.get(projectId), getMyIds()])
  if (!project?.shared) return 0
  return countOf(await pendingIn(project, myIds))
}

// --- записи для сервера (имена полей как в supabase/02_sync.sql) ---

const common = (r: SyncFields) => ({
  id: r.id,
  author_id: r.authorId,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  deleted: r.deleted,
})
const projectRow = (p: Project) => ({ ...common(p), name: p.name })
const sheetRow = (s: Sheet, image: SheetImage | undefined, imagePushed: boolean) => ({
  ...common(s),
  project_id: s.projectId,
  name: s.name,
  sort_order: s.order,
  width: image?.width,
  height: image?.height,
  image_path: imagePushed ? sheetImagePath(s) : null,
})
const pointRow = (p: Point) => ({
  ...common(p),
  project_id: p.projectId,
  sheet_id: p.sheetId,
  x: p.x,
  y: p.y,
  comment: p.comment,
  room_id: p.roomId,
})
const photoRow = (p: Photo) => ({
  ...common(p),
  project_id: p.projectId,
  sheet_id: p.sheetId,
  point_id: p.pointId,
  type: p.type,
  file_name: p.fileName,
  taken_at: p.takenAt,
})

/** Понятный текст ошибки. */
function explain(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'нет связи с сервером'
  if (m.includes('row-level security')) return 'сервер не принял: нет прав'
  if (m.includes('jwt')) return 'вход устарел, войдите в аккаунт заново'
  return message
}

async function upsert(table: string, rows: object[]) {
  const { error } = await supabase.from(table).upsert(rows)
  if (error) throw new Error(explain(error.message))
}

/** Отмечаем, что эта правка записи на сервере. Если запись успели поменять снова — не отмечаем. */
async function markPushed(table: typeof db.points | typeof db.photos | typeof db.projects, records: SyncFields[]) {
  await db.transaction('rw', table, async () => {
    for (const r of records) {
      await (table as typeof db.points)
        .where('id')
        .equals(r.id)
        .filter(x => x.updatedAt === r.updatedAt)
        .modify({ pushedAt: r.updatedAt })
    }
  })
}

/** Отправляет записи пачками. Если пачку не приняли, пробуем по одной, чтобы одна плохая не держала остальные. */
async function pushRecords<T extends SyncFields>(
  name: string,
  table: typeof db.points | typeof db.photos,
  records: T[],
  toRow: (r: T) => object,
  errors: string[],
) {
  for (let i = 0; i < records.length; i += CHUNK) {
    const part = records.slice(i, i + CHUNK)
    try {
      await upsert(name, part.map(toRow))
      await markPushed(table, part)
    } catch {
      for (const r of part) {
        try {
          await upsert(name, [toRow(r)])
          await markPushed(table, [r])
        } catch (e) {
          errors.push((e as Error).message)
        }
      }
    }
  }
}

async function pushSheet(s: Sheet) {
  const image = await db.sheetImages.get(s.id)
  let imagePushed = !!s.imagePushed
  await upsert('sheets', [sheetRow(s, image, imagePushed)])
  if (!s.deleted && !imagePushed && image) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(sheetImagePath(s), image.blob, { upsert: true, contentType: image.blob.type || 'image/jpeg' })
    if (error) throw new Error('картинка листа: ' + explain(error.message))
    imagePushed = true
    await upsert('sheets', [sheetRow(s, image, true)])
  }
  // картинка удалённого листа на сервере больше не нужна
  if (s.deleted && imagePushed) {
    await supabase.storage.from(BUCKET).remove([sheetImagePath(s)])
    imagePushed = false
  }
  await db.sheets
    .where('id')
    .equals(s.id)
    .filter(x => x.updatedAt === s.updatedAt)
    .modify({ pushedAt: s.updatedAt, imagePushed })
}

async function pushProjectData(projectId: string, accountId: string, errors: string[]) {
  await adoptDeviceRecords(projectId, accountId)
  const project = await db.projects.get(projectId)
  if (!project) return
  // после переподписи все свои записи подписаны аккаунтом
  const p = await pendingIn(project, new Set([accountId]))
  if (p.project) {
    try {
      await upsert('projects', [projectRow(p.project)])
      await markPushed(db.projects, [p.project])
    } catch (e) {
      // без объекта на сервере его листы и точки сервер не примет
      errors.push((e as Error).message)
      return
    }
  }
  for (const s of p.sheets) {
    try {
      await pushSheet(s)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  await pushRecords('points', db.points, p.points, pointRow, errors)
  await pushRecords('photos', db.photos, p.photos, photoRow, errors)
}

// --- состояние отправки для экрана ---

export interface PushState {
  busy: boolean
  /** Текст последней ошибки или null. */
  error: string | null
}
let state: PushState = { busy: false, error: null }
const listeners = new Set<() => void>()
function setState(next: Partial<PushState>) {
  state = { ...state, ...next }
  listeners.forEach(l => l())
}
export function usePushState(): PushState {
  return useSyncExternalStore(
    l => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Есть ли сеть (по мнению телефона). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// --- запуск ---

let running = false
let again = false

/** Отправить всё, что ждёт, во всех общих объектах. */
export async function pushAll() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      const accountId = await getAccountId()
      if (!accountId || !navigator.onLine) return
      const shared = (await db.projects.toArray()).filter(p => p.shared)
      if (!shared.length) return
      setState({ busy: true })
      const errors: string[] = []
      for (const p of shared) await pushProjectData(p.id, accountId, errors)
      setState({ error: errors.length ? errors[0] : null })
    } while (again)
  } catch (e) {
    setState({ error: explain((e as Error).message) })
  } finally {
    running = false
    setState({ busy: false })
  }
}

/**
 * Следит за базой и отправляет изменения сами: при запуске, через пару секунд после правки,
 * когда появилась сеть, и раз в минуту, если что-то не ушло.
 */
export function startAutoPush(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let waiting = 0
  const kick = (delay = 1500) => {
    clearTimeout(timer)
    timer = setTimeout(pushAll, delay)
  }
  const sub = liveQuery(async () => {
    const shared = (await db.projects.toArray()).filter(p => p.shared)
    let n = 0
    for (const p of shared) n += await countPending(p.id)
    return n
  }).subscribe(n => {
    waiting = n
    if (n > 0) kick()
  })
  // сразу после входа: заодно переподпишет записи, сделанные без входа
  kick(500)
  const onOnline = () => kick(500)
  window.addEventListener('online', onOnline)
  const retry = setInterval(() => {
    if (waiting > 0) kick(0)
  }, RETRY_MS)
  return () => {
    sub.unsubscribe()
    clearTimeout(timer)
    clearInterval(retry)
    window.removeEventListener('online', onOnline)
  }
}
