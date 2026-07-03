export const TEMPLATES = {
  violet: {
    label: 'Violet',
    preview: { hero: 'linear-gradient(135deg, #1a0533, #4c1d95, #7c3aed)', primary: '#7c3aed', header: '#ffffff' },
    vars: {
      '--sf-primary':       '#7c3aed',
      '--sf-primary-dark':  '#6d28d9',
      '--sf-primary-light': '#ede9fe',
      '--sf-hero-from':     '#1a0533',
      '--sf-hero-via':      '#4c1d95',
      '--sf-hero-to':       '#7c3aed',
      '--sf-header-bg':     '#ffffff',
      '--sf-header-border': '#f3f4f6',
      '--sf-header-text':   '#111827',
      '--sf-header-hover':  '#7c3aed',
      '--sf-body-bg':       '#f9fafb',
      '--sf-card-bg':       '#ffffff',
      '--sf-text':          '#111827',
      '--sf-text-muted':    '#6b7280',
      '--sf-footer-bg':     '#ffffff',
      '--sf-footer-border': '#e5e7eb',
    },
  },
  midnight: {
    label: 'Midnight',
    preview: { hero: 'linear-gradient(135deg, #0f172a, #1e293b, #334155)', primary: '#f59e0b', header: '#0f172a' },
    vars: {
      '--sf-primary':       '#f59e0b',
      '--sf-primary-dark':  '#d97706',
      '--sf-primary-light': '#fef3c7',
      '--sf-hero-from':     '#0f172a',
      '--sf-hero-via':      '#1e293b',
      '--sf-hero-to':       '#334155',
      '--sf-header-bg':     '#0f172a',
      '--sf-header-border': '#1e293b',
      '--sf-header-text':   '#f8fafc',
      '--sf-header-hover':  '#f59e0b',
      '--sf-body-bg':       '#1e293b',
      '--sf-card-bg':       '#0f172a',
      '--sf-text':          '#f8fafc',
      '--sf-text-muted':    '#94a3b8',
      '--sf-footer-bg':     '#0f172a',
      '--sf-footer-border': '#1e293b',
    },
  },
  sahara: {
    label: 'Sahara',
    preview: { hero: 'linear-gradient(135deg, #431407, #9a3412, #c2410c)', primary: '#c2410c', header: '#fef7f0' },
    vars: {
      '--sf-primary':       '#c2410c',
      '--sf-primary-dark':  '#9a3412',
      '--sf-primary-light': '#ffedd5',
      '--sf-hero-from':     '#431407',
      '--sf-hero-via':      '#9a3412',
      '--sf-hero-to':       '#c2410c',
      '--sf-header-bg':     '#fef7f0',
      '--sf-header-border': '#fed7aa',
      '--sf-header-text':   '#1c0a00',
      '--sf-header-hover':  '#c2410c',
      '--sf-body-bg':       '#fef9f5',
      '--sf-card-bg':       '#ffffff',
      '--sf-text':          '#1c0a00',
      '--sf-text-muted':    '#78350f',
      '--sf-footer-bg':     '#fef7f0',
      '--sf-footer-border': '#fed7aa',
    },
  },
}

export const FONTS = {
  inter:   { label: 'Inter (défaut)',  url: null, css: 'Inter, sans-serif' },
  poppins: { label: 'Poppins',         url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap', css: "'Poppins', sans-serif" },
  cairo:   { label: 'Cairo (عربي)',    url: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap',   css: "'Cairo', sans-serif" },
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function darken(hex, amount = 0.15) {
  const { r, g, b } = hexToRgb(hex)
  return `#${[r, g, b].map(c => Math.max(0, Math.round(c * (1 - amount))).toString(16).padStart(2, '0')).join('')}`
}

function lighten(hex, amount = 0.9) {
  const { r, g, b } = hexToRgb(hex)
  return `#${[r, g, b].map(c => Math.min(255, Math.round(c + (255 - c) * amount)).toString(16).padStart(2, '0')).join('')}`
}

export function buildCssVars(template, primaryOverride, secondaryOverride) {
  const base = TEMPLATES[template] ?? TEMPLATES.violet
  const vars = { ...base.vars }
  if (primaryOverride && /^#[0-9a-fA-F]{6}$/.test(primaryOverride)) {
    vars['--sf-primary']       = primaryOverride
    vars['--sf-primary-dark']  = darken(primaryOverride)
    vars['--sf-primary-light'] = lighten(primaryOverride)
  }
  if (secondaryOverride && /^#[0-9a-fA-F]{6}$/.test(secondaryOverride)) {
    vars['--sf-hero-via'] = secondaryOverride
  }
  return vars
}

export function injectTheme(template, primaryOverride, secondaryOverride, font) {
  const vars = buildCssVars(template, primaryOverride, secondaryOverride)
  const css  = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
  const fontDef = FONTS[font] ?? FONTS.inter
  const fontCss = fontDef.css ? `--sf-font-family:${fontDef.css};` : ''

  let style = document.getElementById('sf-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'sf-theme'
    document.head.appendChild(style)
  }
  style.textContent = `:root{${css};${fontCss}}`

  // Load Google Font if needed
  const linkId = 'sf-font-link'
  let link = document.getElementById(linkId)
  if (fontDef.url) {
    if (!link) { link = document.createElement('link'); link.id = linkId; link.rel = 'stylesheet'; document.head.appendChild(link) }
    link.href = fontDef.url
  } else if (link) {
    link.remove()
  }
}

export function cleanupTheme() {
  document.getElementById('sf-theme')?.remove()
  document.getElementById('sf-font-link')?.remove()
}
