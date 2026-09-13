import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, ImageOff, FileImage, Sparkles, X, Package, Receipt } from 'lucide-react'
import DashboardLayout from '../../components/DashboardLayout'
import { theme } from '../../theme'
import { scanProduct } from '../../api/aiApi'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function ModeCard({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-app bg-app-card-alt/40 p-4">
      <div className="w-9 h-9 rounded-lg bg-violet-600/15 text-violet-400 flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-sm font-medium text-app-primary">{title}</p>
        <p className="text-xs text-app-muted mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export default function ScanProductPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const acceptFile = useCallback((f) => {
    if (!f) return
    setError('')
    setFile(f)
    setPreviewUrl(url => {
      if (url) URL.revokeObjectURL(url)
      return f.type.startsWith('image/') ? URL.createObjectURL(f) : null
    })
  }, [])

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = e => {
    e.preventDefault()
    setDragOver(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

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
    <DashboardLayout title="Scanner un produit" subtitle="Laissez l'IA remplir la fiche produit à votre place à partir d'une photo.">
      <div className="max-w-2xl space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <ModeCard icon={Package} title="Photo d'un seul article"
            description="La fiche produit s'ouvre déjà remplie (nom, prix, description) — il ne vous reste qu'à vérifier et enregistrer." />
          <ModeCard icon={Receipt} title="Facture ou catalogue fournisseur"
            description="Chaque ligne détectée devient un brouillon à valider, un par un ou en lot." />
        </div>

        <div className="rounded-xl border border-app bg-app-card p-5 space-y-4">
          {!file ? (
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors duration-150 ${
                dragOver ? 'border-violet-500 bg-violet-500/5' : 'border-app hover:border-violet-500/40 hover:bg-violet-500/5'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-violet-600/15 text-violet-400 flex items-center justify-center">
                <UploadCloud size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-app-primary">Glissez une image ici, ou cliquez pour choisir un fichier</p>
                <p className="text-xs text-app-muted mt-1">JPG, PNG ou WEBP — 5 Mo maximum</p>
              </div>
              <input ref={inputRef} type="file" accept="image/*" aria-label="Choisir une image"
                onChange={e => acceptFile(e.target.files?.[0])}
                className="sr-only" />
            </label>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-app bg-app-card-alt/40 p-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-app-card-alt flex items-center justify-center shrink-0">
                {previewUrl
                  ? <img src={previewUrl} alt="Aperçu" className="w-full h-full object-cover" />
                  : <ImageOff size={20} className="text-app-muted" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-app-primary truncate flex items-center gap-1.5">
                  <FileImage size={14} className="shrink-0 text-app-muted" /> {file.name}
                </p>
                <p className="text-xs text-app-muted mt-0.5">{formatSize(file.size)}</p>
              </div>
              <button type="button" onClick={clearFile} disabled={busy} aria-label="Retirer le fichier"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-app-muted hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 shrink-0">
                <X size={15} />
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="button" disabled={!file || busy} onClick={handleAnalyze}
            className={theme.btn.primary + ' text-sm w-full sm:w-auto disabled:opacity-40 flex items-center justify-center gap-2'}>
            {busy
              ? <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Analyse en cours…
                </>
              : <>
                  <Sparkles size={15} />
                  Analyser avec l'IA
                </>}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
