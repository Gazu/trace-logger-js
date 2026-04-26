# smb-tech Logger

Structured JSON logging and distributed tracing utilities for Node.js and React applications.

This repository contains three npm packages:

- `@smb-tech/logger-core`: shared logger primitives, payload shaping, redaction, sampling, and safe serialization.
- `@smb-tech/logger-node`: Node.js adapter with `AsyncLocalStorage`, Express/Next helpers, outbound HTTP propagation, async sink, backpressure, and internal metrics.
- `@smb-tech/logger-react`: browser/React adapter with client-side trace context and helpers for `fetch` or Axios.

The library is useful when you want every project to log with the same payload shape and propagate `traceId`, `spanId`, and `parentSpanId` across frontend, backend, and service-to-service calls.

## Packages

```bash
npm install @smb-tech/logger-node
npm install @smb-tech/logger-react
npm install @smb-tech/logger-core
```

For backend services, installing `@smb-tech/logger-node` is usually enough because it depends on `@smb-tech/logger-core`.

For React apps, installing `@smb-tech/logger-react` is usually enough because it depends on `@smb-tech/logger-core`.

## What It Emits

Each log is a single JSON line. The stable top-level payload fields are:

- `ts`: ISO timestamp.
- `uuid`: request id when available, otherwise runtime fallback id.
- `type`: log level or event type.
- `msg`: event message.
- `class`: logger context name.
- `pii`: whether the event was marked sensitive.
- `thread`: runtime execution label.
- `mdc`: mapped diagnostic context, including tracing fields.
- `data`: structured event data.
- `tags`: event tags.
- `exception`: serialized error payload or `{}`.

Example:

```json
{
  "ts": "2026-04-24T02:14:45.263Z",
  "uuid": "2a96b64dc6849000",
  "type": "INFO",
  "msg": "HTTP request completed",
  "class": "HttpServer",
  "pii": false,
  "thread": "pid-12345@host.local",
  "mdc": {
    "requestId": "2a96b64dc6849000",
    "traceId": "b08ece77f15f15d9196bcedd212169ff",
    "spanId": "4cde8b916c18a9ed",
    "parentSpanId": "d5af183c122daf21"
  },
  "data": {
    "method": "GET",
    "path": "/health",
    "statusCode": 200,
    "durationMs": 12
  },
  "tags": ["http"],
  "exception": {}
}
```

## Trace Model

The tracing model is intentionally simple:

- `traceId` remains the same across the whole distributed flow.
- `spanId` identifies the current execution unit.
- `parentSpanId` points to the upstream span.
- each inbound HTTP hop creates a new local `spanId`.
- each outbound HTTP call should create a child span.

Flow example:

```text
React -> Express -> Next

React:
traceId=A spanId=1

Express inbound:
traceId=A spanId=2 parentSpanId=1

Express outbound to Next:
traceId=A spanId=3 parentSpanId=2

Next inbound:
traceId=A spanId=4 parentSpanId=3
```

## Backend Quick Start

Install:

```bash
npm install @smb-tech/logger-node
```

Configure the logger and sink once during application bootstrap:

```ts
import { LoggerConfiguration } from '@smb-tech/logger-core';
import { NodeLogSink } from '@smb-tech/logger-node';

LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sampleRate: Number(process.env.LOGGER_SAMPLE_RATE ?? 1),
  sensitiveKeys: ['authorization', 'cookie', 'password', 'token']
});

NodeLogSink.initialize({
  mode: 'async',
  flushIntervalMs: Number(process.env.LOGGER_FLUSH_INTERVAL_MS ?? 10),
  maxQueueSize: Number(process.env.LOGGER_MAX_QUEUE_SIZE ?? 10000),
  overflowStrategy: process.env.LOGGER_OVERFLOW_STRATEGY === 'drop' ? 'drop' : 'sync-fallback',
  shutdownTimeoutMs: Number(process.env.LOGGER_SHUTDOWN_TIMEOUT_MS ?? 2000),
  metricsEnabled: process.env.LOGGER_INTERNAL_METRICS_ENABLED === 'true'
});
```

Create and use a logger:

```ts
import { NodeLogger } from '@smb-tech/logger-node';

const logger = NodeLogger.get('UserController');

logger.info((event) => {
  event
    .message('User loaded')
    .tag('user')
    .with('userId', '123');
});
```

## Express Setup

```ts
import express from 'express';
import { createExpressTraceMiddleware, NodeLogger } from '@smb-tech/logger-node';

const app = express();
const logger = NodeLogger.get('HttpServer');

app.use(express.json());
app.use(createExpressTraceMiddleware());

app.get('/health', (_req, res) => {
  logger.info((event) => {
    event.message('Health check executed').tag('health');
  });

  res.status(200).json({ status: 'UP' });
});
```

