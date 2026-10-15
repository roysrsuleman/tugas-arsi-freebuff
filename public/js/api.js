/* Wrapper fetch untuk REST API Mini Gantt Project. */
'use strict';

const API = {
  async request(path, options = {}) {
    const init = { headers: {} };
    if (options.method) init.method = options.method;
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    let data = null;
    try {
      const res = await fetch(path, init);
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (!res.ok) {
        throw new Error((data && data.error) || `Permintaan gagal (HTTP ${res.status})`);
      }
      return data;
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan (npm start).');
      }
      throw err;
    }
  },
  get(path) {
    return this.request(path);
  },
  post(path, body) {
    return this.request(path, { method: 'POST', body });
  },
  put(path, body) {
    return this.request(path, { method: 'PUT', body });
  },
  del(path) {
    return this.request(path, { method: 'DELETE' });
  },
};
