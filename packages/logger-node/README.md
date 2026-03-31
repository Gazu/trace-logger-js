# @smb-tech/logger-node

Node.js adapter for structured logging with AsyncLocalStorage.

## Features

- Request context (MDC)
- TraceId / SpanId propagation
- AsyncLocalStorage support
- Express / Next / Nest compatible

## Installation

```bash
npm install @smb-tech/logger-node
```

## Example

```ts
import { runWithNodeContext, Logger } from '@smb-tech/logger-node';

runWithNodeContext(() => {
  const logger = Logger.get('App');

  logger.info((event) => {
    event.message('Request started');
  });
});
```
