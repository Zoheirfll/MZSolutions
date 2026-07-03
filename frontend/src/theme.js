export const theme = {
  primary: {
    50:  '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },

  btn: {
    primary:
      'inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 ' +
      'text-white font-medium rounded-lg transition-colors duration-150 ' +
      'disabled:opacity-40 disabled:pointer-events-none cursor-pointer px-3.5 py-2 text-sm ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    outline:
      'inline-flex items-center justify-center gap-2 border border-white/12 text-gray-300 hover:bg-white/5 hover:border-white/20 ' +
      'active:bg-white/8 rounded-lg transition-colors duration-150 cursor-pointer px-3.5 py-2 text-sm font-medium ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
    ghost:
      'inline-flex items-center justify-center gap-2 text-gray-400 hover:text-gray-200 hover:bg-white/5 active:bg-white/8 ' +
      'rounded-lg transition-colors duration-150 cursor-pointer px-3 py-1.5 text-sm font-medium ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
    danger:
      'inline-flex items-center justify-center gap-2 bg-red-600/90 hover:bg-red-500 active:bg-red-700 text-white ' +
      'font-medium rounded-lg transition-colors duration-150 disabled:opacity-40 ' +
      'disabled:pointer-events-none cursor-pointer px-3.5 py-2 text-sm ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2',
    icon:
      'inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-200 ' +
      'hover:bg-white/8 transition-colors duration-150 cursor-pointer ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
    secondary:
      'inline-flex items-center justify-center gap-2 bg-white/6 hover:bg-white/10 border border-white/10 ' +
      'text-gray-200 font-medium rounded-lg transition-colors duration-150 cursor-pointer px-3.5 py-2 text-sm ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
  },

  input:
    'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none ' +
    'placeholder:text-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 ' +
    'transition-all duration-150 bg-white disabled:bg-gray-50 disabled:text-gray-400',

  inputDark:
    'w-full px-3.5 py-2.5 rounded-lg text-sm text-gray-200 outline-none bg-white/4 border border-white/10 ' +
    'placeholder:text-gray-600 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/15 ' +
    'transition-all duration-150',

  label: 'block text-sm font-medium text-gray-700 mb-1.5',
  labelDark: 'block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5',
  helper: 'mt-1.5 text-xs text-gray-500',
  errorText: 'mt-1.5 text-xs text-red-500 flex items-center gap-1',

  card: 'bg-white rounded-xl border border-gray-200/80 shadow-sm shadow-gray-900/5',
  cardHover: 'transition-colors duration-150 hover:border-gray-300',
  panel: 'bg-white rounded-xl border border-gray-200/80 shadow-sm shadow-gray-900/5 p-5 sm:p-6',

  table: {
    wrap: 'overflow-x-auto rounded-xl border border-gray-200/80 bg-white shadow-sm shadow-gray-900/5',
    head: 'bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200',
    row: 'border-b border-gray-100 last:border-0 hover:bg-violet-50/40 transition-colors duration-150',
    cell: 'px-4 py-3.5 text-sm text-gray-700 align-middle',
  },

  badge: {
    success: 'inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20 px-2.5 py-1 rounded-md text-xs font-medium',
    danger:  'inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20 px-2.5 py-1 rounded-md text-xs font-medium',
    warning: 'inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20 px-2.5 py-1 rounded-md text-xs font-medium',
    info:    'inline-flex items-center gap-1.5 bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/20 px-2.5 py-1 rounded-md text-xs font-medium',
    neutral: 'inline-flex items-center gap-1.5 bg-white/6 text-gray-400 ring-1 ring-inset ring-white/10 px-2.5 py-1 rounded-md text-xs font-medium',
    cyan:    'inline-flex items-center gap-1.5 bg-cyan-500/10 text-cyan-400 ring-1 ring-inset ring-cyan-500/20 px-2.5 py-1 rounded-md text-xs font-medium',
  },

  skeleton: 'animate-pulse bg-white/6 rounded-lg',
  emptyState: 'flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500',

  logo: 'text-violet-400',
  hero: 'bg-gradient-to-br from-[#2e1065] via-[#6d28d9] to-[#7c3aed]',

  // Per-KPI accent colors for stat cards — gives each metric a distinct
  // identity instead of everything defaulting to violet.
  stat: {
    blue:   { hex: '#3b82f6', text: 'text-blue-400',   bg: 'bg-blue-500/10',   ring: 'ring-blue-500/20' },
    green:  { hex: '#22c55e', text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
    orange: { hex: '#f59e0b', text: 'text-amber-400',  bg: 'bg-amber-500/10',  ring: 'ring-amber-500/20' },
    red:    { hex: '#ef4444', text: 'text-red-400',    bg: 'bg-red-500/10',    ring: 'ring-red-500/20' },
    violet: { hex: '#8b5cf6', text: 'text-violet-400',  bg: 'bg-violet-500/10',  ring: 'ring-violet-500/20' },
    cyan:   { hex: '#06b6d4', text: 'text-cyan-400',   bg: 'bg-cyan-500/10',   ring: 'ring-cyan-500/20' },
  },

  // Elevation hierarchy — normal cards vs hover vs modals.
  shadow: {
    sm: 'shadow-sm shadow-black/20',
    md: 'shadow-md shadow-black/30',
    lg: 'shadow-xl shadow-black/40',
  },

  // Simple entry transitions (no extra plugin needed).
  fadeIn: 'animate-[fadeIn_0.25s_ease-out]',

  // Premium dark ("Linear/Vercel"): near-black surfaces, neutral hairline
  // borders (no purple tint), accent reserved for interactive elements only.
  dark: {
    app:        '#08090a',
    sidebar:    '#0a0b0c',
    card:       '#0d0e10',
    cardAlt:    '#131417',
    border:     '#1f2023',
    borderHover:'#2a2b2f',
    muted:      '#6b6d73',
    mutedLight: '#9a9ca3',
  },
}
