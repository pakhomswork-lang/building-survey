import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, PHOTO_TYPES, type Photo, type PhotoType } from './db'
import { PhotoThumb } from './PhotoThumb'
import { PhotoView } from './PhotoView'

type TypeFilter = 'all' | PhotoType

/** Все фото объекта с отбором по листу и типу. */
export function ProjectPhotos({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const data = useLiveQuery(async () => {
    const [project, sheets, points, photos] = await Promise.all([
      db.projects.get(projectId),
      db.sheets.where('projectId').equals(projectId).sortBy('order'),
      db.points.where('projectId').equals(projectId).sortBy('createdAt'),
      db.photos.where('projectId').equals(projectId).sortBy('takenAt'),
    ])
    return {
      project,
      sheets: sheets.filter(s => !s.deleted),
      points: points.filter(p => !p.deleted),
      photos: photos.filter(p => !p.deleted),
    }
  }, [projectId])
  const [sheetId, setSheetId] = useState<string>('all')
  const [chosenType, setType] = useState<TypeFilter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  if (!data) return null

  // номер точки на листе — как на самом листе: по порядку постановки
  const pointNumber = new Map<string, number>()
  for (const s of data.sheets) {
    data.points.filter(p => p.sheetId === s.id).forEach((p, i) => pointNumber.set(p.id, i + 1))
  }
  const sheetName = new Map(data.sheets.map(s => [s.id, s.name]))
  const caption = (p: Photo) => `${sheetName.get(p.sheetId) ?? '—'} · точка ${pointNumber.get(p.pointId) ?? '—'}`

  const bySheet = data.photos.filter(p => sheetId === 'all' || p.sheetId === sheetId)
  const typeTabs: { type: TypeFilter; label: string; count: number }[] = [
    { type: 'all', label: 'Все', count: bySheet.length },
    ...(Object.entries(PHOTO_TYPES) as [PhotoType, string][])
      .map(([type, label]) => ({ type: type as TypeFilter, label, count: bySheet.filter(p => p.type === type).length }))
      .filter(t => t.count > 0),
  ]
  // если в выбранном типе не осталось фото — показываем «Все»
  const type = typeTabs.some(t => t.type === chosenType) ? chosenType : 'all'
  const shown = bySheet.filter(p => type === 'all' || p.type === type)

  return (
    <section>
      <button className="btn-link" onClick={onBack}>
        ← {data.project?.name ?? 'Объект'}
      </button>
      <h2 style={{ fontSize: 20, margin: '4px 0 12px' }}>Фото объекта</h2>

      <select className="field" value={sheetId} onChange={e => setSheetId(e.target.value)} style={{ marginBottom: 10 }}>
        <option value="all">Все листы</option>
        {data.sheets.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {typeTabs.map(t => (
          <button
            key={t.type}
            onClick={() => setType(t.type)}
            style={{
              padding: '6px 10px',
              fontSize: 14,
              borderRadius: 16,
              border: '1px solid var(--accent)',
              background: t.type === type ? 'var(--accent)' : '#fff',
              color: t.type === type ? '#fff' : 'var(--accent)',
            }}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Фото нет.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
        {shown.map(p => (
          <button key={p.id} onClick={() => setOpenId(p.id)} style={{ padding: 0, border: 0, background: 'none', textAlign: 'left' }}>
            <PhotoThumb fileName={p.fileName} size="100%" />
            <div className="muted" style={{ fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {caption(p)}
            </div>
          </button>
        ))}
      </div>

      {openId && (
        <PhotoView photos={shown} photoId={openId} onChange={setOpenId} onClose={() => setOpenId(null)} caption={caption} />
      )}
    </section>
  )
}
