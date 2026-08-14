import DOMPurify from 'dompurify'

// Epic 8.6 — le contenu des pages boutique (RichEditor/TipTap) était injecté
// sans aucune sanitisation via dangerouslySetInnerHTML, exposant tous les
// visiteurs de la boutique publique à une XSS stockée si un compte vendeur
// était compromis ou si le champ était modifié directement via l'API.
// Liste blanche alignée sur ce que TipTap StarterKit + Image/TextAlign/Youtube
// peuvent produire et sur le CSS `.sf-prose` (index.css) — aucun script, ni
// gestionnaire d'événement `on*`. `iframe` est autorisé UNIQUEMENT pour les
// intégrations YouTube (voir le hook ci-dessous qui retire tout iframe dont
// le src ne pointe pas vers youtube.com/youtube-nocookie.com — sinon un
// iframe accepterait n'importe quelle origine, bien plus dangereux qu'un tag
// `style` sur un <p>).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 's', 'h1', 'h2', 'h3',
  'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'hr', 'iframe']
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'style', 'class',
  'width', 'height', 'frameborder', 'allow', 'allowfullscreen']

const YOUTUBE_EMBED_RE = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com)\/embed\//

if (!DOMPurify.__mzYoutubeHookAdded) {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = node.getAttribute && node.getAttribute('src')
      if (!src || !YOUTUBE_EMBED_RE.test(src)) node.remove()
    }
  })
  DOMPurify.__mzYoutubeHookAdded = true
}

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR })
}
