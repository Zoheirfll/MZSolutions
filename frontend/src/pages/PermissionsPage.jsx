import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import Toast from '../components/Toast'
import api from '../api/axios'
import { theme } from '../theme'

const ROLE_LABELS = {
  admin: 'Admin',
  confirmateur: 'Confirmateur',
  dropshipper: 'Dropshipper',
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-app-muted">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
    </div>
  )
}

// Regroupe une liste plate de permissions en { category: { subcategory: [permissions] } },
// en conservant l'ordre d'apparition dans le catalogue (pas de tri alphabétique
// qui mélangerait l'ordre logique des sections).
function groupByCategory(catalog) {
  const groups = []
  const catIndex = new Map()
  for (const perm of catalog) {
    const cat = perm.category || 'Autres'
    const sub = perm.subcategory || 'Autres'
    if (!catIndex.has(cat)) {
      catIndex.set(cat, { name: cat, subIndex: new Map(), subcategories: [] })
      groups.push(catIndex.get(cat))
    }
    const catGroup = catIndex.get(cat)
    if (!catGroup.subIndex.has(sub)) {
      catGroup.subIndex.set(sub, { name: sub, items: [] })
      catGroup.subcategories.push(catGroup.subIndex.get(sub))
    }
    catGroup.subIndex.get(sub).items.push(perm)
  }
  return groups
}

