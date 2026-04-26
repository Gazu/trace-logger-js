import axios, { AxiosHeaders } from 'axios';
import { getTraceHeaders, resolveBrowserHttpContext } from '@smb-tech/logger-react';

export const apiClient = axios.create({
  baseURL: 'http://localhost:3000'
});

apiClient.interceptors.request.use((config) => {
  const context = resolveBrowserHttpContext({ mode: 'reuse' });
  const headers = AxiosHeaders.from(config.headers);
  const traceHeaders = getTraceHeaders(context);

  Object.entries(traceHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  config.headers = headers;

  return config;
});
