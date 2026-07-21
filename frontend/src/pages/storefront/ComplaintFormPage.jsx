import { useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import StorefrontLayout from './StorefrontLayout'
import publicApi from '../../api/publicApi'
import { theme } from '../../theme'

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function ComplaintFormPage() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()

  const [form, setForm] = useState({
    order_id: searchParams.get('order') || '',
    phone: '',
    subject: '',
    description: '',
  })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [sent, setSent]             = useState(false)
  const [attachment, setAttachment] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('store_slug', slug)
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (attachment) fd.append('attachment', attachment)
      await publicApi.post('/complaints/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || "Une erreur est survenue lors de l'envoi.")
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <StorefrontLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <div className={`${theme.badge.success} inline-flex! w-16! h-16! rounded-full! p-0! items-center justify-center mb-4`}>
            <CheckIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Réclamation envoyée</h1>
          <p className="text-gray-500 mb-6">Nous avons bien reçu votre réclamation. Le vendeur vous recontactera au sujet de votre commande la plus récente associée à ce numéro.</p>
          <Link to={`/store/${slug}`} className={theme.btn.primary}>
            Retour à la boutique
          </Link>
        </div>
      </StorefrontLayout>
    )
  }

  return (
    <StorefrontLayout>
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Déposer une réclamation</h1>
        <p className="text-sm text-gray-500 mb-8">Un problème avec votre commande ? Indiquez votre téléphone (celui utilisé à la commande) — aucun compte n'est nécessaire. Nous associerons automatiquement votre commande la plus récente, sauf si vous précisez son numéro ci-dessous.</p>

        <form onSubmit={handleSubmit} className={`${theme.panel} space-y-4`}>
          <div>
            <label className={theme.label}>Téléphone utilisé pour la commande *</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required
              className={theme.input} placeholder="+213…" />
          </div>
          <div>
            <label className={theme.label}>Numéro de commande (optionnel)</label>
            <input value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}
              className={theme.input} placeholder="Laissez vide si vous ne le connaissez pas" />
          </div>
          <div>
            <label className={theme.label}>Sujet *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required
              className={theme.input} placeholder="Ex. Produit endommagé" />
          </div>
          <div>
            <label className={theme.label}>Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={5}
              className={theme.input} placeholder="Décrivez le problème rencontré…" />
          </div>
          <div>
            <label className={theme.label}>Photo (optionnel)</label>
            <input type="file" accept="image/*" onChange={e => setAttachment(e.target.files?.[0] || null)} className={theme.input} />
          </div>

          {error && <p className={theme.errorText}>{error}</p>}

          <button type="submit" disabled={saving} className={`${theme.btn.primary} w-full`}>
            {saving ? 'Envoi…' : 'Envoyer la réclamation'}
          </button>
        </form>
      </div>
    </StorefrontLayout>
  )
}
