// Загрузка листов: PDF (каждая страница — отдельный лист) или картинка (фото плана).
// Всё превращаем в одну картинку JPEG, с которой дальше работает приложение.

import { db, newRecordFields, type Sheet } from './db'

/** Длинная сторона картинки листа. Хватает, чтобы разглядеть оси и надписи при увеличении. */
const MAX_SIDE = 4096
/** Длинная сторона превью для списка листов. */
const THUMB_SIDE = 400

export type ImportProgress = (text: string) => void

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Не удалось сохранить картинку'))), 'image/jpeg', quality),
  )
}

/** Уменьшенная копия картинки для превью. */
async function makeThumb(source: HTMLCanvasElement): Promise<Blob> {
  const k = THUMB_SIDE / Math.max(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * k)
  canvas.height = Math.round(source.height * k)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas, 0.8)
}

/** Белый холст нужного размера: у PDF и PNG бывает прозрачный фон, а JPEG прозрачность не умеет. */
function whiteCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  return { canvas, ctx }
}

async function saveSheet(projectId: string, name: string, order: number, canvas: HTMLCanvasElement): Promise<Sheet> {
  const [blob, thumb] = await Promise.all([canvasToJpeg(canvas), makeThumb(canvas)])
  const sheet: Sheet = { ...(await newRecordFields()), projectId, name, order }
  await db.transaction('rw', db.sheets, db.sheetImages, async () => {
    await db.sheets.add(sheet)
    await db.sheetImages.add({ sheetId: sheet.id, blob, thumb, width: canvas.width, height: canvas.height })
  })
  return sheet
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '')
}

async function importPdf(projectId: string, file: File, firstOrder: number, onProgress: ImportProgress): Promise<number> {
  // pdf.js большой, поэтому загружаем его только когда выбран PDF
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    for (let n = 1; n <= pdf.numPages; n++) {
      onProgress(`${file.name}: страница ${n} из ${pdf.numPages}…`)
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) })
      const { canvas, ctx } = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height))
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const name = pdf.numPages > 1 ? `${baseName(file.name)} — стр. ${n}` : baseName(file.name)
      await saveSheet(projectId, name, firstOrder + n - 1, canvas)
      page.cleanup()
    }
    return pdf.numPages
  } finally {
    // освобождаем память и фоновый поток pdf.js
    await loadingTask.destroy()
  }
}

async function importImage(projectId: string, file: File, order: number, onProgress: ImportProgress): Promise<number> {
  onProgress(`${file.name}…`)
  // imageOrientation: фото с телефона часто «лежат на боку», браузер их разворачивает
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const { canvas, ctx } = whiteCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k))
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  await saveSheet(projectId, baseName(file.name), order, canvas)
  return 1
}

/** Добавляет листы из выбранных файлов. Возвращает, сколько листов добавлено. */
export async function importSheets(projectId: string, files: File[], onProgress: ImportProgress): Promise<number> {
  let order = await db.sheets.where('projectId').equals(projectId).count()
  let added = 0
  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const count = isPdf
      ? await importPdf(projectId, file, order, onProgress)
      : await importImage(projectId, file, order, onProgress)
    order += count
    added += count
  }
  return added
}
