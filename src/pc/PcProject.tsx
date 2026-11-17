import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { db, PHOTO_TYPES, type Photo } from '../db'
import { countByType, plural, TYPE_KEYS } from '../format'
import { PcFolderStatus } from '../PcFolderStatus'
import { useProjectFolder } from '../pcFolder'
import { usePeople } from '../people'
import { PhotoThumb } from '../PhotoThumb'
import { PhotoView } from '../PhotoView'
import { MixBar } from '../SheetPreview'
import { typeColor } from '../typeColor'
import { useObjectUrl } from '../useObjectUrl'
import { matches, type FilterDef, type Selection } from './filters'
import { PcFilterBar } from './PcFilterBar'
import { PcPhotoGrid, PcPhotoPreview, type GridSize } from './PcPhotoGrid'
import { PcSheet } from './PcSheet'

type Mode = 'plan' | 'grid'

/**
 * Экран объекта на компьютере (Р-40, Р-41). Два вида:
 * «План» — листы слева, лист с точками в середине, фото точки справа;
 * «Фото» — сетка миниатюр всех фото с отборами, выбранное фото крупно справа.
 * Отборы (тип, автор) общие для обоих видов.
 */
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
  const people = usePeople()
  const [mode, setMode] = useState<Mode>('plan')
  const [selection, setSelection] = useState<Selection>({})
  const [chosenSheet, setChosenSheet] = useState<string | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [size, setSize] = useState<GridSize>('m')

  // номер точки на листе — по порядку постановки, как на самом листе
  const pointNumber = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of data?.sheets ?? []) data!.points.filter(p => p.sheetId === s.id).forEach((p, i) => map.set(p.id, i + 1))
    return map
  }, [data])
  const sheetName = useMemo(() => new Map((data?.sheets ?? []).map(s => [s.id, s.name])), [data])
  const caption = useCallback(
    (p: Photo) => `${sheetName.get(p.sheetId) ?? 'Лист'}, т. ${pointNumber.get(p.pointId) ?? '?'}`,
    [sheetName, pointNumber],
  )

  // группы отборов; новые (конструкции, помещения) добавятся сюда же
  const defs = useMemo<FilterDef[]>(() => {
    if (!data) return []
    const authors = [...new Set(data.photos.map(p => p.authorId))]
    const codeOf = (id: string) => people?.codeOf(id) || data.photos.find(p => p.authorId === id)!.fileName.split('_')[0]
    return [
      { key: 'sheet', label: 'Лист', valueOf: p => p.sheetId, options: data.sheets.map(s => ({ value: s.id, label: s.name })) },
      {
        key: 'type',
        label: 'Тип',
        valueOf: p => p.type,
        options: TYPE_KEYS.map(t => ({ value: t, label: PHOTO_TYPES[t], color: typeColor(t) })),
      },
      {
        key: 'author',
        label: 'Автор',
        valueOf: p => p.authorId,
        options: authors
          .map(id => ({ value: id, label: codeOf(id), title: people?.nameOf(id) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ]
  }, [data, people])

  if (!data) return null
  if (!data.project || data.project.deleted) {
    return (
      <main className="pc-page">
        <p className="pc-muted">Объект не найден. <a href="#/">К объектам</a></p>
      </main>
    )
  }

  // порядок фото в сетке: по листам, по номеру точки, по времени съёмки
  const sheetOrder = new Map(data.sheets.map((s, i) => [s.id, i]))
  const sorted = [...data.photos].sort(
    (a, b) =>
      (sheetOrder.get(a.sheetId) ?? 0) - (sheetOrder.get(b.sheetId) ?? 0) ||
      (pointNumber.get(a.pointId) ?? 0) - (pointNumber.get(b.pointId) ?? 0) ||
      a.takenAt - b.takenAt,
  )

  // на плане лист выбирают слева, поэтому отбор по листу там не показываем
  const planDefs = defs.filter(d => d.key !== 'sheet')
  const shownDefs = mode === 'plan' ? planDefs : defs
  const activeDefs = shownDefs.filter(d => selection[d.key]?.length)
  const match = activeDefs.length ? (p: Photo) => matches(p, shownDefs, selection) : null

  const sheetId = chosenSheet && data.sheets.some(s => s.id === chosenSheet) ? chosenSheet : (data.sheets[0]?.id ?? null)
  const sheet = data.sheets.find(s => s.id === sheetId)
  const gridPhotos = sorted.filter(p => matches(p, defs, selection))
  const preview = gridPhotos.find(p => p.id === selectedPhoto)
  const filterPhotos = mode === 'plan' ? data.photos.filter(p => p.sheetId === sheetId) : data.photos

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
        <div className="pc-tabs">
          <button className={mode === 'plan' ? 'on' : ''} onClick={() => setMode('plan')}>
            План
          </button>
          <button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>
            Все фото
          </button>
        </div>
        {mode === 'plan' && (
          <nav className="pc-sheets">
            {data.sheets.map(s => {
              const photos = data.photos.filter(p => p.sheetId === s.id)
              return (
                <button
                  key={s.id}
                  className={s.id === sheetId ? 'on' : ''}
                  onClick={() => {
                    setChosenSheet(s.id)
                    setSelectedPoint(null)
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
        )}
        {mode === 'grid' && (
          <div className="pc-size">
            <span className="pc-muted">Размер миниатюр</span>
            {(['s', 'm', 'l'] as GridSize[]).map(s => (
              <button key={s} className={'chip' + (size === s ? ' on' : '')} onClick={() => setSize(s)}>
                {{ s: 'Мелкие', m: 'Средние', l: 'Крупные' }[s]}
              </button>
            ))}
          </div>
        )}
        <div className="list pc-folder">
          <PcFolderStatus projectId={projectId} />
        </div>
      </aside>

      <section className="pc-main">
        <div className="pc-filters">
          {mode === 'plan' && sheet && <b className="pc-sheet-name">{sheet.name}</b>}
          {mode === 'grid' && (
            <b className="pc-sheet-name">
              {gridPhotos.length === data.photos.length ? `Все фото: ${data.photos.length}` : `Отобрано ${gridPhotos.length} из ${data.photos.length}`}
            </b>
          )}
          <PcFilterBar photos={filterPhotos} defs={shownDefs} selection={selection} onChange={setSelection} />
        </div>
        {mode === 'plan' ? (
          <>
            {sheetId ? (
              <PcSheet sheetId={sheetId} match={match} selectedId={selectedPoint} onSelect={setSelectedPoint} />
            ) : (
              <p className="pc-muted pc-center">В объекте нет листов.</p>
            )}
            <div className="pc-hint">Колесо — приблизить · тащить мышью — двигать лист · щелчок по точке — её фото</div>
          </>
        ) : (
          <PcPhotoGrid
            photos={gridPhotos}
            caption={caption}
            selectedId={openId ? null : (preview?.id ?? null)}
            onSelect={setSelectedPhoto}
            onOpen={setOpenId}
            size={size}
          />
        )}
      </section>

      <aside className="pc-right">
        {mode === 'plan' ? (
          selectedPoint && pointNumber.has(selectedPoint) ? (
            <PointPhotos
              pointId={selectedPoint}
              number={pointNumber.get(selectedPoint)!}
              caption={caption}
              match={match}
              onClose={() => setSelectedPoint(null)}
            />
          ) : (
            <p className="pc-muted">Щёлкните по точке на листе, чтобы увидеть её фото.</p>
          )
        ) : preview ? (
          <PcPhotoPreview photo={preview} caption={caption(preview)} onOpen={() => setOpenId(preview.id)} />
        ) : (
          <p className="pc-muted">Щёлкните по фото, чтобы посмотреть его крупно.</p>
        )}
      </aside>

      {mode === 'grid' && openId && (
        <PhotoView
          photos={gridPhotos}
          photoId={openId}
          onChange={id => {
            setOpenId(id)
            setSelectedPhoto(id)
          }}
          onClose={() => setOpenId(null)}
          caption={caption}
        />
      )}
    </div>
  )
}

function SheetThumb({ sheetId }: { sheetId: string }) {
  const thumb = useLiveQuery(async () => (await db.sheetImages.get(sheetId))?.thumb, [sheetId])
  const url = useObjectUrl(thumb)
  return <i className="pc-sheet-thumb">{url && <img src={url} alt="" draggable={false} />}</i>
}

/** Фото выбранной точки. Подходящие под отборы — сверху, остальные бледнее ниже. */
function PointPhotos({
  pointId,
  number,
  caption,
  match,
  onClose,
}: {
  pointId: string
  number: number
  caption: (p: Photo) => string
  match: ((p: Photo) => boolean) | null
  onClose: () => void
}) {
  const point = useLiveQuery(() => db.points.get(pointId), [pointId])
  const photos = useLiveQuery(async () => (await db.photos.where('pointId').equals(pointId).sortBy('takenAt')).filter(p => !p.deleted), [pointId])
  const people = usePeople()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!point || !photos) return null
  const ordered = match ? [...photos.filter(match), ...photos.filter(p => !match(p))] : photos

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
            className={'photo-cell' + (match && !match(p) ? ' dim' : '')}
            style={{ '--c': typeColor(p.type) } as CSSProperties}
            title={`${PHOTO_TYPES[p.type]} · ${p.fileName}`}
            onClick={() => setOpenId(p.id)}
          >
            <PhotoThumb fileName={p.fileName} size="100%" radius={0} />
          </button>
        ))}
      </div>
      {openId && <PhotoView photos={ordered} photoId={openId} onChange={setOpenId} onClose={() => setOpenId(null)} caption={caption} />}
    </>
  )
}
