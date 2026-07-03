import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import api from '../../api/axios'
import { useAuth } from '../../context/AuthContext'
import { TEMPLATES, FONTS, buildCssVars } from '../../storefront-themes'
import { theme } from '../../theme'

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ThemePreview({ template, primaryOverride, secondaryOverride, font, storeName }) {
  const vars = buildCssVars(template, primaryOverride, secondaryOverride)
  const tpl = TEMPLATES[template] ?? TEMPLATES.violet
  const primary    = (primaryOverride  && /^#[0-9a-fA-F]{6}$/.test(primaryOverride))  ? primaryOverride  : vars['--sf-primary']
  const heroFrom   = vars['--sf-hero-from']
  const heroVia    = vars['--sf-hero-via']
  const heroTo     = vars['--sf-hero-to']
  const headerBg   = vars['--sf-header-bg']
  const headerText = vars['--sf-header-text']
  const bodyBg     = vars['--sf-body-bg']
  const cardBg     = vars['--sf-card-bg']
  const textColor  = vars['--sf-text']
  const mutedColor = vars['--sf-text-muted']

  return (
    <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: theme.dark.border, fontFamily: FONTS[font]?.css }}>
      {/* Header mockup */}
      <div className="flex items-center gap-2 px-3 py-2 border-b text-[10px] font-semibold"
        style={{ background: headerBg, borderColor: vars['--sf-header-border'], color: headerText }}>
        <div className="w-5 h-5 rounded-md flex items-center justify-center text-white font-bold text-[8px]"
          style={{ background: `linear-gradient(135deg, ${heroFrom}, ${primary})` }}>
          {(storeName || 'M')[0]}
        </div>
        <span className="flex-1 truncate">{storeName || 'Ma Boutique'}</span>
        <div className="flex gap-2" style={{ color: mutedColor }}>
          <span>Accueil</span><span>Produits</span>
          <span className="font-bold" style={{ color: primary }}>Panier</span>
        </div>
      </div>

      {/* Hero mockup */}
      <div className="py-5 px-4 text-center"
        style={{ background: `linear-gradient(135deg, ${heroFrom}, ${heroVia}, ${heroTo})` }}>
        <p className="text-white font-bold text-sm mb-1">{storeName || 'Ma Boutique'}</p>
        <p className="text-white/60 text-[10px] mb-3">Bienvenue dans notre boutique</p>
        <span className="inline-block bg-white text-[10px] font-bold px-3 py-1 rounded-lg"
          style={{ color: primary }}>
          Voir les produits
        </span>
      </div>

      {/* Products grid mockup */}
      <div className="p-3 grid grid-cols-3 gap-2" style={{ background: bodyBg }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden border" style={{ background: cardBg, borderColor: `color-mix(in srgb, ${primary} 20%, transparent)` }}>
            <div className="aspect-square" style={{ background: vars['--sf-primary-light'] }} />
            <div className="p-1.5">
              <div className="h-1.5 rounded-full mb-1 w-4/5" style={{ background: `${textColor}20` }} />
              <div className="h-1.5 rounded-full w-2/5 font-bold" style={{ background: primary }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ThemePage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({
    theme_template: 'violet',
    theme_primary:  '',
    theme_secondary: '',
    theme_font:     'inter',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const storeSlug = user?.store_slug

  useEffect(() => {
    api.get('/stores/me/settings/').then(({ data }) => {
      setSettings(data)
      setForm({
        theme_template:  data.theme_template  || 'violet',
        theme_primary:   data.theme_primary   || '',
        theme_secondary: data.theme_secondary || '',
        theme_font:      data.theme_font      || 'inter',
      })
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/stores/me/settings/', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const sectionLabel = (label) => (
    <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: theme.dark.mutedLight }}>{label}</p>
  )

  return (
    <DashboardLayout title="Thème & Apparence">
      <div className="flex flex-col xl:flex-row gap-6 items-start">

        {/* ── Éditeur ── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Templates */}
          <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {sectionLabel('Template')}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(TEMPLATES).map(([key, tpl]) => {
                const active = form.theme_template === key
                return (
                  <button key={key} onClick={() => setForm(f => ({ ...f, theme_template: key, theme_primary: '', theme_secondary: '' }))}
                    className="relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-200 text-left focus:outline-none"
                    style={{ borderColor: active ? '#7c3aed' : theme.dark.border }}>
                    {/* Mini hero swatch */}
                    <div className="h-14"
                      style={{ background: `linear-gradient(135deg, ${tpl.preview.hero.match(/#[0-9a-fA-F]{6}/g)?.[0] || '#000'}, ${tpl.preview.primary})` }} />
                    {/* Header swatch */}
                    <div className="px-3 py-2 flex items-center gap-1.5"
                      style={{ background: tpl.preview.header }}>
                      <div className="w-3 h-3 rounded-sm" style={{ background: tpl.preview.primary }} />
                      <span className="text-[11px] font-semibold text-gray-700">{tpl.label}</span>
                    </div>
                    {active && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm bg-violet-600">
                        <CheckIcon />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Couleurs */}
          <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {sectionLabel('Couleurs (personnalisation)')}
            <p className="text-xs mb-4" style={{ color: theme.dark.muted }}>Laissez vide pour utiliser les couleurs par défaut du template.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={theme.labelDark}>Couleur primaire</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.theme_primary || TEMPLATES[form.theme_template]?.vars['--sf-primary'] || '#7c3aed'}
                    onChange={e => setForm(f => ({ ...f, theme_primary: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0.5 bg-transparent" />
                  <input type="text" value={form.theme_primary}
                    onChange={e => setForm(f => ({ ...f, theme_primary: e.target.value }))}
                    placeholder={TEMPLATES[form.theme_template]?.vars['--sf-primary'] || '#7c3aed'}
                    className={`${theme.inputDark} font-mono text-sm flex-1`} maxLength={7} />
                  {form.theme_primary && (
                    <button onClick={() => setForm(f => ({ ...f, theme_primary: '' }))}
                      className="text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors"
                      style={{ color: theme.dark.mutedLight, background: theme.dark.app }}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className={theme.labelDark}>Couleur secondaire (hero)</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.theme_secondary || TEMPLATES[form.theme_template]?.vars['--sf-hero-via'] || '#4c1d95'}
                    onChange={e => setForm(f => ({ ...f, theme_secondary: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0.5 bg-transparent" />
                  <input type="text" value={form.theme_secondary}
                    onChange={e => setForm(f => ({ ...f, theme_secondary: e.target.value }))}
                    placeholder={TEMPLATES[form.theme_template]?.vars['--sf-hero-via'] || '#4c1d95'}
                    className={`${theme.inputDark} font-mono text-sm flex-1`} maxLength={7} />
                  {form.theme_secondary && (
                    <button onClick={() => setForm(f => ({ ...f, theme_secondary: '' }))}
                      className="text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors"
                      style={{ color: theme.dark.mutedLight, background: theme.dark.app }}>
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Police */}
          <div className="rounded-2xl p-5 border" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            {sectionLabel('Police')}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(FONTS).map(([key, f]) => (
                <button key={key} onClick={() => setForm(form => ({ ...form, theme_font: key }))}
                  className="relative px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-200 text-left"
                  style={{ borderColor: form.theme_font === key ? '#7c3aed' : theme.dark.border, background: form.theme_font === key ? 'rgba(124,58,237,0.08)' : theme.dark.app }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--sf-primary, #7c3aed)', fontFamily: f.css }}>{f.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: theme.dark.muted, fontFamily: f.css }}>Aa Bb Cc 123</p>
                  {form.theme_font === key && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-white bg-violet-600">
                      <CheckIcon />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className={`${theme.btn.primary} min-w-36`}>
              {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
            {storeSlug && (
              <a href={`/store/${storeSlug}`} target="_blank" rel="noreferrer"
                className="text-sm font-medium transition-colors"
                style={{ color: theme.dark.mutedLight }}
                onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
                onMouseLeave={e => e.currentTarget.style.color = theme.dark.mutedLight}>
                Voir ma boutique →
              </a>
            )}
          </div>
        </div>

        {/* ── Aperçu ── */}
        <div className="w-full xl:w-80 shrink-0 xl:sticky xl:top-24">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: theme.dark.mutedLight }}>Aperçu en direct</p>
          {settings !== null && (
            <ThemePreview
              template={form.theme_template}
              primaryOverride={form.theme_primary}
              secondaryOverride={form.theme_secondary}
              font={form.theme_font}
              storeName={user?.store_name}
            />
          )}
          <p className="text-xs mt-3 text-center" style={{ color: theme.dark.muted }}>
            L'aperçu reflète les changements en temps réel.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}
