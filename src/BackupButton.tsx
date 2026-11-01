import { useState } from 'react'
import { buildProjectBackup, downloadFile } from './backup'

/** Кнопка «Резервная копия»: всё по объекту одним архивом в «Загрузки». */
export function BackupButton({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const { blob, fileName, photoCount, missing } = await buildProjectBackup(projectId, setStatus)
      downloadFile(blob, fileName)
      const mb = (blob.size / 1024 / 1024).toFixed(1)
      setStatus(
        `Готово: ${photoCount} фото, ${mb} МБ. Файл в «Загрузках».` +
          (missing ? ` Не найдено в приложении: ${missing} фото.` : ''),
      )
    } catch (e) {
      setStatus('Не удалось: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <button className="btn btn-outline" style={{ width: '100%' }} disabled={busy} onClick={run}>
        {busy ? 'Готовим архив…' : 'Резервная копия объекта (архив)'}
      </button>
      {status && (
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {status}
        </p>
      )}
    </div>
  )
}
