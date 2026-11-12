import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteSheet, type Sheet } from './db'
import { plural } from './format'
import { Icon } from './Icon'

/** Слово, которое нужно ввести, чтобы удалить лист: защита от случайного нажатия. */
const CONFIRM_WORD = 'удалить'

/**
 * Удаление листа с экрана объекта: выбрать лист, ввести слово «удалить», подтвердить.
 * Удаление нарочно спрятано глубже, чтобы лист с точками не стёрли случайно.
 */
export function DeleteSheetDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const [sheets, points, photos] = await Promise.all([
      db.sheets.where('projectId').equals(projectId).sortBy('order'),
      db.points.where('projectId').equals(projectId).toArray(),
      db.photos.where('projectId').equals(projectId).toArray(),
    ])
    return {
      sheets: sheets.filter(s => !s.deleted),
      points: points.filter(p => !p.deleted),
      photos: photos.filter(p => !p.deleted),
    }
  }, [projectId])
  const [chosen, setChosen] = useState<Sheet | null>(null)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)

  const countText = (sheetId: string) => {
    const points = data?.points.filter(p => p.sheetId === sheetId).length ?? 0
    const photos = data?.photos.filter(p => p.sheetId === sheetId).length ?? 0
    return points ? `${plural(points, 'точка', 'точки', 'точек')}, ${photos} фото` : 'Точек нет'
  }
  const wordOk = word.trim().toLowerCase() === CONFIRM_WORD

  async function remove() {
    if (!chosen || !wordOk) return
    setBusy(true)
    await deleteSheet(chosen.id)
    onClose()
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-label="Удалить лист">
        <div className="grip" />
        {!chosen ? (
          <>
            <b style={{ fontWeight: 500, fontSize: 18 }}>Какой лист удалить?</b>
            <div className="list" style={{ marginTop: 16 }}>
              {data?.sheets.map(s => (
                <button key={s.id} className="item" onClick={() => setChosen(s)}>
                  <Icon name="file" />
                  <div className="grow">
                    <b>{s.name}</b>
                    <small>{countText(s.id)}</small>
                  </div>
                  <Icon name="right" />
                </button>
              ))}
            </div>
            <button className="secondary-btn" style={{ marginTop: 16 }} onClick={onClose}>
              Отмена
            </button>
          </>
        ) : (
          <>
            <b style={{ fontWeight: 500, fontSize: 18 }}>Удалить лист «{chosen.name}»?</b>
            <p className="muted" style={{ fontSize: 14, margin: '8px 0 0' }}>
              На листе: {countText(chosen.id).toLowerCase()}. Они удалятся вместе с листом.
              Фото, уже сохранённые в папку телефона, останутся там.
            </p>
            <label htmlFor="delete-word">Чтобы удалить, введите слово «{CONFIRM_WORD}»</label>
            <input
              id="delete-word"
              className="field"
              value={word}
              onChange={e => setWord(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
            />
            <button
              className="primary-btn"
              style={{ marginTop: 16, background: 'var(--danger)' }}
              disabled={!wordOk || busy}
              onClick={remove}
            >
              <Icon name="trash" />
              Удалить лист
            </button>
            <button
              className="secondary-btn"
              style={{ marginTop: 8 }}
              onClick={() => {
                setChosen(null)
                setWord('')
              }}
            >
              Выбрать другой лист
            </button>
          </>
        )}
      </div>
    </>
  )
}
