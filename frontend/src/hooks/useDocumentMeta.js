import { useEffect } from 'react'

// Balises <title>/<meta description> — pas de librairie type react-helmet dans
// ce projet, manipulation directe du DOM + restauration au démontage (même
// pattern que StorefrontProductPage.jsx, factorisé pour Home/pages publiques).
export default function useDocumentMeta(title, description) {
  useEffect(() => {
    if (!title) return
    const previousTitle = document.title
    document.title = title

    let metaTag = document.querySelector('meta[name="description"]')
    const previousContent = metaTag?.getAttribute('content')
    const createdTag = !metaTag
    if (!metaTag) {
      metaTag = document.createElement('meta')
      metaTag.setAttribute('name', 'description')
      document.head.appendChild(metaTag)
    }
    metaTag.setAttribute('content', description || '')

    return () => {
      document.title = previousTitle
      if (createdTag) metaTag.remove()
      else if (previousContent != null) metaTag.setAttribute('content', previousContent)
    }
  }, [title, description])
}
