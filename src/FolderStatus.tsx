import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Icon } from './Icon'
import { chooseFolder, folderSupported, getFolder, pendingFileNames, savePendingToFolder } from './photoFolder'

/** Строка «Папка для фото» на экране объекта: куда сохраняются фото и сколько ещё не сохранено. */
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

  if (!folderSupported) {
    return (
      <div className="item warn">
        <Icon name="folder" />
        <div className="grow">
          <b>Папка для фото</b>
          <small>Этот браузер не умеет сохранять фото в папку. Откройте приложение в Chrome</small>
        </div>
      </div>
    )
  }
  if (folder === undefined || pending === undefined) return null

  // что покажет строка и что сделает нажатие
  let text: string
  let warn = false
  let action: () => void
  if (progress) {
    text = progress
    action = () => {}
  } else if (folder === null) {
    text = 'Не выбрана, фото хранятся только в приложении. Нажмите, чтобы выбрать'
    warn = true
    action = () => chooseFolder().then(save)
  } else if (pending.length > 0) {
    text = `«${folder.name}». Не сохранено: ${pending.length} фото. Нажмите, чтобы сохранить`
    warn = true
    action = save
  } else {
    text = `«${folder.name}». Все фото сохранены. Нажмите, чтобы сменить папку`
    action = () => chooseFolder()
  }

  return (
    <button className={'item' + (warn ? ' warn' : '')} onClick={action}>
      <Icon name="folder" />
      <div className="grow">
        <b>Папка для фото</b>
        <small>{text}</small>
      </div>
      <Icon name="right" />
    </button>
  )
}
