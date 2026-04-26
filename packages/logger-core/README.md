# @smb-tech/logger-core

Core primitives for structured JSON logging.

Use this package directly when you are building a custom runtime adapter. For Node.js applications, prefer `@smb-tech/logger-node`. For React/browser applications, prefer `@smb-tech/logger-react`.

## Installation

```bash
npm install @smb-tech/logger-core
```

## What It Provides

- `Logger`: emits structured JSON logs.
- `LogEvent`: builder used by logger methods.
- `LoggerConfiguration`: global runtime configuration.
- safe serialization for `data`.
- safe serialization for errors, including `cause`, `code`, and metadata.
- configurable redaction of sensitive keys.
- configurable sampling.
- TypeScript types for log payloads and runtime adapters.

## Basic Usage

```ts
import { Logger, LoggerConfiguration } from '@smb-tech/logger-core';

LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sampleRate: 1,
  sensitiveKeys: ['authorization', 'password', 'token']
});

const logger = new Logger(
  'MyClass',
  {
    getMdc: () => ({
      requestId: 'request-1',
      traceId: '0123456789abcdef',
      spanId: '1111111111111111'
    })
  },
  {
    dispatch: (line, level) => {
      const stream = level === 'ERROR' || level === 'WARN' ? console.error : console.log;
      stream(line);
    }
  },
  {
    getThreadLabel: () => 'custom-runtime',
    fallbackId: () => 'fallback-id'
  }
);

logger.info((event) => {
  event
    .message('User loaded')
    .tag('user')
    .with('userId', '123');
});
```

Most projects should not instantiate `Logger` manually. Runtime packages provide easier factories such as `NodeLogger.get(...)` and `ReactLogger.get(...)`.

## LoggerConfiguration

```ts
LoggerConfiguration.configure({
  level: 'INFO',
  sampleRate: 1,
  sampledLevels: ['TRACE', 'DEBUG', 'INFO', 'TRACK', 'METRIC'],
  errorStackEnabled: true,
  maxRedactionInputLength: 4096,
  sensitiveKeys: ['authorization', 'cookie', 'password', 'token'],
  redactPlaceholder: '[REDACTED]',
  internalErrorHandler: (error, context) => {
    console.error('Logger failed internally', { error, context });
  }
});
```

Options:

- `level`: minimum emitted level. Defaults to `INFO`.
- `sampleRate`: number from `0` to `1`. Defaults to `1`.
- `sampledLevels`: levels affected by sampling.
- `sensitiveKeys`: extra keys or per-key masking rules. Default sensitive keys are always included.
- `redactPlaceholder`: value used for redacted fields. Defaults to `[REDACTED]`.
- `errorStackEnabled`: includes serialized error stack traces when `true`. Defaults to `true`.
- `maxRedactionInputLength`: maximum string length processed by regex masking. Longer sensitive values are replaced directly.
- `internalErrorHandler`: callback used when the logger itself fails.

## Levels

Supported levels:

- `TRACE`
- `DEBUG`
- `INFO`
- `WARN`
- `ERROR`
- `METRIC`
- `AUDIT`
- `SECURITY`
- `TRACK`

Level priority:

- `TRACE` < `DEBUG` < `INFO`
- `WARN`, `AUDIT`, and `SECURITY` are treated as warning priority.
- `ERROR` is the highest priority.

## Event Builder

```ts
logger.info((event) => {
  event
    .type('ACCESS')
    .message('Request completed')
    .tag('http')
    .with('method', 'GET')
    .with('path', '/health')
    .with('statusCode', 200);
});
```

Available builder methods:

- `message(message)`: sets `msg`.
- `type(type)`: sets event type.
- `tag(tag)`: adds a tag.
- `with(key, value)`: adds structured data.
- `error(error)`: attaches any throwable or unknown error value.
- `sensitive()`: marks the event as containing PII.

## Payload Shape

Every log line is JSON with these top-level fields:

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

