# @smb-tech/logger-react

React/browser adapter for `@smb-tech/logger-core`.

It provides browser trace context, React initialization, browser logging, and helpers for propagating tracing headers through `fetch` or Axios.

## Installation

```bash
npm install @smb-tech/logger-react
```

This package depends on `@smb-tech/logger-core` and has a peer dependency on React.

## Setup

Wrap your React app with `LoggingProvider`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { LoggingProvider } from '@smb-tech/logger-react';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoggingProvider
      level={import.meta.env.VITE_LOG_LEVEL}
      sensitiveKeys={['authorization', 'password', 'token']}
    >
      <App />
    </LoggingProvider>
  </React.StrictMode>
);
```

For Vite, use:

```env
VITE_LOG_LEVEL=INFO
```

## Browser Logging

```ts
import { BrowserContextStore, ReactLogger } from '@smb-tech/logger-react';

const logger = ReactLogger.get('ProfilePage');

BrowserContextStore.setMdc('screen', 'profile');

logger.info((event) => {
  event
    .message('Profile saved')
    .tag('ui')
    .with('section', 'preferences');
});
```

Logs are written to the browser console as JSON strings.

## Context

Create a browser trace context manually:

```ts
import { BrowserContextStore, BrowserTraceContextFactory } from '@smb-tech/logger-react';

const context = BrowserTraceContextFactory.create({
  mdc: {
    screen: 'checkout'
  }
});

BrowserContextStore.set(context);
```

Read the current MDC:

```ts
const mdc = BrowserContextStore.getMdc();
console.log(mdc.traceId, mdc.spanId);
```

Add metadata:

```ts
BrowserContextStore.setMdc('feature', 'checkout');
BrowserContextStore.setManyMdc({
  tenantId: 'tenant-1',
  flow: 'checkout-submit'
});
```

Clear context:

```ts
BrowserContextStore.clear();
```

## HTTP Trace Modes

Browser request helpers support three modes:

- `root`: creates a new execution context.
- `child`: keeps current `traceId`, creates a new `spanId`, and sets `parentSpanId`.
- `reuse`: uses the current context if it exists, otherwise creates one.

## Fetch

```ts
import { apiFetch } from '@smb-tech/logger-react';

const response = await apiFetch('http://localhost:3000/health', undefined, {
  mode: 'root',
  mdc: {
    flow: 'frontend-to-backend'
  }
});

const payload = await response.json();
```

For manual `fetch` control:

```ts
import { prepareTraceRequestInit } from '@smb-tech/logger-react';

const request = prepareTraceRequestInit({
  method: 'POST',
  body: JSON.stringify({ name: 'Ada' })
}, {
  mode: 'root',
  mdc: {
    flow: 'create-user'
  }
});

await fetch('/api/users', request.init);
```

## Axios

```ts
import axios, { AxiosHeaders } from 'axios';
import { getTraceHeaders, resolveBrowserHttpContext } from '@smb-tech/logger-react';

export const apiClient = axios.create({
  baseURL: 'http://localhost:3000'
});

apiClient.interceptors.request.use((config) => {
  const context = resolveBrowserHttpContext({ mode: 'reuse' });
  const headers = AxiosHeaders.from(config.headers);

  Object.entries(getTraceHeaders(context)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  config.headers = headers;
  return config;
});
```

Start a new trace before a specific flow:

```ts
import { startHttpExecutionContext } from '@smb-tech/logger-react';

const context = startHttpExecutionContext({
  mdc: {
    flow: 'frontend-to-backend'
  }
});

console.log(context.mdc.traceId);
```

## API Reference

Context:

- `BrowserTraceContextFactory.create(options?)`
- `BrowserTraceContextFactory.createExecution(options?)`
- `BrowserTraceContextFactory.createChildExecution(options?)`
- `BrowserContextStore.set(context)`
- `BrowserContextStore.get()`
- `BrowserContextStore.getMdc()`
- `BrowserContextStore.getPersistentMdc()`
- `BrowserContextStore.setMdc(key, value)`
- `BrowserContextStore.setManyMdc(values)`
- `BrowserContextStore.clear()`

HTTP:

- `startHttpExecutionContext(options?)`
- `startHttpChildExecutionContext(options?)`
- `resolveBrowserHttpContext(options?)`
- `getTraceHeaders(context?)`
- `applyBrowserTraceHeaders(headers, context?)`
- `prepareTraceRequestInit(init?, options?)`
- `apiFetch(input, init?, options?)`

Logging:

- `ReactLogger.get(contextName)`
- `LoggingProvider`

## Headers

The browser helpers send:

- `x-request-id`
- `X-B3-TraceId`
- `X-B3-SpanId`
- `X-B3-ParentSpanId`

Your backend must allow those headers in CORS preflight responses.
