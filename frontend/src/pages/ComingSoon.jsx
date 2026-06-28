import DashboardLayout from '../components/DashboardLayout'
import { theme } from '../theme'

export default function ComingSoon({ title = 'Bientôt disponible' }) {
  return (
    <DashboardLayout title={title}>
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="text-center">
          <p className="text-5xl mb-4">🚀</p>
          <p className="text-lg font-semibold text-gray-300 mb-2">{title}</p>
          <p className="text-sm" style={{ color: theme.dark.muted }}>Cette section sera disponible dans un prochain sprint.</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
