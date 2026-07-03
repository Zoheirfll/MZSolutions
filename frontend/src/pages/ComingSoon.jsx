import DashboardLayout from '../components/DashboardLayout'
import { theme } from '../theme'

export default function ComingSoon({ title = 'Bientôt disponible' }) {
  return (
    <DashboardLayout title={title}>
      <div className="flex items-center justify-center h-full min-h-64 px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-600/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-200 mb-2">{title}</p>
          <p className="text-sm" style={{ color: theme.dark.muted }}>Cette section sera disponible dans un prochain sprint.</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
