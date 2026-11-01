import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { PHOTO_TYPES, type PhotoType } from './db'
import { Icon } from './Icon'
import { typeColor } from './typeColor'
import { useObjectUrl } from './useObjectUrl'

// Встроенная камера (Р-20): не закрывается после снимка, снимает в полном разрешении.
// На Android в Chrome фото берём через ImageCapture, иначе (iPhone) — кадр из видео.

// ImageCapture есть в Chrome, но его нет в стандартных типах TypeScript
interface ImageCaptureApi {
  getPhotoCapabilities(): Promise<{ imageWidth: { max: number }; imageHeight: { max: number } }>
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureApi } | undefined

type CameraCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }

export function CameraView({
  title,
  photoType,
  onPhotoTypeChange,
  onShot,
  onSystemCamera,
  onClose,
}: {
  /** Куда снимаем, например «Точка 3». */
  title: string
  photoType: PhotoType
  onPhotoTypeChange: (type: PhotoType) => void
  /** Вызывается, когда фото готово. Сохранение идёт в фоне, можно снимать дальше. */
  onShot: (photo: Blob, type: PhotoType) => void
  /** Перейти на обычную (системную) камеру: она лучше обрабатывает снимок (Р-20). */
  onSystemCamera: () => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const captureRef = useRef<{ api: ImageCaptureApi; width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [shots, setShots] = useState(0)
  // последний снимок — маленькое превью слева от кнопки съёмки
  const [last, setLast] = useState<Blob | undefined>()
  const lastUrl = useObjectUrl(last)
  const [zoom, setZoom] = useState<{ min: number; max: number; step: number; value: number } | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } },
          audio: false,
        })
      } catch (e) {
        setError('Камера не открылась: ' + (e instanceof Error ? e.message : String(e)))
        return
      }
      if (cancelled) return stream.getTracks().forEach(t => t.stop())
      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})

      if (typeof ImageCapture !== 'undefined') {
        try {
          const api = new ImageCapture(track)
          const caps = await api.getPhotoCapabilities()
          captureRef.current = { api, width: caps.imageWidth.max, height: caps.imageHeight.max }
        } catch {
          // останемся на кадре из видео
        }
      }
      const caps = (track.getCapabilities?.() ?? {}) as CameraCaps
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        setZoom({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1, value: caps.zoom.min })
      }
    })()
    return () => {
      cancelled = true
      stream?.getTracks().forEach(t => t.stop())
      trackRef.current = null
      captureRef.current = null
    }
  }, [])

  async function shoot() {
    if (capturing || !trackRef.current) return
    setCapturing(true)
    try {
      let blob: Blob
      const cap = captureRef.current
      if (cap) {
        blob = await cap.api.takePhoto({ imageWidth: cap.width, imageHeight: cap.height })
      } else {
        const video = videoRef.current!
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error('пустой кадр'))), 'image/jpeg', 0.95),
        )
      }
      // сигнал «готово» — только когда фото действительно снято
      setFlash(true)
      setTimeout(() => setFlash(false), 150)
      navigator.vibrate?.(40)
      setShots(n => n + 1)
      setLast(blob)
      onShot(blob, photoType)
    } catch (e) {
      setError('Снимок не удался: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCapturing(false)
    }
  }

  async function focusAt(e: MouseEvent<HTMLVideoElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const point = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    // не все телефоны умеют фокус по нажатию — тогда просто ничего не делаем
    await trackRef.current
      ?.applyConstraints({ advanced: [{ pointsOfInterest: [point], focusMode: 'single-shot' } as MediaTrackConstraintSet] })
      .catch(() => {})
  }

  function changeZoom(value: number) {
    setZoom(z => (z ? { ...z, value } : z))
    trackRef.current?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {})
  }

  return (
    <div className="dark-screen" style={{ zIndex: 10, background: '#000' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        onClick={focusAt}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash ? 0.6 : 0, pointerEvents: 'none', transition: 'opacity .15s' }} />

      <div className="dark-top">
        <button className="icon-btn" aria-label="Закрыть камеру" onClick={onClose}>
          <Icon name="close" />
        </button>
        <b style={{ flex: 1, fontWeight: 500 }}>{title}</b>
        <span style={{ fontSize: 13, opacity: 0.85, paddingRight: 8 }}>Снято: {shots}</span>
      </div>

      {capturing && (
        <div style={{ position: 'absolute', top: '45%', left: 0, right: 0, textAlign: 'center', fontSize: 22, fontWeight: 600, textShadow: '0 1px 4px #000' }}>
          Держите…
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', zIndex: 2, top: 64, left: 12, right: 12, background: 'var(--danger)', padding: 12, borderRadius: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div className="dark-bottom">
        {zoom && (
          <input
            type="range"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoom.value}
            onChange={e => changeZoom(Number(e.target.value))}
            style={{ width: '100%', marginBottom: 12 }}
          />
        )}
        <div className="chips">
          {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
            <button key={type} className={'chip on-dark' + (type === photoType ? ' on' : '')} onClick={() => onPhotoTypeChange(type)}>
              <i className="type-dot" style={{ background: typeColor(type) }} />
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <div style={{ width: 60, height: 56, borderRadius: 12, overflow: 'hidden', border: lastUrl ? '2px solid #fff' : 0 }}>
            {lastUrl && <img src={lastUrl} alt="Последний снимок" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </div>
          <button className="shutter" aria-label="Снять" onClick={shoot} disabled={capturing}>
            <span />
          </button>
          <button className="cam-alt" aria-label="Обычная камера, лучше качество" onClick={onSystemCamera}>
            <Icon name="cameraAlt" size={18} />
            Обычная
          </button>
        </div>
      </div>
    </div>
  )
}
