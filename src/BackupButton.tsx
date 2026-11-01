import { useState } from 'react'
import { buildProjectBackup, downloadFile } from './backup'
import { Icon } from './Icon'

/** Строка «Резервная копия»: всё по объекту одним архивом в «Загрузки». */
export function BackupButton({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    if (busy) return
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
    <button className="item" onClick={run}>
      <Icon name="archive" />
      <div className="grow">
        <b>Резервная копия</b>
        <small>{busy && !status ? 'Готовим архив…' : status ?? 'Архив в «Загрузки»: данные, листы, фото'}</small>
      </div>
      <Icon name="right" />
    </button>
  )
}
