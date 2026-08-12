import { useState } from 'react'
import api from '../api/axios'
import { theme } from '../theme'

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  )
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

// Bloquer un numéro (ou modifier le message d'une entrée existante) —
// réutilisé par BlacklistPage (ajout/édition) ainsi que ClientsPage et
// AtRiskCustomersPage (blocage direct depuis la liste, téléphone pré-rempli).
export default function BlockPhoneModal({ entry, initialPhone, onClose, onSaved }) {
  const isEdit = !!entry
  const [form, setForm] = useState({ phone: entry?.phone || initialPhone || '', message: entry?.message || '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const inputCls = 'w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent outline-none focus:border-violet-500 transition [color-scheme:dark]'
  const bdrStyle = { borderColor: theme.dark.border }

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      if (isEdit) await api.put(`/orders/blacklist/${entry.id}/`, { message: form.message })
      else await api.post('/orders/blacklist/', form)
      onSaved()
    } catch (err) {
      setErrors(err.response?.data || {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border p-6" style={{ background: theme.dark.card, borderColor: theme.dark.border }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-app-primary">{isEdit ? 'Modifier le message' : 'Bloquer un numéro de téléphone'}</h3>
          <button onClick={onClose} className="text-app-muted hover:text-app-primary transition cursor-pointer"><CloseIcon /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Message</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3}
              className={`${inputCls} resize-none`} style={bdrStyle}
              placeholder="Entrez un message que vous devez montrer au client" />
          </div>
          <div>
            <label className="block text-xs text-app-muted-light mb-1.5">Numéro de téléphone *</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required
              disabled={isEdit} className={inputCls + (isEdit ? ' opacity-60' : '')} style={bdrStyle} placeholder="Entrez un numéro de téléphone à bloquer" />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-app-muted-light hover:text-app-primary cursor-pointer transition">Fermer</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 cursor-pointer transition flex items-center gap-1.5">
              <ShieldIcon /> {saving ? '…' : isEdit ? 'Enregistrer' : 'Bloquer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
