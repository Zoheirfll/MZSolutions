import DispatchRulesPage from './DispatchRulesPage'
import { useTranslation } from 'react-i18next'

export default function DispatchByConfirmateurPage() {
  const { t } = useTranslation('dashboard')
  return (
    <DispatchRulesPage
      title={t('Dispatch par confirmateur')}
      subtitle={t('Routez automatiquement les commandes contenant un produit précis vers un confirmateur donné, plutôt que le round-robin habituel.')}
      matchType="product"
      matchLabel="Produit"
      allowConfirmateur
    />
  )
}
