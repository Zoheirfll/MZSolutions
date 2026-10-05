import DispatchRulesPage from './DispatchRulesPage'
import { useTranslation } from 'react-i18next'

export default function DispatchByWilayaPage() {
  const { t } = useTranslation('dashboard')
  return (
    <DispatchRulesPage
      title={t('Dispatch par wilaya')}
      subtitle={t('Routez automatiquement les commandes d\'une wilaya précise vers un confirmateur et/ou un transporteur donné.')}
      matchType="wilaya"
      matchLabel="Wilaya"
      allowConfirmateur
      allowCarrier
    />
  )
}
