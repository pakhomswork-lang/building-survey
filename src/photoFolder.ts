// Сохранение фото в папку телефона (Р-13, Р-21).
// Пользователь один раз выбирает папку, приложение кладёт фото в подпапку объекта:
// <выбранная папка>/<название объекта>/MAX_20261029_140512_ab12.jpg

import { db } from './db'

// Этих функций нет в стандартных типах TypeScript, но Chrome их поддерживает
type PermissionMode = { mode: 'readwrite' }
interface DirectoryWithPermission extends FileSystemDirectoryHandle {
  queryPermission(opts: PermissionMode): Promise<PermissionState>
  requestPermission(opts: PermissionMode): Promise<PermissionState>
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: PermissionMode) => Promise<FileSystemDirectoryHandle>
  }
}

const RW: PermissionMode = { mode: 'readwrite' }

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function getFolder(): Promise<FileSystemDirectoryHandle | null> {
  return (await db.folders.get('photos'))?.handle ?? null
}

/** Открывает выбор папки. Нужно вызывать прямо из нажатия на кнопку. */
export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null
  try {
    const handle = await window.showDirectoryPicker(RW)
    await db.folders.put({ key: 'photos', handle })
    return handle
  } catch {
    return null // пользователь передумал
  }
}

/**
 * Есть ли сейчас разрешение писать в папку.
 * ask = true — спросить пользователя, если разрешения нет (только из нажатия на кнопку).
 */
export async function hasFolderPermission(handle: FileSystemDirectoryHandle, ask = false): Promise<boolean> {
  const h = handle as DirectoryWithPermission
  if ((await h.queryPermission(RW)) === 'granted') return true
  if (!ask) return false
  return (await h.requestPermission(RW).catch(() => 'denied')) === 'granted'
}

/** Название объекта, пригодное для имени папки. */
function folderName(projectName: string) {
  return projectName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Объект'
}

async function writeOne(root: FileSystemDirectoryHandle, fileName: string): Promise<boolean> {
  const file = await db.photoFiles.get(fileName)
  const photo = await db.photos.where('fileName').equals(fileName).first()
  if (!file || !photo) return false
  const project = await db.projects.get(photo.projectId)
  const dir = await root.getDirectoryHandle(folderName(project?.name ?? ''), { create: true })
  const fh = await dir.getFileHandle(fileName, { create: true })
  const w = await fh.createWritable()
  await w.write(file.blob)
  await w.close()
  await db.photoFiles.update(fileName, { savedToFolder: true })
  return true
}

/** Тихо пробует записать только что снятое фото. Если нет папки или разрешения — фото подождёт. */
export async function trySaveToFolder(fileName: string): Promise<void> {
  try {
    const root = await getFolder()
    if (root && (await hasFolderPermission(root))) await writeOne(root, fileName)
  } catch {
    // не страшно: фото есть в приложении, его сохранит кнопка «Сохранить в папку»
  }
}

/** Имена фото объекта, которые ещё не попали в папку. */
export async function pendingFileNames(projectId: string): Promise<string[]> {
  const photos = await db.photos.where('projectId').equals(projectId).toArray()
  const names = photos.filter(p => !p.deleted).map(p => p.fileName)
  const files = await db.photoFiles.bulkGet(names)
  return names.filter((_, i) => files[i] && !files[i]!.savedToFolder)
}

/** Записывает в папку все несохранённые фото объекта. Вызывать из нажатия на кнопку. */
export async function savePendingToFolder(projectId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  let root = await getFolder()
  if (!root || !(await hasFolderPermission(root, true))) root = await chooseFolder()
  if (!root) return 0
  const names = await pendingFileNames(projectId)
  let done = 0
  for (const name of names) {
    if (await writeOne(root, name)) done++
    onProgress?.(done, names.length)
  }
  return done
}
