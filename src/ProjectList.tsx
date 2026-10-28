import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { createProject, db } from './db'

export function ProjectList({ onOpen }: { onOpen: (projectId: string) => void }) {
  // список обновляется сам, когда в базе что-то меняется
  const projects = useLiveQuery(async () => {
    const all = await db.projects.orderBy('updatedAt').reverse().toArray()
    return all.filter(p => !p.deleted)
  })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const project = await createProject(name.trim())
    setName('')
    setCreating(false)
    onOpen(project.id)
  }

  return (
    <section>
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Объекты</h2>

      {creating ? (
        <form onSubmit={submit} style={{ marginBottom: 16 }}>
          <input
            className="field"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Название объекта, например «ул. Ленина, 12»"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn" type="submit" disabled={!name.trim()}>
              Создать
            </button>
            <button className="btn-link" type="button" onClick={() => setCreating(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ width: '100%', marginBottom: 16 }} onClick={() => setCreating(true)}>
          + Новый объект
        </button>
      )}

      {projects?.length === 0 && <p className="muted">Объектов пока нет.</p>}
      {projects?.map(p => (
        <button key={p.id} className="card" onClick={() => onOpen(p.id)}>
          {p.name}
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            создан {new Date(p.createdAt).toLocaleDateString('ru-RU')}
          </div>
        </button>
      ))}
    </section>
  )
}
