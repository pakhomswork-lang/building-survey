import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from './db'
import { importSheets } from './sheetImport'

/** Превью листа из базы. Ссылку на картинку освобождаем, когда превью пропадает с экрана. */
function SheetThumb({ sheetId }: { sheetId: string }) {
  const thumb = useLiveQuery(async () => (await db.sheetImages.get(sheetId))?.thumb, [sheetId])
  const url = useMemo(() => thumb && URL.createObjectURL(thumb), [thumb])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return (
    <div style={{ width: 72, height: 72, flex: 'none', borderRadius: 6, background: '#eee', overflow: 'hidden' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
    </div>
  )
}

export function SheetList({ projectId }: { projectId: string }) {
  const sheets = useLiveQuery(async () => {
    const all = await db.sheets.where('projectId').equals(projectId).sortBy('order')
    return all.filter(s => !s.deleted)
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
      <button
        className="btn"
        style={{ width: '100%', marginBottom: 8 }}
        disabled={progress !== null}
        onClick={() => fileInput.current?.click()}
      >
        {progress ? 'Загружаем…' : '+ Добавить листы (PDF или фото)'}
      </button>
      {progress && <p className="muted" style={{ fontSize: 14 }}>{progress}</p>}
      {error && <p style={{ color: '#d9534f', fontSize: 14 }}>{error}</p>}

      {sheets?.length === 0 && !progress && (
        <p className="muted">Листов пока нет. Многостраничный PDF превратится в несколько листов.</p>
      )}
      {sheets?.map(s => (
        <div key={s.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'default' }}>
          <SheetThumb sheetId={s.id} />
          <span>{s.name}</span>
        </div>
      ))}
    </section>
  )
}
