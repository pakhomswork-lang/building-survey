import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DeleteSheetDialog } from './DeleteSheetDialog'
import { db, deleteProject, renameProject } from './db'
import { FolderStatus } from './FolderStatus'
import { plural } from './format'
import { Icon } from './Icon'
import { isComputer } from './pcFolder'
import { PcFolderStatus } from './PcFolderStatus'
import { SheetList } from './SheetList'
import { TeamStatus } from './TeamStatus'
import { navigate } from './useHashRoute'

export function ProjectScreen({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  // null — объект не найден, undefined — ещё загружаем
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])
  const counts = useLiveQuery(async () => {
    const [sheets, photos] = await Promise.all([
      db.sheets.where('projectId').equals(projectId).toArray(),
      db.photos.where('projectId').equals(projectId).toArray(),
    ])
    return { sheets: sheets.filter(s => !s.deleted).length, photos: photos.filter(p => !p.deleted).length }
  }, [projectId])
  const [menuOpen, setMenuOpen] = useState(false)
  const [deletingSheet, setDeletingSheet] = useState(false)

  if (project === undefined) return null

  if (project === null || project.deleted) {
    return (
      <section>
        <div className="page-top">
          <button className="icon-btn" aria-label="Назад" onClick={onBack}>
            <Icon name="back" />
          </button>
        </div>
        <p className="muted">Объект не найден.</p>
      </section>
    )
  }

  async function rename() {
    setMenuOpen(false)
    const name = prompt('Новое название объекта', project!.name)?.trim()
    if (name && name !== project!.name) await renameProject(projectId, name)
  }

  async function remove() {
    setMenuOpen(false)
    const ok = confirm(
      `Удалить объект «${project!.name}» со всеми листами, точками и фото?\n\n` +
        'Фото, уже сохранённые в папку телефона, останутся там.',
    )
    if (!ok) return
    await deleteProject(projectId)
    onBack()
  }

  return (
    <section>
      <div className="page-top">
        <button className="icon-btn" aria-label="Назад" onClick={onBack}>
          <Icon name="back" />
        </button>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Действия с объектом" onClick={() => setMenuOpen(o => !o)}>
          <Icon name="more" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
          <div className="type-menu" style={{ top: 52, right: 12, left: 'auto', bottom: 'auto' }}>
            <button onClick={rename}>
              <Icon name="edit" />
              Переименовать
            </button>
            {(counts?.sheets ?? 0) > 0 && (
              <button
                style={{ color: 'var(--danger)' }}
                onClick={() => {
                  setMenuOpen(false)
                  setDeletingSheet(true)
                }}
              >
                <Icon name="trash" />
                Удалить лист…
              </button>
            )}
            <button style={{ color: 'var(--danger)' }} onClick={remove}>
              <Icon name="trash" />
              Удалить объект
            </button>
          </div>
        </>
      )}

      {deletingSheet && <DeleteSheetDialog projectId={projectId} onClose={() => setDeletingSheet(false)} />}

      <h1 className="page-title">{project.name}</h1>
      {counts && (
        <div className="page-sub">
          {plural(counts.sheets, 'лист', 'листа', 'листов')}, {counts.photos} фото
        </div>
      )}

      <SheetList projectId={projectId} />

      <div className="list" style={{ marginTop: 24 }}>
        <button className="item" onClick={() => navigate({ screen: 'photos', projectId })}>
          <Icon name="images" />
          <div className="grow">
            <b>Все фото объекта</b>
            <small>Отбор по листу и типу</small>
          </div>
          <Icon name="right" />
        </button>
        <TeamStatus projectId={projectId} />
        {/* на компьютере фото не снимают, а ищут в папке с фото объекта (Р-39) */}
        {isComputer ? <PcFolderStatus projectId={projectId} /> : <FolderStatus projectId={projectId} />}
      </div>
    </section>
  )
}
