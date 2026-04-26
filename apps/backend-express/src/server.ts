import './env.js';
import { createApp } from './app.js';
import { LoggerConfiguration } from '@smb-tech/logger-core';
import { NodeLogger, NodeLogSink } from '@smb-tech/logger-node';

const internalMetricsEnabled = parseBoolean(process.env.LOGGER_INTERNAL_METRICS_ENABLED);
const configuredLevel = LoggerConfiguration.configure({
  level: process.env.LOG_LEVEL,
  sampleRate: parseSampleRate(process.env.LOGGER_SAMPLE_RATE),
  errorStackEnabled: parseBoolean(process.env.LOGGER_ERROR_STACK_ENABLED, true),
  sensitiveKeys: [
    'authorization',
    'cookie',
    'password',
    'token',
    'client_secret'
  ]
});

NodeLogSink.initialize({
  mode: 'async',
  flushIntervalMs: Number(process.env.LOGGER_FLUSH_INTERVAL_MS ?? 10),
  maxQueueSize: Number(process.env.LOGGER_MAX_QUEUE_SIZE ?? 10000),
  overflowStrategy: parseOverflowStrategy(process.env.LOGGER_OVERFLOW_STRATEGY),
  shutdownTimeoutMs: Number(process.env.LOGGER_SHUTDOWN_TIMEOUT_MS ?? 2000),
  metricsEnabled: internalMetricsEnabled
});

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const logger = NodeLogger.get('Bootstrap');

const server = app.listen(port, () => {
  logger.info((event) => {
    event
      .message('Server started')
      .with('port', port)
      .with('logLevel', configuredLevel)
      .with('internalMetricsEnabled', internalMetricsEnabled);
  });
});

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  server.close(async () => {
    await NodeLogSink.shutdown({
      timeoutMs: Number(process.env.LOGGER_SHUTDOWN_TIMEOUT_MS ?? 2000)
    });
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

function parseBoolean(value?: string, defaultValue = false): boolean {
  if (value == null) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}

function parseSampleRate(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOverflowStrategy(value?: string): 'drop' | 'sync-fallback' | undefined {
  return value === 'drop' || value === 'sync-fallback' ? value : undefined;
}
