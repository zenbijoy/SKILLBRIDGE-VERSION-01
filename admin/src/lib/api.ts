import axios from 'axios';
import { supabase } from './supabase';

const baseURL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

const api = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await supabase.auth.signOut();
    }
    const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Request failed';
    error.message = message;
    return Promise.reject(error);
  },
);

export default api;

