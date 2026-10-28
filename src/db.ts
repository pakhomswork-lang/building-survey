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
  /** Размер картинки в пикселях. */
  width: number
  height: number
}

/** Само фото. Только на этом устройстве. */
export interface PhotoFile {
  fileName: string
  blob: Blob
}

/** Настройки устройства: кто пользователь и т. п. */
export interface Setting {
  key: string
  value: string
}

export const db = new Dexie('building-survey') as Dexie & {
  projects: EntityTable<Project, 'id'>
  sheets: EntityTable<Sheet, 'id'>
  points: EntityTable<Point, 'id'>
  photos: EntityTable<Photo, 'id'>
  sheetImages: EntityTable<SheetImage, 'sheetId'>
  photoFiles: EntityTable<PhotoFile, 'fileName'>
  settings: EntityTable<Setting, 'key'>
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

/** Уникальное имя файла фото, например 20261028_221438_1sr8.jpg. */
export function makePhotoFileName(date = new Date(), ext = 'jpg'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${stamp}_${rand}.${ext}`
}
