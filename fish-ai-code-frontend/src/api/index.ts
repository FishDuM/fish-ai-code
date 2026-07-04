import axios from 'axios';
import { API_BASE_URL } from '@/constants';
import { attachResponseInterceptors } from './interceptors';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

attachResponseInterceptors(api);

export default api;
