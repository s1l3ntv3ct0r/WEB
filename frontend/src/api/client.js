import axios from 'axios';
export const api = axios.create({ baseURL: '/api', withCredentials: true });
let accessToken = null; let pendingRefresh = null;
export const setToken = token => { accessToken = token; };
export async function restoreSession() {
  if (!pendingRefresh) pendingRefresh = api.post('/auth/refresh').then(({ data }) => {
    accessToken = data.data.accessToken; return data.data.user;
  }).finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}
api.interceptors.request.use(config => { if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`; return config; });
api.interceptors.response.use(response => {
  if (response.config.method !== 'get' && /^\/(cart|orders)(\/|$)/.test(response.config.url)) window.dispatchEvent(new Event('shoplab:cart-updated'));
  return response;
}, async error => {
  const config = error.config;
  if (error.response?.status === 401 && config && !config.retried && !config.url.startsWith('/auth/')) {
    config.retried = true;
    try { await restoreSession(); return api(config); }
    catch { accessToken = null; window.dispatchEvent(new Event('shoplab:signed-out')); }
  }
  return Promise.reject(error);
});
export const messageOf = error => error.response?.data?.error?.message || 'Could not connect. Please try again.';
export const money = value => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
export async function downloadAttachment(attachment) {
  const { data } = await api.get(`/attachments/${attachment.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(data); const link = document.createElement('a'); link.href = url; link.download = attachment.asset.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
