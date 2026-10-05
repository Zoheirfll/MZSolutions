import PaymentsPage from './PaymentsPage'
import { useTranslation } from 'react-i18next'

export default function PaymentCollectedPage() {
  const { t } = useTranslation('dashboard')
  return <PaymentsPage state="collected" title={t('Paiement récupéré')} />
}
