// База данных приложения на устройстве (IndexedDB через Dexie).
//
// Данные делятся на два вида:
// - записи (проект, лист, точка, фото) — их позже будем синхронизировать
//   с сервером (Р-14). У каждой есть id, автор, время изменения и флаг удаления;
// - файлы (картинка листа, сами фото) — только на этом устройстве, на сервер
//   не уходят (Р-13).

import Dexie, { type EntityTable } from 'dexie'

/** Поля, которые есть у каждой синхронизируемой записи. */
export interface SyncFields {
  /** Уникальный номер записи, одинаковый на всех устройствах. */
  id: string
  /** Кто создал запись (id пользователя). */
  authorId: string
  createdAt: number
  updatedAt: number
  /** Удалённые записи не стираем, а помечаем, чтобы удаление дошло до других устройств. */
  deleted: boolean
}

export interface Project extends SyncFields {
  name: string
}

export interface Sheet extends SyncFields {
  projectId: string
  name: string
  /** Порядок листов в списке. */
  order: number
}

export interface Point extends SyncFields {
  projectId: string
  sheetId: string
  /** Положение на листе в процентах от ширины и высоты (0–100). */
  x: number
  y: number
  comment: string
  /** Помещение. На этапе 1 не назначаем (Р-10). */
  roomId: string | null
}

export const PHOTO_TYPES = {
  general: 'Общий вид',
  defect: 'Дефект',
  measure: 'Замер',
  node: 'Узел',
  opening: 'Вскрытие, шурф',
} as const

export type PhotoType = keyof typeof PHOTO_TYPES

export interface Photo extends SyncFields {
  projectId: string
  sheetId: string
  pointId: string
  type: PhotoType
  /** Уникальное имя файла: по нему компьютер найдёт фото в папке (Р-13). */
  fileName: string
  takenAt: number
}

/** Картинка листа. Пока хранится только на устройстве. */
export interface SheetImage {
  sheetId: string
  blob: Blob
  /** Маленькая копия для списка листов. */
  thumb: Blob
  /** Размер картинки в пикселях. */
  width: number
  height: number
}

/** Само фото. Только на этом устройстве. */
export interface PhotoFile {
  fileName: string
  blob: Blob
  /** Маленькая копия для списков. */
  thumb: Blob
  /** Фото уже записано в папку телефона (Р-21). */
  savedToFolder?: boolean
}

/** Настройки устройства: кто пользователь и т. п. */
export interface Setting {
  key: string
  value: string
}

/** Доступ к папке телефона. Браузер разрешает хранить его в базе. */
export interface FolderRecord {
  key: string
  handle: FileSystemDirectoryHandle
}

export const db = new Dexie('building-survey') as Dexie & {
  projects: EntityTable<Project, 'id'>
  sheets: EntityTable<Sheet, 'id'>
  points: EntityTable<Point, 'id'>
  photos: EntityTable<Photo, 'id'>
  sheetImages: EntityTable<SheetImage, 'sheetId'>
  photoFiles: EntityTable<PhotoFile, 'fileName'>
  settings: EntityTable<Setting, 'key'>
  folders: EntityTable<FolderRecord, 'key'>
}

// Здесь перечислены только поля, по которым ищем. Остальные поля хранятся и так.
db.version(1).stores({
  projects: 'id, updatedAt',
  sheets: 'id, projectId, updatedAt',
  points: 'id, projectId, sheetId, roomId, updatedAt',
  photos: 'id, projectId, sheetId, pointId, type, fileName, updatedAt',
  sheetImages: 'sheetId',
  photoFiles: 'fileName',
  settings: 'key',
})

// v2: доступ к папке телефона, куда сохраняются фото (Р-21)
db.version(2).stores({
  folders: 'key',
})

/** id пользователя этого устройства. Создаётся один раз при первом запуске. */
export async function getUserId(): Promise<string> {
  const saved = await db.settings.get('userId')
  if (saved) return saved.value
  const userId = crypto.randomUUID()
  await db.settings.put({ key: 'userId', value: userId })
  return userId
}

/** Заполняет общие поля для новой записи. */
export async function newRecordFields(): Promise<SyncFields> {
  const now = Date.now()
  return { id: crypto.randomUUID(), authorId: await getUserId(), createdAt: now, updatedAt: now, deleted: false }
}

