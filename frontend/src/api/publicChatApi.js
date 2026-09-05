import publicApi from './publicApi'

export function sendPublicChatMessage({ slug, sessionId, message }) {
  return publicApi.post(`/store/${slug}/chat/`, { session_id: sessionId, message }).then(r => r.data)
}

export function getPublicChatHistory({ slug, sessionId }) {
  return publicApi.get(`/store/${slug}/chat/${sessionId}/`).then(r => r.data)
}
