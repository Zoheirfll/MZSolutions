import DOMPurify from 'dompurify'

// Epic 8.6 — le contenu des pages boutique (RichEditor/TipTap) était injecté
// sans aucune sanitisation via dangerouslySetInnerHTML, exposant tous les
// visiteurs de la boutique publique à une XSS stockée si un compte vendeur
// était compromis ou si le champ était modifié directement via l'API.
// Liste blanche alignée sur ce que TipTap StarterKit peut produire et sur le
// CSS `.sf-prose` (StorefrontPagePage.jsx) — aucun script, iframe, ou
// gestionnaire d'événement `on*`.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3',
  'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'hr']
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt']

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR })
}
