import DashboardLayout from '../components/DashboardLayout'
import { theme } from '../theme'

export default function ContactPage() {
  return (
    <DashboardLayout title="Contactez-nous" subtitle="Une question, un problème technique, une suggestion ? Écrivez-nous.">
      <div className="rounded-xl border p-6 max-w-md" style={{ background: theme.dark.card, borderColor: theme.dark.border }}>
        <p className="text-sm text-app-primary mb-1">Support MZSolutions</p>
        <a href="mailto:mzsolutions31@gmail.com" className="text-sm text-violet-400 hover:text-violet-300 transition">
          mzsolutions31@gmail.com
        </a>
        <p className="text-xs mt-4" style={{ color: theme.dark.muted }}>
          Cette page sera enrichie prochainement (formulaire de contact, chat en direct).
        </p>
      </div>
    </DashboardLayout>
  )
}
