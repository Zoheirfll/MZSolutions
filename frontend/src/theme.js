export const theme = {
  // Couleurs primaires — mauve/violet
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

  // Classes Tailwind prêtes à l'emploi
  btn: {
    primary:
      'bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-semibold rounded-lg transition disabled:opacity-60 cursor-pointer',
    outline:
      'border border-violet-300 text-violet-700 hover:bg-violet-50 rounded-lg transition cursor-pointer',
    ghost:
      'text-violet-600 hover:bg-violet-50 rounded-lg transition cursor-pointer',
  },

  input:
    'w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none ' +
    'focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition bg-white',

  badge: {
    success: 'bg-emerald-100 text-emerald-700',
    danger:  'bg-red-100 text-red-600',
    info:    'bg-violet-100 text-violet-700',
  },

  logo: 'text-violet-600',

  // Gradient hero
  hero: 'bg-gradient-to-br from-[#2e1065] via-[#6d28d9] to-[#7c3aed]',
}
