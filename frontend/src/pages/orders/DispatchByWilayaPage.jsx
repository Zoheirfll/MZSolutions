import DispatchRulesPage from './DispatchRulesPage'

export default function DispatchByWilayaPage() {
  return (
    <DispatchRulesPage
      title="Dispatch par wilaya"
      subtitle="Routez automatiquement les commandes d'une wilaya précise vers un confirmateur et/ou un transporteur donné."
      matchType="wilaya"
      matchLabel="Wilaya"
      allowConfirmateur
      allowCarrier
    />
  )
}
