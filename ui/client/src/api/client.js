import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ---- Configs CRUD ----
export const getConfigs = () => api.get('/configs');
export const getConfig = (id) => api.get(`/configs/${id}`);
export const createConfig = (data) => api.post('/configs', data);
export const updateConfig = (id, data) => api.put(`/configs/${id}`, data);
export const deleteConfig = (id) => api.delete(`/configs/${id}`);
export const duplicateConfig = (id) => api.post(`/configs/${id}/duplicate`);
export const getExportUrl = (id) => `/api/configs/${id}/export`;

// ---- Zip Import ----
export const importZip = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/configs/import-zip', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ---- GitHub Integration ----
export const searchGithubTaps = (q, org = 'singer-io') =>
  api.get('/github/search', { params: { q, org } });
export const getGithubRepoInfo = (url) =>
  api.get('/github/repo-info', { params: { url } });
export const importFromGithub = (url, token = '') =>
  api.post('/github/import', { url, token });

// ---- Tap Execution ----
export const discoverTap = (configId) =>
  api.post('/taps/discover', { config_id: configId });
export const runTap = (configId, options = {}) =>
  api.post('/taps/run', { config_id: configId, ...options });
export const getTapRuns = (configId) =>
  configId
    ? api.get('/taps/runs', { params: { config_id: configId } })
    : api.get('/taps/runs');
export const getTapRun = (runId) =>
  api.get(`/taps/runs/${runId}`);
export const stopTapRun = (runId) =>
  api.post(`/taps/runs/${runId}/stop`);
export const getRunStreamUrl = (runId) =>
  `/api/taps/runs/${runId}/stream`;

export default api;
