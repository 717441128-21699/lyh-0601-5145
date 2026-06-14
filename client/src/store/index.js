import { create } from 'zustand';

const getInitialUser = () => {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};

export const useUserStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  user: getInitialUser(),
  permissions: getInitialUser()?.permissions || [],
  isAuthenticated: !!localStorage.getItem('token'),

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, permissions: user.permissions || [], isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, permissions: [], isAuthenticated: false });
  },

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, permissions: user.permissions || [] });
  },

  hasPermission: (permission) => {
    const state = useUserStore.getState();
    if (state.permissions.includes('*')) return true;
    if (state.permissions.includes(permission)) return true;
    const res = permission.split(':')[0];
    return state.permissions.includes(`${res}:*`);
  },
}));

export const useUIStore = create((set) => ({
  collapsed: localStorage.getItem('sidebar_collapsed') === 'true',
  toggleSidebar: () => {
    const v = localStorage.getItem('sidebar_collapsed') === 'true';
    localStorage.setItem('sidebar_collapsed', String(!v));
    set({ collapsed: !v });
  },

  loading: false,
  setLoading: (v) => set({ loading: v }),

  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));

export const useNotificationStore = create((set, get) => ({
  unread: 0,
  urgent: 0,
  list: [],

  setUnread: (count, urgent = 0) => set({ unread: count, urgent }),

  prepend: (item) => set((s) => ({ list: [item, ...s.list].slice(0, 100) })),

  fetchUnread: async (api) => {
    try {
      const res = await api.notifications.unreadCount();
      set({ unread: res.total, urgent: res.urgent });
    } catch { /* ignore */ }
  },
}));

export const formatCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount);
};

export const formatNumber = (n) => {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('zh-CN').format(n);
};

export const formatPercent = (n, digits = 2) => {
  if (n === null || n === undefined) return '-';
  return `${Number(n).toFixed(digits)}%`;
};

export const RISK_COLORS = {
  LOW: '#52c41a',
  MEDIUM: '#faad14',
  HIGH: '#fa8c16',
  CRITICAL: '#ff4d4f',
  SAFE: '#1677ff',
  BLACKLISTED: '#8b0000',
};

export const RISK_LABELS = {
  LOW: '极低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  CRITICAL: '极高风险',
  SAFE: '安全',
  BLACKLISTED: '黑名单',
};

export const TRANSACTION_STATUS_LABELS = {
  PENDING_SCREENING: '待筛查',
  SCREENED: '已筛查',
  FROZEN: '已冻结',
  UNDER_REVIEW: '审查中',
  APPROVED: '已放行',
  REJECTED: '已拒绝',
  RELEASED: '已放行',
};

export const TRANSACTION_STATUS_COLORS = {
  PENDING_SCREENING: 'default',
  SCREENED: 'processing',
  FROZEN: 'warning',
  UNDER_REVIEW: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  RELEASED: 'success',
};

export const REVIEW_STATUS_LABELS = {
  PENDING: '待分配',
  ASSIGNED: '待处理',
  IN_PROGRESS: '处理中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  ESCALATED: '已升级',
  CLOSED: '已关闭',
};

export const REVIEW_STATUS_COLORS = {
  PENDING: 'default',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  ESCALATED: 'warning',
  CLOSED: 'default',
};

export const COUNTRIES = {
  CN: '中国', US: '美国', DE: '德国', JP: '日本', GB: '英国', FR: '法国',
  KR: '韩国', SG: '新加坡', HK: '中国香港', TW: '中国台湾',
  IT: '意大利', AU: '澳大利亚', CA: '加拿大', NL: '荷兰',
  IN: '印度', BR: '巴西', MX: '墨西哥', MY: '马来西亚',
  TH: '泰国', VN: '越南', RU: '俄罗斯', IR: '伊朗', KP: '朝鲜',
  SY: '叙利亚', AE: '阿联酋', SA: '沙特', QA: '卡塔尔',
  BY: '白俄罗斯', MM: '缅甸', CU: '古巴', VE: '委内瑞拉',
  SO: '索马里', SD: '苏丹', LY: '利比亚', YE: '也门',
  KW: '科威特', BH: '巴林', OM: '阿曼', BH: '巴林',
};
