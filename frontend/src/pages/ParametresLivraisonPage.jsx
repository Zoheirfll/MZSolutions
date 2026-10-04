import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import Toast from '../components/Toast'
import api from '../api/axios'
import { theme } from '../theme'
import { WILAYAS } from '../data/wilayas'
import { getCommunesForWilaya } from '../data/communes'
import { tt } from '../i18n'
import { useTranslation } from 'react-i18next'

// Logos des sociétés de livraison — un fichier par code transporteur dans
// assets/carriers/ (n'importe quelle extension image), retombe sur l'avatar-
// lettre si aucun logo n'a été fourni pour ce transporteur.
const CARRIER_LOGO_FILES = import.meta.glob('../assets/carriers/*.{png,jpg,jpeg,svg,webp,jfif}', { eager: true, import: 'default' })
const CARRIER_LOGOS = Object.fromEntries(
  Object.entries(CARRIER_LOGO_FILES).map(([path, url]) => [path.match(/carriers\/([^./]+)\./)[1], url])
)

function CarrierLogo({ code, label, size = 'w-16 h-16', textSize = 'text-lg', rounded = 'rounded-xl' }) {
  const logo = CARRIER_LOGOS[code]
  if (logo) {
    return (
      <div className={`${size} ${rounded} bg-white overflow-hidden flex items-center justify-center shrink-0 shadow`}>
        <img src={logo} alt={label} className="w-full h-full object-contain p-1.5" />
      </div>
    )
  }
  return (
    <div className={`${size} ${rounded} bg-white flex items-center justify-center ${textSize} font-bold text-violet-600 shadow shrink-0`}>
      {label?.[0]}
    </div>
  )
}

// `real: true` = API réellement branchée (via Ecotrack, API propre, ou
// dzship — voir `via`) — le transporteur reçoit vraiment l'expédition.
// `real: false` = simulé pour l'instant (tracking factice MOCK-..., aucune
// piste d'API trouvée à ce jour). `tested: true` = en plus, une vraie
// expédition a été créée avec succès avec un compte partenaire réel (pas
// juste la connexion/auth). `via: 'dzship'` = branché via la passerelle
// tierce freeship.dzbuild.com (2026-09) plutôt qu'un client direct — décision
// produit : uniquement pour les transporteurs sans compte réel chez
// MZSolutions, jamais pour Noest/Yalidine/ZR Express qui ont leur propre
// intégration directe (voir CLAUDE.md, section Livraison, pour le détail).
const CARRIERS = [
  { code: 'yalidine',       label: tt('Yalidine'),              real: true },
  { code: 'zr_express',     label: tt('ZR Express'),            real: true },
  { code: 'noest',          label: tt('Noest'),                 real: true, tested: true },
  { code: 'guepex',         label: tt('Guepex'),                real: true, via: 'dzship' },
  { code: 'maystro',        label: tt('Maystro'),               real: true, via: 'dzship' },
  { code: 'imir',           label: tt('Imir'),                  real: true },
  { code: 'dhd',            label: tt('DHD'),                   real: true },
  { code: 'speedmail',      label: tt('SpeedMail'),             real: true, via: 'dzship' },
  { code: 'worldexpress',   label: tt('Worldexpress'),          real: true },
  { code: 'ups',            label: tt('UPS'),                   real: true },
  { code: 'anderson',       label: tt('Anderson'),               real: true },
  { code: 'ontime',         label: tt('OnTime'),                real: true },
  { code: 'yalitec',        label: tt('Yalitec'),               real: true, via: 'dzship' },
  { code: 'assil_delivery', label: tt('Assil Delivery'),        real: true },
  { code: 'zimou_express',  label: tt('Zimou Express'),         real: true, via: 'dzship' },
  { code: 'tikjdadelivery', label: tt('Tikjdadelivery'),        real: true },
  { code: 'ecomdz',         label: tt('EcomDz'),                real: true, via: 'dzship' },
  { code: 'colireli',       label: tt('Colireli'),              real: true },
  { code: 'expediachrono',  label: tt('Expediachrono'),         real: true },
  { code: 'navex',          label: tt('Navex'),                 real: true },
  { code: 'courier48hr',    label: tt('48HR Courrier Express'), real: true },
  { code: 'pachers',        label: tt('Pachers'),                real: true },
  { code: 'lynx',           label: tt('Lynx'),                  real: true },
  { code: 'tls',            label: tt('TLS'),                   real: true },
  { code: 'siexpress',      label: tt('Siexpress'),             real: true },
  { code: 'chronorex',      label: tt('Chronorex'),             real: true },
  { code: 'mdm',            label: tt('MDM'),                   real: true, via: 'dzship' },
  { code: 'colivraison',    label: tt('Colivraison'),           real: true, via: 'dzship' },
  { code: 'elogistia',      label: tt('Elogistia'),             real: true, via: 'dzship' },
  { code: 'near_delivery',  label: tt('Near Delivery'),         real: true, via: 'dzship' },
  { code: 'easy_speed',     label: tt('Easy & Speed'),          real: true, via: 'dzship' },
  { code: 'economiqua',     label: tt('Economiqua'),            real: true, via: 'dzship' },
  { code: 'wecan',          label: tt('We Can Services'),       real: true, via: 'dzship' },
  { code: 'speeddelivery',  label: tt('Speed Delivery'),        real: true, via: 'dzship' },
  { code: 'gsecommerce',    label: tt('GS Ecommerce'),          real: true, via: 'dzship' },
]

