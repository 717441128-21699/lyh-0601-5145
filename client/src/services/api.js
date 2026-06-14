import axios from 'axios';
import { message } from 'antd';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

const request = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    } else if (error.response?.data?.error) {
      message.error(error.response.data.error);
    } else if (error.message?.includes('timeout')) {
      message.error('请求超时，请重试');
    } else if (!error.response) {
      message.error('网络连接失败，请检查服务器');
    }
    return Promise.reject(error);
  }
);

export const api = {
  auth: {
    login: (data) => request.post('/auth/login', data),
    logout: () => request.post('/auth/logout'),
    me: () => request.get('/auth/me'),
    changePassword: (data) => request.put('/auth/change-password', data),
  },
  dashboard: {
    overview: () => request.get('/dashboard/overview'),
    realtime: () => request.get('/dashboard/stats/realtime'),
    trend: (range = '7d') => request.get(`/dashboard/stats/trend?range=${range}`),
    hourlyToday: () => request.get('/dashboard/stats/hourly-today'),
    reportPreview: (range = '7d') => request.get(`/dashboard/report-preview?range=${range}`),
  },
  transactions: {
    list: (params = {}) => request.get('/transactions', { params }),
    search: (data) => request.post('/transactions/search', data),
    get: (id) => request.get(`/transactions/${id}`),
    history: (id) => request.get(`/transactions/${id}/history`),
    export: (data, format = 'xlsx') => request.post(`/transactions/export?format=${format}`, data),
    freeze: (id, reason) => request.post(`/transactions/${id}/freeze`, { reason }),
    release: (id, reason) => request.post(`/transactions/${id}/release`, { reason }),
    rescreen: (id) => request.post(`/transactions/${id}/re-screen`),
    sync: (incremental = false) => request.post('/transactions/sync', { incremental }),
    createReview: (data) => request.post('/transactions/create-review', data),
  },
  reviews: {
    list: (params = {}) => request.get('/reviews', { params }),
    dashboard: () => request.get('/reviews/dashboard'),
    get: (id) => request.get(`/reviews/${id}`),
    assign: (id, assignTo) => request.put(`/reviews/${id}/assign`, { assignTo }),
    setStatus: (id, status) => request.put(`/reviews/${id}/status`, { status }),
    approve: (id, notes) => request.post(`/reviews/${id}/approve`, { notes }),
    reject: (id, data) => request.post(`/reviews/${id}/reject`, data),
    escalate: (id, reason) => request.post(`/reviews/${id}/escalate`, { reason }),
    checkOverdue: () => request.post('/reviews/check-overdue'),
    performance: (params = {}) => request.get('/reviews/stats/performance', { params }),
    workload: () => request.get('/reviews/stats/workload'),
  },
  sanctions: {
    list: (params = {}) => request.get('/sanctions', { params }),
    config: () => request.get('/sanctions/config'),
    get: (id) => request.get(`/sanctions/${id}`),
    create: (data) => request.post('/sanctions', data),
    update: (id, data) => request.put(`/sanctions/${id}`, data),
    delete: (id) => request.delete(`/sanctions/${id}`),
    upload: (formData, onProgress) =>
      request.post('/sanctions/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress
          ? (e) => onProgress(Math.round((e.loaded * 100) / e.total))
          : undefined,
      }),
    uploadHistory: (params = {}) => request.get('/sanctions/uploads/history', { params }),
    getUpload: (id) => request.get(`/sanctions/uploads/${id}`),
    searchTransactions: (entryId) => request.post('/sanctions/search/transactions', { entryId }),
    stats: () => request.get('/sanctions/stats/summary'),
  },
  suppliers: {
    list: (params = {}) => request.get('/suppliers', { params }),
    stats: () => request.get('/suppliers/stats/summary'),
    get: (id) => request.get(`/suppliers/${id}`),
    update: (id, data) => request.put(`/suppliers/${id}`, data),
    blacklist: (id, data) => request.post(`/suppliers/${id}/blacklist`, data),
    unblock: (id, reason) => request.post(`/suppliers/${id}/unblock`, { reason }),
    rescreen: (id) => request.post(`/suppliers/${id}/rescreen`),
    history: (id) => request.get(`/suppliers/${id}/history`),
  },
  reports: {
    list: (params = {}) => request.get('/reports', { params }),
    generate: (data) => request.post('/reports/generate', data),
    generateDaily: (date) => request.get(`/reports/daily/generate${date ? `?date=${date}` : ''}`),
    get: (id) => request.get(`/reports/${id}`),
    downloadExcel: (id) => `${API_BASE}/reports/${id}/download/excel`,
    downloadPdf: (id) => `${API_BASE}/reports/${id}/download/pdf`,
    summaryToday: () => request.get('/reports/summary/today'),
    regenerateFiles: (id) => request.post(`/reports/${id}/regenerate-files`),
  },
  audit: {
    list: (params = {}) => request.get('/audit', { params }),
    export: (data) => request.post('/audit/export', data),
    summary: (params = {}) => request.get('/audit/summary', { params }),
    categories: () => request.get('/audit/categories'),
    get: (id) => request.get(`/audit/${id}`),
  },
  notifications: {
    list: (params = {}) => request.get('/notifications', { params }),
    markRead: (data) => request.post('/notifications/mark-read', data),
    unreadCount: () => request.get('/notifications/unread-count'),
    get: (id) => request.get(`/notifications/${id}`),
    archive: (id) => request.post(`/notifications/${id}/archive`),
    testWebhook: (data) => request.post('/notifications/test-webhook', data),
    types: () => request.get('/notifications/types/config'),
  },
};

export default request;