For CORS, allow the tracing headers:

```ts
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId'
  );
  res.header('Access-Control-Expose-Headers', 'x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
```

## Next.js Route Handler Setup

```ts
import {
  RequestContextStore,
  getNextTraceResponseHeaders,
  withNextRequestContext
} from '@smb-tech/logger-node';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return withNextRequestContext(request, () => {
    const mdc = RequestContextStore.getMdc();

    return new Response(
      JSON.stringify({
        status: 'ok',
        traceId: mdc.traceId,
        spanId: mdc.spanId,
        parentSpanId: mdc.parentSpanId
      }),
      {
        status: 200,
        headers: getNextTraceResponseHeaders({
          'content-type': 'application/json'
        })
      }
    );
  });
}
```

## Node Outbound HTTP

Use `nodeFetch` when a backend calls another backend.

```ts
import { RequestContextStore, nodeFetch, withNodeHttpChildContext } from '@smb-tech/logger-node';

const response = await withNodeHttpChildContext(async () => {
  const mdc = RequestContextStore.getMdc();

  console.log('Calling dependency with child span', {
    traceId: mdc.traceId,
    spanId: mdc.spanId,
    parentSpanId: mdc.parentSpanId
  });

  return nodeFetch('http://127.0.0.1:3001/health', undefined, {
    reuseCurrentContext: true
  });
}, {
  mdc: {
    dependency: 'backend-next'
  }
});
```

## React Quick Start

Install:

```bash
npm install @smb-tech/logger-react
```

Wrap the app:

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

Log browser events:

```ts
import { BrowserContextStore, ReactLogger } from '@smb-tech/logger-react';

const logger = ReactLogger.get('CheckoutPage');

BrowserContextStore.setMdc('screen', 'checkout');

logger.info((event) => {
  event
    .message('Checkout submitted')
    .tag('ui')
    .with('cartSize', 3);
});
```

## React Fetch

```ts
import { apiFetch } from '@smb-tech/logger-react';

const response = await apiFetch('http://localhost:3000/health', undefined, {
  mode: 'root',
  mdc: {
    flow: 'frontend-to-backend'
  }
});
```

## React Axios

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

Use `mode: 'root'` when starting a new user flow, `mode: 'child'` when creating a child browser span, and `mode: 'reuse'` when a context was already created before the request.

## Configuration Reference

Logger options:

- `level`: minimum log level. Valid values are `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `METRIC`, `AUDIT`, `SECURITY`, `TRACK`.
- `sensitiveKeys`: extra keys or per-key masking rules for `mdc`, `data`, and error metadata.
- `redactPlaceholder`: replacement value for sensitive keys. Default is `[REDACTED]`.
- `errorStackEnabled`: includes serialized error stack traces when `true`. Default is `true`.
- `maxRedactionInputLength`: maximum string length processed by regex masking. Longer sensitive values are replaced directly.
- `sampleRate`: number from `0` to `1`. Default is `1`.
- `sampledLevels`: levels affected by sampling. Defaults to `TRACE`, `DEBUG`, `INFO`, `TRACK`, `METRIC`.
- `internalErrorHandler`: optional callback for logger-internal failures.

## PII and Masking

Use `event.sensitive()` when an event contains personally identifiable or sensitive information. This sets `pii: true` in the emitted payload.

Masking is key-based:

- `event.sensitive()` marks the event with `pii: true`.
- values are redacted only when their key matches a default sensitive key or a configured `sensitiveKeys` entry.
- redaction applies to `mdc`, `data`, and error metadata.

Example:

```ts
import { LoggerConfiguration } from '@smb-tech/logger-core';
import { NodeLogger } from '@smb-tech/logger-node';

LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sensitiveKeys: ['email', 'rut', 'authorization']
});

const logger = NodeLogger.get('AuthController');

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
  "type": "WARN",
  "msg": "Login failed",
  "pii": true,
  "data": {
    "email": "[REDACTED]",
    "rut": "[REDACTED]",
    "authorization": "[REDACTED]",
    "reason": "INVALID_PASSWORD"
  },
  "tags": ["auth"]
}
```

If you mark an event as sensitive but the field key is not configured as sensitive, the value remains visible:

```ts
logger.info((event) => {
  event
    .message('Customer profile opened')
    .sensitive()
    .with('customerId', 'cus_123');
});
```

Output excerpt:

```json
{
  "pii": true,
  "data": {
    "customerId": "cus_123"
  }
}
```

Add `customerId` to `sensitiveKeys` if it must be masked.

Default masked keys:

- `password`
- `passwd`
- `secret`
- `token`
- `access_token`
- `refresh_token`
- `id_token`
- `authorization`
- `cookie`
- `set-cookie`
- `api-key`
- `apikey`
- `client-secret`
- `client_secret`

### Per-Key Regex Masking

`sensitiveKeys` accepts either strings or rule objects.

Use a string to replace the whole value:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: ['password', 'token']
});
```

