import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'

const storageKey = (k) => `admin_aide_${k}`
function readOpen(k) { try { return localStorage.getItem(storageKey(k)) === '1' } catch { return false } }
function writeOpen(k, v) { try { localStorage.setItem(storageKey(k), v ? '1' : '0') } catch { /* stockage indisponible */ } }

// En-tête commun des pages admin : titre, sous-titre, actions et bouton « Aide »
// repliable (replié par défaut, état mémorisé par page).
export default function AdminPageHeader({ pageKey, title, subtitle, help, actions }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => readOpen(pageKey))
  const toggle = () => setOpen((o) => { writeOpen(pageKey, !o); return !o })

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-primary">{title}</h1>
          {subtitle && <p className="text-sm text-app-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {help && (
            <button onClick={toggle} aria-expanded={open} className={theme.btn.ghost}>
              {t('Aide')}
            </button>
          )}
        </div>
      </div>
      {help && open && (
        <div className="mt-3 rounded-xl border p-4 text-sm text-app-muted-light"
          style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
          {help}
        </div>
      )}
    </div>
  )
}
