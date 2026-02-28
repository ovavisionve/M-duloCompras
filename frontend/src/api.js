import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function downloadFile(url, filename) {
  const token = localStorage.getItem('token');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Error al descargar');
      const disposition = res.headers.get('Content-Disposition');
      if (!filename && disposition) {
        const match = disposition.match(/filename=(.+)/);
        if (match) filename = match[1].replace(/"/g, '');
      }
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'descarga';
      a.click();
      URL.revokeObjectURL(blobUrl);
    })
    .catch((err) => alert(err.message));
}

export default api;
