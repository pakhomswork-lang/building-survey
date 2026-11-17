import type { Photo } from '../db'
import { isEmpty, optionCounts, toggle, type FilterDef, type Selection } from './filters'

/** Строки отборов: в каждой группе можно включить несколько значений. */
export function PcFilterBar({
  photos,
  defs,
  selection,
  onChange,
}: {
  photos: Photo[]
  defs: FilterDef[]
  selection: Selection
  onChange: (sel: Selection) => void
}) {
  const keys = defs.map(d => d.key)
  return (
    <div className="pc-filterbar">
      {defs.map(def => {
        const counts = optionCounts(photos, defs, selection, def)
        const chosen = selection[def.key] ?? []
        return (
          <div key={def.key} className="pc-filter-row">
            <span className="pc-filter-label">{def.label}</span>
            <button
              className={'chip' + (chosen.length === 0 ? ' on' : '')}
              onClick={() => onChange({ ...selection, [def.key]: [] })}
            >
              Все
            </button>
            {def.options.map(o => {
              const n = counts.get(o.value) ?? 0
              const on = chosen.includes(o.value)
              return (
                <button
                  key={o.value}
                  title={o.title}
                  className={'chip' + (on ? ' on' : '') + (!n && !on ? ' empty' : '')}
                  onClick={() => onChange(toggle(selection, def.key, o.value))}
                >
                  {o.color && <i className="type-dot" style={{ background: o.color }} />}
                  {o.label}
                  <em>{n}</em>
                </button>
              )
            })}
          </div>
        )
      })}
      {!isEmpty(selection, keys) && (
        <button className="pc-btn pc-reset" onClick={() => onChange({})}>
          Сбросить отборы
        </button>
      )}
    </div>
  )
}
