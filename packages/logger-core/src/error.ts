import { LoggerConfiguration } from './config.js';
import type { ThrowablePayload } from './types.js';

const MAX_DEPTH = 5;
const MAX_ENTRIES = 25;
const RESERVED_KEYS = new Set(['name', 'message', 'stack', 'cause', 'code', 'metadata']);

type ErrorWithExtras = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  cause?: unknown;
  code?: unknown;
  metadata?: unknown;
};

export function serializeError(error: unknown): ThrowablePayload | Record<string, never> {
  if (error == null) {
    return {};
  }

  return serializeThrowable(error, 0, new WeakSet<object>());
}

function serializeThrowable(
  error: unknown,
  depth: number,
  seen: WeakSet<object>
): ThrowablePayload {
  if (depth >= MAX_DEPTH) {
    return {
      class: 'MaxDepthError',
      message: 'Error cause depth limit reached'
    };
  }

  if (!isObjectLike(error)) {
    return {
      class: typeof error,
      message: LoggerConfiguration.redactText(String(error))
    };
  }

  if (seen.has(error)) {
    return {
      class: getErrorClass(error),
      message: 'Circular error reference detected'
    };
  }

  seen.add(error);

  const payload: ThrowablePayload = {
    class: getErrorClass(error)
  };

  const message = getOptionalString((error as ErrorWithExtras).message);
  if (message) {
    payload.message = LoggerConfiguration.redactText(message);
  }

  const stack = getOptionalString((error as ErrorWithExtras).stack);
  if (stack && LoggerConfiguration.isErrorStackEnabled()) {
    payload.stack = LoggerConfiguration.redactText(stack);
  }

  const code = getOptionalCode((error as ErrorWithExtras).code);
  if (code) {
    payload.code = code;
  }

  const metadata = buildMetadata(error, depth, seen);
  if (metadata && Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }

  const cause = (error as ErrorWithExtras).cause;
  if (cause !== undefined) {
    payload.cause = serializeThrowable(cause, depth + 1, seen);
  }

  return payload;
}

function buildMetadata(
  error: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  const explicitMetadata = sanitizeValue((error as ErrorWithExtras).metadata, depth + 1, seen, ['metadata']);

  if (isRecord(explicitMetadata)) {
    Object.assign(metadata, explicitMetadata);
  }

  Object.entries(error)
    .filter(([key]) => !RESERVED_KEYS.has(key))
    .slice(0, MAX_ENTRIES)
    .forEach(([key, value]) => {
      metadata[key] = sanitizeValue(value, depth + 1, seen, [key]);
    });

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>, path: string[]): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepthExceeded]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ENTRIES).map((entry) => sanitizeValue(entry, depth + 1, seen, path));
  }

  if (value instanceof Error) {
    return serializeThrowable(value, depth + 1, seen);
  }

  if (!isObjectLike(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);
  try {
    const sanitizedEntries = Object.entries(value)
      .slice(0, MAX_ENTRIES)
      .map(([key, entryValue]) => {
        const entryPath = [...path, key];
        const normalizedPath = entryPath.join('.');

        if (LoggerConfiguration.isSensitiveKey(key) || LoggerConfiguration.isSensitivePath(normalizedPath)) {
          return [key, LoggerConfiguration.redactValueAtPath(key, entryValue, normalizedPath)] as const;
        }

        return [key, sanitizeValue(entryValue, depth + 1, seen, entryPath)] as const;
      });

    return Object.fromEntries(sanitizedEntries);
  } finally {
    seen.delete(value);
  }
}

function getErrorClass(error: Record<string, unknown>): string {
  return getOptionalString((error as ErrorWithExtras).name) ?? error.constructor?.name ?? 'Error';
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getOptionalCode(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObjectLike(value) && !Array.isArray(value);
}
