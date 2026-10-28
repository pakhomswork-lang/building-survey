// Сохранение снятых фото: уникальное имя с кодом автора (Р-18), запись в базу и превью.

import { db, getUserProfile, makePhotoFileName, newRecordFields, type Photo, type PhotoType, type Point } from './db'

const THUMB_SIDE = 320

/** Превью фото. Учитываем поворот из данных камеры, иначе фото «лежат на боку». */
async function makeThumb(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * k)
  canvas.height = Math.round(bitmap.height * k)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Не удалось сделать превью'))), 'image/jpeg', 0.8),
  )
}

function extensionOf(file: File): string {
  if (file.type === 'image/jpeg') return 'jpg'
  const fromName = file.name.split('.').pop()?.toLowerCase()
  return fromName && fromName.length <= 4 ? fromName : 'jpg'
}

/** Сохраняет снятое фото и привязывает его к точке. */
export async function savePhoto(point: Point, file: File, type: PhotoType): Promise<Photo> {
  const profile = await getUserProfile()
  if (!profile) throw new Error('Не заполнен профиль')
  const takenAt = file.lastModified || Date.now()
  const fileName = makePhotoFileName(profile.code, new Date(takenAt), extensionOf(file))
  const thumb = await makeThumb(file)
  const photo: Photo = {
    ...(await newRecordFields()),
    projectId: point.projectId,
    sheetId: point.sheetId,
    pointId: point.id,
    type,
    fileName,
    takenAt,
  }
  await db.transaction('rw', db.photos, db.photoFiles, async () => {
    await db.photos.add(photo)
    await db.photoFiles.add({ fileName, blob: file, thumb })
  })
  return photo
}
