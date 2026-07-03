import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml (Epic 8.6 — XSS storefront)', () => {
  it('keeps whitelisted formatting tags', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p>')
    expect(result).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('strips <script> tags entirely', () => {
    const result = sanitizeHtml('<p>Safe</p><script>alert(1)</script>')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert')
    expect(result).toContain('Safe')
  })

  it('strips onerror/onclick event handler attributes', () => {
    const result = sanitizeHtml('<img src="x.png" onerror="alert(1)">')
    expect(result).not.toContain('onerror')
  })

  it('strips iframe tags', () => {
    const result = sanitizeHtml('<iframe src="https://evil.test"></iframe>')
    expect(result).not.toContain('<iframe')
  })

  it('keeps safe href on links but the tag survives sanitization', () => {
    const result = sanitizeHtml('<a href="https://example.com">Link</a>')
    expect(result).toContain('href="https://example.com"')
  })

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })
})
