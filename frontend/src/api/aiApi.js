import api from './axios'

export function generateProduct({ name, keywords }) {
  return api.post('/ai/generate-product/', { name, keywords }).then(r => r.data)
}

export function suggestReply(conversationId) {
  return api.post(`/ai/inbox/${conversationId}/suggest-reply/`).then(r => r.data)
}

export function getDashboardSummary(tab, queryStringValue) {
  return api.get(`/ai/dashboard-summary/?tab=${tab}&${queryStringValue}`).then(r => r.data)
}

export function listConversations() {
  return api.get('/ai/conversations/').then(r => r.data)
}

export function getConversation(id) {
  return api.get(`/ai/conversations/${id}/`).then(r => r.data)
}

export function sendChatMessage({ conversationId, message }) {
  return api.post('/ai/chat/', { conversation_id: conversationId, message }).then(r => r.data)
}
