// Папка с фото объекта на компьютере (шаг 17а, Р-39).
// Бригада сама переносит фото в папку объекта (например, «Фото»), раскладывает как удобно.
// Приложение обходит папку со всеми вложенными и запоминает, где лежит каждое фото,
// чтобы находить его по уникальному имени (Р-13). Папку только читаем.

import { useEffect, useSyncExternalStore } from 'react'
import { db } from './db'
import type { DirectoryWithPermission, PermissionMode } from './photoFolder'
import { makeThumb } from './photos'

const READ: PermissionMode = { mode: 'read' }

/** Компьютер: управляют мышью, а не пальцем. */
export const isComputer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export interface FolderFile {
  handle: FileSystemFileHandle
  /** Где лежит внутри папки объекта, например «Иванов/день 1/IVA_….jpg». */
  path: string
}

export type FolderState =
  | { status: 'none' }
  | { status: 'need-permission'; name: string }
  | { status: 'scanning'; name: string; files: number }
  | { status: 'ready'; name: string; files: number }
  | { status: 'error'; name: string; message: string }

// --- общее состояние для всех экранов ---

const states = new Map<string, FolderState>()
/** Найденные фото по объектам: имя файла → где лежит. */
const indexes = new Map<string, Map<string, FolderFile>>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  listeners.forEach(l => l())
}
function setState(projectId: string, state: FolderState) {
  states.set(projectId, state)
  changed()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const key = (projectId: string) => `pc:${projectId}`

/** Где лежит фото, если оно нашлось в папке какого-нибудь объекта. */
export function findInFolder(fileName: string): FolderFile | undefined {
  for (const index of indexes.values()) {
    const f = index.get(fileName)
    if (f) return f
  }
  return undefined
}

/** Имена найденных в папке объекта фото. */
export function folderIndex(projectId: string): Map<string, FolderFile> | undefined {
  return indexes.get(projectId)
}

// --- обход папки ---

async function scan(projectId: string, root: FileSystemDirectoryHandle) {
  const index = new Map<string, FolderFile>()
  setState(projectId, { status: 'scanning', name: root.name, files: 0 })
  let lastShown = 0
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        await walk(entry, prefix + entry.name + '/')
      } else if (!index.has(entry.name)) {
        // одно и то же фото в двух папках — берём первое
        index.set(entry.name, { handle: entry, path: prefix + entry.name })
        if (index.size - lastShown >= 200) {
          lastShown = index.size
          setState(projectId, { status: 'scanning', name: root.name, files: index.size })
        }
      }
    }
  }
  try {
    await walk(root, '')
    indexes.set(projectId, index)
    setState(projectId, { status: 'ready', name: root.name, files: index.size })
  } catch (e) {
    setState(projectId, { status: 'error', name: root.name, message: e instanceof Error ? e.message : String(e) })
  }
}

/** При открытии экрана: если папка выбрана и доступ есть — найти фото. Ничего не спрашивает. */
export async function loadProjectFolder(projectId: string) {
  if (states.has(projectId)) return
  states.set(projectId, { status: 'none' }) // чтобы не начать второй раз, пока ждём базу
  const handle = (await db.folders.get(key(projectId)))?.handle as DirectoryWithPermission | undefined
  if (!handle) return setState(projectId, { status: 'none' })
  if ((await handle.queryPermission(READ)) !== 'granted') {
    return setState(projectId, { status: 'need-permission', name: handle.name })
  }
  await scan(projectId, handle)
}

/** Выбрать папку с фото объекта. Вызывать прямо из нажатия на кнопку. */
export async function chooseProjectFolder(projectId: string) {
  if (!window.showDirectoryPicker) return
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker(READ)
  } catch {
    return // пользователь передумал
  }
  await db.folders.put({ key: key(projectId), handle })
  await scan(projectId, handle)
}

/** Разрешить доступ к уже выбранной папке (Chrome спрашивает после перезапуска) или искать заново. */
export async function reopenProjectFolder(projectId: string) {
  const handle = (await db.folders.get(key(projectId)))?.handle as DirectoryWithPermission | undefined
  if (!handle) return chooseProjectFolder(projectId)
  if ((await handle.requestPermission(READ).catch(() => 'denied')) !== 'granted') return
  await scan(projectId, handle)
}

// --- миниатюры ---

const queue: string[] = []
const queued = new Set<string>()
let running = 0
const WORKERS = 3

/** Сделать миниатюру фото из папки (один раз), положить в базу. */
export function ensureFolderThumb(fileName: string) {
  if (queued.has(fileName)) return
  queued.add(fileName)
  queue.push(fileName)
  pump()
}

function pump() {
  while (running < WORKERS && queue.length) {
    const fileName = queue.shift()!
    running++
    makeFolderThumb(fileName).finally(() => {
      running--
      pump()
    })
  }
}

async function makeFolderThumb(fileName: string) {
  try {
    if (await db.folderThumbs.get(fileName)) return
    const f = findInFolder(fileName)
    if (!f) return queued.delete(fileName) // может найтись после нового поиска
    const thumb = await makeThumb(await f.handle.getFile())
    await db.folderThumbs.put({ fileName, thumb })
  } catch {
    // не картинка или не открылась — оставляем без миниатюры
  }
}

// --- для экранов ---

/** Состояние папки объекта; при первом показе начинает поиск, если доступ уже есть. */
export function useProjectFolder(projectId: string): FolderState {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    void loadProjectFolder(projectId)
  }, [projectId])
  return states.get(projectId) ?? { status: 'none' }
}

/** Где лежит фото в папке на компьютере (обновляется после поиска). */
export function useFolderFile(fileName: string): FolderFile | undefined {
  useSyncExternalStore(subscribe, () => version)
  return findInFolder(fileName)
}
