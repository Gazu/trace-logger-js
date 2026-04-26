# @smb-tech/logger-node

Node.js adapter for `@smb-tech/logger-core`.

It adds request-scoped context with `AsyncLocalStorage`, HTTP tracing helpers, Express middleware, Next.js route helpers, stdout/stderr sinks, async queueing, backpressure, shutdown, and optional internal metrics.

## Installation

```bash
npm install @smb-tech/logger-node
```

This package depends on `@smb-tech/logger-core`.

## Bootstrap

Configure the logger and sink once when your service starts:

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

Recommended environment variables:

```env
LOG_LEVEL=INFO
LOGGER_SAMPLE_RATE=1
LOGGER_INTERNAL_METRICS_ENABLED=false
LOGGER_MAX_QUEUE_SIZE=10000
LOGGER_FLUSH_INTERVAL_MS=10
LOGGER_OVERFLOW_STRATEGY=sync-fallback
LOGGER_SHUTDOWN_TIMEOUT_MS=2000
```

## Create a Logger

```ts
import { NodeLogger } from '@smb-tech/logger-node';

const logger = NodeLogger.get('PaymentController');

logger.info((event) => {
  event
    .message('Payment authorized')
    .tag('payment')
    .with('paymentId', 'pay_123');
});
```

## Express

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

`createExpressTraceMiddleware()` reads:

- `x-request-id`
- `x-b3-traceid`
- `x-b3-spanid`
- `x-b3-parentspanid`

It creates a new local `spanId`, preserves the incoming `traceId`, and stores the incoming span as `parentSpanId`.

Custom header names:

```ts
app.use(createExpressTraceMiddleware({
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-b3-traceid',
  spanIdHeader: 'x-b3-spanid',
  parentSpanIdHeader: 'x-b3-parentspanid'
}));
```

## Next.js Route Handlers

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
        headers: getNextTraceResponseHeaders({
          'content-type': 'application/json'
        })
      }
    );
  });
}
```

## Manual Context

Use `runWithNodeContext` for root execution units:

```ts
import { NodeLogger, runWithNodeContext } from '@smb-tech/logger-node';

const logger = NodeLogger.get('Worker');

runWithNodeContext(() => {
  logger.info((event) => {
    event.message('Job started').tag('job');
  });
}, {
  mdc: {
    jobName: 'daily-settlement'
  }
});
```

Use `runWithNodeChildContext` for nested execution units:

```ts
import { RequestContextStore, runWithNodeChildContext } from '@smb-tech/logger-node';

runWithNodeChildContext(() => {
  console.log(RequestContextStore.getMdc());
});
```

## Outbound HTTP

Use `nodeFetch` when this service calls another service.

```ts
import { RequestContextStore, nodeFetch, withNodeHttpChildContext } from '@smb-tech/logger-node';

const response = await withNodeHttpChildContext(async () => {
  const mdc = RequestContextStore.getMdc();

  console.log('Outbound child span', {
    traceId: mdc.traceId,
    spanId: mdc.spanId,
    parentSpanId: mdc.parentSpanId
  });

  return nodeFetch('http://service-b/health', undefined, {
    reuseCurrentContext: true
  });
}, {
  mdc: {
    dependency: 'service-b'
  }
});
```

Helpers:

- `nodeFetch(input, init, options)`: fetch wrapper that injects tracing headers.
- `withNodeHttpChildContext(callback, options)`: creates a child context around outbound work.
- `getNodeTraceHeaders(context?)`: returns trace headers as an object.
- `applyNodeTraceHeaders(headers, context?)`: writes trace headers into `Headers`.
- `createNodeHttpChildContext(options?)`: creates a child context without running a callback.

## RequestContextStore

```ts
import { RequestContextStore } from '@smb-tech/logger-node';

RequestContextStore.setMdc('tenantId', 'tenant-1');
RequestContextStore.setManyMdc({
  operation: 'create-payment',
  component: 'api'
});

const traceId = RequestContextStore.getMdcValue('traceId');
const mdc = RequestContextStore.getMdc();
```

Protected MDC keys cannot be removed:

- `requestId`
- `traceId`
- `spanId`
- `parentSpanId`

## Sink Modes

Sync mode writes directly:

```ts
NodeLogSink.initialize({
  mode: 'sync'
});
```

Async mode queues and flushes periodically:

```ts
NodeLogSink.initialize({
  mode: 'async',
  flushIntervalMs: 10,
  maxQueueSize: 10000,
  overflowStrategy: 'sync-fallback'
});
```

Overflow strategies:

- `sync-fallback`: when the queue is full, write directly.
- `drop`: when the queue is full, discard the new log line.

## Shutdown

Flush logs before process exit:

```ts
await NodeLogSink.shutdown({
  timeoutMs: 2000
});
```

Express example:

```ts
const shutdown = async () => {
  server.close(async () => {
    await NodeLogSink.shutdown({ timeoutMs: 2000 });
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
```

## NestJS Setup

`@smb-tech/logger-node` exposes NestJS-compatible helpers without requiring a Nest runtime dependency.

Middleware:

```ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { createNestTraceMiddleware } from '@smb-tech/logger-node';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(createNestTraceMiddleware())
      .forRoutes('*');
  }
}
```

Global interceptor:

```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { createNestTraceInterceptor } from '@smb-tech/logger-node';

export const tracingInterceptorProvider = {
  provide: APP_INTERCEPTOR,
  useValue: createNestTraceInterceptor()
};
```

Both helpers read B3 headers, create a request context, and write trace headers back to the HTTP response.

## Internal Metrics

Enable metrics:

```ts
NodeLogSink.initialize({
  mode: 'async',
  metricsEnabled: true
});
```

Expose them through a protected internal route:

```ts
app.get('/internal/logger-metrics', (_req, res) => {
  res.status(200).json(NodeLogSink.getMetrics());
});
```

Metrics include:

- `enabled`
- `mode`
- `overflowStrategy`
- `queueSize`
- `maxQueueSize`
- `maxObservedQueueSize`
- `totalDispatched`
- `totalWritten`
- `totalQueued`
- `totalDropped`
- `totalSyncFallbacks`
- `totalFlushes`
- `totalFlushDurationMs`
- `totalWriteErrors`
- `lastFlushDurationMs`

## CORS Headers

If a browser sends tracing headers to an Express or Next backend, allow:

```text
Content-Type, Authorization, x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId
```

Expose:

```text
x-request-id, X-B3-TraceId, X-B3-SpanId, X-B3-ParentSpanId
```
