import { useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import api from '../api/axios'
import Toast from '../components/Toast'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

// Formulaire de contact vers l'équipe MZSolutions. Le message est rattaché à la
// boutique (l'équipe sait de qui il s'agit). 5 messages par heure maximum.
export default function ContactPage() {
  const { t } = useTranslation('dashboard')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)

  const send = async (e) => {
    e.preventDefault()
    setSending(true)
    try {
      await api.post('/support/contact/', { subject, body })
      setToast({ type: 'success', message: t('Message envoyé. Nous vous répondrons par email.') })
      setSubject('')
      setBody('')
    } catch (err) {
      const status = err.response?.status
      setToast({
        type: 'error',
        message: status === 429 ? t('Trop de messages envoyés. Réessayez dans une heure.')
          : status === 403 ? t('Seul le propriétaire ou un administrateur de la boutique peut écrire au support.')
          : err.response?.data?.detail || t('Envoi impossible.'),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <DashboardLayout title={t('Contactez-nous')} subtitle={t('Une question, un problème technique, une suggestion ? Écrivez-nous.')}>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={send} className="rounded-xl border p-6 max-w-xl space-y-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <div>
          <label htmlFor="contact-subject" className="block text-sm text-app-primary mb-1">{t('Sujet')}</label>
          <input id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required className={`${theme.inputDark} w-full`} />
        </div>
        <div>
          <label htmlFor="contact-body" className="block text-sm text-app-primary mb-1">{t('Message')}</label>
          <textarea id="contact-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={6} required className={`${theme.inputDark} w-full`} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <a href="mailto:mzsolutions31@gmail.com" className="text-xs text-violet-400 hover:text-violet-300 transition">{t('Ou écrivez à mzsolutions31@gmail.com')}</a>
          <button type="submit" disabled={sending || !subject.trim() || !body.trim()} className={theme.btn.primary}>{t('Envoyer')}</button>
        </div>
      </form>
    </DashboardLayout>
  )
}
