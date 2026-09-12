import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import EmptyState from '../../components/EmptyState'
import Toast from '../../components/Toast'
import { theme } from '../../theme'
import { listProductDrafts, createProductFromDraft, discardProductDraft } from '../../api/aiApi'

export default function ProductDraftsPage() {
  const [drafts, setDrafts] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const refresh = useCallback(() => {
    setLoading(true)
    listProductDrafts().then(setDrafts).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleCreateSelected = async () => {
    setBusy(true)
    for (const id of selected) {
      try { await createProductFromDraft(id) } catch { /* best-effort, on continue les autres */ }
    }
    setBusy(false)
    setSelected([])
    setToast({ message: 'Produits créés à partir des brouillons sélectionnés.' })
    refresh()
  }

  const handleDiscard = async id => {
    try { await discardProductDraft(id) } catch { /* best-effort */ }
    refresh()
  }

  return (
    <DashboardLayout title="Brouillons de produits (IA)" subtitle="Issus d'un scan de facture ou de catalogue fournisseur — validez avant création.">
      {loading ? (
        <p className="text-sm text-app-muted">Chargement…</p>
      ) : drafts.length === 0 ? (
        <EmptyState title="Aucun brouillon en attente" description="Scannez une photo de produit ou une facture fournisseur pour en générer." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-app bg-app-card divide-y divide-app">
            {drafts.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-app-primary">{d.extracted_data.name}</p>
                  <p className="text-xs text-app-muted">{d.extracted_data.price} DA{d.extracted_data.category ? ` — ${d.extracted_data.category}` : ''}</p>
                </div>
                <button type="button" aria-label="Rejeter ce brouillon" onClick={() => handleDiscard(d.id)}
                  className="text-xs text-app-muted hover:text-red-400 transition">
                  Rejeter
                </button>
              </div>
            ))}
          </div>
          <button type="button" disabled={busy || selected.length === 0} onClick={handleCreateSelected}
            className={theme.btn.primary + ' text-sm disabled:opacity-40'}>
            Créer les produits sélectionnés ({selected.length})
          </button>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
