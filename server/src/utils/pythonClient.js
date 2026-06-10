const axios = require('axios');

const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const pythonHeaders = () => ({
  'Content-Type': 'application/json',
  ...(process.env.PYTHON_SERVICE_API_KEY ? { 'X-API-Key': process.env.PYTHON_SERVICE_API_KEY } : {}),
});

const pyPost = (path, data, opts = {}) =>
  axios.post(`${PYTHON_SERVICE}${path}`, data, { ...opts, headers: { ...pythonHeaders(), ...(opts.headers || {}) } });

const pyGet = (path, opts = {}) =>
  axios.get(`${PYTHON_SERVICE}${path}`, { ...opts, headers: { ...pythonHeaders(), ...(opts.headers || {}) } });

module.exports = { pyPost, pyGet, PYTHON_SERVICE };
