import { LoggerConfiguration } from './config.js';
import { sanitizeRecord } from './data.js';
import { serializeError } from './error.js';
import { LogEvent } from './event.js';
import type {
  LogContextAccessor,
  LogLevel,
  LogPayload,
  LogSink,
  RuntimeDetailsProvider
} from './types.js';

const ENABLED_LEVELS = new Set<LogLevel>(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'METRIC', 'AUDIT', 'SECURITY', 'TRACK']);

export class Logger {
  constructor(
    private readonly contextName: string,
    private readonly contextAccessor: LogContextAccessor,
    private readonly sink: LogSink,
    private readonly runtimeDetailsProvider: RuntimeDetailsProvider
  ) {}

  trace(builder: (event: LogEvent) => void): void {
    this.log('TRACE', builder);
  }

  debug(builder: (event: LogEvent) => void): void {
    this.log('DEBUG', builder);
  }

  info(builder: (event: LogEvent) => void): void {
    this.log('INFO', builder);
  }

  warn(builder: (event: LogEvent) => void): void {
    this.log('WARN', builder);
  }

  error(builder: (event: LogEvent) => void): void {
    this.log('ERROR', builder);
  }

  metric(builder: (event: LogEvent) => void): void {
    this.log('METRIC', (event) => {
      event.type('METRIC');
      builder(event);
    });
  }

  audit(builder: (event: LogEvent) => void): void {
    this.log('AUDIT', (event) => {
      event.type('AUDIT');
      builder(event);
    });
  }

  security(builder: (event: LogEvent) => void): void {
    this.log('SECURITY', (event) => {
      event.type('SECURITY');
      builder(event);
    });
  }

  track(builder: (event: LogEvent) => void): void {
    this.log('TRACK', (event) => {
      event.type('TRACK');
      builder(event);
    });
  }

  private log(level: LogLevel, builder: (event: LogEvent) => void): void {
    if (!ENABLED_LEVELS.has(level)) {
      return;
    }

    if (!LoggerConfiguration.isEnabled(level)) {
      return;
    }

    if (!LoggerConfiguration.shouldSample(level)) {
      return;
    }

    const event = new LogEvent();

    try {
      builder(event);
    } catch (error) {
      LoggerConfiguration.reportInternalError(error, {
        contextName: this.contextName,
        level,
        phase: 'builder'
      });
      return;
    }

    let payload: LogPayload;

    try {
      payload = this.toPayload(level, event);
    } catch (error) {
      LoggerConfiguration.reportInternalError(error, {
        contextName: this.contextName,
        level,
        phase: 'payload'
      });
      return;
    }

    try {
      this.sink.dispatch(JSON.stringify(payload), level);
    } catch (error) {
      LoggerConfiguration.reportInternalError(error, {
        contextName: this.contextName,
        level,
        phase: 'dispatch'
      });
    }
  }

  private toPayload(level: LogLevel, event: LogEvent): LogPayload {
    const normalized = event.toJSON();
    const error = normalized.error;
    const mdc = sanitizeMdc(this.contextAccessor.getMdc());

    return {
      ts: new Date().toISOString(),
      uuid: mdc.requestId ?? this.runtimeDetailsProvider.fallbackId(),
      type: normalized.type === 'APP' ? level : normalized.type,
      msg: normalized.msg,
      class: this.contextName,
      pii: normalized.pii,
      thread: this.runtimeDetailsProvider.getThreadLabel(),
      mdc,
      data: sanitizeRecord(normalized.data),
      tags: normalized.tags,
      exception: serializeError(error)
    };
  }
}

function sanitizeMdc(mdc: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mdc).map(([key, value]) => {
      if (LoggerConfiguration.isSensitiveKey(key)) {
        return [key, String(LoggerConfiguration.redactValue(key, value))];
      }

      return [key, value];
    })
  );
}
