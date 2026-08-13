import DispatchRulesPage from './DispatchRulesPage'

export default function DispatchByConfirmateurPage() {
  return (
    <DispatchRulesPage
      title="Dispatch par confirmateur"
      subtitle="Routez automatiquement les commandes contenant un produit précis vers un confirmateur donné, plutôt que le round-robin habituel."
      matchType="product"
      matchLabel="Produit"
      allowConfirmateur
    />
  )
}
