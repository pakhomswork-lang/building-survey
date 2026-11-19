import { useState } from 'react'
import type { Room } from './db'
import { Icon } from './Icon'
import { roomTitle, updateRoom } from './rooms'

/** Поля помещения: номер, название, комментарий (Р-46). Кто не может править — только смотрит. */
export function RoomPanel({ room, color, canEdit, onClose }: { room: Room; color: string; canEdit: boolean; onClose: () => void }) {
  const [number, setNumber] = useState(room.number)
  const [name, setName] = useState(room.name)
  const [comment, setComment] = useState(room.comment)

  async function save() {
    const changes = { number: number.trim(), name: name.trim(), comment: comment.trim() }
    if (changes.number !== room.number || changes.name !== room.name || changes.comment !== room.comment) {
      await updateRoom(room.id, changes)
    }
    onClose()
  }

  return (
    <>
      <div className="scrim" onClick={canEdit ? save : onClose} />
      <div className="bottom-sheet" role="dialog" aria-label={'Помещение ' + roomTitle(room)}>
        <div className="grip" />
        <b style={{ fontWeight: 500, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="type-dot" style={{ background: color, width: 12, height: 12 }} />
          Помещение {roomTitle(room)}
        </b>
        {canEdit ? (
          <>
            <label htmlFor="room-number">Номер</label>
            <input id="room-number" className="field" value={number} onChange={e => setNumber(e.target.value)} placeholder="Например, 12 или А1" maxLength={20} />
            <label htmlFor="room-name">Название</label>
            <input id="room-name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Например, Кухня" maxLength={200} />
            <label htmlFor="room-comment">Комментарий</label>
            <textarea id="room-comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="Например, не было доступа" maxLength={2000} />
            <button className="primary-btn" style={{ marginTop: 16 }} onClick={save}>
              <Icon name="check" />
              Готово
            </button>
          </>
        ) : (
          <>
            {room.comment && <p style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{room.comment}</p>}
            <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>Помещения правит создатель объекта.</p>
            <button className="primary-btn" style={{ marginTop: 16 }} onClick={onClose}>
              Закрыть
            </button>
          </>
        )}
      </div>
    </>
  )
}
