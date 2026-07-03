import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadPixelScripts, trackEvent } from '../../lib/pixels'

describe('pixels.js', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    window.fbq = undefined
    window.ttq = undefined
    window.gtag = undefined
    window.dataLayer = undefined
  })

  describe('loadPixelScripts', () => {
    it('injects a script tag for a facebook pixel', () => {
      loadPixelScripts('shop-a', [{ pixel_type: 'facebook', pixel_id: '123456789' }])
      expect(document.getElementById('mz-fb-pixel-base')).not.toBeNull()
    })

    it('rejects a pixel_id containing unsafe characters (XSS guard, Epic 8.6)', () => {
      loadPixelScripts('shop-b', [{ pixel_type: 'facebook', pixel_id: "123');alert(1)//" }])
      expect(document.getElementById('mz-fb-pixel-base')).toBeNull()
    })

    it('does nothing when pixels list is empty', () => {
      loadPixelScripts('shop-c', [])
      expect(document.head.innerHTML).toBe('')
    })

    it('does not reload scripts twice for the same slug', () => {
      loadPixelScripts('shop-d', [{ pixel_type: 'google_analytics', pixel_id: 'G-ABC123' }])
      const scriptCountAfterFirst = document.head.querySelectorAll('script').length
      loadPixelScripts('shop-d', [{ pixel_type: 'google_analytics', pixel_id: 'G-ABC123' }])
      expect(document.head.querySelectorAll('script').length).toBe(scriptCountAfterFirst)
    })
  })

  describe('trackEvent', () => {
    it('calls fbq, ttq, and gtag with the platform-specific event name', () => {
      window.fbq = vi.fn()
      window.ttq = { track: vi.fn() }
      window.gtag = vi.fn()

      trackEvent('AddToCart', { value: 100 })

      expect(window.fbq).toHaveBeenCalledWith('track', 'AddToCart', { value: 100 })
      expect(window.ttq.track).toHaveBeenCalledWith('AddToCart', { value: 100 })
      expect(window.gtag).toHaveBeenCalledWith('event', 'add_to_cart', { value: 100 })
    })

    it('maps Purchase to CompletePayment for TikTok specifically', () => {
      window.ttq = { track: vi.fn() }
      trackEvent('Purchase', { value: 500 })
      expect(window.ttq.track).toHaveBeenCalledWith('CompletePayment', { value: 500 })
    })

    it('does nothing and does not throw when no pixel script is loaded', () => {
      expect(() => trackEvent('PageView', {})).not.toThrow()
    })

    it('silently ignores an unknown event name', () => {
      window.fbq = vi.fn()
      trackEvent('NotARealEvent', {})
      expect(window.fbq).not.toHaveBeenCalled()
    })
  })
})
