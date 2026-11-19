import { useState } from 'react'
import type { Photo, Point, Room, Sheet } from '../db'
import { roomColor, updateRoom } from '../rooms'

/**
 * Таблица помещений объекта на компьютере (шаг 23, Р-46 п. 9, Р-54).
 * Номер, название, комментарий правятся прямо в строках: сохраняется, когда ячейка
 * теряет фокус или нажали Enter; Tab — к следующей ячейке. Править может создатель объекта.
 */
export function PcRoomTable({
  sheets,
  rooms,
  pointRoom,
  points,
  photos,
  canEdit,
  onShow,
}: {
  sheets: Sheet[]
  /** Помещения по листам. */
  rooms: Map<string, Room[]>
  /** Помещение каждой точки (по контуру или выбранное вручную). */
  pointRoom: Map<string, Room | null>
  points: Point[]
  photos: Photo[]
  canEdit: boolean
  /** Показать помещение на плане. */
  onShow: (room: Room) => void
}) {
  const pointCount = new Map<string, number>()
  for (const p of points) {
    const r = pointRoom.get(p.id)
    if (r) pointCount.set(r.id, (pointCount.get(r.id) ?? 0) + 1)
  }
  const photoCount = new Map<string, number>()
  for (const ph of photos) {
    const r = pointRoom.get(ph.pointId)
    if (r) photoCount.set(r.id, (photoCount.get(r.id) ?? 0) + 1)
  }
  const total = [...rooms.values()].reduce((n, list) => n + list.length, 0)

  if (!total) {
    return (
      <p className="pc-muted pc-center">
        Помещений пока нет. Их рисуют на листе: «План» → «Помещения».
      </p>
    )
  }

  return (
    <div className="pc-room-table-wrap">
      <table className="pc-room-table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>№</th>
            <th>Название</th>
            <th>Комментарий</th>
            <th style={{ width: 64 }} title="Точек в помещении">Точек</th>
            <th style={{ width: 64 }} title="Фото в помещении">Фото</th>
            <th style={{ width: 90 }} />
          </tr>
        </thead>
        {sheets
          .filter(s => rooms.get(s.id)?.length)
          .map(s => {
            // цвет — как на плане (по порядку рисования), строки — по номеру
            const list = rooms.get(s.id)!
            const sorted = list
              .map((r, i) => ({ r, color: roomColor(i) }))
              .sort((a, b) => a.r.number.localeCompare(b.r.number, 'ru', { numeric: true }) || a.r.createdAt - b.r.createdAt)
            return (
              <tbody key={s.id}>
                <tr className="pc-room-sheet">
                  <td colSpan={6}>
                    {s.name} <span className="pc-muted">· {list.length}</span>
                  </td>
                </tr>
                {sorted.map(({ r, color }) => (
                  <tr key={r.id}>
                    <td>
                      <span className="pc-room-num">
                        <i className="type-dot" style={{ background: color }} />
                        <Cell room={r} field="number" canEdit={canEdit} maxLength={20} placeholder="—" />
                      </span>
                    </td>
                    <td>
                      <Cell room={r} field="name" canEdit={canEdit} maxLength={200} placeholder="—" />
                    </td>
                    <td>
                      <Cell room={r} field="comment" canEdit={canEdit} maxLength={2000} placeholder="—" />
                    </td>
                    <td className="pc-num">{pointCount.get(r.id) ?? 0}</td>
                    <td className="pc-num">{photoCount.get(r.id) ?? 0}</td>
                    <td>
                      <button className="btn-link" onClick={() => onShow(r)}>
                        На плане
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )
          })}
      </table>
    </div>
  )
}

/** Ячейка, которая правится прямо в таблице. */
function Cell({
  room,
  field,
  canEdit,
  maxLength,
  placeholder,
}: {
  room: Room
  field: 'number' | 'name' | 'comment'
  canEdit: boolean
  maxLength: number
  placeholder: string
}) {
  const [value, setValue] = useState(room[field])
  // пришло изменение с другого устройства, а ячейку сейчас не правят — показываем новое
  const [seen, setSeen] = useState(room[field])
  if (room[field] !== seen) {
    setSeen(room[field])
    setValue(room[field])
  }
  if (!canEdit) return <span className={room[field] ? '' : 'pc-muted'}>{room[field] || placeholder}</span>
  return (
    <input
      className="pc-cell"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={{ number: 'Номер', name: 'Название', comment: 'Комментарий' }[field]}
      onChange={e => setValue(e.target.value)}
      onBlur={async () => {
        const v = value.trim()
        if (v !== room[field]) await updateRoom(room.id, { [field]: v })
        else setValue(v)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(room[field])
          // отмена правки: возвращаем как было и уходим из ячейки
          setTimeout(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}
