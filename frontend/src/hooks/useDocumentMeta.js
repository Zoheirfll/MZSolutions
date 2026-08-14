import { useEffect } from 'react'

function setMeta(selector, attr, value, createTag) {
  let tag = document.querySelector(selector)
  const previous = tag?.getAttribute('content')
  const created = !tag
  if (!value) {
    if (tag && created === false && previous == null) return () => {}
  }
  if (!tag) {
    if (!value) return () => {}
    tag = createTag()
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', value || '')
  return () => {
    if (created) tag.remove()
    else if (previous != null) tag.setAttribute('content', previous)
  }
}

// Balises <title>/<meta description>/robots/keywords/Open Graph/Twitter Card —
// pas de librairie type react-helmet dans ce projet, manipulation directe du
// DOM + restauration au démontage. `extra` (optionnel) : { robots, keywords, ogImage, twitterImage }.
export default function useDocumentMeta(title, description, extra = {}) {
  const { robots, keywords, ogImage, twitterImage } = extra
  useEffect(() => {
    if (!title) return
    const previousTitle = document.title
    document.title = title

    const cleanups = [
      setMeta('meta[name="description"]', 'content', description, () => {
        const t = document.createElement('meta'); t.setAttribute('name', 'description'); return t
      }),
      setMeta('meta[name="robots"]', 'content', robots, () => {
        const t = document.createElement('meta'); t.setAttribute('name', 'robots'); return t
      }),
      setMeta('meta[name="keywords"]', 'content', keywords, () => {
        const t = document.createElement('meta'); t.setAttribute('name', 'keywords'); return t
      }),
      setMeta('meta[property="og:title"]', 'content', title, () => {
        const t = document.createElement('meta'); t.setAttribute('property', 'og:title'); return t
      }),
      setMeta('meta[property="og:description"]', 'content', description, () => {
        const t = document.createElement('meta'); t.setAttribute('property', 'og:description'); return t
      }),
      setMeta('meta[property="og:image"]', 'content', ogImage, () => {
        const t = document.createElement('meta'); t.setAttribute('property', 'og:image'); return t
      }),
      setMeta('meta[name="twitter:card"]', 'content', (twitterImage || ogImage) ? 'summary_large_image' : null, () => {
        const t = document.createElement('meta'); t.setAttribute('name', 'twitter:card'); return t
      }),
      setMeta('meta[name="twitter:image"]', 'content', twitterImage || ogImage, () => {
        const t = document.createElement('meta'); t.setAttribute('name', 'twitter:image'); return t
      }),
    ]

    return () => {
      document.title = previousTitle
      cleanups.forEach(fn => fn())
    }
  }, [title, description, robots, keywords, ogImage, twitterImage])
}
