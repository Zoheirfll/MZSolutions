import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import Select from '../components/Select'
import api from '../api/axios'
import { theme } from '../theme'

const ROLE_LABELS = {
  admin: 'Admin',
  confirmateur: 'Confirmateur',
  dropshipper: 'Dropshipper',
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-500">
      <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
      <span className="text-xs">Chargement…</span>
    </div>
  )
}

function RoleMatrix() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null) // "role:permission" en cours

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
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour.')
    } finally {
      setSaving(null)
    }
  }

  if (loading || !data) return <Spinner />

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: theme.dark.border }}>
      <table className="w-full text-sm min-w-140">
        <thead style={{ background: theme.dark.sidebar }}>
          <tr className="text-left text-xs text-gray-500 border-b" style={{ borderColor: theme.dark.border }}>
            <th className="px-4 py-3 font-medium">PERMISSION</th>
            {data.roles.map(role => (
              <th key={role} className="px-4 py-3 font-medium text-center">{ROLE_LABELS[role] || role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.catalog.map(({ key, label }) => (
            <tr key={key} className="border-b hover:bg-white/2 transition" style={{ borderColor: theme.dark.borderRowHover }}>
              <td className="px-4 py-3 text-gray-200">{label}</td>
              {data.roles.map(role => {
                const enabled = data.matrix[role]?.[key]
                const busy = saving === `${role}:${key}`
                return (
                  <td key={role} className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggle(role, key, enabled)}
                      disabled={busy}
                      className={`w-9 h-5 rounded-full transition-colors duration-150 relative cursor-pointer disabled:opacity-60 ${enabled ? 'bg-violet-600' : 'bg-white/10'}`}
                      title={enabled ? 'Activé — cliquer pour désactiver' : 'Désactivé — cliquer pour activer'}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MemberMatrix({ memberId }) {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)

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
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.dark.border }}>
      <div className="divide-y" style={{ borderColor: theme.dark.border }}>
        {catalog.map(({ key, label, enabled, is_custom }) => {
          const busy = saving === key
          return (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-gray-200 flex items-center gap-2">
                {label}
                {is_custom && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300">
                    Personnalisé
                  </span>
                )}
              </span>
              <button
                onClick={() => toggle(key, enabled)}
                disabled={busy}
                className={`w-9 h-5 rounded-full transition-colors duration-150 relative cursor-pointer disabled:opacity-60 shrink-0 ${enabled ? 'bg-violet-600' : 'bg-white/10'}`}
                title={enabled ? 'Activé — cliquer pour désactiver' : 'Désactivé — cliquer pour activer'}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
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
    <DashboardLayout title="Permissions">
      <p className="text-sm mb-4" style={{ color: theme.dark.muted }}>
        Personnalise ce que chaque rôle peut voir dans le tableau de bord, ou affine les permissions d'une personne précise au-dessus de son rôle. Les actions de création/modification/suppression restent toujours réservées au propriétaire et aux administrateurs, quel que soit ce réglage.
      </p>

      <div className="mb-5 max-w-sm">
        <Select
          value={target}
          onChange={setTarget}
          options={options}
          className="w-full px-3.5 py-2.5 rounded-lg border text-sm text-gray-200 bg-transparent"
          style={{ borderColor: theme.dark.border }}
        />
      </div>

      {target === 'role' ? <RoleMatrix /> : <MemberMatrix memberId={target} />}
    </DashboardLayout>
  )
}
