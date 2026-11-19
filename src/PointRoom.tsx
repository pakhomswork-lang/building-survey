import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ROOM_NONE, type Point } from './db'
import { Icon } from './Icon'
import { pointRoomText, roomColor, roomOfPoint, roomsOfSheet, roomTitle, setPointRoom, insideContour } from './rooms'

/**
 * Помещение точки на телефоне (шаг 22, Р-48): строка «Помещение: …»; автор точки нажатием
 * открывает выбор — по контуру, одно из помещений листа или «без помещения».
 */
export function PointRoom({ point, canEdit }: { point: Point; canEdit: boolean }) {
  const rooms = useLiveQuery(() => roomsOfSheet(point.sheetId), [point.sheetId])
  const [open, setOpen] = useState(false)
  // на листе нет помещений и вручную ничего не выбрано — строку не показываем
  if (!rooms || (!rooms.length && !point.roomId)) return null

  const auto = roomOfPoint({ ...point, roomId: null }, rooms)
  const choose = async (roomId: string | null) => {
    setOpen(false)
    if (roomId !== point.roomId) await setPointRoom(point.id, roomId)
  }
  const chosen = point.roomId && point.roomId !== ROOM_NONE && rooms.some(r => r.id === point.roomId) ? point.roomId : null

  return (
    <>
      {canEdit ? (
        <button className="point-room" onClick={() => setOpen(true)}>
          Помещение: <b>{pointRoomText(point, rooms)}</b>
          <Icon name="down" size={14} />
        </button>
      ) : (
        <div className="point-room">
          Помещение: <b>{pointRoomText(point, rooms)}</b>
        </div>
      )}
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} />
          <div className="bottom-sheet" role="dialog" aria-label="Помещение точки">
            <div className="grip" />
            <b style={{ fontWeight: 500, fontSize: 18 }}>Помещение точки</b>
            <div className="list" style={{ marginTop: 12 }}>
              <button className={'item' + (point.roomId === null ? ' on' : '')} onClick={() => choose(null)}>
                <Icon name={point.roomId === null ? 'check' : 'pin'} />
                <div className="grow">
                  <b>По контуру</b>
                  <small>Сейчас: {auto ? roomTitle(auto) : 'без помещения'}. Поменяется, если поправить контуры</small>
                </div>
              </button>
              {rooms.map((r, i) => (
                <button key={r.id} className={'item' + (chosen === r.id ? ' on' : '')} onClick={() => choose(r.id)}>
                  {chosen === r.id ? <Icon name="check" /> : <i className="type-dot" style={{ background: roomColor(i), width: 12, height: 12, margin: 6 }} />}
                  <div className="grow">
                    <b>{roomTitle(r)}</b>
                    {insideContour(point.x, point.y, r.contour) && <small>точка внутри этого помещения</small>}
                  </div>
                </button>
              ))}
              <button className={'item' + (point.roomId === ROOM_NONE ? ' on' : '')} onClick={() => choose(ROOM_NONE)}>
                <Icon name={point.roomId === ROOM_NONE ? 'check' : 'close'} />
                <div className="grow">
                  <b>Без помещения</b>
                  <small>Например, снято с улицы</small>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
