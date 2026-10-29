import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { PHOTO_TYPES, type PhotoType } from './db'

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
  photoType,
  onPhotoTypeChange,
  onShot,
  onClose,
}: {
  photoType: PhotoType
  onPhotoTypeChange: (type: PhotoType) => void
  /** Вызывается, когда фото готово. Сохранение идёт в фоне, можно снимать дальше. */
  onShot: (photo: Blob, type: PhotoType) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const captureRef = useRef<{ api: ImageCaptureApi; width: number; height: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [shots, setShots] = useState(0)
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 10, background: '#000', color: '#fff' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        onClick={focusAt}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash ? 0.6 : 0, pointerEvents: 'none', transition: 'opacity .15s' }} />

      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ background: 'rgba(0,0,0,.5)', padding: '8px 12px', borderRadius: 8, fontSize: 14 }}>Снято: {shots}</span>
        <button className="btn" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
          Готово
        </button>
      </div>

      {capturing && (
        <div style={{ position: 'absolute', top: '45%', left: 0, right: 0, textAlign: 'center', fontSize: 22, fontWeight: 600, textShadow: '0 1px 4px #000' }}>
          Держите…
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: 64, left: 12, right: 12, background: '#d9534f', padding: 10, borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 12px 24px', background: 'linear-gradient(transparent, rgba(0,0,0,.7))' }}>
        {zoom && (
          <input
            type="range"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoom.value}
            onChange={e => changeZoom(Number(e.target.value))}
            style={{ width: '100%', marginBottom: 10 }}
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
          {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
            <button
              key={type}
              onClick={() => onPhotoTypeChange(type)}
              style={{
                padding: '6px 10px',
                fontSize: 14,
                borderRadius: 16,
                border: '1px solid #fff',
                background: type === photoType ? '#fff' : 'rgba(0,0,0,.4)',
                color: type === photoType ? '#000' : '#fff',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          aria-label="Снять"
          onClick={shoot}
          disabled={capturing}
          style={{
            display: 'block',
            margin: '0 auto',
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: capturing ? '#bbb' : '#fff',
            border: '6px solid rgba(255,255,255,.5)',
            backgroundClip: 'padding-box',
          }}
        />
      </div>
    </div>
  )
}
