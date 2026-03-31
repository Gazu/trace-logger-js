import axios, { AxiosHeaders } from 'axios';
import { getTraceHeaders } from './trace-headers';

export const apiClient = axios.create({
  baseURL: 'http://localhost:3000'
});

apiClient.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);
  const traceHeaders = getTraceHeaders();

  Object.entries(traceHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  config.headers = headers;

  return config;
});