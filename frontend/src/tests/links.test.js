import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Vérificateur de liens internes : chaque lien en dur (`to="/…"`, `navigate('/…')`)
// doit correspondre à une route déclarée dans App.jsx. Les liens construits avec
// une variable (`/store/${slug}`) ne sont pas vérifiables statiquement et sont ignorés.
const SRC = resolve(__dirname, '..')

function listSources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (full.includes(`${join('src', 'tests')}`)) return []
    return statSync(full).isDirectory() ? listSources(full) : /\.jsx?$/.test(name) ? [full] : []
  })
}

// Extrait les chemins complets des <Route>, en suivant l'imbrication ligne à ligne.
function declaredRoutes() {
  const stack = []
  const routes = []
  for (const line of readFileSync(join(SRC, 'App.jsx'), 'utf8').split('\n')) {
    if (/<\/Route>/.test(line)) { stack.pop(); continue }
    const match = line.match(/<Route\s+(?:index\s+|path="([^"]*)")/)
    if (!match) continue
    const path = match[1]
    const parent = stack[stack.length - 1] || ''
    const full = path === undefined ? parent : path.startsWith('/') ? path : `${parent}/${path}`.replace(/\/+/g, '/')
    routes.push(full)
    const selfClosing = /\/>\s*$/.test(line.trim())
    if (!selfClosing) stack.push(full)
  }
  return routes
}

function toMatcher(route) {
  const pattern = route.split('/').map(seg => (seg.startsWith(':') ? '[^/]+' : seg === '*' ? '.*' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')
  return new RegExp(`^${pattern}/?$`)
}

describe('liens internes', () => {
  const routes = declaredRoutes()
  const matchers = routes.map(toMatcher)

  it('lit bien les routes de App.jsx (imbriquées comprises)', () => {
    expect(routes.length).toBeGreaterThan(50)
    expect(routes).toContain('/auth')
    expect(routes).toContain('/platform-admin/boutiques')
    expect(routes).toContain('/plateforme/comptes')
  })

  it('chaque lien interne en dur pointe vers une route existante', () => {
    const broken = []
    for (const file of listSources(SRC)) {
      const source = readFileSync(file, 'utf8')
      const targets = [
        ...source.matchAll(/\bto="(\/[^"{}$]*)"/g),
        ...source.matchAll(/navigate\('(\/[^'{}$]*)'/g),
      ].map(m => m[1].split('?')[0].split('#')[0])
      for (const target of targets) {
        if (!matchers.some(rx => rx.test(target))) broken.push(`${file.replace(SRC, 'src')} → ${target}`)
      }
    }
    expect(broken).toEqual([])
  })
})
