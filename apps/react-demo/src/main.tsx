import React from 'react';
import ReactDOM from 'react-dom/client';
import { LoggingProvider } from '@smb-tech/logger-react';
import { App } from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoggingProvider
      level={import.meta.env.VITE_LOG_LEVEL}
      timezone={import.meta.env.VITE_LOGGER_TIMEZONE}
      sensitiveKeys={['authorization', 'password', 'token']}
    >
      <App />
    </LoggingProvider>
  </React.StrictMode>
);
