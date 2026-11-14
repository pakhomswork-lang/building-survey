import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type CSSProperties } from 'react'
import { db, PHOTO_TYPES, type PhotoType } from '../db'
import { countByType, plural, TYPE_KEYS } from '../format'
import { PcFolderStatus } from '../PcFolderStatus'
import { useProjectFolder } from '../pcFolder'
import { usePeople } from '../people'
import { PhotoThumb } from '../PhotoThumb'
import { PhotoView } from '../PhotoView'
import { MixBar } from '../SheetPreview'
import { typeColor } from '../typeColor'
import { useObjectUrl } from '../useObjectUrl'
import { PcSheet } from './PcSheet'

/** Экран объекта на компьютере: листы слева, лист с точками в середине, фото точки справа. */
export function PcProject({ projectId }: { projectId: string }) {
  useProjectFolder(projectId)
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
  const [chosenSheet, setChosenSheet] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | PhotoType>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!data) return null
  if (!data.project || data.project.deleted) {
    return (
      <main className="pc-page">
        <p className="pc-muted">Объект не найден. <a href="#/">К объектам</a></p>
      </main>
    )
  }

  const sheetId = chosenSheet && data.sheets.some(s => s.id === chosenSheet) ? chosenSheet : (data.sheets[0]?.id ?? null)
  const sheet = data.sheets.find(s => s.id === sheetId)
  const sheetPhotos = data.photos.filter(p => p.sheetId === sheetId)
  const counts = countByType(sheetPhotos)
  const sheetPoints = data.points.filter(p => p.sheetId === sheetId)
  const pointIndex = sheetPoints.findIndex(p => p.id === selectedId)

  return (
    <div className="pc-project">
      <aside className="pc-side">
        <a className="pc-back" href="#/">
          ← Объекты
        </a>
        <h1>{data.project.name}</h1>
        <div className="pc-muted">
          {plural(data.sheets.length, 'лист', 'листа', 'листов')}, {data.photos.length} фото
        </div>
        <nav className="pc-sheets">
          {data.sheets.map(s => {
            const photos = data.photos.filter(p => p.sheetId === s.id)
            return (
              <button
                key={s.id}
                className={s.id === sheetId ? 'on' : ''}
                onClick={() => {
                  setChosenSheet(s.id)
                  setSelectedId(null)
                }}
              >
                <SheetThumb sheetId={s.id} />
                <span>
                  <b>{s.name}</b>
                  <small>
                    {plural(data.points.filter(p => p.sheetId === s.id).length, 'точка', 'точки', 'точек')}, {photos.length} фото
                  </small>
                  <MixBar counts={countByType(photos)} />
                </span>
              </button>
            )
          })}
          {data.sheets.length === 0 && <p className="pc-muted">Листов нет.</p>}
        </nav>
        <div className="list pc-folder">
          <PcFolderStatus projectId={projectId} />
        </div>
      </aside>

      <section className="pc-main">
        {sheet && (
          <div className="pc-filters">
            <b>{sheet.name}</b>
            <span className="spacer" />
            <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>
              Все <em>{sheetPhotos.length}</em>
            </button>
            {TYPE_KEYS.map(t => (
              <button key={t} className={'chip' + (filter === t ? ' on' : '')} onClick={() => setFilter(t)}>
                <i className="type-dot" style={{ background: typeColor(t) }} />
                {PHOTO_TYPES[t]}
                <em>{counts[t]}</em>
              </button>
            ))}
          </div>
        )}
        {sheetId ? (
          <PcSheet sheetId={sheetId} filter={filter} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <p className="pc-muted pc-center">В объекте нет листов.</p>
        )}
        <div className="pc-hint">Колесо — приблизить · тащить мышью — двигать лист · щелчок по точке — её фото</div>
      </section>

      <aside className="pc-right">
        {pointIndex >= 0 ? (
          <PointPhotos
            pointId={selectedId!}
            number={pointIndex + 1}
            caption={`${sheet?.name ?? 'Лист'}, точка ${pointIndex + 1}`}
            filter={filter}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <p className="pc-muted">Щёлкните по точке на листе, чтобы увидеть её фото.</p>
        )}
      </aside>
    </div>
  )
}

function SheetThumb({ sheetId }: { sheetId: string }) {
  const thumb = useLiveQuery(async () => (await db.sheetImages.get(sheetId))?.thumb, [sheetId])
  const url = useObjectUrl(thumb)
  return <i className="pc-sheet-thumb">{url && <img src={url} alt="" draggable={false} />}</i>
}

/** Фото выбранной точки. Тип фото в отборе — сверху, остальные ниже. */
function PointPhotos({
  pointId,
  number,
  caption,
  filter,
  onClose,
}: {
  pointId: string
  number: number
  caption: string
  filter: 'all' | PhotoType
  onClose: () => void
}) {
  const point = useLiveQuery(() => db.points.get(pointId), [pointId])
  const photos = useLiveQuery(async () => (await db.photos.where('pointId').equals(pointId).sortBy('takenAt')).filter(p => !p.deleted), [pointId])
  const people = usePeople()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!point || !photos) return null
  const ordered = filter === 'all' ? photos : [...photos.filter(p => p.type === filter), ...photos.filter(p => p.type !== filter)]

  return (
    <>
      <div className="pc-point-head">
        <h2>Точка {number}</h2>
        <button className="pc-btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
      <div className="pc-muted">
        {new Date(point.createdAt).toLocaleString('ru-RU')}
        {people && <>, поставил: {people.nameOf(point.authorId)}</>}
      </div>
      {point.comment && <p className="pc-comment">{point.comment}</p>}
      <div className="pc-muted" style={{ marginTop: 12 }}>
        {photos.length} фото
      </div>
      <div className="pc-grid">
        {ordered.map(p => (
          <button
            key={p.id}
            className={'photo-cell' + (filter !== 'all' && p.type !== filter ? ' dim' : '')}
            style={{ '--c': typeColor(p.type) } as CSSProperties}
            title={`${PHOTO_TYPES[p.type]} · ${p.fileName}`}
            onClick={() => setOpenId(p.id)}
          >
            <PhotoThumb fileName={p.fileName} size="100%" radius={0} />
          </button>
        ))}
      </div>
      {openId && <PhotoView photos={ordered} photoId={openId} onChange={setOpenId} onClose={() => setOpenId(null)} caption={() => caption} />}
    </>
  )
}
