import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

export const getOrders = (filters = {}) =>
  api.get('/orders', { params: filters }).then(r => r.data)

export const getOrder = (id) =>
  api.get(`/orders/${id}`).then(r => r.data)

export const createOrder = (data) =>
  api.post('/orders', data).then(r => r.data)

export const updateStatus = (id, payload) =>
  api.patch(`/orders/${id}/status`, payload).then(r => r.data)

export const getDashboardSummary = () =>
  api.get('/dashboard/summary').then(r => r.data)

export const getAlerts = () =>
  api.get('/alerts').then(r => r.data)

export const resolveAlert = (id) =>
  api.patch(`/alerts/${id}/resolve`).then(r => r.data)

export const getInventory = () =>
  api.get('/inventory').then(r => r.data)

export const checkStock = (params) =>
  api.get('/inventory/check', { params }).then(r => r.data)

export const getBreachPredictions = () =>
  api.get('/predictions/breach-risk').then(r => r.data)
