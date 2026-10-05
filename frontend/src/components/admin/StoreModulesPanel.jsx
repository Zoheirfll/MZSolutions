import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import Toast from '../Toast'

const MODULES = [
  { key: 'ai', label: 'Assistant IA' },
  { key: 'webhooks', label: 'Webhooks sortants' },
  { key: 'channels', label: 'Canaux de vente' },
]

// Modules d'UNE boutique (superadmin) : coupe ou rétablit une fonction pour cette boutique
// seulement. La coupure globale se règle dans « Réglages ».
export default function StoreModulesPanel({ storeId, disabled = [], onChanged }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const toggle = async (key) => {
    const next = disabled.includes(key) ? disabled.filter((k) => k !== key) : [...disabled, key]
    setBusy(true)
    try {
      await api.put(`/platform-admin/accounts/${storeId}/features/`, { disabled: next })
      setToast({ type: 'success', message: t('Modules mis à jour.') })
      await onChanged?.()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border p-5 mt-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <h2 className="text-sm font-semibold text-app-primary mb-3">{t('Modules de la boutique')}</h2>
      <div className="space-y-2">
        {MODULES.map((m) => {
          const off = disabled.includes(m.key)
          return (
            <label key={m.key} className="flex items-center justify-between gap-3 text-sm text-app-primary">
              <span>{t(m.label)} <span className={off ? 'text-red-400' : 'text-emerald-400'}>— {off ? t('désactivé') : t('actif')}</span></span>
              <input type="checkbox" aria-label={t(m.label)} checked={!off} disabled={busy} onChange={() => toggle(m.key)} className="accent-violet-600" />
            </label>
          )
        })}
      </div>
    </div>
  )
}
