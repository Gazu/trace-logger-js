export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'METRIC' | 'AUDIT' | 'SECURITY' | 'TRACK';

export type EventType = 'APP' | 'ERROR' | 'TRACK' | 'SECURITY' | 'AUDIT' | 'ACCESS' | 'METRIC' | string;

export interface ThrowablePayload {
  message?: string;
  class: string;
  code?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  cause?: ThrowablePayload;
}

export interface LogPayload {
  ts: string;
  uuid: string;
  type: EventType;
  msg: string;
  class: string;
  pii: boolean;
  thread: string;
  mdc: Record<string, string>;
  data: Record<string, unknown>;
  tags: string[];
  exception: Record<string, unknown> | ThrowablePayload;
}

export interface NormalizedLogEvent {
  type: EventType;
  msg: string;
  data: Record<string, unknown>;
  tags: string[];
  pii: boolean;
  error?: unknown;
}

export interface LogContextAccessor {
  getMdc(): Record<string, string>;
}

export interface LogSink {
  dispatch(line: string, level: LogLevel): void;
}

export interface RuntimeDetailsProvider {
  getThreadLabel(): string;
  fallbackId(): string;
}
