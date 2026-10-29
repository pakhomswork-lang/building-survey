import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { chooseFolder, folderSupported, getFolder, pendingFileNames, savePendingToFolder } from './photoFolder'

/** Плашка на экране объекта: куда сохраняются фото и сколько ещё не сохранено. */
export function FolderStatus({ projectId }: { projectId: string }) {
  const folder = useLiveQuery(getFolder)
  const pending = useLiveQuery(() => pendingFileNames(projectId), [projectId])
  const [progress, setProgress] = useState<string | null>(null)

  async function save() {
    setProgress('Сохраняем…')
    const done = await savePendingToFolder(projectId, (d, total) => setProgress(`Сохраняем ${d} из ${total}…`))
    setProgress(done ? `Сохранено: ${done}` : null)
    setTimeout(() => setProgress(null), 3000)
  }

  const box = { padding: 12, marginBottom: 12, borderRadius: 10, fontSize: 14 }

  if (!folderSupported) {
    return <div style={{ ...box, background: '#fff3cd' }}>Этот браузер не умеет сохранять фото в папку. Откройте приложение в Chrome.</div>
  }
  if (folder === undefined || pending === undefined) return null

  if (folder === null) {
    return (
      <div style={{ ...box, background: '#fff3cd' }}>
        Фото пока хранятся только в приложении.
        <button className="btn" style={{ display: 'block', width: '100%', marginTop: 8 }} onClick={() => chooseFolder().then(save)}>
          Выбрать папку на телефоне для фото
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...box, background: pending.length ? '#fff3cd' : 'var(--surface)' }}>
      <div>
        Фото сохраняются в папку «{folder.name}».{' '}
        <button className="btn-link" style={{ padding: 0, fontSize: 14 }} onClick={() => chooseFolder()}>
          Сменить
        </button>
      </div>
      {progress ? (
        <div className="muted" style={{ marginTop: 6 }}>{progress}</div>
      ) : (
        pending.length > 0 && (
          <button className="btn" style={{ display: 'block', width: '100%', marginTop: 8 }} onClick={save}>
            Сохранить в папку: {pending.length} фото
          </button>
        )
      )}
    </div>
  )
}
