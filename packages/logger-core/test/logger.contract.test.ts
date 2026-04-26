import test from 'node:test';
import assert from 'node:assert/strict';
import { LoggerConfiguration, Logger, type LogLevel } from '../src/index.js';

class MemorySink {
  lines: Array<{ line: string; level: LogLevel }> = [];

  dispatch(line: string, level: LogLevel): void {
    this.lines.push({ line, level });
  }
}

const runtime = {
  getThreadLabel: () => 'test-thread',
  fallbackId: () => 'fallback-id'
};

test('emits the stable v1 log payload contract', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'TRACE',
    sampleRate: 1,
    sensitiveKeys: ['password']
  });

  const logger = new Logger(
    'ContractLogger',
    {
      getMdc: () => ({
        requestId: 'request-1',
        traceId: '0123456789abcdef',
        spanId: '1111111111111111',
        parentSpanId: '2222222222222222'
      })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event
      .message('Contract event')
      .tag('contract')
      .with('count', 1)
      .with('password', 'secret');
  });

  assert.equal(sink.lines.length, 1);
  const payload = JSON.parse(sink.lines[0].line);

  assert.deepEqual(Object.keys(payload).sort(), [
    'class',
    'data',
    'exception',
    'mdc',
    'msg',
    'pii',
    'tags',
    'thread',
    'ts',
    'type',
    'uuid'
  ].sort());

  assert.equal(payload.type, 'INFO');
  assert.equal(payload.msg, 'Contract event');
  assert.equal(payload.class, 'ContractLogger');
  assert.equal(payload.uuid, 'request-1');
  assert.equal(payload.thread, 'test-thread');
  assert.deepEqual(payload.tags, ['contract']);
  assert.equal(payload.data.count, 1);
  assert.equal(payload.data.password, '[REDACTED]');
  assert.equal(payload.mdc.traceId, '0123456789abcdef');
  assert.equal(payload.mdc.spanId, '1111111111111111');
  assert.equal(payload.mdc.parentSpanId, '2222222222222222');
  assert.deepEqual(payload.exception, {});
});

test('serializes errors with code, metadata, and cause safely', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'ERROR',
    sampleRate: 1,
    sensitiveKeys: ['token']
  });

  const cause = new Error('Root cause');
  const error = Object.assign(new Error('Wrapper failed', { cause }), {
    code: 'E_WRAPPER',
    metadata: {
      token: 'secret-token',
      attempt: 2
    }
  });

  const logger = new Logger(
    'ErrorLogger',
    {
      getMdc: () => ({ requestId: 'request-2' })
    },
    sink,
    runtime
  );

  logger.error((event) => {
    event.message('Error event').error(error);
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.exception.class, 'Error');
  assert.equal(payload.exception.message, 'Wrapper failed');
  assert.equal(payload.exception.code, 'E_WRAPPER');
  assert.equal(payload.exception.metadata.token, '[REDACTED]');
  assert.equal(payload.exception.metadata.attempt, 2);
  assert.equal(payload.exception.cause.class, 'Error');
  assert.equal(payload.exception.cause.message, 'Root cause');
});

test('does not emit sampled logs when sample rate is zero', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'TRACE',
    sampleRate: 0
  });

  const logger = new Logger(
    'SamplingLogger',
    {
      getMdc: () => ({ requestId: 'request-3' })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event.message('Sampled out');
  });

  assert.equal(sink.lines.length, 0);
});

test('supports per-key regex masking rules', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'INFO',
    sampleRate: 1,
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

  const logger = new Logger(
    'MaskingLogger',
    {
      getMdc: () => ({
        requestId: 'request-4',
        authorization: 'Bearer abc.def.ghi'
      })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event
      .message('Masked event')
      .with('authorization', 'Bearer xyz.123')
      .with('apiKey', 'abcd1234');
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.mdc.authorization, 'Bearer ****');
  assert.equal(payload.data.authorization, 'Bearer ****');
  assert.equal(payload.data.apiKey, 'abcd****');
});