function ToggleSwitch({ enabled, busy, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      className={`w-9 h-5 rounded-full transition-colors duration-150 relative cursor-pointer disabled:opacity-60 shrink-0 ${enabled ? 'bg-violet-600' : 'bg-violet-500/15'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function CategoryAccordion({ groups, renderRow, renderCategoryActions }) {
  const [openCats, setOpenCats] = useState(() => new Set())
  const toggleCat = name => setOpenCats(s => {
    const next = new Set(s)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const isOpen = openCats.has(group.name)
        const total = group.subcategories.reduce((n, s) => n + s.items.length, 0)
        const allKeys = group.subcategories.flatMap(s => s.items.map(p => p.key))
        return (
          <div key={group.name} className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
            <div
              className="w-full flex items-center justify-between px-4 py-3 gap-3"
              style={{ background: theme.dark.sidebar }}
            >
              <button
                onClick={() => toggleCat(group.name)}
                className="flex-1 flex items-center justify-between text-left cursor-pointer transition min-w-0"
              >
                <span className="text-sm font-semibold text-app-primary">{group.name}</span>
                <span className="flex items-center gap-2 ml-3">
                  <span className="text-xs" style={{ color: theme.dark.muted }}>{total} permission{total > 1 ? 's' : ''}</span>
                  <svg className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              {renderCategoryActions && <div className="shrink-0" onClick={e => e.stopPropagation()}>{renderCategoryActions(group.name, allKeys)}</div>}
            </div>
            {isOpen && (
              <div className="divide-y" style={{ borderColor: theme.dark.border }}>
                {group.subcategories.map(sub => (
                  <div key={sub.name}>
                    {group.subcategories.length > 1 && (
                      <p className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.dark.muted }}>
                        {sub.name}
                      </p>
                    )}
                    {sub.items.map(renderRow)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RoleMatrix() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null) // "role:permission" en cours
  const [toast, setToast]     = useState(null)

  const fetchData = () => {
    setLoading(true)
    api.get('/team/permissions/')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const toggle = async (role, permission, current) => {
    const key = `${role}:${permission}`
    setSaving(key)
    setData(d => ({ ...d, matrix: { ...d.matrix, [role]: { ...d.matrix[role], [permission]: !current } } }))
    try {
      await api.post('/team/permissions/', { role, permission, enabled: !current })
    } catch (err) {
      setData(d => ({ ...d, matrix: { ...d.matrix, [role]: { ...d.matrix[role], [permission]: current } } }))
      setToast({ type: 'error', message: err.response?.data?.detail || 'Erreur lors de la mise à jour.' })
    } finally {
      setSaving(null)
    }
  }

  const toggleAll = async (role, keys, enable) => {
    setSaving(`${role}:__category__`)
    setData(d => ({ ...d, matrix: { ...d.matrix, [role]: { ...d.matrix[role], ...Object.fromEntries(keys.map(k => [k, enable])) } } }))
    try {
      await Promise.all(keys.map(permission => api.post('/team/permissions/', { role, permission, enabled: enable })))
      fetchData()
    } catch (err) {
      fetchData()
      setToast({ type: 'error', message: err.response?.data?.detail || 'Erreur lors de la mise à jour groupée.' })
    } finally {
      setSaving(null)
    }
  }

  if (loading || !data) return <Spinner />

  const groups = groupByCategory(data.catalog)

  return (
    <>
    <CategoryAccordion
      groups={groups}
      renderCategoryActions={(_categoryName, allKeys) => (
        <div className="flex items-center gap-3">
          {data.roles.map(role => {
            const busy = saving === `${role}:__category__`
            const allOn = allKeys.every(k => data.matrix[role]?.[k])
            return (
              <button
                key={role}
                disabled={busy}
                onClick={() => toggleAll(role, allKeys, !allOn)}
                className="text-[11px] px-2 py-1 rounded-md border transition disabled:opacity-50 cursor-pointer hover:bg-violet-500/10"
                style={{ borderColor: theme.dark.border, color: theme.dark.muted }}
                title={`${allOn ? 'Tout désactiver' : 'Tout activer'} — ${ROLE_LABELS[role] || role}`}
              >
                {ROLE_LABELS[role] || role} : {allOn ? 'tout désactiver' : 'tout activer'}
              </button>
            )
          })}
        </div>
      )}
      renderRow={({ key, label }) => (
        <div key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-violet-500/5 transition">
          <span className="text-sm text-app-primary">{label}</span>
          <div className="flex items-center gap-5 shrink-0">
            {data.roles.map(role => {
              const enabled = data.matrix[role]?.[key]
              const busy = saving === `${role}:${key}`
              return (
                <div key={role} className="flex flex-col items-center gap-1 w-16">
                  <span className="text-[10px]" style={{ color: theme.dark.muted }}>{ROLE_LABELS[role] || role}</span>
                  <ToggleSwitch
                    enabled={enabled}
                    busy={busy}
                    onClick={() => toggle(role, key, enabled)}
                    title={enabled ? 'Activé — cliquer pour désactiver' : 'Désactivé — cliquer pour activer'}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    />
    <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}

function MemberMatrix({ memberId }) {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)
  const [toast, setToast]     = useState(null)

  const fetchCatalog = () => {
    setLoading(true)
    api.get(`/team/members/${memberId}/permissions/`)
      .then(({ data }) => setCatalog(data.catalog || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCatalog() }, [memberId])

  const toggle = async (key, current) => {
    setSaving(key)
    setCatalog(c => c.map(e => e.key === key ? { ...e, enabled: !current } : e))
    try {
      await api.post(`/team/members/${memberId}/permissions/`, { permission: key, enabled: !current })
      fetchCatalog()
    } catch (err) {
      setCatalog(c => c.map(e => e.key === key ? { ...e, enabled: current } : e))
      setToast({ type: 'error', message: err.response?.data?.detail || 'Erreur lors de la mise à jour.' })
    } finally {
      setSaving(null)
    }
  }

  const toggleAll = async (keys, enable) => {
    setSaving('__category__')
    setCatalog(c => c.map(e => keys.includes(e.key) ? { ...e, enabled: enable } : e))
    try {
      await Promise.all(keys.map(permission => api.post(`/team/members/${memberId}/permissions/`, { permission, enabled: enable })))
      fetchCatalog()
    } catch (err) {
      fetchCatalog()
      setToast({ type: 'error', message: err.response?.data?.detail || 'Erreur lors de la mise à jour groupée.' })
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <Spinner />

  const groups = groupByCategory(catalog)

  return (
    <>
    <CategoryAccordion
      groups={groups}
      renderCategoryActions={(_categoryName, allKeys) => {
        const busy = saving === '__category__'
        const allOn = allKeys.every(k => catalog.find(e => e.key === k)?.enabled)
        return (
          <button
            disabled={busy}
            onClick={() => toggleAll(allKeys, !allOn)}
            className="text-[11px] px-2 py-1 rounded-md border transition disabled:opacity-50 cursor-pointer hover:bg-violet-500/10"
            style={{ borderColor: theme.dark.border, color: theme.dark.muted }}
          >
            {allOn ? 'Tout désactiver' : 'Tout activer'}
          </button>
        )
      }}
      renderRow={({ key, label, enabled, is_custom }) => {
        const busy = saving === key
        return (
          <div key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-violet-500/5 transition">
            <span className="text-sm text-app-primary flex items-center gap-2">
              {label}
              {is_custom && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300">
                  Personnalisé
                </span>
              )}
            </span>
            <ToggleSwitch
              enabled={enabled}
              busy={busy}
              onClick={() => toggle(key, enabled)}
              title={enabled ? 'Activé — cliquer pour désactiver' : 'Désactivé — cliquer pour activer'}
            />
          </div>
        )
      }}
    />
    <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  )
}

export default function PermissionsPage() {
  const [target, setTarget]   = useState('role') // 'role' ou l'id d'un membre
  const [members, setMembers] = useState([])

  useEffect(() => {
    api.get('/team/members/').then(({ data }) => setMembers(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const options = [
    { value: 'role', label: 'Tous les rôles (matrice)' },
    ...members.map(m => ({
      value: String(m.id),
      label: `${m.first_name} ${m.last_name} (${ROLE_LABELS[m.role] || m.role})`,
    })),
  ]

  return (
    <DashboardLayout title="Permissions" subtitle="Cette page vous permet de décider ce que chaque type de membre de votre équipe (administrateur, confirmateur, dropshipper) a le droit de voir dans le tableau de bord. Par exemple, vous pouvez cacher la section Finances à vos confirmateurs. Attention : ce réglage contrôle uniquement ce qu'un rôle peut consulter — les actions comme créer, modifier ou supprimer restent toujours réservées aux administrateurs, quoi que vous cochiez ici.">
      <p className="text-sm mb-4" style={{ color: theme.dark.muted }}>
        Personnalise ce que chaque rôle peut voir dans le tableau de bord, ou affine les permissions d'une personne précise au-dessus de son rôle. Les actions de création/modification/suppression restent toujours réservées au propriétaire et aux administrateurs, quel que soit ce réglage.
      </p>

      <div className="mb-5 max-w-sm">
        <Select
          value={target}
          onChange={setTarget}
          options={options}
          className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-app-primary bg-transparent"
          style={{ borderColor: theme.dark.border }}
        />
      </div>

      {target === 'role' ? <RoleMatrix /> : <MemberMatrix memberId={target} />}
    </DashboardLayout>
  )
}