Example:

```json
{
  "ts": "2026-04-24T02:14:45.263Z",
  "uuid": "request-1",
  "type": "INFO",
  "msg": "User loaded",
  "class": "MyClass",
  "pii": false,
  "thread": "custom-runtime",
  "mdc": {
    "requestId": "request-1",
    "traceId": "0123456789abcdef",
    "spanId": "1111111111111111"
  },
  "data": {
    "userId": "123"
  },
  "tags": ["user"],
  "exception": {}
}
```

## Redaction

Fields matching default or configured sensitive keys are replaced before emission.

Important behavior:

- `event.sensitive()` sets `pii: true`.
- `event.sensitive()` does not redact every field automatically.
- masking is key-based and uses `sensitiveKeys` plus the default sensitive keys.
- masking applies to `mdc`, `data`, and error metadata.

```ts
LoggerConfiguration.configure({
  sensitiveKeys: ['rut', 'email', 'authorization']
});

logger.info((event) => {
  event
    .message('Login attempt')
    .sensitive()
    .with('email', 'user@example.com')
    .with('authorization', 'Bearer secret')
    .with('status', 'FAILED');
});
```

Output:

```json
{
  "pii": true,
  "data": {
    "email": "[REDACTED]",
    "authorization": "[REDACTED]",
    "status": "FAILED"
  }
}
```

If the event is marked sensitive but the field key is not configured as sensitive, the value remains visible:

```ts
logger.info((event) => {
  event
    .message('Profile viewed')
    .sensitive()
    .with('profileId', 'profile-123');
});
```

Output:

```json
{
  "pii": true,
  "data": {
    "profileId": "profile-123"
  }
}
```

To mask `profileId`, add it to `sensitiveKeys`.

Default sensitive keys include:

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

You can change the placeholder:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: ['email'],
  redactPlaceholder: '[MASKED]'
});
```

Output:

```json
{
  "data": {
    "email": "[MASKED]"
  }
}
```

## Per-Key Regex Masking

`sensitiveKeys` accepts strings and rule objects.

Use a string when the whole value should be replaced:

```ts
LoggerConfiguration.configure({
  sensitiveKeys: ['password', 'token']
});
```

Use a rule object when the value should be transformed with a regex:

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

Input:

```ts
logger.info((event) => {
  event
    .message('Calling dependency')
    .with('authorization', 'Bearer abc.def.ghi')
    .with('apiKey', 'abcd1234');
});
```

Output data:

```json
{
  "authorization": "Bearer ****",
  "apiKey": "abcd****"
}
```

If a rule has no `pattern`, the full value is replaced with `replacement` or `redactPlaceholder`.

If the value is not a string, the full value is replaced with `replacement` or `redactPlaceholder`.

Regex rules are also applied to serialized error messages and stack traces. Unsafe nested quantifier patterns such as `(a+)+` are rejected during configuration, and very long sensitive strings are replaced directly instead of being processed by regex.

## Error Serialization

```ts
const cause = new Error('Database unavailable');
const error = Object.assign(new Error('User lookup failed', { cause }), {
  code: 'USER_LOOKUP_FAILED',
  metadata: {
    userId: '123',
    token: 'secret'
  }
});

logger.error((event) => {
  event.message('Failed to load user').error(error);
});
```

The logger serializes:

- `class`
- `message`
- `stack`
- `code`
- `metadata`
- nested `cause`

It also avoids circular references and caps nested object depth.

## Sampling

```ts
LoggerConfiguration.configure({
  level: 'INFO',
  sampleRate: 0.25,
  sampledLevels: ['INFO', 'DEBUG', 'TRACE']
});
```

Sampling applies only to configured sampled levels. High-signal levels such as `ERROR`, `WARN`, `AUDIT`, and `SECURITY` are not sampled by default.

## Contract Tests

This package includes contract tests for the payload shape:

```bash
npm run test -w @smb-tech/logger-core
```
