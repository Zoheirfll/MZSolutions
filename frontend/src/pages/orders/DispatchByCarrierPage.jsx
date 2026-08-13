import DispatchRulesPage from './DispatchRulesPage'

export default function DispatchByCarrierPage() {
  return (
    <DispatchRulesPage
      title="Dispatch par société de livraison"
      subtitle="Routez automatiquement les commandes contenant un produit précis vers un transporteur donné, plutôt que le transporteur par défaut."
      matchType="product"
      matchLabel="Produit"
      allowCarrier
    />
  )
}
