import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { db, PHOTO_TYPES, setPhotoType, type Photo, type PhotoType } from '../db'
import { TYPE_KEYS } from '../format'
import { useFolderFile } from '../pcFolder'
import { usePeople } from '../people'
import { PhotoThumb } from '../PhotoThumb'
import { typeColor } from '../typeColor'
import { useObjectUrl } from '../useObjectUrl'

/** Размер миниатюр в сетке. */
export type GridSize = 's' | 'm' | 'l'
const CELL: Record<GridSize, number> = { s: 120, m: 180, l: 260 }

/**
 * Миниатюра, которая загружается, только когда подъезжает к экрану.
 * Иначе тысяча фото разом стала бы делать тысячу миниатюр.
 */
function LazyThumb({ fileName }: { fileName: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(entries => entries.some(e => e.isIntersecting) && setSeen(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return <div ref={ref} style={{ width: '100%', aspectRatio: '1' }}>{seen && <PhotoThumb fileName={fileName} size="100%" radius={0} />}</div>
}

/** Сетка миниатюр. Щелчок — выбрать (предпросмотр справа), двойной щелчок или Enter — на весь экран, стрелки — соседнее фото. */
export function PcPhotoGrid({
  photos,
  caption,
  selectedId,
  onSelect,
  onOpen,
  size,
}: {
  photos: Photo[]
  caption: (p: Photo) => string
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  size: GridSize
}) {
  const people = usePeople()
  const gridRef = useRef<HTMLDivElement>(null)

  // стрелки: соседнее фото (вверх-вниз — на строку), Enter — на весь экран
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!photos.length || (e.target as HTMLElement).closest?.('input, textarea')) return
      const i = photos.findIndex(p => p.id === selectedId)
      const perRow = Math.max(1, Math.floor((gridRef.current?.clientWidth ?? 1) / (CELL[size] + 8)))
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key]
      if (step) {
        e.preventDefault()
        const next = photos[Math.min(photos.length - 1, Math.max(0, i < 0 ? 0 : i + step))]
        onSelect(next.id)
        gridRef.current?.querySelector(`[data-photo-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' && selectedId) {
        e.preventDefault()
        onOpen(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photos, selectedId, onSelect, onOpen, size])

  if (!photos.length) return <p className="pc-muted pc-center">Под эти отборы фото нет.</p>

  return (
    <div className="pc-photo-scroll">
      <div ref={gridRef} className="pc-photo-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CELL[size]}px, 1fr))` }}>
        {photos.map(p => (
          <button
            key={p.id}
            data-photo-id={p.id}
            className={'pc-photo' + (p.id === selectedId ? ' on' : '')}
            style={{ '--c': typeColor(p.type) } as CSSProperties}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => onOpen(p.id)}
          >
            <LazyThumb fileName={p.fileName} />
            <span className="pc-photo-cap">
              <i className="type-dot" style={{ background: typeColor(p.type) }} />
              {caption(p)}
              <em>{people?.codeOf(p.authorId) || p.fileName.split('_')[0]}</em>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Фото целиком: из базы, если снято на этом устройстве, иначе из папки с фото. */
function usePhotoUrl(fileName: string): string | undefined {
  const local = useLiveQuery(async () => (await db.photoFiles.get(fileName))?.blob ?? null, [fileName])
  const inFolder = useFolderFile(fileName)
  const [folderBlob, setFolderBlob] = useState<{ name: string; blob: Blob } | null>(null)
  useEffect(() => {
    if (local === null && inFolder) inFolder.handle.getFile().then(blob => setFolderBlob({ name: fileName, blob }), () => {})
  }, [local, inFolder, fileName])
  return useObjectUrl(local ?? (folderBlob?.name === fileName ? folderBlob.blob : undefined))
}

/** Предпросмотр выбранного фото справа: крупно, где снято, кто снимал, тип. */
export function PcPhotoPreview({ photo, caption, onOpen }: { photo: Photo; caption: string; onOpen: () => void }) {
  const url = usePhotoUrl(photo.fileName)
  const inFolder = useFolderFile(photo.fileName)
  const point = useLiveQuery(() => db.points.get(photo.pointId), [photo.pointId])
  const people = usePeople()
  // тип меняет только тот, кто снимал (Р-38)
  const mine = !people || people.isMine(photo.authorId)

  return (
    <div className="pc-preview">
      <button className="pc-preview-img" onClick={onOpen} title="Открыть на весь экран">
        {url ? <img src={url} alt="" draggable={false} /> : <span className="pc-muted">{inFolder ? 'Загружаем…' : 'Фото нет в папке'}</span>}
      </button>
      <h2>{caption}</h2>
      <div className="pc-muted">
        {new Date(photo.takenAt).toLocaleString('ru-RU')}
        {people && <>, снимал: {people.nameOf(photo.authorId)}</>}
      </div>
      <div className="pc-muted" style={{ wordBreak: 'break-all', fontSize: 12, marginTop: 2 }}>
        {inFolder?.path ?? photo.fileName}
      </div>
      {point?.comment && <p className="pc-comment">{point.comment}</p>}
      <div className="pc-types">
        {(mine ? TYPE_KEYS : [photo.type]).map((t: PhotoType) => (
          <button
            key={t}
            className={'chip' + (t === photo.type ? ' on' : '')}
            disabled={!mine}
            onClick={() => setPhotoType(photo.id, t)}
          >
            <i className="type-dot" style={{ background: typeColor(t) }} />
            {PHOTO_TYPES[t]}
          </button>
        ))}
      </div>
      {!mine && <div className="pc-muted" style={{ fontSize: 12 }}>Тип меняет только тот, кто снимал.</div>}
      <div className="pc-muted" style={{ fontSize: 12, marginTop: 16 }}>
        Стрелки — соседнее фото, Enter или двойной щелчок — на весь экран.
      </div>
    </div>
  )
}
