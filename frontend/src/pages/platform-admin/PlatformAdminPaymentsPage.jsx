import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import Select from '../../components/Select'
import Toast from '../../components/Toast'
import StatCard from '../../components/StatCard'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import AdminList from '../../components/admin/AdminList'
import AdminConfirmModal from '../../components/admin/AdminConfirmModal'

const PER_PAGE = 20
const MIN_REASON = 5
const money = (v) => `${Number(v || 0).toLocaleString('fr-DZ')} DA`
const date = (v) => (v ? new Date(v).toLocaleDateString('fr-DZ') : '—')
const STATUS_BADGE = { success: theme.badge.success, pending: theme.badge.warning, failed: theme.badge.danger, refunded: theme.badge.neutral }
const STATUS_LABEL = { success: 'Payé', pending: 'En attente', failed: 'Échoué', refunded: 'Remboursé' }

// Historique des paiements d'abonnement SofizPay. Filtres dans l'URL. Le
// remboursement est ENREGISTRÉ ici — le virement de retour se fait chez SofizPay.
export default function PlatformAdminPaymentsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isSuper = user?.platform_level === 'superadmin'
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const search = params.get('search') || ''
  const dateFrom = params.get('date_from') || ''
  const dateTo = params.get('date_to') || ''
  const page = Number(params.get('page') || 1)

  const [data, setData] = useState({ results: [], count: 0, summary: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [term, setTerm] = useState(search)
  const [refund, setRefund] = useState(null)
  const [reason, setReason] = useState('')
  const [revoke, setRevoke] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const update = useCallback((patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k) })
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (term === search) return undefined
    const id = setTimeout(() => update({ search: term, page: '' }), 300)
    return () => clearTimeout(id)
  }, [term, search, update])

  const query = { status: status || undefined, search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined }

  const load = useCallback(() => {
    return api.get('/platform-admin/payments/', { params: { ...query, page, per_page: PER_PAGE } })
      .then(({ data: d }) => { setData(d); setError('') })
      .catch(() => setError(t('Impossible de charger les paiements.')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, dateFrom, dateTo, page, t])

  useEffect(() => { load() }, [load])

  const exportCsv = async () => {
    try {
      const { data: blob } = await api.get('/platform-admin/payments/export/', { params: query, responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'paiements.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast({ type: 'error', message: t('Export impossible.') })
    }
  }

  const closeRefund = () => { setRefund(null); setReason(''); setRevoke(false) }
  const doRefund = async () => {
    setBusy(true)
    try {
      await api.post(`/platform-admin/payments/${refund.id}/refund/`, { reason: reason.trim(), revoke_access: revoke })
      setToast({ type: 'success', message: t('Remboursement enregistré.') })
      closeRefund()
      await load()
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || t('Action impossible.') })
    } finally {
      setBusy(false)
    }
  }

  const statusOptions = [{ value: '', label: t('Tous les statuts') }, ...Object.keys(STATUS_LABEL).map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))]
  const columns = [
    { key: 'created_at', label: t('Date'), render: (r) => date(r.created_at) },
    { key: 'store', label: t('Boutique'), render: (r) => (<div><p className="font-medium">{r.store_name}</p><p className="text-xs text-app-muted">{r.owner_email}</p></div>) },
    { key: 'plan', label: t('Palier'), render: (r) => `${r.plan} (${r.billing_cycle === 'yearly' ? t('annuel') : t('mensuel')})` },
    { key: 'amount', label: t('Montant'), render: (r) => money(r.amount) },
    { key: 'status', label: t('Statut'), render: (r) => (
      <div>
        <span className={STATUS_BADGE[r.status] || theme.badge.neutral}>{t(STATUS_LABEL[r.status] || r.status)}</span>
        {r.status === 'refunded' && r.refund_reason && <p className="text-xs text-app-muted mt-1">{r.refund_reason}</p>}
      </div>
    ) },
  ]

  const summary = data.summary
  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <AdminPageHeader pageKey="payments" title={t('Paiements')} subtitle={t('Abonnements encaissés via SofizPay')}
        actions={isSuper && <button onClick={exportCsv} className={theme.btn.outline}>{t('Exporter en CSV')}</button>}
        help={t('Historique des paiements d\'abonnement. Un remboursement est seulement enregistré ici (motif obligatoire) : le virement de retour se fait chez SofizPay. Les paiements remboursés sortent des revenus de la vue d\'ensemble.')} />

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard label={t('Encaissé')} value={money(summary.collected)} color="green" />
          <StatCard label={t('Remboursé')} value={money(summary.refunded)} color="orange" />
          <StatCard label={t('Paiements confirmés')} value={summary.success_count} color="violet" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Boutique, email ou transaction…')} className={`${theme.inputDark} w-full sm:w-72`} />
        <Select value={status} onChange={(v) => update({ status: v, page: '' })} options={statusOptions} className={`${theme.inputDark} w-44`} />
        <input type="date" aria-label={t('Du')} value={dateFrom} onChange={(e) => update({ date_from: e.target.value, page: '' })} className={`${theme.inputDark} w-40`} />
        <input type="date" aria-label={t('Au')} value={dateTo} onChange={(e) => update({ date_to: e.target.value, page: '' })} className={`${theme.inputDark} w-40`} />
      </div>

      <AdminList columns={columns} rows={data.results} total={data.count} page={page} perPage={PER_PAGE}
        onPage={(p) => update({ page: p > 1 ? String(p) : '' })} loading={loading} error={error} onRetry={load}
        rowActions={isSuper ? (r) => (r.status === 'success' ? (
          <button onClick={() => setRefund(r)} className="text-red-400 hover:text-red-300 text-xs font-medium">{t('Rembourser')}</button>
        ) : null) : undefined} />

      <AdminConfirmModal open={!!refund} title={t('Enregistrer un remboursement')} danger confirmLabel={t('Enregistrer')} busy={busy}
        confirmDisabled={reason.trim().length < MIN_REASON} onConfirm={doRefund} onCancel={closeRefund}
        message={refund ? t('Paiement de {{amount}} — {{store}}. Le virement de retour se fait chez SofizPay.', { amount: money(refund.amount), store: refund.store_name }) : ''}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300}
          placeholder={t('Motif du remboursement (obligatoire)')} className={`${theme.inputDark} w-full mb-3`} />
        <label className="flex items-center gap-2 text-sm text-app-muted-light">
          <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="accent-violet-600" />
          {t('Retirer aussi le palier accordé par ce paiement')}
        </label>
      </AdminConfirmModal>
    </div>
  )
}
