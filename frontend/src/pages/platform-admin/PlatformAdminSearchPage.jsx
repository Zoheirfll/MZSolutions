import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { theme } from '../../theme'
import AdminPageHeader from '../../components/admin/AdminPageHeader'
import { AdminError } from '../../components/admin/AdminState'

const MIN_QUERY = 3
const money = (v) => `${Number(v || 0).toLocaleString('fr-DZ')} DA`
const dateTime = (v) => (v ? new Date(v).toLocaleString('fr-DZ') : '—')

function Group({ title, count, children }) {
  if (count === 0) return null
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-app-primary mb-2">{title} <span className="text-app-muted font-normal">({count})</span></h2>
      <div className="rounded-xl border divide-y" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>{children}</div>
    </div>
  )
}

const Row = ({ children }) => <div className="px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">{children}</div>
const StoreLink = ({ id, name }) => <Link to={`/plateforme/comptes/${id}`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{name}</Link>

// Recherche globale (lecture seule) à travers toutes les boutiques. Le terme saisi n'est jamais
// journalisé (les commandes contiennent des données de clients finaux). L'URL porte ?q=.
export default function PlatformAdminSearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [term, setTerm] = useState(q)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (term === q) return undefined
    const id = setTimeout(() => setParams(term ? { q: term } : {}, { replace: true }), 350)
    return () => clearTimeout(id)
  }, [term, q, setParams])

  useEffect(() => {
    if (q.trim().length < MIN_QUERY) { setData(null); setError(''); return undefined }
    let alive = true
    api.get('/platform-admin/search/', { params: { q: q.trim() } })
      .then(({ data: d }) => { if (alive) { setData(d); setError('') } })
      .catch(() => { if (alive) setError(t('Recherche impossible.')) })
    return () => { alive = false }
  }, [q, t])

  const total = data ? data.stores.length + data.users.length + data.orders.length + data.products.length : 0

  return (
    <div>
      <AdminPageHeader pageKey="search" title={t('Recherche globale')} subtitle={t('Boutiques, utilisateurs, commandes et produits')}
        help={t('Recherchez à travers toute la plateforme : nom de boutique, email, téléphone ou nom d\'un client, numéro de commande, code de suivi, produit ou SKU (3 caractères minimum, 10 résultats par type). Lecture seule. Le terme recherché n\'est pas conservé dans le journal d\'audit.')} />

      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('Rechercher…')} autoFocus
        className={`${theme.inputDark} w-full max-w-xl mb-6`} />

      {term.trim().length > 0 && term.trim().length < MIN_QUERY && <p className="text-sm text-app-muted">{t('Saisissez au moins {{n}} caractères.', { n: MIN_QUERY })}</p>}
      {error && <AdminError message={error} />}
      {data && total === 0 && <p className="text-sm text-app-muted">{t('Aucun résultat.')}</p>}

      {data && (
        <>
          <Group title={t('Boutiques')} count={data.stores.length}>
            {data.stores.map((s) => (
              <Row key={s.id}><span><strong>{s.name}</strong> <span className="text-app-muted">/{s.slug} — {s.owner_email}</span></span>
                <span className="flex items-center gap-3">{!s.is_active && <span className={theme.badge.danger}>{t('Suspendue')}</span>}<StoreLink id={s.id} name={t('Ouvrir la fiche')} /></span></Row>
            ))}
          </Group>
          <Group title={t('Utilisateurs')} count={data.users.length}>
            {data.users.map((u) => (
              <Row key={u.id}><span>{u.name || '—'} <span className="text-app-muted">{u.email}</span></span>
                <Link to={`/plateforme/utilisateurs?search=${encodeURIComponent(u.email)}`} className="text-violet-400 hover:text-violet-300 text-xs font-medium">{t('Voir')}</Link></Row>
            ))}
          </Group>
          <Group title={t('Commandes')} count={data.orders.length}>
            {data.orders.map((o) => (
              <Row key={o.id}><span>#{o.id} — {o.customer || '—'} <span className="text-app-muted">{o.phone} — {o.status} — {money(o.total)} — {dateTime(o.created_at)}{o.tracking ? ` — ${o.tracking}` : ''}</span></span>
                <StoreLink id={o.store_id} name={o.store_name} /></Row>
            ))}
          </Group>
          <Group title={t('Produits')} count={data.products.length}>
            {data.products.map((p) => (
              <Row key={p.id}><span>{p.name} <span className="text-app-muted">{p.sku ? `${p.sku} — ` : ''}{money(p.price)}{p.is_active ? '' : ` — ${t('inactif')}`}</span></span>
                <StoreLink id={p.store_id} name={p.store_name} /></Row>
            ))}
          </Group>
        </>
      )}
    </div>
  )
}
