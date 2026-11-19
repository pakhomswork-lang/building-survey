import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import { db, getMyIds, PHOTO_TYPES, ROOM_NONE, type Photo, type Point, type Room } from '../db'
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
import { PcRoomPanel } from './PcRoomPanel'
import { PcRoomTable } from './PcRoomTable'
import { ListsPanel } from '../ListsPanel'
import { canEditRooms, pointRoomText, roomOfPoint, roomsOfProject, roomTitle, setPointRoom } from '../rooms'
import { buildPhotoCsv, csvFileName, saveTextFile } from './exportPhotos'
import { attachPdf, removePdf } from './sheetPdf'

type Mode = 'plan' | 'grid' | 'rooms' | 'lists'

/**
 * Экран объекта на компьютере (Р-40, Р-41). Два вида:
 * «План» — листы слева, лист с точками в середине, фото точки справа;
 * «Фото» — сетка миниатюр всех фото с отборами, выбранное фото крупно справа.
 * Отборы (тип, автор) общие для обоих видов.
 */
export function PcProject({ projectId }: { projectId: string }) {
  useProjectFolder(projectId)
  const data = useLiveQuery(async () => {
    const [project, sheets, points, photos, rooms] = await Promise.all([
      db.projects.get(projectId),
      db.sheets.where('projectId').equals(projectId).sortBy('order'),
      db.points.where('projectId').equals(projectId).sortBy('createdAt'),
      db.photos.where('projectId').equals(projectId).sortBy('takenAt'),
      roomsOfProject(projectId),
    ])
    return {
      project,
      rooms,
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
  // помещения на плане (шаг 21): режим, выбранное помещение, правка контура
  const [roomMode, setRoomMode] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  // контуры помещений при работе с точками и фото (шаг 22), помнятся на компьютере
  const [showRooms, setShowRooms] = useState(() => {
    try {
      return localStorage.getItem('showRooms') === 'on'
    } catch {
      return false
    }
  })
  function toggleShowRooms() {
    setShowRooms(!showRooms)
    try {
      localStorage.setItem('showRooms', showRooms ? 'off' : 'on')
    } catch {
      // не сохранилось — не страшно
    }
  }
  const myIds = useLiveQuery(() => getMyIds(), [])

  // номер точки на листе — по порядку постановки, как на самом листе
  const pointNumber = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of data?.sheets ?? []) data!.points.filter(p => p.sheetId === s.id).forEach((p, i) => map.set(p.id, i + 1))
    return map
  }, [data])
  const sheetName = useMemo(() => new Map((data?.sheets ?? []).map(s => [s.id, s.name])), [data])
  // помещение каждой точки: по контуру или выбранное вручную (Р-48)
  const pointRoom = useMemo(() => {
    const map = new Map<string, Room | null>()
    for (const p of data?.points ?? []) map.set(p.id, roomOfPoint(p, data!.rooms.get(p.sheetId) ?? []))
    return map
  }, [data])
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
      ...(data.rooms.size
        ? [
            {
              key: 'room',
              label: 'Помещение',
              valueOf: (p: Photo) => pointRoom.get(p.pointId)?.id ?? ROOM_NONE,
              options: [
                ...data.sheets.flatMap(s =>
                  (data.rooms.get(s.id) ?? []).map(r => ({ value: r.id, label: roomTitle(r), title: s.name, sheetId: s.id })),
                ),
                { value: ROOM_NONE, label: 'Без помещения' },
              ],
            } as FilterDef,
          ]
        : []),
      {
        key: 'author',
        label: 'Автор',
        valueOf: p => p.authorId,
        options: authors
          .map(id => ({ value: id, label: codeOf(id), title: people?.nameOf(id) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    ]
  }, [data, people, pointRoom])

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

  // на плане лист выбирают слева, поэтому отбор по листу там не показываем,
  // а в отборе по помещению остаются только помещения этого листа
  const planSheet = chosenSheet && data.sheets.some(s => s.id === chosenSheet) ? chosenSheet : data.sheets[0]?.id
  const planDefs = defs
    .filter(d => d.key !== 'sheet')
    .map(d => (d.key === 'room' ? { ...d, options: d.options.filter(o => !('sheetId' in o) || (o as { sheetId: string }).sheetId === planSheet) } : d))
  const shownDefs = mode === 'plan' ? planDefs : defs
  const activeDefs = shownDefs.filter(d => selection[d.key]?.length)
  const match = activeDefs.length ? (p: Photo) => matches(p, shownDefs, selection) : null

  const sheetId = chosenSheet && data.sheets.some(s => s.id === chosenSheet) ? chosenSheet : (data.sheets[0]?.id ?? null)
  const sheet = data.sheets.find(s => s.id === sheetId)
  const gridPhotos = sorted.filter(p => matches(p, defs, selection))
  const preview = gridPhotos.find(p => p.id === selectedPhoto)
  const mayEditRooms = canEditRooms(data.project, myIds)
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
          <button className={mode === 'rooms' ? 'on' : ''} onClick={() => setMode('rooms')}>
            Помещения
          </button>
          <button className={mode === 'lists' ? 'on' : ''} onClick={() => setMode('lists')}>
            Списки
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
                    setRoomId(null)
                    setEditId(null)
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
        {mode === 'lists' ? (
          <div className="pc-lists">
            <ListsPanel owner={{ kind: 'project', projectId }} />
          </div>
        ) : mode === 'rooms' ? (
          <>
            <div className="pc-filters">
              <div className="pc-sheet-name">
                <b>Помещения: {[...data.rooms.values()].reduce((n, l) => n + l.length, 0)}</b>
              </div>
              <div className="pc-muted" style={{ paddingTop: 6 }}>
                {mayEditRooms
                  ? 'Номер, название и комментарий правятся прямо в таблице: Enter или щелчок мимо — сохранить, Tab — к следующей ячейке, Esc — отменить.'
                  : 'Помещения правит создатель объекта.'}
              </div>
            </div>
            <PcRoomTable
              sheets={data.sheets}
              rooms={data.rooms}
              pointRoom={pointRoom}
              points={data.points}
              photos={data.photos}
              canEdit={mayEditRooms}
              onShow={r => {
                setMode('plan')
                setChosenSheet(r.sheetId)
                setSelectedPoint(null)
                setRoomMode(true)
                setEditId(null)
                setRoomId(r.id)
              }}
            />
          </>
        ) : (
          <>
        <div className="pc-filters">
          {mode === 'plan' && sheet && (
            <div className="pc-sheet-name">
              <b>{sheet.name}</b>
              {data.rooms.has(sheet.id) && !roomMode && (
                <button className={'chip' + (showRooms ? ' on' : '')} title="Показывать контуры помещений при работе с точками" onClick={toggleShowRooms}>
                  Контуры
                </button>
              )}
              <button
                className={'chip' + (roomMode ? ' on' : '')}
                title="Показать помещения листа; рисовать и править их может создатель объекта"
                onClick={() => {
                  setRoomMode(!roomMode)
                  setRoomId(null)
                  setEditId(null)
                }}
              >
                Помещения
              </button>
              <SheetPdfButton key={sheet.id} sheetId={sheet.id} />
            </div>
          )}
          {mode === 'grid' && (
            <div className="pc-sheet-name">
              <b>
                {gridPhotos.length === data.photos.length ? `Все фото: ${data.photos.length}` : `Отобрано ${gridPhotos.length} из ${data.photos.length}`}
              </b>
              <button
                className="pc-btn pc-export"
                disabled={!gridPhotos.length}
                title="Таблица для Excel и ИИ: файл, где лежит, лист, точка, тип, кто и когда снимал, комментарий"
                onClick={async () => saveTextFile(csvFileName(data.project!.name), await buildPhotoCsv(projectId, gridPhotos))}
              >
                Выгрузить описание
              </button>
            </div>
          )}
          <PcFilterBar photos={filterPhotos} defs={shownDefs} selection={selection} onChange={setSelection} />
        </div>
        {mode === 'plan' ? (
          <>
            {sheetId ? (
              <PcSheet
                sheetId={sheetId}
                match={match}
                selectedId={selectedPoint}
                onSelect={setSelectedPoint}
                roomMode={roomMode}
                roomId={roomId}
                onRoomSelect={setRoomId}
                canEditRooms={mayEditRooms}
                editId={editId}
                showRooms={showRooms}
                onEditDone={() => {
                  setRoomId(editId)
                  setEditId(null)
                }}
              />
            ) : (
              <p className="pc-muted pc-center">В объекте нет листов.</p>
            )}
            <div className="pc-hint">
              {roomMode
                ? 'Колесо — приблизить · тащить мышью — двигать лист · щелчок по помещению — его поля'
                : 'Колесо — приблизить · тащить мышью — двигать лист · щелчок по точке — её фото'}
            </div>
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
          </>
        )}
      </section>

      <aside className="pc-right">
        {mode === 'lists' ? (
          <p className="pc-muted">
            Списки видит вся бригада, править может любой участник. Готовые списки можно взять из шаблонов: <a href="#/templates">шаблоны списков</a>.
          </p>
        ) : mode === 'rooms' ? (
          <p className="pc-muted">«На плане» в строке — открыть помещение на листе.</p>
        ) : mode === 'plan' && roomMode ? (
          roomId && !editId ? (
            <PcRoomPanel roomId={roomId} canEdit={mayEditRooms} onEditContour={() => setEditId(roomId)} onClose={() => setRoomId(null)} />
          ) : (
            <p className="pc-muted">
              {editId ? 'Правка контура: тащите углы на листе.' : 'Щёлкните по помещению на листе, чтобы увидеть и исправить его поля.'}
            </p>
          )
        ) : mode === 'plan' ? (
          selectedPoint && pointNumber.has(selectedPoint) ? (
            <PointPhotos
              rooms={data.rooms.get(sheetId ?? '') ?? []}
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

/** Указать исходный PDF листа: лист станет чётким при любом приближении (только на этом компьютере, Р-42). */
function SheetPdfButton({ sheetId }: { sheetId: string }) {
  const rec = useLiveQuery(async () => {
    const r = await db.sheetPdfs.get(sheetId)
    return r ? { name: r.name, page: r.page } : null
  }, [sheetId])
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (rec === undefined) return null

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = ''
    if (!file) return
    setBusy(true)
    setError((await attachPdf(sheetId, file)) ?? '')
    setBusy(false)
  }

  return (
    <div className="pc-pdf">
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => pick(e.target.files?.[0])} />
      {rec ? (
        <>
          <span className="pc-muted" title={rec.name}>
            Чётко из PDF: {rec.name}
            {rec.page > 1 ? `, стр. ${rec.page}` : ''}
          </span>
          <button className="btn-link" onClick={() => removePdf(sheetId)}>
            Убрать
          </button>
        </>
      ) : (
        <button className="pc-btn" disabled={busy} onClick={() => input.current?.click()} title="Указать исходный PDF чертежа: лист станет чётким при любом приближении. PDF хранится только на этом компьютере.">
          {busy ? 'Открываем PDF…' : 'Чёткий лист из PDF'}
        </button>
      )}
      {error && <span className="pc-error">{error}</span>}
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
  rooms,
  pointId,
  number,
  caption,
  match,
  onClose,
}: {
  /** Помещения листа точки. */
  rooms: Room[]
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
      <PointRoomPc point={point} rooms={rooms} canEdit={!people || people.isMine(point.authorId)} />
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

/** Помещение точки на компьютере (шаг 22): автор точки выбирает его из списка, остальные только видят. */
function PointRoomPc({ point, rooms, canEdit }: { point: Point; rooms: Room[]; canEdit: boolean }) {
  if (!rooms.length && !point.roomId) return null
  const auto = roomOfPoint({ ...point, roomId: null }, rooms)
  const value = point.roomId === ROOM_NONE ? ROOM_NONE : point.roomId && rooms.some(r => r.id === point.roomId) ? point.roomId : ''
  if (!canEdit) return <div className="pc-muted pc-point-room">Помещение: {pointRoomText(point, rooms)}</div>
  return (
    <label className="pc-point-room">
      <span className="pc-muted">Помещение</span>
      <select className="field" value={value} onChange={e => setPointRoom(point.id, e.target.value || null)}>
        <option value="">По контуру: {auto ? roomTitle(auto) : 'без помещения'}</option>
        {rooms.map(r => (
          <option key={r.id} value={r.id}>
            {roomTitle(r)}
          </option>
        ))}
        <option value={ROOM_NONE}>Без помещения</option>
      </select>
    </label>
  )
}