Use a rule object to transform the value with a regex:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: [
    {
      key: 'authorization',
      pattern: /^Bearer\s+.+$/i,
      replacement: 'Bearer ****'
    },
    {
      key: 'apiKey',
      pattern: /(?<=.{4})./g,
      replacement: '*'
    }
  ]
});
```

Use `path` when only one nested location should be masked:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: [
    {
      path: 'user.credentials.apiKey',
      pattern: /(?<=.{4})./g,
      replacement: '*'
    }
  ]
});
```

Regex rules are also applied to serialized error messages and stack traces. Avoid unsafe nested quantifier patterns such as `(a+)+`; they are rejected during configuration. Very long sensitive string values are replaced directly instead of being processed by regex.

Input:

```ts
logger.info((event) => {
  event
    .message('Calling dependency')
    .with('authorization', 'Bearer abc.def.ghi')
    .with('apiKey', 'abcd1234');
});
```

Output excerpt:

```json
{
  "data": {
    "authorization": "Bearer ****",
    "apiKey": "abcd****"
  }
}
```

Node sink options:

- `mode`: `sync` or `async`.
- `flushIntervalMs`: interval for async queue flush.
- `maxQueueSize`: maximum queued log lines.
- `overflowStrategy`: `sync-fallback` or `drop`.
- `shutdownTimeoutMs`: max graceful shutdown wait.
- `metricsEnabled`: enables internal sink counters.

Recommended `.env`:

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

For Vite/React:

```env
VITE_LOG_LEVEL=INFO
```

## Internal Metrics

When `LOGGER_INTERNAL_METRICS_ENABLED=true`, expose `NodeLogSink.getMetrics()` behind an internal/protected route:

```ts
import { NodeLogSink } from '@smb-tech/logger-node';

app.get('/internal/logger-metrics', (_req, res) => {
  res.status(200).json(NodeLogSink.getMetrics());
});
```

Useful fields:

- `queueSize`
- `maxObservedQueueSize`
- `totalDispatched`
- `totalWritten`
- `totalQueued`
- `totalDropped`
- `totalSyncFallbacks`
- `totalWriteErrors`

## Monorepo Development

Install dependencies:

```bash
npm install
```

Build all packages and apps:

```bash
npm run build
```

Run contract tests:

```bash
npm run test
```

Run demos:

```bash
npm run dev:backend-next
npm run dev:backend-express
npm run dev:react
```

Demo endpoints:

- Express: `http://localhost:3000/health`
- Express -> Next hop: `http://localhost:3000/health/upstream`
- Express metrics: `http://localhost:3000/internal/logger-metrics`
- Next: `http://localhost:3001/health`
- Next metrics: `http://localhost:3001/internal/logger-metrics`
- React demo: `http://localhost:5173`

## Publishing Notes

Before publishing:

```bash
npm run release:check
```

`release:check` runs tests, builds every workspace, verifies package tarballs, and executes npm publish dry-runs for the three public packages.

Publishable packages:

- `@smb-tech/logger-core`
- `@smb-tech/logger-node`
- `@smb-tech/logger-react`

Package metadata:

- npm scope: `@smb-tech`
- author: `smb-tech`
- author URL: `https://smb-tech.cl`
- repository: `https://github.com/Gazu/trace-logger-js`

Versioning policy:

- packages are released together with the same SemVer version.
- the log payload contract is versioned by the npm package version.
- the payload does not include `schemaVersion`.
- breaking payload or public API changes require a major version bump.

See `docs/versioning.md` for the full policy.

## Recommended Adoption Order

1. Configure `LoggerConfiguration`.
2. Initialize `NodeLogSink` in backend apps.
3. Add inbound tracing middleware or route helpers.
4. Replace outbound backend calls with `nodeFetch`.
5. Wrap React apps with `LoggingProvider`.
6. Use `apiFetch` or Axios interceptors for frontend calls.
7. Enable internal metrics in non-public routes.

## Best Practices

- Do not log secrets, tokens, cookies, credentials, or full authorization headers.
- Add project-specific sensitive keys through `sensitiveKeys`.
- Use `traceId`, `spanId`, and `parentSpanId` to debug distributed flows.
- Keep `LOG_LEVEL=INFO` or higher in production unless debugging a short-lived incident.
- Prefer structured `data` fields over string-concatenated messages.
- Protect internal metrics routes.
