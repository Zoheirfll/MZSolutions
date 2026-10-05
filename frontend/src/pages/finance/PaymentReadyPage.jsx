import PaymentsPage from './PaymentsPage'
import { useTranslation } from 'react-i18next'

export default function PaymentReadyPage() {
  const { t } = useTranslation('dashboard')
  return <PaymentsPage state="ready" title={t('Paiement prêt')} />
}