const TABS = [
  { key: 'browse',    label: tt('Sociétés de livraison') },
  { key: 'connected', label: tt('Mes Sociétés de livraison') },
  { key: 'tarification', label: tt('Tarification') },
]

function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-xs" style={{ color: theme.dark.muted }}>—</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer
        ${copied ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/10 text-app-primary hover:bg-violet-500/15'}`}
      title={label}
    >
      <span className="max-w-28 truncate">{value}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

function StatusToggle({ active, onChange }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={active}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer shrink-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400
        ${active ? 'bg-violet-600' : 'bg-violet-500/15'}`}
    >
      <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${active ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'}`} />
    </button>
  )
}

export default function ParametresLivraisonPage() {
  const { t: tr } = useTranslation('dashboard')
  const [toast, setToast] = useState(null)
  const [tab, setTab]                   = useState('browse')
  const [carrierSearch, setCarrierSearch] = useState('')
  const [accounts, setAccounts]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalCarrier, setModalCarrier] = useState(null)
  const [name, setName]                 = useState('')
  const [departureWilaya, setDepartureWilaya] = useState('')
  const [apiId, setApiId]               = useState('')
  const [apiToken, setApiToken]         = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [isActive, setIsActive]         = useState(true)
  const [saving, setSaving]             = useState(false)

  // Tarification par wilaya/commune (onglet "Tarification", équivalent
  // RiseCart) — la grille éditée ici prend le pas sur le tarif transporteur
  // en temps réel côté serveur (voir `_resolve_shipping_cost`).
  const [wilayaRates, setWilayaRates]   = useState([])
  const [rateLoading, setRateLoading]   = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [rateModal, setRateModal]       = useState(null) // {wilaya_id, wilaya_name, home_price, desk_price, show_home, show_desk}
  const [savingRate, setSavingRate]     = useState(false)
  const [communeWilaya, setCommuneWilaya] = useState(null) // {id, name} ou null (vue wilayas)
  const [communeRates, setCommuneRates] = useState([])
  const [communeLoading, setCommuneLoading] = useState(false)
  const [communeModal, setCommuneModal] = useState(null)
  const [savingCommune, setSavingCommune] = useState(false)
  const [syncingCommunes, setSyncingCommunes] = useState(false)

  const fetchWilayaRates = () => {
    setRateLoading(true)
    api.get('/stores/me/wilaya-rates/')
      .then(({ data }) => setWilayaRates(data))
      .catch(() => {})
      .finally(() => setRateLoading(false))
  }

  useEffect(() => { if (tab === 'tarification' && !communeWilaya) fetchWilayaRates() }, [tab, communeWilaya])

  const wilayaRateFor = (id) => wilayaRates.find(r => r.wilaya_id === id)

  const openRateModal = (w) => {
    const existing = wilayaRateFor(w.id)
    setRateModal({
      wilaya_id: w.id, wilaya_name: w.name,
      home_price: existing?.home_price ?? '0',
      desk_price: existing?.desk_price ?? '',
      show_home: existing ? existing.show_home : true,
      show_desk: existing ? existing.show_desk : true,
    })
  }

  const saveWilayaRate = async () => {
    if (!rateModal) return
    setSavingRate(true)
    try {
      await api.post('/stores/me/wilaya-rates/', {
        wilaya_id: rateModal.wilaya_id,
        home_price: rateModal.home_price || 0,
        desk_price: rateModal.desk_price === '' ? null : rateModal.desk_price,
        show_home: rateModal.show_home,
        show_desk: rateModal.show_desk,
      })
      setRateModal(null)
      fetchWilayaRates()
    } catch {} finally { setSavingRate(false) }
  }

  const removeWilayaRate = async (rate) => {
    await api.delete(`/stores/me/wilaya-rates/${rate.id}/`)
    fetchWilayaRates()
  }

  const syncFromCarrier = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post('/stores/me/wilaya-rates/sync/')
      fetchWilayaRates()
      setToast({ type: 'success', message: `Tarifs mis à jour : ${data.updated} wilaya(s)${data.failed ? `, ${data.failed} indisponible(s)` : ''}.` })
    } catch (err) {
      setToast({ type: 'error', message: err?.response?.data?.detail || tr('Échec de la synchronisation — vérifiez qu\'un transporteur par défaut actif est connecté.') })
    } finally { setSyncing(false) }
  }

  const fetchCommuneRates = (wilayaId) => {
    setCommuneLoading(true)
    api.get(`/stores/me/commune-rates/?wilaya_id=${wilayaId}`)
      .then(({ data }) => setCommuneRates(data))
      .catch(() => {})
      .finally(() => setCommuneLoading(false))
  }

  useEffect(() => { if (communeWilaya) fetchCommuneRates(communeWilaya.id) }, [communeWilaya])

  const openCommuneModal = (name, existing) => {
    setCommuneModal({
      commune_name: name,
      home_price: existing?.home_price ?? '0',
      desk_price: existing?.desk_price ?? '',
    })
  }

  const saveCommuneRate = async () => {
    if (!communeModal || !communeWilaya) return
    setSavingCommune(true)
    try {
      await api.post('/stores/me/commune-rates/', {
        wilaya_id: communeWilaya.id,
        commune_name: communeModal.commune_name,
        home_price: communeModal.home_price || 0,
        desk_price: communeModal.desk_price === '' ? null : communeModal.desk_price,
      })
      setCommuneModal(null)
      fetchCommuneRates(communeWilaya.id)
    } catch {} finally { setSavingCommune(false) }
  }

  const removeCommuneRate = async (rate) => {
    await api.delete(`/stores/me/commune-rates/${rate.id}/`)
    fetchCommuneRates(communeWilaya.id)
  }

  const syncCommunesFromCarrier = async () => {
    if (!communeWilaya) return
    setSyncingCommunes(true)
    try {
      const { data } = await api.post('/stores/me/commune-rates/sync/', { wilaya_name: communeWilaya.name })
      fetchCommuneRates(communeWilaya.id)
      setToast({ type: 'success', message: tr('{{updated}} commune(s) mise(s) à jour.', { updated: data.updated }) })
    } catch (err) {
      setToast({ type: 'error', message: err?.response?.data?.detail || tr('Échec de la synchronisation — le transporteur par défaut ne fournit peut-être pas de tarifs par commune.') })
    } finally { setSyncingCommunes(false) }
  }

  const fetchAccounts = () => {
    setLoading(true)
    api.get('/stores/me/carriers/')
      .then(({ data }) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAccounts() }, [])

  const accountFor = (code) => accounts.find(a => a.carrier === code)

  const openModal = (code) => {
    const existing = accountFor(code)
    setName(existing?.name || '')
    setDepartureWilaya(existing?.departure_wilaya || '')
    setApiId(existing?.api_id || '')
    setApiToken('')
    setWebhookSecret('')
    setIsActive(existing ? existing.is_active : true)
    setModalCarrier(code)
  }

  const saveAccount = async () => {
    if (!modalCarrier) return
    setSaving(true)
    try {
      const existing = accountFor(modalCarrier)
      const payload = { name, departure_wilaya: departureWilaya, api_id: apiId, api_token: apiToken, is_active: isActive }
      if (webhookSecret) payload.webhook_secret = webhookSecret
      if (existing) {
        await api.put(`/stores/me/carriers/${existing.id}/`, payload)
      } else {
        await api.post('/stores/me/carriers/', { carrier: modalCarrier, ...payload })
      }
      setModalCarrier(null)
      fetchAccounts()
    } catch {} finally { setSaving(false) }
  }

  const toggleActive = async (account) => {
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a))
    try {
      await api.put(`/stores/me/carriers/${account.id}/`, { is_active: !account.is_active })
    } catch {
      fetchAccounts()
    }
  }

  const toggleDefault = async (account) => {
    await api.put(`/stores/me/carriers/${account.id}/`, { is_default: !account.is_default })
    fetchAccounts()
  }

  const removeAccount = async (account) => {
    await api.delete(`/stores/me/carriers/${account.id}/`)
    fetchAccounts()
  }

  return (
    <DashboardLayout title={tr('Paramètres livraison')} subtitle={tr('Cette page sert à relier votre boutique à une société de livraison (Yalidine, Noest, ZR Express...). Vous devez d\'abord créer un compte professionnel chez le transporteur de votre choix, ce qui vous donne une clé et un jeton d\'accès à coller ici. Une fois connecté, choisissez ce compte comme transporteur "par défaut" : dès qu\'une commande passe au statut Confirmée, l\'expédition est créée automatiquement chez ce transporteur, avec un numéro de suivi généré tout seul. Vous pouvez connecter plusieurs transporteurs à la fois si vous travaillez avec plusieurs sociétés.')}>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: theme.dark.card, border: `1px solid ${theme.dark.border}` }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
              ${tab === t.key ? 'bg-violet-600 text-white shadow-sm' : 'text-app-muted-light hover:text-app-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <>
          <input
            value={carrierSearch}
            onChange={e => setCarrierSearch(e.target.value)}
            placeholder={tr('Rechercher une société de livraison…')}
            className="w-full sm:w-80 px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition mb-5"
            style={{ borderColor: theme.dark.border }}
          />
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={theme.skeleton + ' h-48'} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CARRIERS.filter(c => c.label.toLowerCase().includes(carrierSearch.trim().toLowerCase())).map(c => {
                const account = accountFor(c.code)
                return (
                  <div key={c.code} className="rounded-xl border p-5 flex flex-col items-center text-center gap-3 transition-colors duration-150 hover:border-violet-500/25"
                    style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
                    <CarrierLogo code={c.code} label={c.label} />
                    <p className="font-semibold text-app-primary">{c.label}</p>
                    <span
                      className={c.tested ? theme.badge.success : c.via === 'dzship' ? theme.badge.info : c.real ? theme.badge.info : theme.badge.warning}
                      title={
                        c.tested
                          ? tr('Expédition réelle créée avec succès avec un vrai compte partenaire')
                          : c.via === 'dzship'
                          ? tr('Passe par la passerelle tierce dzship (freeship.dzbuild.com) plutôt qu\'une intégration directe — non testé avec un vrai compte, voir CLAUDE.md')
                          : c.real
                          ? tr('Connexion à l\'API confirmée — création d\'expédition non encore testée avec un vrai compte')
                          : undefined
                      }
                    >
                      {c.tested ? tr('Testé et fonctionnel') : c.via === 'dzship' ? tr('Via dzship (non testé)') : c.real ? tr('API branchée (non testée)') : tr('Simulé (à venir)')}
                    </span>
                    {account ? (
                      <>
                        <span className={theme.badge.success}>{tr('Connecté')}</span>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: theme.dark.muted }}>
                          <input type="checkbox" checked={account.is_default} onChange={() => toggleDefault(account)} className="cursor-pointer accent-violet-600" />{tr('Société de livraison par défaut')}</label>
                        <div className="flex gap-2 w-full">
                          <button onClick={() => openModal(c.code)} className={theme.btn.outline + ' flex-1 text-xs cursor-pointer'}>{tr('Modifier')}</button>
                          <button onClick={() => removeAccount(account)} className={theme.btn.danger + ' flex-1 text-xs cursor-pointer'}>{tr('Retirer')}</button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => openModal(c.code)} className={theme.btn.primary + ' w-full cursor-pointer'}>{tr('Ajouter')}</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'connected' && (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border, background: theme.dark.card }}>
          <table className="w-full text-sm">
            <thead style={{ background: theme.dark.sidebar }}>
              <tr className="text-start text-xs" style={{ color: theme.dark.muted }}>
                <th className="px-4 py-3 text-start font-medium">{tr('ID')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Société')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Ville de départ')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Statut')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Clé API')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Jeton API')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('URL webhook')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Défaut')}</th>
                <th className="px-4 py-3 text-start font-medium">{tr('Créé à')}</th>
                <th className="px-4 py-3 text-end font-medium">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(2)].map((_, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: theme.dark.borderRowHover }}>
                    <td colSpan={10} className="px-4 py-4"><div className={theme.skeleton + ' h-5 w-full'} /></td>
                  </tr>
                ))
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className={theme.emptyState}>
                      <p className="text-sm">{tr('Aucun transporteur connecté pour l\'instant.')}</p>
                      <button onClick={() => setTab('browse')} className={theme.btn.ghost + ' mt-2 cursor-pointer'}>{tr('Aller dans "Sociétés de livraison"')}</button>
                    </div>
                  </td>
                </tr>
              ) : accounts.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                  <td className="px-4 py-3 text-app-muted-light">{a.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <CarrierLogo code={a.carrier} label={a.carrier_label} size="w-8 h-8" textSize="text-xs" rounded="rounded-lg" />
                      <div>
                        <p className="text-app-primary font-medium leading-tight">{a.name || a.carrier_label}</p>
                        <p className="text-xs leading-tight" style={{ color: theme.dark.muted }}>{a.carrier_label}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-app-primary">{a.departure_wilaya || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusToggle active={a.is_active} onChange={() => toggleActive(a)} />
                  </td>
                  <td className="px-4 py-3"><CopyButton value={a.api_id} label={tr('Copier la clé API')} /></td>
                  <td className="px-4 py-3"><CopyButton value={a.api_token_masked} label={tr('Le jeton complet n\'est jamais renvoyé')} /></td>
                  <td className="px-4 py-3">
                    {a.webhook_url ? <CopyButton value={a.webhook_url} label={tr('URL du webhook à coller dans le dashboard du transporteur')} /> : <span className="text-xs" style={{ color: theme.dark.muted }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {a.is_default ? (
                      <span className={theme.badge.info}>{tr('Par défaut')}</span>
                    ) : (
                      <button onClick={() => toggleDefault(a)} className="text-xs text-violet-400 hover:text-violet-300 cursor-pointer transition">{tr('Définir par défaut')}</button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-app-muted-light text-xs">{new Date(a.created_at).toLocaleDateString('fr-DZ')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openModal(a.carrier)} className={theme.btn.icon} title={tr('Modifier')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => removeAccount(a)} className={theme.btn.icon + ' hover:text-red-400 hover:bg-red-500/10'} title={tr('Retirer')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tarification' && !communeWilaya && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <p className="text-sm max-w-xl" style={{ color: theme.dark.muted }}>{tr('Grille de frais de livraison par wilaya — remplace le calcul en temps réel du transporteur pour vos clients dès qu\'une ligne existe. Cliquez sur une wilaya pour ses tarifs par commune.')}</p>
            <button onClick={syncFromCarrier} disabled={syncing} className={theme.btn.outline + ' text-sm cursor-pointer shrink-0'}>
              {syncing ? tr('Synchronisation…') : tr('Mettre à jour depuis la société')}
            </button>
          </div>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border, background: theme.dark.card }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-start text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 text-start font-medium">{tr('ID')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Nom')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Frais au bureau')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Frais à domicile')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Afficher au bureau')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Afficher à domicile')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Communes')}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rateLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: theme.dark.borderRowHover }}>
                      <td colSpan={8} className="px-4 py-4"><div className={theme.skeleton + ' h-5 w-full'} /></td>
                    </tr>
                  ))
                ) : WILAYAS.map(w => {
                  const rate = wilayaRateFor(w.id)
                  return (
                    <tr key={w.id} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                      <td className="px-4 py-3 text-app-muted-light">{w.id}</td>
                      <td className="px-4 py-3 text-app-primary font-medium">{w.name}</td>
                      <td className="px-4 py-3 text-app-primary">{rate?.desk_price != null ? `${rate.desk_price} DA` : '—'}</td>
                      <td className="px-4 py-3 text-app-primary">{rate ? `${rate.home_price} DA` : '—'}</td>
                      <td className="px-4 py-3">{rate ? (rate.show_desk ? <span className={theme.badge.success}>{tr('Oui')}</span> : <span className={theme.badge.neutral}>{tr('Non')}</span>) : '—'}</td>
                      <td className="px-4 py-3">{rate ? (rate.show_home ? <span className={theme.badge.success}>{tr('Oui')}</span> : <span className={theme.badge.neutral}>{tr('Non')}</span>) : '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setCommuneWilaya({ id: w.id, name: w.name })} className="text-xs text-violet-400 hover:text-violet-300 cursor-pointer transition">{tr('Voir les communes')}</button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openRateModal(w)} className={theme.btn.icon} title={rate ? tr('Modifier') : tr('Ajouter une nouvelle')}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          {rate && (
                            <button onClick={() => removeWilayaRate(rate)} className={theme.btn.icon + ' hover:text-red-400 hover:bg-red-500/10'} title={tr('Supprimer')}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'tarification' && communeWilaya && (
        <>
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => setCommuneWilaya(null)} className={theme.btn.ghost + ' text-sm cursor-pointer'}>{tr('← Retour aux wilayas')}</button>
              <h3 className="font-semibold text-app-primary">{tr('Communes — {{name}}', { name: communeWilaya.name })}</h3>
            </div>
            <button onClick={syncCommunesFromCarrier} disabled={syncingCommunes} className={theme.btn.outline + ' text-sm cursor-pointer'}>
              {syncingCommunes ? tr('Synchronisation…') : tr('Mettre à jour depuis la société')}
            </button>
          </div>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border, background: theme.dark.card }}>
            <table className="w-full text-sm">
              <thead style={{ background: theme.dark.sidebar }}>
                <tr className="text-start text-xs" style={{ color: theme.dark.muted }}>
                  <th className="px-4 py-3 text-start font-medium">{tr('Commune')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Frais au bureau')}</th>
                  <th className="px-4 py-3 text-start font-medium">{tr('Frais à domicile')}</th>
                  <th className="px-4 py-3 text-end font-medium">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {communeLoading ? (
                  <tr><td colSpan={4} className="px-4 py-4"><div className={theme.skeleton + ' h-5 w-full'} /></td></tr>
                ) : getCommunesForWilaya(communeWilaya.id).length === 0 ? (
                  <tr><td colSpan={4}><div className={theme.emptyState}><p className="text-sm">{tr('Liste des communes indisponible pour cette wilaya.')}</p></div></td></tr>
                ) : getCommunesForWilaya(communeWilaya.id).map(communeName => {
                  const r = communeRates.find(cr => cr.commune_name.toLowerCase() === communeName.toLowerCase())
                  return (
                    <tr key={communeName} className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                      <td className="px-4 py-3 text-app-primary font-medium">{communeName}</td>
                      <td className="px-4 py-3 text-app-primary">{r?.desk_price != null ? `${r.desk_price} DA` : '—'}</td>
                      <td className="px-4 py-3 text-app-primary">{r ? `${r.home_price} DA` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openCommuneModal(communeName, r)} className={theme.btn.icon} title={r ? tr('Modifier') : tr('Ajouter un tarif')}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          {r && (
                            <button onClick={() => removeCommuneRate(r)} className={theme.btn.icon + ' hover:text-red-400 hover:bg-red-500/10'} title={tr('Supprimer')}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setRateModal(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm relative" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setRateModal(null)} className="absolute top-4 end-4 w-7 h-7 rounded-full flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/10 transition cursor-pointer">✕</button>
            <h3 className="font-semibold text-app-primary mb-5 text-center">{tr('Tarif — {{wilaya_name}}', { wilaya_name: rateModal.wilaya_name })}</h3>
            <label className={theme.labelDark}>{tr('Frais de livraison à domicile')}</label>
            <input type="number" min="0" value={rateModal.home_price} onChange={e => setRateModal(m => ({ ...m, home_price: e.target.value }))} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>{tr('Frais de livraison au bureau')}</label>
            <input type="number" min="0" value={rateModal.desk_price} onChange={e => setRateModal(m => ({ ...m, desk_price: e.target.value }))} placeholder={tr('Non proposé')} className={theme.inputDark + ' mb-3'} />
            <label className="flex items-center justify-between text-sm text-app-primary mb-3">{tr('Afficher à domicile')}<StatusToggle active={rateModal.show_home} onChange={() => setRateModal(m => ({ ...m, show_home: !m.show_home }))} />
            </label>
            <label className="flex items-center justify-between text-sm text-app-primary mb-5">{tr('Afficher au bureau')}<StatusToggle active={rateModal.show_desk} onChange={() => setRateModal(m => ({ ...m, show_desk: !m.show_desk }))} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setRateModal(null)} className={theme.btn.secondary + ' flex-1 cursor-pointer'}>{tr('Fermer')}</button>
              <button onClick={saveWilayaRate} disabled={savingRate} className={theme.btn.primary + ' flex-1 cursor-pointer'}>{savingRate ? '…' : tr('Enregistrer')}</button>
            </div>
          </div>
        </div>
      )}

      {communeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setCommuneModal(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm relative" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setCommuneModal(null)} className="absolute top-4 end-4 w-7 h-7 rounded-full flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/10 transition cursor-pointer">✕</button>
            <h3 className="font-semibold text-app-primary mb-5 text-center">{tr('Tarif commune — {{name}}', { name: communeWilaya?.name })}</h3>
            <label className={theme.labelDark}>{tr('Nom de la commune')}</label>
            <input value={communeModal.commune_name} onChange={e => setCommuneModal(m => ({ ...m, commune_name: e.target.value }))} placeholder={tr('Nom de la commune')} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>{tr('Frais de livraison à domicile')}</label>
            <input type="number" min="0" value={communeModal.home_price} onChange={e => setCommuneModal(m => ({ ...m, home_price: e.target.value }))} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>{tr('Frais de livraison au bureau')}</label>
            <input type="number" min="0" value={communeModal.desk_price} onChange={e => setCommuneModal(m => ({ ...m, desk_price: e.target.value }))} placeholder={tr('Non proposé')} className={theme.inputDark + ' mb-3'} />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setCommuneModal(null)} className={theme.btn.secondary + ' flex-1 cursor-pointer'}>{tr('Fermer')}</button>
              <button onClick={saveCommuneRate} disabled={savingCommune || !communeModal.commune_name.trim()} className={theme.btn.primary + ' flex-1 cursor-pointer'}>{savingCommune ? '…' : tr('Enregistrer')}</button>
            </div>
          </div>
        </div>
      )}

      {modalCarrier && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModalCarrier(null)}>
          <div className="rounded-xl border p-6 w-full max-w-sm relative" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalCarrier(null)} className="absolute top-4 end-4 w-7 h-7 rounded-full flex items-center justify-center text-app-muted-light hover:text-app-primary hover:bg-violet-500/10 transition cursor-pointer">
              ✕
            </button>
            <h3 className="font-semibold text-app-primary mb-5 text-center">
              {accountFor(modalCarrier) ? tr('Modifier') : tr('Connecter')} {CARRIERS.find(c => c.code === modalCarrier)?.label}
            </h3>
            <div className="flex justify-center mb-5">
              <CarrierLogo code={modalCarrier} label={CARRIERS.find(c => c.code === modalCarrier)?.label} rounded="rounded-full" />
            </div>
            <label className={theme.labelDark}>{tr('Sélectionnez la ville de départ')}</label>
            <Select
              value={departureWilaya}
              onChange={setDepartureWilaya}
              options={WILAYAS.map(w => ({ value: w.name, label: w.name }))}
              placeholder={tr('Sélectionnez la ville de départ')}
              className={theme.inputDark + ' mb-3'}
            />
            <label className={theme.labelDark}>{tr('Name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Entrez le nom de l\'entreprise')} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>{tr('Entrez votre clé API')}</label>
            <input value={apiId} onChange={e => setApiId(e.target.value)} placeholder={tr('Entrez votre clé API')} className={theme.inputDark + ' mb-3'} />
            <label className={theme.labelDark}>{tr('Entrez votre jeton API')}</label>
            <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" placeholder={tr('Entrez votre jeton API')} className={theme.inputDark + ' mb-3'} />
            {modalCarrier === 'yalidine' && (
              <>
                <label className={theme.labelDark}>{tr('URL du webhook (à coller dans votre dashboard Yalidine)')}</label>
                <div className="mb-3">
                  <CopyButton value={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/public/webhooks/yalidine/`} label={tr('URL du webhook Yalidine')} />
                </div>
                <label className={theme.labelDark + ' mt-3'}>{tr('Clé secrète du webhook (générée par Yalidine)')}</label>
                <input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder={tr('Laissez vide pour ne pas changer')} className={theme.inputDark + ' mb-3'} />
                <p className="text-xs mb-3" style={{ color: theme.dark.muted }}>
                  {accountFor(modalCarrier)?.webhook_secret_masked ? tr('Clé actuelle : {{webhook_secret_masked}}', { webhook_secret_masked: accountFor(modalCarrier).webhook_secret_masked }) : tr('Aucune clé enregistrée — le suivi automatique retombera sur une vérification toutes les 15 min plutôt qu\'en temps réel.')}
                </p>
              </>
            )}
            <label className="flex items-center justify-between text-sm text-app-primary mb-5">{tr('Actif')}<StatusToggle active={isActive} onChange={() => setIsActive(v => !v)} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setModalCarrier(null)} className={theme.btn.secondary + ' flex-1 cursor-pointer'}>{tr('Fermer')}</button>
              <button onClick={saveAccount} disabled={saving} className={theme.btn.primary + ' flex-1 cursor-pointer'}>
                {saving ? '…' : (accountFor(modalCarrier) ? tr('Enregistrer') : tr('Créer'))}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
