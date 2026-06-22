import axios from 'axios';
import { API_BASE_URL, ERROR_CODES } from '@/constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data.code !== undefined && data.code !== ERROR_CODES.SUCCESS) {
      if (data.code === ERROR_CODES.NOT_LOGIN_ERROR) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
        window.location.href = '/login';
      }
      const error = new Error(data.message || '请求失败');
      (error as any).code = data.code;
      return Promise.reject(error);
    }
    return response;
  },
  (error) => {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
        window.location.href = '/login';
      }
    } else if (error.code === 'ECONNABORTED') {
      error.message = '请求超时';
    } else {
      error.message = '网络异常';
    }
    return Promise.reject(error);
  }
);

export default api;
