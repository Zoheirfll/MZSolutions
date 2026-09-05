import DOMPurify from 'dompurify'

// Rendu markdown minimal pour les réponses de l'Assistant IA — pas de lib
// externe (aucune dans le projet), juste ce qu'un modèle produit couramment
// (gras, italique, code inline/bloc, listes, liens, paragraphes). Sanitisé
// séparément de lib/sanitize.js (contexte de confiance différent : sortie
// modèle, pas contenu éditeur WYSIWYG) — jamais de balise `style`/`iframe` ici.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote']
const ALLOWED_ATTR = ['href', 'target', 'rel']

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
  return out
}

export function renderMarkdown(text) {
  const src = text || ''
  const blocks = src.split(/```([\s\S]*?)```/)
  let html = ''
  blocks.forEach((block, i) => {
    if (i % 2 === 1) {
      html += `<pre><code>${escapeHtml(block.trim())}</code></pre>`
      return
    }
    const lines = block.split('\n')
    let listBuffer = []
    let listType = null
    const flushList = () => {
      if (listBuffer.length) {
        html += `<${listType}>${listBuffer.map(li => `<li>${inline(li)}</li>`).join('')}</${listType}>`
        listBuffer = []
        listType = null
      }
    }
    lines.forEach(line => {
      const trimmed = line.trim()
      const bullet = trimmed.match(/^[-*]\s+(.*)/)
      const numbered = trimmed.match(/^\d+[.)]\s+(.*)/)
      if (bullet) {
        if (listType && listType !== 'ul') flushList()
        listType = 'ul'
        listBuffer.push(bullet[1])
      } else if (numbered) {
        if (listType && listType !== 'ol') flushList()
        listType = 'ol'
        listBuffer.push(numbered[1])
      } else {
        flushList()
        if (trimmed) html += `<p>${inline(trimmed)}</p>`
      }
    })
    flushList()
  })
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
