import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { List, ListItem, ListTemplate } from './db'
import { Icon } from './Icon'
import {
  allTemplates,
  createList,
  createTemplate,
  deleteItem,
  deleteList,
  deleteTemplate,
  LIST_COLORS,
  listsOfProject,
  markCounts,
  newItem,
  updateList,
  updateTemplate,
} from './lists'
import { plural } from './format'

// Свои списки объекта и шаблоны списков (шаг 24, Р-47, Р-48, Р-55).
// Один и тот же экран на телефоне и на компьютере.

type Owner = { kind: 'project'; projectId: string } | { kind: 'templates' }
type Editable = (List | ListTemplate) & { projectId?: string }

export function ListsPanel({ owner }: { owner: Owner }) {
  const records = useLiveQuery<Editable[]>(
    () => (owner.kind === 'project' ? listsOfProject(owner.projectId) : allTemplates()),
    [owner.kind, owner.kind === 'project' ? owner.projectId : ''],
  )
  const templates = useLiveQuery(() => allTemplates(), [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [choosingTemplate, setChoosingTemplate] = useState(false)
  if (!records) return null

  const open = records.find(r => r.id === openId)
  if (open) return <ListEditor key={open.id} record={open} owner={owner} onClose={() => setOpenId(null)} />

  async function create() {
    const r = owner.kind === 'project' ? await createList(owner.projectId, '') : await createTemplate('')
    setOpenId(r.id)
  }

  return (
    <div className="lists-panel">
      {records.length === 0 && (
        <p className="muted" style={{ margin: '4px 0 16px' }}>
          {owner.kind === 'project'
            ? 'Список — одна характеристика, например «Материал стен» с позициями «Кирпичные», «Деревянные». По позициям потом ставят цветные отметки на плане.'
            : 'Шаблоны — готовые списки, которые можно загрузить в любой объект. Хранятся в аккаунте: видны на телефоне и на компьютере.'}
        </p>
      )}
      <div className="list">
        {records.map(r => (
          <button key={r.id} className="item" onClick={() => setOpenId(r.id)}>
            <div className="grow">
              <b>{r.name || 'Без названия'}</b>
              <span className="list-swatches">
                {r.items.slice(0, 12).map(i => (
                  <i key={i.id} className="type-dot" style={{ background: i.color }} title={i.name} />
                ))}
                <small>{plural(r.items.length, 'позиция', 'позиции', 'позиций')}</small>
              </span>
            </div>
            <Icon name="right" />
          </button>
        ))}
      </div>
      <div className="lists-actions">
        <button className="btn" onClick={create}>
          {owner.kind === 'project' ? 'Новый список' : 'Новый шаблон'}
        </button>
        {owner.kind === 'project' && (
          <button className="btn btn-outline" disabled={!templates?.length} onClick={() => setChoosingTemplate(true)} title={templates?.length ? '' : 'Шаблонов пока нет'}>
            Из шаблона
          </button>
        )}
      </div>

      {choosingTemplate && owner.kind === 'project' && (
        <>
          <div className="scrim" onClick={() => setChoosingTemplate(false)} />
          <div className="bottom-sheet" role="dialog" aria-label="Список из шаблона">
            <div className="grip" />
            <b style={{ fontWeight: 500, fontSize: 18 }}>Список из шаблона</b>
            <div className="list" style={{ marginTop: 12 }}>
              {templates?.map(t => (
                <button
                  key={t.id}
                  className="item"
                  onClick={async () => {
                    const l = await createList(owner.projectId, t.name, t.items)
                    setChoosingTemplate(false)
                    setOpenId(l.id)
                  }}
                >
                  <div className="grow">
                    <b>{t.name || 'Без названия'}</b>
                    <small>{t.items.map(i => i.name).join(', ') || 'нет позиций'}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Редактор одного списка или шаблона. Всё сохраняется сразу. */
function ListEditor({ record, owner, onClose }: { record: Editable; owner: Owner; onClose: () => void }) {
  const isList = owner.kind === 'project'
  const save = (changes: Partial<Pick<List, 'name' | 'items'>>) => (isList ? updateList(record.id, changes) : updateTemplate(record.id, changes))
  const counts = useLiveQuery(async () => (isList ? markCounts(record.id) : new Map<string, number>()), [record.id, isList])
  const [name, setName] = useState(record.name)
  const [newName, setNewName] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ListItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savedAsTemplate, setSavedAsTemplate] = useState(false)
  const items = record.items

  function setItems(next: ListItem[]) {
    save({ items: next })
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }
  function add() {
    const n = newName.trim()
    if (!n) return
    setItems([...items, newItem(items, n)])
    setNewName('')
  }
  async function removeItem(item: ListItem) {
    if ((counts?.get(item.id) ?? 0) > 0) return setDeleting(item)
    if (isList) await deleteItem(record as List, item.id, null)
    else setItems(items.filter(i => i.id !== item.id))
  }

  return (
    <div className="list-editor">
      <div className="list-editor-head">
        <button className="btn-link" onClick={onClose}>
          ← {isList ? 'Все списки' : 'Все шаблоны'}
        </button>
      </div>
      <label className="list-label" htmlFor="list-name">
        Название {isList ? 'списка' : 'шаблона'}
      </label>
      <input
        id="list-name"
        className="field"
        value={name}
        maxLength={200}
        placeholder="Например, Материал стен"
        autoFocus={!record.name}
        onChange={e => setName(e.target.value)}
        onBlur={() => name.trim() !== record.name && save({ name: name.trim() })}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      />

      <div className="list-label">Позиции</div>
      <div className="list-items">
        {items.map((it, i) => (
          <div key={it.id} className="list-item-row">
            <span className="list-item-no">{i + 1}.</span>
            <button
              className="list-color"
              style={{ background: it.color }}
              aria-label={`Цвет позиции ${it.name}`}
              onClick={() => setColorFor(colorFor === it.id ? null : it.id)}
            />
            <ItemName item={it} onSave={n => setItems(items.map(x => (x.id === it.id ? { ...x, name: n } : x)))} />
            {isList && !!counts?.get(it.id) && <small className="muted list-item-count">{counts.get(it.id)}</small>}
            <button className="list-mini" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="list-mini" aria-label="Ниже" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="list-mini danger" aria-label={`Удалить позицию ${it.name}`} onClick={() => removeItem(it)}>
              ×
            </button>
            {colorFor === it.id && (
              <div className="list-palette">
                {LIST_COLORS.map(c => (
                  <button
                    key={c}
                    className={'list-color' + (c === it.color ? ' on' : '')}
                    style={{ background: c }}
                    aria-label={`Цвет ${c}`}
                    onClick={() => {
                      setItems(items.map(x => (x.id === it.id ? { ...x, color: c } : x)))
                      setColorFor(null)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="list-item-row">
          <span className="list-item-no">{items.length + 1}.</span>
          <span className="list-color" style={{ background: newItem(items).color, opacity: 0.4 }} />
          <input
            className="field list-item-name"
            value={newName}
            maxLength={200}
            placeholder="Новая позиция, например Кирпичные"
            aria-label="Новая позиция"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <button className="list-mini add" aria-label="Добавить позицию" disabled={!newName.trim()} onClick={add}>
            +
          </button>
        </div>
      </div>

      <div className="list" style={{ marginTop: 24 }}>
        {isList && (
          <button
            className="item"
            onClick={async () => {
              await createTemplate(name.trim() || record.name, items)
              setSavedAsTemplate(true)
            }}
          >
            <Icon name="file" />
            <div className="grow">
              <b>{savedAsTemplate ? 'Сохранено в шаблоны' : 'Сохранить как шаблон'}</b>
              <small>Чтобы загрузить этот список в другой объект</small>
            </div>
          </button>
        )}
        <button
          className="item danger"
          onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true)
            if (isList) await deleteList(record.id)
            else await deleteTemplate(record.id)
            onClose()
          }}
        >
          <Icon name="trash" />
          <div className="grow">
            <b>{confirmDelete ? 'Нажмите ещё раз, чтобы удалить' : isList ? 'Удалить список' : 'Удалить шаблон'}</b>
            {isList && <small>Вместе со всеми отметками этого списка на планах</small>}
          </div>
        </button>
      </div>

      {deleting && isList && (
        <DeleteItemDialog list={record as List} item={deleting} count={counts?.get(deleting.id) ?? 0} onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}

/** Название позиции: правится прямо в строке, сохраняется по Enter или когда поле теряет фокус. */
function ItemName({ item, onSave }: { item: ListItem; onSave: (name: string) => void }) {
  const [value, setValue] = useState(item.name)
  return (
    <input
      className="field list-item-name"
      value={value}
      maxLength={200}
      aria-label={`Позиция ${item.name}`}
      onChange={e => setValue(e.target.value)}
      onBlur={() => value.trim() && value.trim() !== item.name ? onSave(value.trim()) : setValue(item.name)}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Удаление позиции, по которой стоят отметки (Р-55): удалить их или перенести в другую позицию. */
function DeleteItemDialog({ list, item, count, onClose }: { list: List; item: ListItem; count: number; onClose: () => void }) {
  const others = list.items.filter(i => i.id !== item.id)
  const run = async (moveTo: string | null) => {
    await deleteItem(list, item.id, moveTo)
    onClose()
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-label="Удаление позиции">
        <div className="grip" />
        <b style={{ fontWeight: 500, fontSize: 18 }}>Удалить позицию «{item.name}»</b>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          На планах есть отметки этой позиции: {plural(count, 'отметка', 'отметки', 'отметок')}. Что с ними сделать?
        </p>
        {others.length > 0 && (
          <>
            <div className="list-label">Перенести отметки в позицию</div>
            <div className="list">
              {others.map(o => (
                <button key={o.id} className="item" onClick={() => run(o.id)}>
                  <i className="type-dot" style={{ background: o.color, width: 14, height: 14, margin: 5 }} />
                  <div className="grow">
                    <b>{o.name}</b>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="list" style={{ marginTop: 16 }}>
          <button className="item danger" onClick={() => run(null)}>
            <Icon name="trash" />
            <div className="grow">
              <b>Удалить позицию и {plural(count, 'отметку', 'отметки', 'отметок')}</b>
            </div>
          </button>
        </div>
        <button className="btn btn-outline" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
          Отмена
        </button>
      </div>
    </>
  )
}
