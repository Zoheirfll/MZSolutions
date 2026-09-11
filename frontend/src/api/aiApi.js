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

export function deleteConversation(id) {
  return api.delete(`/ai/conversations/${id}/`)
}

export function confirmPendingAction(id) {
  return api.post(`/ai/pending-actions/${id}/confirm/`).then(r => r.data)
}

export function rejectPendingAction(id) {
  return api.post(`/ai/pending-actions/${id}/reject/`).then(r => r.data)
}

export function scanProduct(file) {
  const form = new FormData()
  form.append('image', file)
  return api.post('/ai/scan/', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}

export function listProductDrafts() {
  return api.get('/ai/product-drafts/').then(r => r.data)
}

export function createProductFromDraft(id) {
  return api.post(`/ai/product-drafts/${id}/create/`).then(r => r.data)
}

export function discardProductDraft(id) {
  return api.post(`/ai/product-drafts/${id}/discard/`).then(r => r.data)
}
