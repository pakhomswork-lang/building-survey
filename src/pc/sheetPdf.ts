// Чёткие листы на компьютере (17б-4, Р-42). К листу можно указать исходный PDF:
// он хранится только на этом компьютере, а видимая часть листа рисуется из него
// под текущее приближение. Точки стоят в процентах от листа, поэтому PDF должен быть
// той же страницей, из которой сделан лист (пропорции проверяем).

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { db, type SheetPdf } from '../db'

async function pdfjs() {
  // pdf.js большой, загружаем только когда нужен
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  return lib
}

/** Открыть PDF. destroy — освободить память и фоновый поток pdf.js. */
async function openPdf(blob: Blob): Promise<{ doc: PDFDocumentProxy; destroy: () => Promise<void> }> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  return { doc: await task.promise, destroy: () => task.destroy() }
}

/** Номер страницы из названия листа «План — стр. 3», если лист сделан из многостраничного PDF. */
function pageFromName(name: string): number | null {
  const m = name.match(/стр\.\s*(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

/**
 * Привязать PDF к листу. Вызывать из нажатия: может спросить номер страницы
 * и предупредить, если пропорции не совпадают. Возвращает текст ошибки или null.
 */
export async function attachPdf(sheetId: string, file: File): Promise<string | null> {
  const [sheet, image] = await Promise.all([db.sheets.get(sheetId), db.sheetImages.get(sheetId)])
  if (!sheet) return 'Лист не найден.'
  let opened: Awaited<ReturnType<typeof openPdf>>
  try {
    opened = await openPdf(file)
  } catch {
    return 'Не удалось открыть PDF.'
  }
  const doc = opened.doc
  try {
    let page = 1
    if (doc.numPages > 1) {
      const guess = pageFromName(sheet.name)
      const answer = prompt(`В PDF ${doc.numPages} стр. Какая страница — лист «${sheet.name}»?`, String(guess ?? 1))
      if (answer === null) return null
      page = Number(answer)
      if (!Number.isInteger(page) || page < 1 || page > doc.numPages) return `Нет страницы «${answer}».`
    }
    if (image) {
      const vp = (await doc.getPage(page)).getViewport({ scale: 1 })
      const diff = Math.abs(vp.width / vp.height - image.width / image.height) / (image.width / image.height)
      const ok =
        diff < 0.02 ||
        confirm(
          'Пропорции этой страницы PDF не совпадают с листом.\n' +
            'Похоже, это другая страница или другой файл, точки встанут не на свои места.\n\nВсё равно взять?',
        )
      if (!ok) return null
    }
    await db.sheetPdfs.put({ sheetId, blob: file, name: file.name, page })
    return null
  } finally {
    await opened.destroy()
  }
}

export async function removePdf(sheetId: string) {
  await db.sheetPdfs.delete(sheetId)
}

/** Страница PDF листа, если PDF указан. Открывается заново, когда PDF выбрали или убрали. */
export function usePdfPage(sheetId: string): PDFPageProxy | null {
  const rec = useLiveQuery(() => db.sheetPdfs.get(sheetId), [sheetId])
  const [state, setState] = useState<{ rec: SheetPdf; page: PDFPageProxy } | null>(null)
  useEffect(() => {
    if (!rec) return
    let destroy: (() => Promise<void>) | null = null
    let cancelled = false
    openPdf(rec.blob)
      .then(async opened => {
        destroy = opened.destroy
        const page = await opened.doc.getPage(rec.page)
        if (!cancelled) setState({ rec, page })
      })
      .catch(() => {
        // испорченный PDF — остаётся обычная картинка листа
      })
    return () => {
      cancelled = true
      void destroy?.()
    }
  }, [rec])
  return rec && state?.rec === rec ? state.page : null
}
