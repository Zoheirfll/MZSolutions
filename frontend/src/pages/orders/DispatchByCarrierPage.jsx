import DispatchRulesPage from './DispatchRulesPage'
import { useTranslation } from 'react-i18next'

export default function DispatchByCarrierPage() {
  const { t } = useTranslation('dashboard')
  return (
    <DispatchRulesPage
      title={t('Dispatch par société de livraison')}
      subtitle={t('Routez automatiquement les commandes contenant un produit précis vers un transporteur donné, plutôt que le transporteur par défaut.')}
      matchType="product"
      matchLabel="Produit"
      allowCarrier
    />
  )
}
