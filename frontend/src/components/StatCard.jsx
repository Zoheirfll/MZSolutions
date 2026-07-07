import { theme } from '../theme'

function RingProgress({ pct, color, hex }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const r = 26
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - clamped / 100)
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke={theme.dark.border} strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={hex} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-700 ease-out" />
      <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
        className={`rotate-90 origin-center text-[13px] font-bold ${color}`}
        style={{ fill: 'currentColor', transformOrigin: '32px 32px' }}>
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

export default function StatCard({ label, sub, value, trend, ring, color = 'violet', icon: Icon }) {
  const c = theme.stat[color] || theme.stat.violet
  return (
    <div className={`relative rounded-2xl p-5 border overflow-hidden group transition-all duration-300 hover:-translate-y-0.5 cursor-default shadow-sm shadow-black/20 hover:shadow-md hover:shadow-black/30 ${theme.fadeIn}`}
      style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 20% 50%, ${c.hex}22, transparent 70%)` }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl opacity-70" style={{ background: c.hex }} />

      <div className="relative flex items-start justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: theme.dark.mutedLight }}>{label}</p>
        {Icon && !ring && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${c.bg}`}>
            <Icon className={`w-4 h-4 ${c.text}`} strokeWidth={2} />
          </span>
        )}
      </div>

      {ring != null ? (
        <div className="relative flex items-center gap-4">
          <RingProgress pct={ring} color={c.text} hex={c.hex} />
          <div>
            <span className={`text-3xl font-bold tracking-tight ${c.text}`}>{value ?? 0}</span>
            {sub && <p className="text-[10px] mt-1" style={{ color: theme.dark.muted }}>{sub}</p>}
          </div>
        </div>
      ) : (
        <div className="relative flex items-end justify-between">
          <span className={`text-4xl font-bold tracking-tight ${c.text}`}>{value ?? 0}</span>
          {sub && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mb-1 ${c.bg} ${c.text}`}>
              {sub}
            </span>
          )}
        </div>
      )}

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