test('redacts configured regex matches from error messages and can disable stack traces', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'ERROR',
    sampleRate: 1,
    errorStackEnabled: false,
    sensitiveKeys: [
      {
        key: 'token',
        pattern: /secret-token/g,
        replacement: '****'
      }
    ]
  });

  const logger = new Logger(
    'ErrorMaskingLogger',
    {
      getMdc: () => ({ requestId: 'request-5' })
    },
    sink,
    runtime
  );

  logger.error((event) => {
    event
      .message('Error with sensitive message')
      .error(new Error('Request failed with token secret-token'));
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.exception.message, 'Request failed with token ****');
  assert.equal(payload.exception.stack, undefined);
});

test('rejects unsafe nested regex masking rules', () => {
  assert.throws(() => {
    LoggerConfiguration.configure({
      sensitiveKeys: [
        {
          key: 'token',
          pattern: /(a+)+$/,
          replacement: '****'
        }
      ]
    });
  }, /Unsafe sensitive key regex rejected/);
});

test('bounds regex masking work for long sensitive values', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'INFO',
    sampleRate: 1,
    maxRedactionInputLength: 4,
    sensitiveKeys: [
      {
        key: 'token',
        pattern: /secret/g,
        replacement: '****'
      }
    ]
  });

  const logger = new Logger(
    'BoundedRegexLogger',
    {
      getMdc: () => ({ requestId: 'request-6' })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event
      .message('Bounded masking')
      .with('token', 'very-long-secret-token');
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.data.token, '****');
});

test('sanitizes hostile payloads without leaking nested sensitive values', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'INFO',
    sampleRate: 1,
    maxRedactionInputLength: 4096,
    sensitiveKeys: ['password', 'token']
  });

  const circular: Record<string, unknown> = {
    password: 'secret',
    nested: {
      token: 'secret-token'
    }
  };
  circular.self = circular;

  const huge = Array.from({ length: 2000 }, (_, index) => ({
    index,
    token: `token-${index}`
  }));

  const logger = new Logger(
    'HostilePayloadLogger',
    {
      getMdc: () => ({ requestId: 'request-7' })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event
      .message('Hostile payload')
      .with('circular', circular)
      .with('huge', huge)
      .with('bigint', 123n);
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.data.circular.password, '[REDACTED]');
  assert.equal(payload.data.circular.nested.token, '[REDACTED]');
  assert.equal(payload.data.circular.self, '[Circular]');
  assert.equal(payload.data.huge.length, 25);
  assert.equal(payload.data.huge[0].token, '[REDACTED]');
  assert.equal(payload.data.bigint, '123');
});

test('supports nested path masking rules without masking same-named fields elsewhere', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'INFO',
    sampleRate: 1,
    sensitiveKeys: [
      {
        path: 'user.credentials.partnerId',
        pattern: /(?<=.{4})./g,
        replacement: '*'
      }
    ]
  });

  const logger = new Logger(
    'PathMaskingLogger',
    {
      getMdc: () => ({ requestId: 'request-8' })
    },
    sink,
    runtime
  );

  logger.info((event) => {
    event
      .message('Path masked event')
      .with('user', {
        credentials: {
          partnerId: 'abcd1234'
        },
        publicProfile: {
          partnerId: 'visible-key'
        }
      });
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.data.user.credentials.partnerId, 'abcd****');
  assert.equal(payload.data.user.publicProfile.partnerId, 'visible-key');
});

test('supports path masking inside error metadata', () => {
  const sink = new MemorySink();

  LoggerConfiguration.configure({
    level: 'ERROR',
    sampleRate: 1,
    errorStackEnabled: false,
    sensitiveKeys: [
      {
        path: 'metadata.http.authorization',
        pattern: /^Bearer\s+.+$/i,
        replacement: 'Bearer ****'
      }
    ]
  });

  const error = Object.assign(new Error('Upstream failed'), {
    metadata: {
      http: {
        authorization: 'Bearer secret-token'
      }
    }
  });

  const logger = new Logger(
    'ErrorPathMaskingLogger',
    {
      getMdc: () => ({ requestId: 'request-9' })
    },
    sink,
    runtime
  );

  logger.error((event) => {
    event.message('Error path masked event').error(error);
  });

  const payload = JSON.parse(sink.lines[0].line);

  assert.equal(payload.exception.metadata.http.authorization, 'Bearer ****');
});
