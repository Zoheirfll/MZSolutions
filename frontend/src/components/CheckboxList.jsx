import { theme } from '../theme'

export default function CheckboxList({ items, selected, onToggle, emptyLabel }) {
  if (items.length === 0) {
    return <p className="text-xs text-app-muted py-2">{emptyLabel}</p>
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border divide-y" style={{ borderColor: theme.dark.border }}>
      {items.map(item => (
        <label key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-app-primary cursor-pointer hover:bg-white/5 transition" style={{ borderColor: theme.dark.border }}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} className="w-4 h-4 accent-violet-600 cursor-pointer shrink-0" />
          {item.name}
        </label>
      ))}
    </div>
  )
}
