import { LoggerConfiguration } from './config.js';
import { serializeError } from './error.js';

const MAX_DEPTH = 5;
const MAX_ENTRIES = 25;

export function sanitizeForLogging(value: unknown): unknown {
  return sanitizeValue(value, 0, new WeakSet<object>(), []);
}

export function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeForLogging(value);
  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>, path: string[]): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepthExceeded]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ENTRIES)
      .map((entry) => sanitizeValue(entry, depth + 1, seen, path));
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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObjectLike(value) && !Array.isArray(value);
}
