import { theme } from '../theme'

export default function StatCard({ label, sub, value, trend, color = 'violet', icon: Icon }) {
  const c = theme.stat[color] || theme.stat.violet
  return (
    <div className={`relative rounded-2xl p-5 border overflow-hidden group transition-all duration-300 hover:-translate-y-0.5 cursor-default shadow-sm shadow-black/20 hover:shadow-md hover:shadow-black/30 ${theme.fadeIn}`}
      style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 20% 50%, ${c.hex}22, transparent 70%)` }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl opacity-70" style={{ background: c.hex }} />

      <div className="relative flex items-start justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: theme.dark.mutedLight }}>{label}</p>
        {Icon && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${c.bg}`}>
            <Icon className={`w-4 h-4 ${c.text}`} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="relative flex items-end justify-between">
        <span className={`text-4xl font-bold tracking-tight ${c.text}`}>{value ?? 0}</span>
        {sub && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mb-1 ${c.bg} ${c.text}`}>
            {sub}
          </span>
        )}
      </div>
      {trend != null && (
        <div className="relative mt-4 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full" style={{ background: theme.dark.border }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, trend)}%`, background: c.hex }} />
          </div>
          <span className="text-[10px]" style={{ color: theme.dark.muted }}>↗ {trend}%</span>
        </div>
      )}
    </div>
  )
}
