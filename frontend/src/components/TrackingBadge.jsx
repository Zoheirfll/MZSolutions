import { useState } from 'react'
import { theme } from '../theme'

function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  )
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

// Code de suivi transporteur — colonne "SUIVI" façon RiseCart, réutilisée
// partout où une commande peut apparaître (liste commandes, échanges,
// échecs...). "Non attribué" tant qu'aucune expédition n'a été créée
// (`Order.carrier_tracking_number` vide).
export default function TrackingBadge({ trackingNumber, carrierLabel }) {
  const [copied, setCopied] = useState(false)

  if (!trackingNumber) {
    return <span className={theme.badge.neutral}>Non attribué</span>
  }

  const copy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(trackingNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <button
      onClick={copy}
      title={carrierLabel ? `${carrierLabel} — cliquer pour copier` : 'Cliquer pour copier'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition cursor-pointer
        ${copied ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/10 text-app-primary hover:bg-violet-500/15'}`}
    >
      <span className="max-w-32 truncate">{trackingNumber}</span>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
