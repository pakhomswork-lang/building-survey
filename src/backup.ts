// Резервная копия объекта одним архивом: данные, картинки листов и все фото.
// Нужна на случай, если телефон или браузер потеряет данные (особенно Safari на iPhone).
//
// Внутри архива:
//   data.json        — объект, листы, точки, записи о фото (с подписями «лист, точка, тип»)
//   sheets/01.jpg …  — картинки листов по порядку
//   photos/<имя>.jpg — сами фото под их уникальными именами

import { db, getUserProfile, PHOTO_TYPES } from './db'
import { APP_VERSION } from './version'
import { makeZip, type ZipEntry } from './zip'

export async function buildProjectBackup(
  projectId: string,
  onProgress: (text: string) => void,
): Promise<{ blob: Blob; fileName: string; photoCount: number; missing: number }> {
  onProgress('Собираем данные…')
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Объект не найден')
  const sheets = (await db.sheets.where('projectId').equals(projectId).sortBy('order')).filter(s => !s.deleted)
  const points = (await db.points.where('projectId').equals(projectId).sortBy('createdAt')).filter(p => !p.deleted)
  const photos = (await db.photos.where('projectId').equals(projectId).sortBy('takenAt')).filter(p => !p.deleted)

  const entries: ZipEntry[] = []
  const pad = (n: number) => String(n).padStart(2, '0')

  const sheetFile = new Map<string, string>()
  for (const [i, s] of sheets.entries()) {
    const image = await db.sheetImages.get(s.id)
    if (!image) continue
    const name = `sheets/${pad(i + 1)}.jpg`
    sheetFile.set(s.id, name)
    entries.push({ name, data: image.blob })
  }

  // номер точки на листе — как на экране: по порядку постановки
  const pointNumber = new Map<string, number>()
  for (const s of sheets) points.filter(p => p.sheetId === s.id).forEach((p, i) => pointNumber.set(p.id, i + 1))
  const sheetName = new Map(sheets.map(s => [s.id, s.name]))

  let missing = 0
  for (const p of photos) {
    const file = await db.photoFiles.get(p.fileName)
    if (file) entries.push({ name: `photos/${p.fileName}`, data: file.blob })
    else missing++
  }

  const data = {
    format: 'building-survey-backup',
    version: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: await getUserProfile(),
    project,
    sheets: sheets.map(s => ({ ...s, file: sheetFile.get(s.id) ?? null })),
    points: points.map(p => ({ ...p, number: pointNumber.get(p.id) ?? null, sheetName: sheetName.get(p.sheetId) ?? null })),
    photos: photos.map(p => ({
      ...p,
      typeLabel: PHOTO_TYPES[p.type],
      sheetName: sheetName.get(p.sheetId) ?? null,
      pointNumber: pointNumber.get(p.pointId) ?? null,
    })),
  }
  entries.unshift({ name: 'data.json', data: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }) })

  const blob = await makeZip(entries, (done, total) => onProgress(`Упаковываем ${done} из ${total}…`))
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_').trim()
  const day = new Date().toISOString().slice(0, 10)
  return { blob, fileName: `Резервная копия — ${safeName} — ${day}.zip`, photoCount: photos.length - missing, missing }
}

/** Отдаёт файл на скачивание (на телефоне он попадёт в «Загрузки»). */
export function downloadFile(blob: Blob, fileName: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}
