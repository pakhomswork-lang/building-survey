import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties } from 'react'
import { db, PHOTO_TYPES, type Photo, type PhotoType } from './db'
import { countByType, TYPE_KEYS } from './format'
import { Icon } from './Icon'
import { PhotoThumb } from './PhotoThumb'
import { PhotoView } from './PhotoView'
import { typeColor } from './typeColor'

type TypeFilter = 'all' | PhotoType

/** Все фото объекта с отбором по листу и типу, сгруппированные по точкам. */
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
  const [type, setType] = useState<TypeFilter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  if (!data) return null

  // номер точки на листе — как на самом листе: по порядку постановки
  const pointNumber = new Map<string, number>()
  for (const s of data.sheets) {
    data.points.filter(p => p.sheetId === s.id).forEach((p, i) => pointNumber.set(p.id, i + 1))
  }
  const sheetName = new Map(data.sheets.map(s => [s.id, s.name]))
  const caption = (p: Photo) => `${sheetName.get(p.sheetId) ?? 'Лист'}, точка ${pointNumber.get(p.pointId) ?? '?'}`

  const bySheet = data.photos.filter(p => sheetId === 'all' || p.sheetId === sheetId)
  const counts = countByType(bySheet)
  const shown = bySheet.filter(p => type === 'all' || p.type === type)

  // группы по точкам в порядке листов и номеров точек
  const groups = data.sheets.flatMap(s =>
    data.points
      .filter(pt => pt.sheetId === s.id)
      .map(pt => ({ point: pt, photos: shown.filter(ph => ph.pointId === pt.id) }))
      .filter(g => g.photos.length > 0),
  )
  const ordered = groups.flatMap(g => g.photos)

  return (
    <section>
      <div className="page-top">
        <button className="icon-btn" aria-label="Назад" onClick={onBack}>
          <Icon name="back" />
        </button>
      </div>
      <h1 className="page-title">Фото объекта</h1>
      <div className="page-sub">{data.project?.name}</div>

      {data.sheets.length > 1 && (
        <div className="chips" style={{ marginTop: 12 }}>
          <button className={'chip dark' + (sheetId === 'all' ? ' on' : '')} onClick={() => setSheetId('all')}>
            Все листы
          </button>
          {data.sheets.map(s => (
            <button key={s.id} className={'chip dark' + (sheetId === s.id ? ' on' : '')} onClick={() => setSheetId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="chips" style={{ marginTop: 8 }}>
        <button className={'chip' + (type === 'all' ? ' on' : '')} onClick={() => setType('all')}>
          Все <em>{bySheet.length}</em>
        </button>
        {TYPE_KEYS.map(t => (
          <button key={t} className={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>
            <i className="type-dot" style={{ background: typeColor(t) }} />
            {PHOTO_TYPES[t]}
            <em>{counts[t]}</em>
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="muted" style={{ marginTop: 24 }}>Фото нет.</p>}
      {groups.map(({ point, photos }) => (
        <section key={point.id} className="photo-group">
          <header>
            <h2>{caption(photos[0])}</h2>
            <small>{photos.length} фото</small>
          </header>
          <div className="photo-grid">
            {photos.map(p => (
              <button
                key={p.id}
                className="photo-cell"
                style={{ '--c': typeColor(p.type) } as CSSProperties}
                aria-label={PHOTO_TYPES[p.type]}
                onClick={() => setOpenId(p.id)}
              >
                <PhotoThumb fileName={p.fileName} size="100%" radius={0} />
              </button>
            ))}
          </div>
        </section>
      ))}

      {openId && (
        <PhotoView photos={ordered} photoId={openId} onChange={setOpenId} onClose={() => setOpenId(null)} caption={caption} />
      )}
    </section>
  )
}
