# Adoption Guide

Use this checklist when adding the logger to a new project.

## 1. Choose the Package

Backend service:

```bash
npm install @smb-tech/logger-node
```

React app:

```bash
npm install @smb-tech/logger-react
```

Custom runtime adapter:

```bash
npm install @smb-tech/logger-core
```

## 2. Add Environment Variables

Backend `.env`:

```env
LOG_LEVEL=INFO
LOGGER_SAMPLE_RATE=1
LOGGER_ERROR_STACK_ENABLED=false
LOGGER_INTERNAL_METRICS_ENABLED=false
LOGGER_MAX_QUEUE_SIZE=10000
LOGGER_FLUSH_INTERVAL_MS=10
LOGGER_OVERFLOW_STRATEGY=sync-fallback
LOGGER_SHUTDOWN_TIMEOUT_MS=2000
```

React `.env` for Vite:

```env
VITE_LOG_LEVEL=INFO
```

## 3. Bootstrap a Node Service

Create a logger bootstrap module and import it before creating app loggers.

```ts
import { LoggerConfiguration } from '@smb-tech/logger-core';
import { NodeLogSink, NodeLogger } from '@smb-tech/logger-node';

LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sampleRate: Number(process.env.LOGGER_SAMPLE_RATE ?? 1),
  errorStackEnabled: process.env.LOGGER_ERROR_STACK_ENABLED !== 'false',
  sensitiveKeys: ['authorization', 'cookie', 'password', 'token']
});

if (!NodeLogSink.isInitialized()) {
  NodeLogSink.initialize({
    mode: 'async',
    flushIntervalMs: Number(process.env.LOGGER_FLUSH_INTERVAL_MS ?? 10),
    maxQueueSize: Number(process.env.LOGGER_MAX_QUEUE_SIZE ?? 10000),
    overflowStrategy: process.env.LOGGER_OVERFLOW_STRATEGY === 'drop' ? 'drop' : 'sync-fallback',
    shutdownTimeoutMs: Number(process.env.LOGGER_SHUTDOWN_TIMEOUT_MS ?? 2000),
    metricsEnabled: process.env.LOGGER_INTERNAL_METRICS_ENABLED === 'true'
  });
}

export const logger = NodeLogger.get('App');
```

## 4. Add Express Tracing

```ts
import express from 'express';
import { createExpressTraceMiddleware } from '@smb-tech/logger-node';
import { logger } from './logger';

const app = express();

app.use(express.json());
app.use(createExpressTraceMiddleware());

app.get('/health', (_req, res) => {
  logger.info((event) => {
    event.message('Health check executed').tag('health');
  });

  res.status(200).json({ status: 'UP' });
});
```

## 5. Add Next.js Route Tracing

```ts
import { RequestContextStore, getNextTraceResponseHeaders, withNextRequestContext } from '@smb-tech/logger-node';
import { logger } from '../../lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return withNextRequestContext(request, () => {
    logger.info((event) => {
      event.message('Health check executed').tag('health');
    });

    const mdc = RequestContextStore.getMdc();

    return new Response(JSON.stringify({ status: 'ok', traceId: mdc.traceId }), {
      headers: getNextTraceResponseHeaders({
        'content-type': 'application/json'
      })
    });
  });
}
```

## 6. Add Backend Outbound Calls

```ts
import { nodeFetch, withNodeHttpChildContext } from '@smb-tech/logger-node';

const response = await withNodeHttpChildContext(async () => {
  return nodeFetch('http://dependency/health', undefined, {
    reuseCurrentContext: true
  });
}, {
  mdc: {
    dependency: 'dependency'
  }
});
```

## 7. Add React Logging

```tsx
import { LoggingProvider } from '@smb-tech/logger-react';

export function Root() {
  return (
    <LoggingProvider
      level={import.meta.env.VITE_LOG_LEVEL}
      sensitiveKeys={['authorization', 'password', 'token']}
    >
      <App />
    </LoggingProvider>
  );
}
```

```ts
import { BrowserContextStore, ReactLogger } from '@smb-tech/logger-react';

const logger = ReactLogger.get('Checkout');

BrowserContextStore.setMdc('screen', 'checkout');

logger.info((event) => {
  event
    .message('Checkout clicked')
    .tag('ui')
    .with('button', 'submit');
});
```

## 8. Add React HTTP Propagation

Fetch:

```ts
import { apiFetch } from '@smb-tech/logger-react';

await apiFetch('/api/health', undefined, {
  mode: 'root',
  mdc: {
    flow: 'frontend-to-api'
  }
});
```

Axios:

```ts
import axios, { AxiosHeaders } from 'axios';
import { getTraceHeaders, resolveBrowserHttpContext } from '@smb-tech/logger-react';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const context = resolveBrowserHttpContext({ mode: 'reuse' });
  const headers = AxiosHeaders.from(config.headers);

  Object.entries(getTraceHeaders(context)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  config.headers = headers;
  return config;
});
```

