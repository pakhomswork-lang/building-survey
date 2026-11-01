import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from './db'
import { countByType, plural } from './format'
import { Icon } from './Icon'
import { importSheets } from './sheetImport'
import { MixBar, SheetPreview } from './SheetPreview'
import { navigate } from './useHashRoute'

/** Листы объекта карточками по два в ряд и кнопка «Добавить лист». */
export function SheetList({ projectId }: { projectId: string }) {
  const data = useLiveQuery(async () => {
    const [sheets, points, photos] = await Promise.all([
      db.sheets.where('projectId').equals(projectId).sortBy('order'),
      db.points.where('projectId').equals(projectId).toArray(),
      db.photos.where('projectId').equals(projectId).toArray(),
    ])
    return {
      sheets: sheets.filter(s => !s.deleted),
      points: points.filter(p => !p.deleted),
      photos: photos.filter(p => !p.deleted),
    }
  }, [projectId])
  const fileInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    try {
      await importSheets(projectId, [...files], setProgress)
    } catch (e) {
      setError('Не удалось загрузить: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setProgress(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <section>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        hidden
        onChange={e => onFiles(e.target.files)}
      />

      {data && data.sheets.length > 0 && (
        <div className="sheet-cards">
          {data.sheets.map(s => {
            const points = data.points.filter(p => p.sheetId === s.id).length
            const photos = data.photos.filter(p => p.sheetId === s.id)
            return (
              <button key={s.id} className="sheet-card" onClick={() => navigate({ screen: 'sheet', sheetId: s.id })}>
                <SheetPreview sheetId={s.id} height={92} />
                <div className="meta">
                  <b>{s.name}</b>
                  <small>{points ? `${plural(points, 'точка', 'точки', 'точек')}, ${photos.length} фото` : 'Точек нет'}</small>
                  <MixBar counts={countByType(photos)} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {data?.sheets.length === 0 && !progress && (
        <p className="muted" style={{ fontSize: 14, margin: '16px 0 0' }}>
          Листов пока нет. Загрузите PDF или фото плана. Многостраничный PDF превратится в несколько листов.
        </p>
      )}

      <button className="secondary-btn" style={{ marginTop: 8 }} disabled={progress !== null} onClick={() => fileInput.current?.click()}>
        <Icon name="file" />
        {progress ? 'Загружаем…' : 'Добавить лист: PDF или фото'}
      </button>
      {progress && <p className="muted" style={{ fontSize: 14 }}>{progress}</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
    </section>
  )
}
