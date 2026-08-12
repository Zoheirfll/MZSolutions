import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import StatusBadge from '../../components/StatusBadge'
import Select from '../../components/Select'
import api from '../../api/axios'
import { theme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { WILAYAS, getWilayaIdByName } from '../../data/wilayas'
import { getCommunesForWilaya } from '../../data/communes'

const STATUS_CHOICES = [
  { value: 'pending',          label: 'En attente de confirmation' },
  { value: 'no_answer_1',      label: 'Non joignable — 1ère tentative' },
  { value: 'no_answer_2',      label: 'Non joignable — 2ème tentative' },
  { value: 'no_answer_3',      label: 'Non joignable — 3ème tentative' },
  { value: 'confirmed',        label: 'Confirmée' },
  { value: 'shipped',          label: 'Expédiée' },
  { value: 'delivered',        label: 'Livrée' },
  { value: 'returned',         label: 'Retournée' },
  { value: 'cancel_requested', label: "Demande d'annulation" },
  { value: 'cancelled',        label: 'Annulée' },
]

// Mapping statut → badge (aligné sur OrdersPage.jsx) :
// success (emerald) = confirmée/expédiée/livrée · warning (amber) = en attente / tentatives d'appel
// danger (red) = retournée/annulée/demande d'annulation · neutral = fallback
const STATUS_COLORS = {
  pending:          'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_1:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_2:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  no_answer_3:      'bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/20',
  confirmed:        'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  shipped:          'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  delivered:        'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/20',
  returned:         'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
  cancel_requested: 'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
  cancelled:        'bg-red-900/30 text-red-400 ring-1 ring-red-500/20',
}
const STATUS_FALLBACK = 'bg-violet-500/10 text-app-muted-light ring-1 ring-violet-500/15'

const STATUS_DOT = {
  pending: 'bg-amber-400', no_answer_1: 'bg-amber-400', no_answer_2: 'bg-amber-400', no_answer_3: 'bg-amber-400',
  confirmed: 'bg-emerald-400', shipped: 'bg-emerald-400', delivered: 'bg-emerald-400',
  returned: 'bg-red-400', cancel_requested: 'bg-red-400', cancelled: 'bg-red-400',
}

function Icon({ path, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  back:     'M19 12H5M12 19l-7-7 7-7',
  user:     'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  phone:    'M2.25 6.75c0 8.284 6.716 15 15 15h1.5a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106a1.125 1.125 0 00-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97a1.125 1.125 0 00.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z',
  pin:      'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z',
  truck:    'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.83H14.25M16.5 18.75h-2.25m0-12h-3c-1.03 0-1.9.693-2.166 1.638m5.166-1.638V18.75m-5.166-12H3.375c-.621 0-1.126.504-1.125 1.125l.001 8.443c0 .823.673 1.494 1.497 1.494H6M16.5 6.75V4.5m0 2.25h4.5m-4.5 0v9.75m6-6.75v6.75',
  cash:     'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  package:  'M20.25 7.5l-8.25-4.5L3.75 7.5m16.5 0l-8.25 4.5m8.25-4.5v9l-8.25 4.5m0-9L3.75 7.5m8.25 4.5v9M3.75 7.5v9l8.25 4.5',
  note:     'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6 12l-3-3m0 0l-3 3m3-3v6M6.75 3.75h4.5a1.5 1.5 0 011.06.44l4.5 4.5a1.5 1.5 0 01.44 1.06V19.5a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V5.25a1.5 1.5 0 011.5-1.5z',
  status:   'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  shipping: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.83H14.25M16.5 18.75h-2.25m0-12h-3c-1.03 0-1.9.693-2.166 1.638m5.166-1.638V18.75m-5.166-12H3.375c-.621 0-1.126.504-1.125 1.125l.001 8.443c0 .823.673 1.494 1.497 1.494H6M16.5 6.75V4.5m0 2.25h4.5m-4.5 0v9.75m6-6.75v6.75',
  team:     'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
}

function InfoTile({ icon, label, value, highlight }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
        <Icon path={icon} className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.dark.muted }}>{label}</p>
        <p className={`text-sm font-medium truncate ${highlight ? 'text-violet-300' : 'text-app-primary'}`}>{value}</p>
      </div>
    </div>
  )
}

