import DashboardLayout from '../components/DashboardLayout'
import EmptyState from '../components/EmptyState'

export default function FaqPage() {
  return (
    <DashboardLayout title="FAQ" subtitle="Questions fréquentes sur l'utilisation de MZSolutions.">
      <EmptyState
        title="Contenu à venir"
        description="Cette page sera remplie prochainement avec les questions les plus fréquentes de nos vendeurs."
      />
    </DashboardLayout>
  )
}
