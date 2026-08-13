import { useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import Toast from '../../components/Toast'
import api from '../../api/axios'
import { theme } from '../../theme'

// Import du rapport de versement transporteur (xlsx) — aucun format standard
// entre transporteurs, détection heuristique des colonnes côté serveur
// (PaymentsExcelImportView). Pointe automatiquement les commandes trouvées
// comme "récupérées" (Order.payment_collected_at).
export default function PaymentsExcelUploadPage() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState(null)

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/finance/payments/import-excel/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(data)
      setToast({ type: 'success', message: `${data.matched} commande(s) rapprochée(s) et marquée(s) comme récupérée(s).` })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || "Échec de l'import." })
    } finally { setUploading(false) }
  }

  return (
    <DashboardLayout title="Importer un fichier Excel" subtitle="Importez le rapport de versement (Excel) fourni par votre transporteur — les commandes livrées sont automatiquement rapprochées par numéro de suivi et marquées comme récupérées dans « Paiement récupéré ».">
      <div className="rounded-xl border p-6 sm:p-8 max-w-lg" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <h2 className="font-semibold text-app-primary mb-1">Rapport de paiement transporteur</h2>
        <p className="text-xs mb-5" style={{ color: theme.dark.muted }}>
          Le fichier doit contenir au moins une colonne de numéro de suivi (« tracking », « suivi », « colis »…) et idéalement une colonne de montant.
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 mb-4 cursor-pointer hover:border-violet-500/40 transition"
          style={{ borderColor: theme.dark.border }}>
          <svg className="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 3v4a1 1 0 001 1h4" /><path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-app-primary">{file ? file.name : <>Glissez un fichier ou <span className="text-violet-400">parcourir</span></>}</p>
          <p className="text-xs" style={{ color: theme.dark.muted }}>XLSX, XLS</p>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>

        <button onClick={upload} disabled={!file || uploading} className={theme.btn.primary + ' w-full cursor-pointer disabled:opacity-50'}>
          {uploading ? 'Traitement…' : 'Importer'}
        </button>

        {result && (
          <div className="mt-5 rounded-lg p-4 text-sm" style={{ background: theme.dark.cardAlt }}>
            <p className="text-emerald-400">{result.matched} commande(s) rapprochée(s)</p>
            {result.unmatched > 0 && <p className="text-amber-400 mt-1">{result.unmatched} ligne(s) sans commande correspondante</p>}
            <p className="text-app-primary mt-1">Montant total : {Number(result.total_amount).toLocaleString('fr-DZ')} DZD</p>
          </div>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </DashboardLayout>
  )
}
