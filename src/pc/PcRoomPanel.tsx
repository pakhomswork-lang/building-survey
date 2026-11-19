import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Room } from '../db'
import { deleteRoom, roomColor, roomsOfSheet, roomTitle, updateRoom } from '../rooms'

/**
 * Поля выбранного помещения справа от листа (шаг 21, Р-52). Номер, название, комментарий
 * сохраняются, как только поле потеряло фокус или нажали Enter.
 */
export function PcRoomPanel({
  roomId,
  canEdit,
  onEditContour,
  onClose,
}: {
  roomId: string
  canEdit: boolean
  onEditContour: () => void
  onClose: () => void
}) {
  const data = useLiveQuery(async () => {
    const room = await db.rooms.get(roomId)
    if (!room || room.deleted) return { room: null, index: 0 }
    const list = await roomsOfSheet(room.sheetId)
    return { room, index: list.findIndex(r => r.id === roomId) }
  }, [roomId])
  if (!data) return null
  if (!data.room) return <p className="pc-muted">Помещение удалено.</p>
  // key — чтобы поля заполнились заново, когда выбрали другое помещение
  return <Fields key={data.room.id} room={data.room} color={roomColor(data.index)} canEdit={canEdit} onEditContour={onEditContour} onClose={onClose} />
}

function Fields({
  room,
  color,
  canEdit,
  onEditContour,
  onClose,
}: {
  room: Room
  color: string
  canEdit: boolean
  onEditContour: () => void
  onClose: () => void
}) {
  const [number, setNumber] = useState(room.number)
  const [name, setName] = useState(room.name)
  const [comment, setComment] = useState(room.comment)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(changes: Partial<Pick<Room, 'number' | 'name' | 'comment'>>) {
    const [k, v] = Object.entries(changes)[0] as ['number' | 'name' | 'comment', string]
    if (room[k] !== v.trim()) await updateRoom(room.id, { [k]: v.trim() })
  }
  const enterSaves = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <div className="pc-room-panel">
      <div className="pc-point-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="type-dot" style={{ background: color, width: 12, height: 12 }} />
          Помещение {roomTitle(room)}
        </h2>
        <button className="pc-btn" onClick={onClose}>
          Закрыть
        </button>
      </div>
      {canEdit ? (
        <>
          <label htmlFor="pc-room-number">Номер</label>
          <input id="pc-room-number" className="field" value={number} maxLength={20} placeholder="Например, 12 или А1"
            onChange={e => setNumber(e.target.value)} onBlur={() => save({ number })} onKeyDown={enterSaves} />
          <label htmlFor="pc-room-name">Название</label>
          <input id="pc-room-name" className="field" value={name} maxLength={200} placeholder="Например, Кухня"
            onChange={e => setName(e.target.value)} onBlur={() => save({ name })} onKeyDown={enterSaves} />
          <label htmlFor="pc-room-comment">Комментарий</label>
          <textarea id="pc-room-comment" className="field" value={comment} maxLength={2000} rows={4} placeholder="Например, не было доступа"
            onChange={e => setComment(e.target.value)} onBlur={() => save({ comment })} />
          <div className="pc-room-actions">
            <button className="pc-btn" onClick={onEditContour}>
              Изменить контур
            </button>
            <button
              className="pc-btn pc-danger"
              onClick={async () => {
                // первое нажатие спрашивает, второе удаляет
                if (!confirmDelete) return setConfirmDelete(true)
                await deleteRoom(room.id)
                onClose()
              }}
            >
              {confirmDelete ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить помещение'}
            </button>
          </div>
        </>
      ) : (
        <>
          {room.comment && <p className="pc-comment">{room.comment}</p>}
          <p className="pc-muted">Помещения правит создатель объекта.</p>
        </>
      )}
    </div>
  )
}