## 9. Add CORS Headers

If a browser calls your backend with tracing headers, allow:

```text
Content-Type, Authorization, x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId
```

Expose:

```text
x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId
```

## 10. Add Internal Metrics

Only expose this behind internal access controls.

```ts
import { NodeLogSink } from '@smb-tech/logger-node';

app.get('/internal/logger-metrics', (_req, res) => {
  if (process.env.LOGGER_INTERNAL_METRICS_ENABLED !== 'true') {
    res.status(404).json({ status: 'DISABLED' });
    return;
  }

  res.status(200).json(NodeLogSink.getMetrics());
});
```

Watch these fields:

- `totalDropped`
- `totalSyncFallbacks`
- `totalWriteErrors`
- `queueSize`
- `maxObservedQueueSize`

## 11. Use PII and Masking Correctly

Use `event.sensitive()` to mark a log as containing sensitive data. This sets `pii: true`.

Masking is key-based. A value is masked only when the key is included in default sensitive keys or your configured `sensitiveKeys`.

```ts
LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sensitiveKeys: [
    'email',
    'rut',
    {
      key: 'authorization',
      pattern: /^Bearer\s+.+$/i,
      replacement: 'Bearer ****'
    }
  ]
});

logger.warn((event) => {
  event
    .message('Login failed')
    .sensitive()
    .tag('auth')
    .with('email', 'user@example.com')
    .with('rut', '11111111-1')
    .with('authorization', 'Bearer secret')
    .with('reason', 'INVALID_PASSWORD');
});
```

Output excerpt:

```json
{
  "pii": true,
  "data": {
    "email": "[REDACTED]",
    "rut": "[REDACTED]",
    "authorization": "Bearer ****",
    "reason": "INVALID_PASSWORD"
  }
}
```

This event has `pii: true`, but `customerId` remains visible because it is not configured as sensitive:

```ts
logger.info((event) => {
  event
    .message('Customer profile opened')
    .sensitive()
    .with('customerId', 'cus_123');
});
```

```json
{
  "pii": true,
  "data": {
    "customerId": "cus_123"
  }
}
```

Add `customerId` to `sensitiveKeys` if your project treats it as sensitive.

For partial masking, configure a rule object:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: [
    {
      key: 'apiKey',
      pattern: /(?<=.{4})./g,
      replacement: '*'
    }
  ]
});
```

Use `path` for nested fields that should be masked only in one location:

```ts
LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sensitiveKeys: [
    {
      path: 'user.credentials.apiKey',
      pattern: /(?<=.{4})./g,
      replacement: '*'
    }
  ]
});
```

Input:

```json
{
  "apiKey": "abcd1234"
}
```

Output:

```json
{
  "apiKey": "abcd****"
}
```

Masking also applies to `mdc` and error metadata:

```ts
RequestContextStore.setMdc('authorization', 'Bearer secret');

const error = Object.assign(new Error('Request failed'), {
  metadata: {
    token: 'secret-token'
  }
});

logger.error((event) => {
  event.message('Request failed').error(error);
});
```

Output excerpt:

```json
{
  "mdc": {
    "authorization": "[REDACTED]"
  },
  "exception": {
    "metadata": {
      "token": "[REDACTED]"
    }
  }
}
```

## 12. Payload Contract

Top-level fields:

- `ts`
- `uuid`
- `type`
- `msg`
- `class`
- `pii`
- `thread`
- `mdc`
- `data`
- `tags`
- `exception`

Contract tests live in:

```text
packages/logger-core/test/logger.contract.test.ts
```

Run:

```bash
npm run test
```

## 13. Production Checklist

- `LOG_LEVEL` is `INFO`, `WARN`, or `ERROR`.
- `sensitiveKeys` include project-specific secrets.
- backend has inbound trace middleware or Next route wrapper.
- backend outbound calls use `nodeFetch` or trace headers.
- React calls use `apiFetch` or an Axios interceptor.
- CORS allows and exposes tracing headers.
- `NodeLogSink.shutdown()` is called during graceful shutdown.
- internal metrics route is protected.
- `npm run test` and `npm run build` pass.

## 14. Versioning

The publishable packages use synchronized SemVer:

- `@smb-tech/logger-core`
- `@smb-tech/logger-node`
- `@smb-tech/logger-react`

The log payload contract is versioned by the npm package version, not by a `schemaVersion` field in the payload.

Breaking changes to stable top-level payload fields or public TypeScript APIs require a major version bump. Backward-compatible features use minor versions, and compatible fixes use patch versions.

See `docs/versioning.md` for the full release policy.
