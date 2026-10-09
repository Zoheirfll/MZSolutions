import { useEffect, useState } from 'react'
import api from '../api/axios'

// État partagé du quota IA (reste par fonctionnalité). Rechargé automatiquement après tout appel
// qui consomme le quota (succès ou refus 429), pour que chaque badge reste à jour sans que
// chaque page ait à s'en occuper.
let state = null
let inflight = null
const listeners = new Set()

export function refreshAiQuota() {
  if (inflight) return inflight
  inflight = Promise.resolve()
    .then(() => api.get('/ai/quota/'))
    .then((res) => { if (res?.data && Array.isArray(res.data.features)) { state = res.data; listeners.forEach((fn) => fn(state)) } })
    .catch(() => {})
    .finally(() => { inflight = null })
  return inflight
}

const CONSUMING = /\/ai\/(generate-product|inbox\/\d+\/suggest-reply|dashboard-summary|chat|scan)\/|risk-explanation|recommendations\/.*explain|bundle-explain|monitoring\/.*explain|team-explain|\/stores\/me\/audit\//
let installed = false
function install() {
  if (installed || !api?.interceptors?.response) return
  installed = true
  const after = (cfg, method) => {
    if (cfg?.url && /post|get/i.test(method || '') && CONSUMING.test(cfg.url) && !cfg.url.includes('/ai/quota/')
      && (String(method).toLowerCase() === 'post' || cfg.url.includes('dashboard-summary'))) refreshAiQuota()
  }
  api.interceptors.response.use(
    (res) => { after(res.config, res.config?.method); return res },
    (err) => { after(err.config, err.config?.method); return Promise.reject(err) },
  )
}

// Quota effectif d'une fonctionnalité = le plus restrictif entre sa limite propre et le total.
export function effectiveQuota(data, feature) {
  const f = data?.features?.find((x) => x.key === feature)
  if (!f) return null
  const pick = (own, total) => {
    const list = [own, total].filter((c) => c && c.limit)
    if (!list.length) return null
    return list.reduce((a, b) => (a.remaining <= b.remaining ? a : b))
  }
  return { daily: pick(f.daily, data.total?.daily), weekly: pick(f.weekly, data.total?.weekly), enabled: data.enabled }
}

export function useAiQuota(feature) {
  const [data, setData] = useState(state)
  useEffect(() => {
    install()
    listeners.add(setData)
    if (!state) refreshAiQuota()
    return () => { listeners.delete(setData) }
  }, [])
  return effectiveQuota(data, feature)
}
