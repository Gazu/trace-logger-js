# @smb-tech/logger-react

React/browser adapter for structured logging.

## Features

- Client-side context store
- TraceId propagation to backend
- Compatible with fetch / axios
- Lightweight

## Installation

```bash
npm install @smb-tech/logger-react
```

## Example

```ts
import { BrowserContextStore, BrowserTraceContextFactory } from '@smb-tech/logger-react';

const context = BrowserTraceContextFactory.create();
BrowserContextStore.set(context);
```

## Sending trace headers

```ts
const mdc = BrowserContextStore.getMdc();

fetch('/api', {
  headers: {
    'x-b3-traceid': mdc.traceId
  }
});
```
