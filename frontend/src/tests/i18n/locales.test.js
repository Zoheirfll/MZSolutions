import { describe, it, expect } from 'vitest'
import frDashboard from '../../i18n/locales/fr/dashboard.json'
import arDashboard from '../../i18n/locales/ar/dashboard.json'
import frStorefront from '../../i18n/locales/fr/storefront.json'
import arStorefront from '../../i18n/locales/ar/storefront.json'
import frCommon from '../../i18n/locales/fr/common.json'
import arCommon from '../../i18n/locales/ar/common.json'

function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flat(v, prefix + k + '.', out)
    else out[prefix + k] = v
  }
  return out
}

// « count_one » / « count_other »… : on compare les clés de base, les formes de pluriel diffèrent selon la langue.
const baseKey = (k) => k.replace(/_(zero|one|two|few|many|other)$/, '')
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',')

describe('traductions arabes', () => {
  it('le dashboard : chaque texte français a sa traduction, avec les mêmes variables', () => {
    const missing = Object.keys(frDashboard).filter((k) => !(k in arDashboard))
    expect(missing).toEqual([])
    const mismatched = Object.keys(arDashboard).filter((k) => placeholders(k) !== placeholders(arDashboard[k]))
    expect(mismatched).toEqual([])
  })

  it.each([
    ['boutique', frStorefront, arStorefront],
    ['commun', frCommon, arCommon],
  ])('%s : mêmes clés en français et en arabe', (_name, fr, ar) => {
    const frKeys = new Set(Object.keys(flat(fr)).map(baseKey))
    const arKeys = new Set(Object.keys(flat(ar)).map(baseKey))
    expect([...frKeys].filter((k) => !arKeys.has(k))).toEqual([])
    expect([...arKeys].filter((k) => !frKeys.has(k))).toEqual([])
  })
})