function SectionCard({ icon, title, right, children }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
              <Icon path={icon} className="w-3.5 h-3.5" />
            </div>
          )}
          <h2 className="font-semibold text-app-primary text-sm">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isConfirmateur = user?.team_role === 'confirmateur'
  const canEditOrder = !!user?.permissions?.orders_manage

  const [order,         setOrder]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [confirmateurs, setConfirmateurs] = useState([])
  const [carrierAccounts, setCarrierAccounts] = useState([])
  const [selectedCarrierId, setSelectedCarrierId] = useState('')
  const [carrierWarning, setCarrierWarning] = useState('')
  const [downloadingLabel, setDownloadingLabel] = useState(false)
  const [labelError, setLabelError] = useState('')
  const [savingCarrier, setSavingCarrier] = useState(false)
  const [assignCarrierError, setAssignCarrierError] = useState('')

  // Articles — toujours modifiables directement sur la page (pas caché
  // dans "Modifier") : au cas où le client s'est trompé de taille/couleur,
  // ou pour les commandes importées (Shopify) à corriger manuellement.
  const [localItems,   setLocalItems]   = useState([])
  const [savingItems,  setSavingItems]  = useState(false)
  const [itemsError,   setItemsError]   = useState('')
  const [itemSearch,   setItemSearch]   = useState('')
  const [itemResults,  setItemResults]  = useState([])
  const [itemSearching, setItemSearching] = useState(false)
  const [changingRowKey, setChangingRowKey] = useState(null) // clé de la ligne dont on cherche un nouveau produit/variante
  const nextTempId = useRef(-1)

  useEffect(() => {
    if (order?.items) setLocalItems(order.items.map(i => ({ ...i, _key: i.id })))
  }, [order])

  useEffect(() => {
    const term = itemSearch.trim()
    if (!term) { setItemResults([]); return }
    setItemSearching(true)
    const t = setTimeout(() => {
      api.get(`/products/?search=${encodeURIComponent(term)}&per_page=8`)
        .then(({ data }) => setItemResults(data.results ?? []))
        .catch(() => {})
        .finally(() => setItemSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [itemSearch])

  const localSubtotal = localItems.filter(i => !i._delete).reduce((s, i) => s + i.price * i.quantity, 0)

  // Sauvegarde immédiate — pas de bouton "Enregistrer" : chaque interaction
  // (quantité, suppression, ajout, changement de variante) persiste tout de
  // suite. `items` = le tableau localItems déjà mis à jour (calculé avant
  // l'appel, jamais lu depuis le state qui n'est pas encore à jour à cause
  // de l'asynchronicité de setState).
  const persistItems = async items => {
    setSavingItems(true)
    setItemsError('')
    try {
      const payload = items
        .filter(i => !(i._new && i._delete))
        .map(i => {
          if (i._delete) return { id: i.id, _delete: true }
          if (i._new) return { product: i.product, variant_option: i.variant_option, quantity: i.quantity }
          if (i._changed) return { id: i.id, product: i.product, variant_option: i.variant_option, quantity: i.quantity }
          return { id: i.id, quantity: i.quantity }
        })
      await api.put(`/orders/${id}/`, { items: payload })
      fetchOrder(true)
    } catch (err) {
      setItemsError(err.response?.data?.detail || "Impossible d'enregistrer les articles.")
    } finally { setSavingItems(false) }
  }

  const qtyTimers = useRef({})
  const updateLocalQty = (key, qty) => {
    if (qty < 1) return
    setLocalItems(prev => {
      const next = prev.map(i => i._key === key ? { ...i, quantity: qty } : i)
      // Léger anti-rebond sur les clics +/- répétés, pour ne pas spammer
      // l'API à chaque incrément — la dernière valeur gagne.
      clearTimeout(qtyTimers.current[key])
      qtyTimers.current[key] = setTimeout(() => persistItems(next), 400)
      return next
    })
  }

  const removeLocalItem = key => {
    setLocalItems(prev => {
      const next = prev.filter(i => i._key !== key).concat(
        prev.some(i => i._key === key && !i._new) ? [{ ...prev.find(i => i._key === key), _delete: true }] : []
      )
      persistItems(next)
      return next
    })
  }

  const addProductToOrder = (p, variantOption) => {
    const price = variantOption ? Number(variantOption.price ?? p.price) : Number(p.price)
    const key = nextTempId.current--
    setLocalItems(prev => {
      const next = [...prev, {
        _key: key, _new: true,
        product: p.id, variant_option: variantOption?.id || null,
        product_name: variantOption ? `${p.name} — ${variantOption.value}` : p.name,
        price, quantity: 1,
      }]
      persistItems(next)
      return next
    })
    setItemSearch('')
    setItemResults([])
  }

  const changeRowProduct = (key, p, variantOption) => {
    const price = variantOption ? Number(variantOption.price ?? p.price) : Number(p.price)
    setLocalItems(prev => {
      const next = prev.map(i => i._key === key ? {
        ...i, _changed: true,
        product: p.id, variant_option: variantOption?.id || null,
        product_name: variantOption ? `${p.name} — ${variantOption.value}` : p.name,
        price,
      } : i)
      persistItems(next)
      return next
    })
    setChangingRowKey(null)
    setItemSearch('')
    setItemResults([])
  }

  const assignCarrier = async () => {
    if (!selectedCarrierId) return
    setSavingCarrier(true)
    setAssignCarrierError('')
    try {
      const { data } = await api.post(`/orders/${id}/assign-carrier/`, { carrier_id: selectedCarrierId })
      if (data.carrier_warning) setAssignCarrierError(data.carrier_warning)
      fetchOrder(true)
    } catch (err) {
      setAssignCarrierError(err.response?.data?.detail || "Impossible d'attribuer ce transporteur.")
    } finally { setSavingCarrier(false) }
  }

  const downloadLabel = async () => {
    setLabelError('')
    setDownloadingLabel(true)
    try {
      const res = await api.get(`/orders/${id}/label/`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `etiquette-${id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      let detail = "Impossible de récupérer l'étiquette."
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          detail = JSON.parse(text).detail || detail
        } catch {}
      } else if (err.response?.data?.detail) {
        detail = err.response.data.detail
      }
      setLabelError(detail)
    } finally {
      setDownloadingLabel(false)
    }
  }

  // Livraison — toujours modifiable directement sur la page, sauvegarde
  // immédiate à chaque changement (pas de bouton "Enregistrer") : ville/
  // commune/point relais/frais, au cas où le client s'est trompé au
  // checkout ou pour attribuer manuellement une commande importée (Shopify).
  const [editWilaya,     setEditWilaya]     = useState('')
  const [editCommune,    setEditCommune]    = useState('')
  const [editStopDesk,   setEditStopDesk]   = useState(false)
  const [editRate,       setEditRate]       = useState(null) // {tarif, tarif_stopdesk} ou null
  const [editShipping,   setEditShipping]   = useState(0)
  const [editShippingEdited, setEditShippingEdited] = useState(false)
  const [editShippingLoading, setEditShippingLoading] = useState(false)
  const [editDesks,       setEditDesks]       = useState([])
  const [editDesksLoading, setEditDesksLoading] = useState(false)
  const [editStationCode, setEditStationCode]  = useState('')
  const [savingEdit,     setSavingEdit]     = useState(false)
  const [shippingError,  setShippingError]  = useState('')
  const shippingCostTimer = useRef(null)

  const defaultCarrier = carrierAccounts.find(a => a.is_default)

  const resetShippingFields = () => {
    if (!order) return
    setEditWilaya(order.wilaya)
    setEditCommune(order.commune)
    setEditStopDesk(order.stop_desk)
    setEditStationCode(order.station_code || '')
    setEditShipping(order.shipping_cost)
    setEditShippingEdited(false)
  }

  // Initialise les champs dès que la commande est (re)chargée.
  useEffect(() => { resetShippingFields() }, [order?.id, order?.updated_at])

  // Liste des bureaux réels dès que point relais + wilaya sont connus
  useEffect(() => {
    if (!defaultCarrier || !editWilaya || !editStopDesk) { setEditDesks([]); return }
    setEditDesksLoading(true)
    api.get(`/stores/me/carriers/${defaultCarrier.id}/desks/?wilaya=${encodeURIComponent(editWilaya)}`)
      .then(({ data }) => setEditDesks(data))
      .catch(() => setEditDesks([]))
      .finally(() => setEditDesksLoading(false))
  }, [defaultCarrier, editWilaya, editStopDesk])

  // Retente le vrai tarif du transporteur par défaut dès que la wilaya
  // change, sauf si le confirmateur a déjà tapé un montant à la main.
  useEffect(() => {
    if (!defaultCarrier || !editWilaya || editShippingEdited) return
    setEditShippingLoading(true)
    api.get(`/stores/me/carriers/${defaultCarrier.id}/rates/?wilaya=${encodeURIComponent(editWilaya)}`)
      .then(({ data }) => {
        setEditRate(data)
        setEditShipping(editStopDesk && data.tarif_stopdesk != null ? data.tarif_stopdesk : data.tarif)
      })
      .catch(() => setEditRate(null))
      .finally(() => setEditShippingLoading(false))
  }, [defaultCarrier, editWilaya, editShippingEdited])

  const persistShipping = async fields => {
    setSavingEdit(true)
    setShippingError('')
    try {
      await api.put(`/orders/${id}/`, fields)
      fetchOrder(true)
    } catch (err) {
      setShippingError(err.response?.data?.detail || "Impossible d'enregistrer.")
    } finally { setSavingEdit(false) }
  }

  const chooseWilaya = v => {
    setEditWilaya(v)
    setEditCommune('')
    // Pas de shipping_cost explicite : le serveur retente le vrai tarif
    // pour la nouvelle wilaya (voir _resolve_shipping_cost côté backend).
    persistShipping({ wilaya: v, commune: '' })
  }

  const chooseCommune = v => {
    setEditCommune(v)
    persistShipping({ commune: v })
  }

  // Bascule domicile/point relais : réapplique le tarif réel correspondant
  // si le montant n'a pas été modifié à la main, et sauvegarde tout de suite.
  const chooseStopDesk = value => {
    setEditStopDesk(value)
    const shipping = editRate && !editShippingEdited
      ? (value && editRate.tarif_stopdesk != null ? editRate.tarif_stopdesk : editRate.tarif)
      : editShipping
    if (editRate && !editShippingEdited) setEditShipping(shipping)
    persistShipping({ stop_desk: value, shipping_cost: shipping, station_code: value ? editStationCode : '' })
  }

  const chooseStationCode = v => {
    setEditStationCode(v)
    persistShipping({ station_code: v })
  }

  const changeShippingCost = value => {
    setEditShipping(value)
    setEditShippingEdited(true)
    clearTimeout(shippingCostTimer.current)
    shippingCostTimer.current = setTimeout(() => persistShipping({ shipping_cost: value }), 600)
  }

  // Changer statut
  const [newStatus,  setNewStatus]  = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [failureReasons, setFailureReasons] = useState([])
  const [failureReason,  setFailureReason]  = useState('')
  const showFailureReason = ['no_answer_1', 'no_answer_2', 'no_answer_3'].includes(newStatus)

  // Assignation
  const [newConfirmateur, setNewConfirmateur] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  const fetchOrder = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get(`/orders/${id}/`)
      .then(({ data }) => {
        setOrder(data)
        setNewStatus(data.status)
        setSelectedCarrierId(prev => prev || data.carrier || '')
      })
      .catch(() => { if (!silent) navigate('/dashboard/commandes') })
      .finally(() => { if (!silent) setLoading(false) })
  }, [id, navigate])

  useEffect(() => {
    fetchOrder()
    api.get('/team/members/?role=confirmateur').then(({ data }) => setConfirmateurs(data)).catch(() => {})
    api.get('/stores/me/carriers/').then(({ data }) => setCarrierAccounts(data.filter(a => a.is_active))).catch(() => {})
    api.get('/orders/failure-reasons/?active=1').then(({ data }) => setFailureReasons(data)).catch(() => {})
  }, [fetchOrder])

  const changeStatus = async () => {
    if (!newStatus || newStatus === order?.status) return
    setSavingStatus(true)
    setCarrierWarning('')
    try {
      const payload = { status: newStatus, note: statusNote }
      if (newStatus === 'confirmed' && selectedCarrierId) payload.carrier_id = selectedCarrierId
      const { data } = await api.post(`/orders/${id}/status/`, payload)
      if (data.carrier_warning) setCarrierWarning(data.carrier_warning)
      if (showFailureReason && failureReason) {
        await api.post(`/orders/${id}/call-attempts/`, { status: 'no_answer', failure_reason: failureReason, note: statusNote })
        setFailureReason('')
      }
      setStatusNote('')
      fetchOrder(true)
    } catch {} finally { setSavingStatus(false) }
  }

  const saveAssignment = async () => {
    if (!newConfirmateur) return
    setSavingAssign(true)
    try {
      await api.put(`/orders/${id}/assignment/`, { confirmateur: newConfirmateur })
      fetchOrder(true)
      setNewConfirmateur('')
    } catch {} finally { setSavingAssign(false) }
  }

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  if (loading) return (
    <DashboardLayout title="Commande">
      <div className="flex items-center justify-center gap-2 text-app-muted py-24">
        <svg className="w-5 h-5 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Chargement…
      </div>
    </DashboardLayout>
  )
  if (!order)  return null

  const initials = `${order.first_name?.[0] ?? ''}${order.last_name?.[0] ?? ''}`.toUpperCase() || '?'

  return (
    <DashboardLayout title={`Commande #${order.id}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <button onClick={() => navigate('/dashboard/commandes')}
          className="inline-flex items-center gap-1.5 text-sm text-app-muted-light hover:text-app-primary transition">
          <Icon path={ICONS.back} className="w-4 h-4" />
          Retour aux commandes
        </button>
        <StatusBadge status={order.status} label={order.status_label} />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Colonne principale ── */}
        <div className="flex-1 w-full space-y-5 min-w-0">

          {/* Infos client */}
          <div className="rounded-xl border p-5" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: '#7c3aed' }}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-app-primary truncate">{order.first_name} {order.last_name}</p>
                <p className="text-xs" style={{ color: theme.dark.muted }}>Commande #{order.id} · {new Date(order.created_at).toLocaleDateString('fr-DZ')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-4">
              <InfoTile icon={ICONS.phone} label="Téléphone" value={order.phone} />
              <InfoTile icon={ICONS.pin} label="Wilaya / Commune" value={`${order.wilaya}${order.commune ? ' · ' + order.commune : ''}`} />
              <InfoTile
                icon={ICONS.truck}
                label="Livraison"
                value={
                  order.carrier_label
                    ? order.carrier_label
                    : defaultCarrier
                      ? `${defaultCarrier.carrier_label} (par défaut)`
                      : order.delivery_type || 'Aucun transporteur configuré'
                }
              />
              <InfoTile icon={ICONS.cash} label="Paiement" value={order.payment_method_label || '—'} />
              {order.carrier_tracking_number && (
                <InfoTile icon={ICONS.shipping} label="Société de livraison" value={`${order.carrier_label} — ${order.carrier_tracking_number}`} highlight />
              )}
            </div>

            {order.carrier_tracking_number && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: theme.dark.border }}>
                <button onClick={downloadLabel} disabled={downloadingLabel} className={theme.btn.outline + ' text-sm disabled:opacity-60'}>
                  {downloadingLabel ? 'Téléchargement…' : 'Télécharger l\'étiquette'}
                </button>
                {labelError && <p className="text-red-400 text-xs mt-2">{labelError}</p>}
              </div>
            )}

            {order.note && (
              <div className="mt-4 pt-4 border-t flex items-start gap-2.5" style={{ borderColor: theme.dark.border }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
                  <Icon path={ICONS.note} className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: theme.dark.muted }}>Note</p>
                  <p className="text-sm text-app-primary">{order.note}</p>
                </div>
              </div>
            )}
          </div>

          {/* Articles — toujours modifiables directement (produit, variante,
              quantité, ajout/suppression), indépendamment de "Modifier". */}
          <SectionCard icon={ICONS.package} title={`Articles (${localItems.filter(i => !i._delete).length})`}>
            {canEditOrder && (
              <div className="relative mb-3">
                <input
                  value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setChangingRowKey(null) }}
                  placeholder="Rechercher un produit à ajouter…"
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition"
                  style={{ borderColor: theme.dark.border }}
                />
                {(itemResults.length > 0 || itemSearching) && !changingRowKey && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border overflow-hidden shadow-xl max-h-72 overflow-y-auto" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                    {itemSearching && <p className="px-4 py-3 text-xs text-app-muted">Recherche…</p>}
                    {itemResults.map(p => {
                      const options = (p.variants || []).flatMap(v => v.options || [])
                      return (
                        <div key={p.id} className="border-b last:border-0" style={{ borderColor: theme.dark.border }}>
                          {options.length === 0 && (
                            <button onClick={() => addProductToOrder(p)} className="w-full text-left px-4 py-2.5 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between">
                              <span>{p.name}</span>
                              <span className="text-violet-300 text-xs">{Number(p.price).toLocaleString('fr-DZ')} DZD</span>
                            </button>
                          )}
                          {options.map(opt => (
                            <button key={opt.id} onClick={() => addProductToOrder(p, opt)} className="w-full text-left px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between">
                              <span>{p.name} — {opt.value}</span>
                              <span className="text-violet-300 text-xs">{Number(opt.price ?? p.price).toLocaleString('fr-DZ')} DZD</span>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-120">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide border-b text-left" style={{ color: theme.dark.muted, borderColor: theme.dark.border }}>
                    <th className="pb-2.5 px-1 font-medium">Produit</th>
                    <th className="pb-2.5 px-1 font-medium text-right">Prix</th>
                    <th className="pb-2.5 px-1 font-medium text-center">Qté</th>
                    <th className="pb-2.5 px-1 font-medium text-right">Total</th>
                    {canEditOrder && <th className="pb-2.5 px-1 w-16"></th>}
                  </tr>
                </thead>
                <tbody>
                  {localItems.filter(i => !i._delete).map(item => (
                    <Fragment key={item._key}>
                      <tr className="border-b last:border-0 hover:bg-violet-500/5 transition" style={{ borderColor: theme.dark.borderRowHover }}>
                        <td className="py-3 px-1 text-app-primary font-medium">
                          {item.product_name}
                          {canEditOrder && (
                            <button onClick={() => { setChangingRowKey(k => k === item._key ? null : item._key); setItemSearch(''); setItemResults([]) }} className="ml-2 text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer">
                              {changingRowKey === item._key ? 'Annuler' : 'Changer'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-1 text-right text-app-muted-light">{Number(item.price).toLocaleString('fr-DZ')} DZD</td>
                        <td className="py-3 px-1 text-center">
                          {canEditOrder ? (
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => updateLocalQty(item._key, item.quantity - 1)}
                                className="w-6 h-6 rounded border text-app-muted-light hover:text-app-primary text-xs cursor-pointer" style={{ borderColor: theme.dark.border }}>−</button>
                              <span className="w-8 text-center text-app-primary">{item.quantity}</span>
                              <button type="button" onClick={() => updateLocalQty(item._key, item.quantity + 1)}
                                className="w-6 h-6 rounded border text-app-muted-light hover:text-app-primary text-xs cursor-pointer" style={{ borderColor: theme.dark.border }}>+</button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-md text-xs font-semibold bg-violet-500/10 text-app-primary">
                              {item.quantity}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-1 text-right text-app-primary font-semibold">
                          {(item.price * item.quantity).toLocaleString('fr-DZ')} DZD
                        </td>
                        {canEditOrder && (
                          <td className="py-3 px-1 text-center">
                            <button onClick={() => removeLocalItem(item._key)} className="text-red-400 hover:text-red-300 transition cursor-pointer" title="Retirer">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                      {changingRowKey === item._key && (
                        <tr>
                          <td colSpan={5} className="px-1 pb-3">
                            <div className="relative">
                              <input
                                value={itemSearch}
                                onChange={e => setItemSearch(e.target.value)}
                                placeholder="Rechercher le nouveau produit/variante…"
                                autoFocus
                                className="w-full px-3.5 py-2 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition"
                                style={{ borderColor: theme.dark.border }}
                              />
                              {(itemResults.length > 0 || itemSearching) && (
                                <div className="relative z-20 mt-1 rounded-lg border overflow-hidden shadow-xl max-h-60 overflow-y-auto" style={{ background: theme.dark.sidebar, borderColor: theme.dark.border }}>
                                  {itemSearching && <p className="px-4 py-3 text-xs text-app-muted">Recherche…</p>}
                                  {itemResults.map(p => {
                                    const options = (p.variants || []).flatMap(v => v.options || [])
                                    return (
                                      <div key={p.id} className="border-b last:border-0" style={{ borderColor: theme.dark.border }}>
                                        {options.length === 0 && (
                                          <button onClick={() => changeRowProduct(item._key, p)} className="w-full text-left px-4 py-2.5 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between">
                                            <span>{p.name}</span>
                                            <span className="text-violet-300 text-xs">{Number(p.price).toLocaleString('fr-DZ')} DZD</span>
                                          </button>
                                        )}
                                        {options.map(opt => (
                                          <button key={opt.id} onClick={() => changeRowProduct(item._key, p, opt)} className="w-full text-left px-4 py-2 text-sm text-app-primary hover:bg-violet-500/5 transition flex items-center justify-between">
                                            <span>{p.name} — {opt.value}</span>
                                            <span className="text-violet-300 text-xs">{Number(opt.price ?? p.price).toLocaleString('fr-DZ')} DZD</span>
                                          </button>
                                        ))}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {savingItems && <p className="mt-2 text-xs text-right" style={{ color: theme.dark.muted }}>Enregistrement…</p>}
            {itemsError && <p className="text-red-400 text-xs mt-2 text-right">{itemsError}</p>}
          </SectionCard>

          {/* Livraison — ville/commune/domicile-point relais/frais, toujours
              modifiables ici (pas dans un mode "Modifier" séparé). */}
          {canEditOrder && (
            <SectionCard icon={ICONS.truck} title="Livraison">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-app-muted-light mb-1.5">Wilaya</label>
                  <Select
                    value={editWilaya}
                    onChange={chooseWilaya}
                    options={WILAYAS.map(w => ({ value: w.name, label: `${w.id} — ${w.name}` }))}
                    className={inputCls}
                    style={{ ...bdrStyle, background: theme.dark.sidebar }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-app-muted-light mb-1.5">Commune</label>
                  <Select
                    value={editCommune}
                    onChange={chooseCommune}
                    options={getCommunesForWilaya(getWilayaIdByName(editWilaya)).map(name => ({ value: name, label: name }))}
                    placeholder={editWilaya ? 'Choisissez une commune' : "Choisissez d'abord une wilaya"}
                    disabled={!editWilaya}
                    className={inputCls}
                    style={{ ...bdrStyle, background: theme.dark.sidebar }}
                  />
                </div>
                {editRate && editRate.tarif_stopdesk != null && (
                  <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                    <label className={`flex items-center justify-between gap-2 cursor-pointer rounded-lg border px-3 py-2 text-xs transition ${!editStopDesk ? 'border-violet-500 bg-violet-500/10' : ''}`} style={{ borderColor: !editStopDesk ? undefined : theme.dark.border }}>
                      <span className="flex items-center gap-2 text-app-primary">
                        <input type="radio" name="edit_stop_desk" checked={!editStopDesk} onChange={() => chooseStopDesk(false)} className="accent-violet-600 w-3.5 h-3.5" />
                        À domicile
                      </span>
                      <span className="text-app-muted-light">{Number(editRate.tarif).toLocaleString('fr-DZ')} DZD</span>
                    </label>
                    <label className={`flex items-center justify-between gap-2 cursor-pointer rounded-lg border px-3 py-2 text-xs transition ${editStopDesk ? 'border-violet-500 bg-violet-500/10' : ''}`} style={{ borderColor: editStopDesk ? undefined : theme.dark.border }}>
                      <span className="flex items-center gap-2 text-app-primary">
                        <input type="radio" name="edit_stop_desk" checked={editStopDesk} onChange={() => chooseStopDesk(true)} className="accent-violet-600 w-3.5 h-3.5" />
                        Point relais
                      </span>
                      <span className="text-app-muted-light">{Number(editRate.tarif_stopdesk).toLocaleString('fr-DZ')} DZD</span>
                    </label>
                  </div>
                )}
                {editStopDesk && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-app-muted-light mb-1.5">Bureau de retrait</label>
                    <Select
                      value={editStationCode}
                      onChange={chooseStationCode}
                      options={editDesks.map(d => ({ value: d.code, label: `${d.name} — ${d.address}` }))}
                      placeholder={editDesksLoading ? 'Chargement des bureaux…' : editDesks.length ? 'Choisir un bureau' : 'Aucun bureau trouvé pour cette wilaya'}
                      disabled={editDesksLoading || editDesks.length === 0}
                      className={inputCls}
                      style={{ ...bdrStyle, background: theme.dark.sidebar }}
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs text-app-muted-light mb-1.5">Frais de livraison</label>
                  <input
                    type="number"
                    min="0"
                    value={editShipping}
                    onChange={e => changeShippingCost(e.target.value)}
                    className={inputCls}
                    style={bdrStyle}
                  />
                  {editShippingLoading && <p className="text-xs mt-1" style={{ color: theme.dark.muted }}>Récupération du tarif réel…</p>}
                  {!editShippingLoading && defaultCarrier && !editShippingEdited && (
                    <p className="text-xs mt-1 text-emerald-400">Tarif réel {defaultCarrier.carrier_label} pour {editWilaya}{editRate?.tarif_stopdesk != null ? (editStopDesk ? ' (point relais)' : ' (domicile)') : ''}</p>
                  )}
                  {editShippingEdited && (
                    <button type="button" onClick={() => setEditShippingEdited(false)} className="text-xs text-violet-400 hover:text-violet-300 transition cursor-pointer mt-1">
                      Revenir au tarif réel
                    </button>
                  )}
                  {editStopDesk && defaultCarrier?.carrier === 'noest' && !editStationCode && !editDesksLoading && editDesks.length > 0 && (
                    <p className="text-xs mt-1.5 text-amber-400">
                      ⚠️ Choisissez un bureau ci-dessus — Noest exige un bureau précis pour une livraison en point relais.
                    </p>
                  )}
                </div>
              </div>

              {savingEdit && <p className="text-xs mt-3" style={{ color: theme.dark.muted }}>Enregistrement…</p>}
              {shippingError && <p className="text-xs mt-3 text-red-400">{shippingError}</p>}
            </SectionCard>
          )}

          {/* Total — placé après Livraison pour refléter le frais de livraison à jour */}
          <SectionCard icon={ICONS.cash} title="Total">
            <div className="flex flex-col items-end gap-1.5 text-sm">
              <div className="flex justify-between w-full max-w-56">
                <span style={{ color: theme.dark.muted }}>Sous-total</span>
                <span className="text-app-primary">{localSubtotal.toLocaleString('fr-DZ')} DZD</span>
              </div>
              <div className="flex justify-between w-full max-w-56">
                <span style={{ color: theme.dark.muted }}>Livraison</span>
                <span className="text-app-primary">{Number(order.shipping_cost).toLocaleString('fr-DZ')} DZD</span>
              </div>
              <div className="flex justify-between w-full max-w-56 pt-1.5 mt-1 border-t" style={{ borderColor: theme.dark.border }}>
                <span className="text-app-primary font-medium">Total</span>
                <span className="text-white font-bold text-base">{(localSubtotal + Number(order.shipping_cost)).toLocaleString('fr-DZ')} DZD</span>
              </div>
            </div>
          </SectionCard>

          {/* Historique statuts */}
          <SectionCard icon={ICONS.status} title="Historique des statuts">
            {!order.history?.length ? (
              <p className="text-sm text-center py-6" style={{ color: theme.dark.muted }}>Aucun historique</p>
            ) : (
              <div className="relative space-y-5 pl-1">
                <div className="absolute left-1.75 top-2 bottom-2 w-px" style={{ background: theme.dark.border }} />
                {order.history.map(h => (
                  <div key={h.id} className="relative flex items-start gap-3 pl-6">
                    <div className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full ring-4 ${STATUS_DOT[h.status] || 'bg-(--text-muted)'}`}
                      style={{ boxShadow: `0 0 0 4px ${theme.dark.card}` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className={`text-sm font-medium ${STATUS_COLORS[h.status]?.split(' ')[1] || 'text-app-primary'}`}>{h.status_label}</span>
                        <span className="text-xs" style={{ color: theme.dark.muted }}>{new Date(h.changed_at).toLocaleString('fr-DZ')}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>par {h.changed_by_name}{h.note ? ` · ${h.note}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Colonne droite ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">

          {/* Changer statut */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
                <Icon path={ICONS.status} className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-app-primary">Changer le statut</h3>
            </div>
            <Select value={newStatus} onChange={setNewStatus} options={STATUS_CHOICES} className={inputCls + ' mb-2'} style={{ ...bdrStyle, background: theme.dark.sidebar }} />
            {showFailureReason && (
              <Select
                value={failureReason}
                onChange={setFailureReason}
                options={failureReasons.map(r => ({ value: r.id, label: r.label }))}
                placeholder={failureReasons.length ? 'Raison (optionnel)' : 'Aucune raison configurée'}
                disabled={failureReasons.length === 0}
                className={inputCls + ' mb-2'}
                style={{ ...bdrStyle, background: theme.dark.sidebar }}
              />
            )}
            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} rows={2} className={`${inputCls} resize-none mb-3`} style={bdrStyle} placeholder="Note (optionnel)" />
            <button onClick={changeStatus} disabled={savingStatus || newStatus === order.status} className={theme.btn.primary + ' w-full'}>
              {savingStatus ? '…' : 'Appliquer'}
            </button>
            {carrierWarning && (
              <p className="mt-2.5 text-xs text-amber-400 flex items-start gap-1.5">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {carrierWarning}
              </p>
            )}
          </div>

          {/* Société de livraison — permanente, pas cachée dans "Modifier"
              ni liée à un changement de statut : nécessaire pour attribuer
              manuellement un transporteur aux commandes importées (Shopify)
              qui arrivent sans transporteur. */}
          {canEditOrder && (
            <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
                  <Icon path={ICONS.shipping} className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-app-primary">Société de livraison</h3>
              </div>
              <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: theme.dark.sidebar }}>
                <p className="text-sm text-violet-300 font-medium">
                  {order.carrier_label || <span style={{ color: theme.dark.muted }}>Non attribuée</span>}
                </p>
                {order.carrier_tracking_number && <p className="text-xs mt-0.5" style={{ color: theme.dark.muted }}>Tracking : {order.carrier_tracking_number}</p>}
                {order.carrier_status && order.carrier_status !== 'created' && (
                  <p className="text-xs mt-1 text-emerald-400">Dernier statut transporteur : {order.carrier_status}</p>
                )}
              </div>
              <Select
                value={selectedCarrierId}
                onChange={setSelectedCarrierId}
                options={carrierAccounts.map(a => ({ value: a.id, label: a.carrier_label }))}
                placeholder="Choisir une société de livraison"
                className={inputCls + ' mb-2'}
                style={{ ...bdrStyle, background: theme.dark.sidebar }}
              />
              <button onClick={assignCarrier} disabled={savingCarrier || !selectedCarrierId} className={theme.btn.primary + ' w-full'}>
                {savingCarrier ? '…' : order.carrier_tracking_number ? 'Réattribuer' : 'Attribuer'}
              </button>
              {assignCarrierError && <p className="mt-2 text-xs text-red-400">{assignCarrierError}</p>}
            </div>
          )}

          {/* Assignation — visible pour tous, modifiable uniquement par owner/admin */}
          <div className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', color: '#8b5cf6' }}>
                <Icon path={ICONS.team} className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-app-primary">Confirmateur assigné</h3>
            </div>
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: theme.dark.sidebar }}>
              <p className="text-sm text-violet-300 font-medium">
                {order.assignment?.confirmateur_name || <span style={{ color: theme.dark.muted }}>Non assigné</span>}
              </p>
            </div>
            {!isConfirmateur && (
              <>
                <Select
                  value={newConfirmateur}
                  onChange={setNewConfirmateur}
                  options={confirmateurs.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))}
                  placeholder="Choisir un confirmateur"
                  className={inputCls + ' mb-2'}
                  style={{ ...bdrStyle, background: theme.dark.sidebar }}
                />
                <button onClick={saveAssignment} disabled={savingAssign || !newConfirmateur} className={theme.btn.primary + ' w-full'}>
                  {savingAssign ? '…' : 'Assigner'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
