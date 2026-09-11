import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import { theme } from '../../theme'
import { scanProduct } from '../../api/aiApi'

export default function ScanProductPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const result = await scanProduct(file)
      if (result.type === 'invoice') {
        navigate('/dashboard/produits/brouillons-ia')
      } else {
        const data = result.draft.extracted_data
        navigate('/dashboard/produits/nouveau', {
          state: { prefill: { name: data.name || '', price: data.price ?? '', description: data.description || '' } },
        })
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Assistant IA indisponible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout title="Scanner un produit" subtitle="Photo d'un seul article, ou d'une facture/catalogue fournisseur listant plusieurs articles.">
      <div className="max-w-md space-y-4 rounded-xl border border-app bg-app-card p-5">
        <label className="block text-sm font-medium text-app-primary">
          Choisir une image
          <input type="file" accept="image/*" aria-label="Choisir une image"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="mt-2 block w-full text-sm text-app-muted-light" />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="button" disabled={!file || busy} onClick={handleAnalyze}
          className={theme.btn.primary + ' text-sm disabled:opacity-40'}>
          {busy ? 'Analyse en cours…' : 'Analyser'}
        </button>
      </div>
    </DashboardLayout>
  )
}
