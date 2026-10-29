import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db, PHOTO_TYPES, type PhotoType, type Point } from './db'
import { CameraView } from './CameraView'
import { savePhoto } from './photos'
import { useObjectUrl } from './useObjectUrl'

function PhotoThumb({ fileName }: { fileName: string }) {
  const thumb = useLiveQuery(async () => (await db.photoFiles.get(fileName))?.thumb, [fileName])
  const url = useObjectUrl(thumb)
  return (
    <div style={{ width: 56, height: 56, flex: 'none', borderRadius: 6, background: '#eee', overflow: 'hidden' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}

/** Панель выбранной точки: тип серии, кнопка съёмки и что уже снято. */
export function PointPanel({
  point,
  number,
  photoType,
  onPhotoTypeChange,
  onClose,
}: {
  point: Point
  number: number
  /** Тип выбирается на серию и сохраняется для следующих фото и точек (Р-11). */
  photoType: PhotoType
  onPhotoTypeChange: (type: PhotoType) => void
  onClose: () => void
}) {
  const photos = useLiveQuery(async () => {
    const all = await db.photos.where('pointId').equals(point.id).reverse().sortBy('takenAt')
    return all.filter(p => !p.deleted)
  }, [point.id])
  const camera = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setSaving(true)
    setError(null)
    try {
      for (const file of files) await savePhoto(point, file, photoType)
    } catch (e) {
      setError('Не удалось сохранить фото: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
      if (camera.current) camera.current.value = ''
    }
  }

  const [cameraOpen, setCameraOpen] = useState(false)

  /** Снимок встроенной камеры: сохраняем в фоне, камера остаётся открытой. */
  function onCameraShot(blob: Blob, type: PhotoType) {
    const file = new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg', lastModified: Date.now() })
    savePhoto(point, file, type).catch(e =>
      setError('Не удалось сохранить фото: ' + (e instanceof Error ? e.message : String(e))),
    )
  }

  const counts = (Object.keys(PHOTO_TYPES) as PhotoType[])
    .map(type => ({ type, count: photos?.filter(p => p.type === type).length ?? 0 }))
    .filter(c => c.count > 0)

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 1,
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        background: 'var(--surface)',
        borderTop: '1px solid #ddd',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>Точка {number}</strong>
        <button className="btn-link" style={{ padding: 0 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        поставлена {new Date(point.createdAt).toLocaleString('ru-RU')}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
        {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
          <button
            key={type}
            onClick={() => onPhotoTypeChange(type)}
            style={{
              padding: '6px 10px',
              fontSize: 14,
              borderRadius: 16,
              border: '1px solid var(--accent)',
              background: type === photoType ? 'var(--accent)' : '#fff',
              color: type === photoType ? '#fff' : 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => onFiles(e.target.files)}
      />
      <button className="btn" style={{ width: '100%' }} onClick={() => setCameraOpen(true)}>
        📷 Камера: {PHOTO_TYPES[photoType]}
      </button>
      <button className="btn-link" style={{ width: '100%', fontSize: 14 }} disabled={saving} onClick={() => camera.current?.click()}>
        {saving ? 'Сохраняем…' : 'Обычная камера (лучше качество, по одному снимку)'}
      </button>
      {cameraOpen && (
        <CameraView
          photoType={photoType}
          onPhotoTypeChange={onPhotoTypeChange}
          onShot={onCameraShot}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {error && <p style={{ color: '#d9534f', fontSize: 14 }}>{error}</p>}

      {photos && photos.length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 13, margin: '10px 0 6px' }}>
            {counts.map(c => `${PHOTO_TYPES[c.type]}: ${c.count}`).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {photos.map(p => (
              <PhotoThumb key={p.id} fileName={p.fileName} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
