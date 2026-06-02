import axios from 'axios';

// In production (Cloudflare Pages) set VITE_API_URL to the deployed backend URL.
// Locally it's empty, so requests go to '/' and Vite's dev proxy forwards them to :7700.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/' });

api.interceptors.request.use(config => {
  const token = window.__authToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.__authToken = null;
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
