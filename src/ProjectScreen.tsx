import { useLiveQuery } from 'dexie-react-hooks'
import { BackupButton } from './BackupButton'
import { db, deleteProject, renameProject } from './db'
import { FolderStatus } from './FolderStatus'
import { SheetList } from './SheetList'
import { navigate } from './useHashRoute'

export function ProjectScreen({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  // null — объект не найден, undefined — ещё загружаем
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])
  const photoCount =
    useLiveQuery(async () => (await db.photos.where('projectId').equals(projectId).toArray()).filter(p => !p.deleted).length, [projectId]) ?? 0

  if (project === undefined) return null

  return (
    <section>
      <button className="btn-link" onClick={onBack}>
        ← Объекты
      </button>
      {project === null || project.deleted ? (
        <p className="muted">Объект не найден.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '4px 0 12px' }}>
            <h2 style={{ fontSize: 20, margin: 0, flex: 1 }}>{project.name}</h2>
            <button
              className="btn-link"
              style={{ padding: 0, flex: 'none' }}
              onClick={async () => {
                const name = prompt('Новое название объекта', project.name)?.trim()
                if (name && name !== project.name) await renameProject(projectId, name)
              }}
            >
              Переименовать
            </button>
          </div>
          <FolderStatus projectId={projectId} />
          {photoCount > 0 && (
            <button className="btn" style={{ width: '100%', marginBottom: 12 }} onClick={() => navigate({ screen: 'photos', projectId })}>
              Все фото объекта ({photoCount})
            </button>
          )}
          <SheetList projectId={projectId} />
          <BackupButton projectId={projectId} />
          <button
            className="btn-link danger"
            style={{ marginTop: 16 }}
            onClick={async () => {
              const ok = confirm(
                `Удалить объект «${project.name}» со всеми листами, точками и фото?\n\n` +
                  'Фото, уже сохранённые в папку телефона, останутся там.',
              )
              if (!ok) return
              await deleteProject(projectId)
              onBack()
            }}
          >
            Удалить объект
          </button>
        </>
      )}
    </section>
  )
}
