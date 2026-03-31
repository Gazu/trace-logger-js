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

    const event = new LogEvent();
    builder(event);

    const payload = this.toPayload(level, event);
    this.sink.dispatch(JSON.stringify(payload), level);
  }

  private toPayload(level: LogLevel, event: LogEvent): LogPayload {
    const normalized = event.toJSON();
    const error = normalized.error;
    const mdc = this.contextAccessor.getMdc();

    return {
      ts: new Date().toISOString(),
      uuid: mdc.requestId ?? this.runtimeDetailsProvider.fallbackId(),
      type: normalized.type === 'APP' ? level : normalized.type,
      msg: normalized.msg,
      class: this.contextName,
      pii: normalized.pii,
      thread: this.runtimeDetailsProvider.getThreadLabel(),
      mdc,
      data: normalized.data,
      tags: normalized.tags,
      exception: error
        ? {
            message: error.message,
            class: error.name,
            stack: error.stack,
            cause: error.cause instanceof Error ? error.cause.message : undefined
          }
        : {}
    };
  }
}
