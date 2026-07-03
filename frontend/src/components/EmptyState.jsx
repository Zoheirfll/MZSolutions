import { theme } from '../theme'

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className={theme.emptyState}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl mb-4 flex items-center justify-center"
          style={{ background: '#7c3aed18', border: '1px solid #7c3aed30' }}>
          <Icon className="w-6 h-6 text-violet-400" strokeWidth={1.5} />
        </div>
      )}
      {title && <p className="text-gray-300 text-sm font-medium">{title}</p>}
      {description && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