export async function createProject(name: string): Promise<Project> {
  const project: Project = { ...(await newRecordFields()), name }
  await db.projects.add(project)
  return project
}

/** Новая точка на листе. x и y — в процентах от ширины и высоты листа. */
export async function createPoint(projectId: string, sheetId: string, x: number, y: number): Promise<Point> {
  const point: Point = { ...(await newRecordFields()), projectId, sheetId, x, y, comment: '', roomId: null }
  await db.points.add(point)
  return point
}

// Удаление. Записи не стираем, а помечаем удалёнными, чтобы потом удаление дошло
// до других устройств (Р-14). Картинки листов и фото внутри приложения стираем,
// чтобы освободить место. Фото, уже сохранённые в папку телефона, остаются там.

const deletedNow = () => ({ deleted: true, updatedAt: Date.now() })

async function deletePhotosWhere(field: 'projectId' | 'sheetId' | 'pointId', id: string) {
  const photos = await db.photos.where(field).equals(id).toArray()
  await db.photos.bulkUpdate(photos.map(p => ({ key: p.id, changes: deletedNow() })))
  await db.photoFiles.bulkDelete(photos.map(p => p.fileName))
}

export async function deletePoint(pointId: string) {
  await db.transaction('rw', db.points, db.photos, db.photoFiles, async () => {
    await db.points.update(pointId, deletedNow())
    await deletePhotosWhere('pointId', pointId)
  })
}

export async function deleteSheet(sheetId: string) {
  await db.transaction('rw', [db.sheets, db.sheetImages, db.points, db.photos, db.photoFiles], async () => {
    await db.sheets.update(sheetId, deletedNow())
    await db.sheetImages.delete(sheetId)
    const points = await db.points.where('sheetId').equals(sheetId).primaryKeys()
    await db.points.bulkUpdate(points.map(key => ({ key, changes: deletedNow() })))
    await deletePhotosWhere('sheetId', sheetId)
  })
}

export async function deleteProject(projectId: string) {
  await db.transaction('rw', [db.projects, db.sheets, db.sheetImages, db.points, db.photos, db.photoFiles], async () => {
    await db.projects.update(projectId, deletedNow())
    const sheets = await db.sheets.where('projectId').equals(projectId).primaryKeys()
    await db.sheets.bulkUpdate(sheets.map(key => ({ key, changes: deletedNow() })))
    await db.sheetImages.bulkDelete(sheets)
    const points = await db.points.where('projectId').equals(projectId).primaryKeys()
    await db.points.bulkUpdate(points.map(key => ({ key, changes: deletedNow() })))
    await deletePhotosWhere('projectId', projectId)
  })
}

/** Кто работает на этом устройстве. */
export interface UserProfile {
  id: string
  /** Имя для людей, например «Иванов И.». */
  name: string
  /** Короткий код автора латиницей, стоит в начале имени каждого фото (Р-18). */
  code: string
}

/** Код автора: 2–5 латинских букв или цифр. */
export const USER_CODE_PATTERN = /^[A-Z0-9]{2,5}$/

/** Профиль пользователя или null, если он ещё не заполнен. */
export async function getUserProfile(): Promise<UserProfile | null> {
  const [name, code] = await Promise.all([db.settings.get('userName'), db.settings.get('userCode')])
  if (!name || !code) return null
  return { id: await getUserId(), name: name.value, code: code.value }
}

export async function saveUserProfile(name: string, code: string): Promise<UserProfile> {
  if (!USER_CODE_PATTERN.test(code)) throw new Error('Код: 2–5 латинских букв или цифр')
  await db.settings.bulkPut([
    { key: 'userName', value: name },
    { key: 'userCode', value: code },
  ])
  return { id: await getUserId(), name, code }
}

/**
 * Уникальное имя файла фото, например IVA_20261028_221438_1sr8.jpg:
 * код автора, дата и время съёмки, 4 случайных символа.
 * Дата вместо счётчика нужна потому, что счётчик начнётся заново после
 * переустановки приложения, и имена повторятся.
 */
export function makePhotoFileName(userCode: string, date = new Date(), ext = 'jpg'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${userCode}_${stamp}_${rand}.${ext}`
}
