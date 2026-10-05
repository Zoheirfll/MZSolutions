import { useTranslation } from 'react-i18next'
import { theme } from '../../theme'

// Quotas IA par fonctionnalité : une ligne par fonctionnalité, limite quotidienne et hebdomadaire
// (0 = illimité). `rows` = [{key, label, daily, weekly}] fourni par l'API (catalogue dynamique).
export default function AiQuotaGrid({ rows = [], onChange, disabled = false }) {
  const { t } = useTranslation()
  const set = (key, field, value) => onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value === '' ? 0 : Number(value) } : r)))
  if (!rows.length) return null
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 text-xs text-app-muted">
        <span>{t('Fonctionnalité IA')}</span><span>{t('Par jour')}</span><span>{t('Par semaine')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center">
          <span className="text-sm text-app-primary">{t(r.label)}</span>
          <input type="number" min={0} aria-label={`${t(r.label)} — ${t('Par jour')}`} value={r.daily} disabled={disabled}
            onChange={(e) => set(r.key, 'daily', e.target.value)} className={`${theme.inputDark} w-full`} />
          <input type="number" min={0} aria-label={`${t(r.label)} — ${t('Par semaine')}`} value={r.weekly} disabled={disabled}
            onChange={(e) => set(r.key, 'weekly', e.target.value)} className={`${theme.inputDark} w-full`} />
        </div>
      ))}
      <p className="text-xs text-app-muted">{t('0 = illimité. Limites pour la boutique entière, tous comptes confondus.')}</p>
    </div>
  )
}
