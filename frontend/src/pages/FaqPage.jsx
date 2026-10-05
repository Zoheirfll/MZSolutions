import DashboardLayout from '../components/DashboardLayout'
import EmptyState from '../components/EmptyState'
import { useTranslation } from 'react-i18next'

export default function FaqPage() {
  const { t } = useTranslation('dashboard')
  return (
    <DashboardLayout title={t('FAQ')} subtitle={t('Questions fréquentes sur l\'utilisation de MZSolutions.')}>
      <EmptyState
        title={t('Contenu à venir')}
        description={t('Cette page sera remplie prochainement avec les questions les plus fréquentes de nos vendeurs.')}
      />
    </DashboardLayout>
  )
}
