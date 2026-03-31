# smb-tech Logger

A structured logging system with distributed tracing support for Node.js and React applications.

## 📦 Packages

- **@smb-tech/logger-core** → Core logging primitives
- **@smb-tech/logger-node** → Node.js adapter with AsyncLocalStorage
- **@smb-tech/logger-react** → React/browser adapter with client-side context

---

## 🚀 Features

- Structured JSON logging
- TraceId / SpanId propagation
- Async context handling (Node)
- Client-side context management (React)
- Framework agnostic (Express, Next.js, NestJS)

---

## 🏗️ Monorepo Structure

```
packages/
  logger-core/
  logger-node/
  logger-react/

apps/
  backend-express/
  backend-next/
  react-demo/
```

---

## ⚙️ Installation

### Backend (Node)

```
npm install @smb-tech/logger-node
```

### Frontend (React)

```
npm install @smb-tech/logger-react
```

---

## 🧪 Running the Project (Monorepo)

### Install dependencies

```
npm install
```

### Build all packages

```
npm run build
```

---

### Run Express backend

```
npm run dev:backend
```

Runs:
```
http://localhost:3000/health
```

---

### Run Next.js backend

```
npm run dev:backend-next
```

Runs:
```
http://localhost:3000/health
```

---

### Run React demo

```
npm run dev:react
```

Runs:
```
http://localhost:5173
```

---

## 🔧 Example Usage

### Node (Express / Next / Nest)

```ts
import { runWithNodeContext, Logger } from '@smb-tech/logger-node';

const logger = Logger.get('App');

runWithNodeContext(() => {
  logger.info((event) => {
    event.message('Request started');
  });
});
```

---

### Express Middleware

```ts
app.use((req, res, next) => {
  runWithNodeContext(() => next(), {
    traceId: req.header('x-b3-traceid') ?? undefined
  });
});
```

---

### React Context Initialization

```ts
import { BrowserContextStore, BrowserTraceContextFactory } from '@smb-tech/logger-react';

const context = BrowserTraceContextFactory.create();
BrowserContextStore.set(context);
```

---

### Sending Trace Headers (React → Backend)

```ts
import { BrowserContextStore } from '@smb-tech/logger-react';

const mdc = BrowserContextStore.getMdc();

fetch('/health', {
  headers: {
    'x-request-id': mdc.requestId,
    'x-b3-traceid': mdc.traceId,
    'x-span-id': mdc.spanId
  }
});
```

---

## 🔄 Distributed Tracing Flow

```
React → API (traceId propagated) → Node → Logs
```

- traceId remains the same across services
- spanId changes per execution unit

---

## 📦 Publishing

```
npm run release
```

Packages:

- @smb-tech/logger-core
- @smb-tech/logger-node
- @smb-tech/logger-react

---

## 🧠 Best Practices

- Always propagate `traceId`
- Generate new `spanId` per execution
- Avoid logging sensitive data
- Use structured logs for observability platforms

---

## 📄 License

MIT
