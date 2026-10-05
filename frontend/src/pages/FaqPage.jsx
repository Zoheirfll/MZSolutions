import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import EmptyState from '../components/EmptyState'
import api from '../api/axios'
import { theme } from '../theme'
import { useTranslation } from 'react-i18next'

export default function FaqPage() {
  const { t } = useTranslation('dashboard')
  const [items, setItems] = useState([])

  useEffect(() => {
    Promise.resolve().then(() => api.get('/support/faq/'))
      .then((res) => { if (Array.isArray(res?.data)) setItems(res.data) }).catch(() => {})
  }, [])

  return (
    <DashboardLayout title={t('FAQ')} subtitle={t('Questions fréquentes sur l\'utilisation de MZSolutions.')}>
      {items.length === 0 ? (
        <EmptyState
          title={t('Contenu à venir')}
          description={t('Cette page sera remplie prochainement avec les questions les plus fréquentes de nos vendeurs.')}
        />
      ) : (
        <div className="space-y-2 max-w-3xl">
          {items.map((f) => (
            <details key={f.id} className="rounded-xl border p-4" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
              <summary className="text-sm font-medium text-app-primary cursor-pointer">{f.question}</summary>
              <p className="text-sm text-app-muted-light mt-2 whitespace-pre-line">{f.answer}</p>
            </details>
          ))}
        </div>
      )}
    </DashboardLayout>
  )
}
