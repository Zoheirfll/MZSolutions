import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../lib/markdown'

describe('renderMarkdown', () => {
  it('rend le gras et l\'italique', () => {
    expect(renderMarkdown('**gras** et *italique*')).toBe('<p><strong>gras</strong> et <em>italique</em></p>')
  })

  it('rend le code inline et les blocs de code', () => {
    expect(renderMarkdown('utilise `foo()`')).toBe('<p>utilise <code>foo()</code></p>')
    expect(renderMarkdown('```\nconst x = 1\n```')).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('rend les listes à puces et numérotées', () => {
    expect(renderMarkdown('- un\n- deux')).toBe('<ul><li>un</li><li>deux</li></ul>')
    expect(renderMarkdown('1. un\n2. deux')).toBe('<ol><li>un</li><li>deux</li></ol>')
  })

  it('échappe le HTML brut (pas de script injecté)', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('rend un lien', () => {
    expect(renderMarkdown('[MZSolutions](https://mzsol.online)')).toContain('<a href="https://mzsol.online"')
  })
})
