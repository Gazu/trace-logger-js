import type { LogLevel } from './types.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  TRACK: 30,
  METRIC: 30,
  AUDIT: 40,
  WARN: 40,
  SECURITY: 40,
  ERROR: 50
};

const VALID_LOG_LEVELS = new Set<LogLevel>(Object.keys(LEVEL_PRIORITY) as LogLevel[]);
const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'cookie',
  'set-cookie',
  'api-key',
  'apikey',
  'client-secret',
  'client_secret'
];
const DEFAULT_MAX_REDACTION_INPUT_LENGTH = 4096;
const DEFAULT_TIMEZONE = 'UTC';

export interface SensitiveKeyMaskRule {
  key?: string;
  path?: string;
  pattern?: RegExp;
  replacement?: string;
}

export type SensitiveKeyConfig = string | SensitiveKeyMaskRule;

export interface LoggerInternalErrorContext {
  contextName?: string;
  level?: LogLevel;
  phase: 'builder' | 'payload' | 'dispatch';
}

export interface LoggerRuntimeOptions {
  level?: string;
  timezone?: string;
  sensitiveKeys?: SensitiveKeyConfig[];
  redactPlaceholder?: string;
  errorStackEnabled?: boolean;
  maxRedactionInputLength?: number;
  sampleRate?: number;
  sampledLevels?: LogLevel[];
  internalErrorHandler?: (error: unknown, context: LoggerInternalErrorContext) => void;
}

export interface LoggerRuntimeSnapshot {
  minLevel: LogLevel;
  redactPlaceholder: string;
  errorStackEnabled: boolean;
  timezone: string;
  maxRedactionInputLength: number;
  sensitiveKeys: string[];
  sensitivePaths: string[];
  sensitiveKeyRules: SensitiveKeyMaskRule[];
  sampleRate: number;
  sampledLevels: LogLevel[];
}

export class LoggerConfiguration {
  private static minLevel: LogLevel = 'INFO';
  private static redactPlaceholder = '[REDACTED]';
  private static errorStackEnabled = true;
  private static timezone = DEFAULT_TIMEZONE;
  private static maxRedactionInputLength = DEFAULT_MAX_REDACTION_INPUT_LENGTH;
  private static sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS.map(normalizeKey));
  private static sensitiveKeyRules = new Map<string, SensitiveKeyMaskRule>();
  private static sensitivePathRules = new Map<string, SensitiveKeyMaskRule>();
  private static sampleRate = 1;
  private static sampledLevels = new Set<LogLevel>(['TRACE', 'DEBUG', 'INFO', 'TRACK', 'METRIC']);
  private static internalErrorHandler = (error: unknown, context: LoggerInternalErrorContext): void => {
    const serializedError = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);

    console.error(
      JSON.stringify({
        ts: LoggerConfiguration.formatTimestamp(),
        type: 'LOGGER_INTERNAL_ERROR',
        msg: 'Logger internal failure',
        context
      })
    );
    console.error(serializedError);
  };

  static configure(options?: string | LoggerRuntimeOptions): LogLevel {
    if (typeof options === 'string' || options == null) {
      const resolvedLevel = this.parseLevel(options) ?? this.minLevel;
      this.minLevel = resolvedLevel;
      return resolvedLevel;
    }

    const resolvedLevel = this.parseLevel(options.level) ?? this.minLevel;
    this.minLevel = resolvedLevel;

    if (options.redactPlaceholder) {
      this.redactPlaceholder = options.redactPlaceholder;
    }

    if (typeof options.errorStackEnabled === 'boolean') {
      this.errorStackEnabled = options.errorStackEnabled;
    }

    if ('timezone' in options) {
      this.configureTimezone(options.timezone);
    }

    if (typeof options.maxRedactionInputLength === 'number' && Number.isFinite(options.maxRedactionInputLength)) {
      this.maxRedactionInputLength = Math.max(0, Math.floor(options.maxRedactionInputLength));
    }

    if (options.sensitiveKeys) {
      this.configureSensitiveKeys(options.sensitiveKeys);
    }

    if (typeof options.sampleRate === 'number' && Number.isFinite(options.sampleRate)) {
      this.sampleRate = clampSampleRate(options.sampleRate);
    }

    if (options.sampledLevels) {
      this.sampledLevels = new Set(options.sampledLevels);
    }

    if (options.internalErrorHandler) {
      this.internalErrorHandler = options.internalErrorHandler;
    }

    return resolvedLevel;
  }

  static getMinLevel(): LogLevel {
    return this.minLevel;
  }

  static getRedactPlaceholder(): string {
    return this.redactPlaceholder;
  }

  static isErrorStackEnabled(): boolean {
    return this.errorStackEnabled;
  }

  static getTimezone(): string {
    return this.timezone;
  }

  static formatTimestamp(date = new Date()): string {
    if (this.timezone === DEFAULT_TIMEZONE) {
      return date.toISOString();
    }

    return formatDateInTimezone(date, this.timezone);
  }

  static getMaxRedactionInputLength(): number {
    return this.maxRedactionInputLength;
  }

  static getSensitiveKeys(): string[] {
    return [...this.sensitiveKeys];
  }

  static getSensitiveKeyRules(): SensitiveKeyMaskRule[] {
    return [
      ...this.sensitiveKeyRules.values(),
      ...this.sensitivePathRules.values()
    ];
  }

  static getSensitivePaths(): string[] {
    return [...this.sensitivePathRules.keys()];
  }

  static getSnapshot(): LoggerRuntimeSnapshot {
    return {
      minLevel: this.minLevel,
      redactPlaceholder: this.redactPlaceholder,
      errorStackEnabled: this.errorStackEnabled,
      timezone: this.timezone,
      maxRedactionInputLength: this.maxRedactionInputLength,
      sensitiveKeys: this.getSensitiveKeys(),
      sensitivePaths: this.getSensitivePaths(),
      sensitiveKeyRules: this.getSensitiveKeyRules(),
      sampleRate: this.sampleRate,
      sampledLevels: [...this.sampledLevels]
    };
  }

  static isEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  static isSensitiveKey(key: string): boolean {
    return this.sensitiveKeys.has(normalizeKey(key));
  }

  static redactValue(key: string, value: unknown): unknown {
    return this.redactValueAtPath(key, value);
  }

  static isSensitivePath(path: string): boolean {
    return this.sensitivePathRules.has(normalizePath(path));
  }

  static redactValueAtPath(key: string, value: unknown, path?: string): unknown {
    const normalizedKey = normalizeKey(key);
    const pathRule = path ? this.sensitivePathRules.get(normalizePath(path)) : undefined;

    if (!this.sensitiveKeys.has(normalizedKey) && !pathRule) {
      return value;
    }

    const rule = pathRule ?? this.sensitiveKeyRules.get(normalizedKey);

    if (rule?.pattern && typeof value === 'string') {
      return this.applyMaskRule(value, rule);
    }

    return rule?.replacement ?? this.redactPlaceholder;
  }

  static redactText(value: string): string {
    return [...this.sensitiveKeyRules.values()]
      .filter((rule) => rule.pattern)
      .reduce((current, rule) => this.applyMaskRule(current, rule), value);
  }

  static shouldSample(level: LogLevel): boolean {
    if (!this.sampledLevels.has(level)) {
      return true;
    }

    return this.sampleRate >= 1 || Math.random() <= this.sampleRate;
  }

  static parseLevel(level?: string): LogLevel | undefined {
    if (!level) {
      return undefined;
    }

    const normalized = level.trim().toUpperCase() as LogLevel;
    return VALID_LOG_LEVELS.has(normalized) ? normalized : undefined;
  }

  static reportInternalError(error: unknown, context: LoggerInternalErrorContext): void {
    try {
      this.internalErrorHandler(error, context);
    } catch (handlerError) {
      console.error('Logger internal error handler failed', handlerError);
    }
  }

  private static configureSensitiveKeys(values: SensitiveKeyConfig[]): void {
    this.sensitiveKeys = new Set(DEFAULT_SENSITIVE_KEYS.map(normalizeKey));
    this.sensitiveKeyRules = new Map();
    this.sensitivePathRules = new Map();

    values.forEach((value) => {
      if (typeof value === 'string') {
        this.sensitiveKeys.add(normalizeKey(value));
        return;
      }

      validateSensitiveKeyMaskRule(value);

      if (value.key) {
        const normalizedKey = normalizeKey(value.key);
        this.sensitiveKeys.add(normalizedKey);
        this.sensitiveKeyRules.set(normalizedKey, {
          ...value,
          key: normalizedKey
        });
      }

      if (value.path) {
        const normalizedPath = normalizePath(value.path);
        this.sensitivePathRules.set(normalizedPath, {
          ...value,
          path: normalizedPath
        });
      }
    });
  }

  private static configureTimezone(value?: string): void {
    const timezone = value?.trim() || DEFAULT_TIMEZONE;

    if (timezone === DEFAULT_TIMEZONE || isValidTimezone(timezone)) {
      this.timezone = timezone;
      return;
    }

    this.timezone = DEFAULT_TIMEZONE;
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        type: 'LOGGER_INTERNAL_WARNING',
        msg: `Invalid LOGGER_TIMEZONE "${timezone}"; falling back to UTC`
      })
    );
  }

  private static applyMaskRule(value: string, rule: SensitiveKeyMaskRule): string {
    if (!rule.pattern) {
      return value;
    }

    if (value.length > this.maxRedactionInputLength) {
      return rule.replacement ?? this.redactPlaceholder;
    }

    rule.pattern.lastIndex = 0;
    return value.replace(rule.pattern, rule.replacement ?? this.redactPlaceholder);
  }
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function normalizePath(path: string): string {
  return path
    .split('.')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('.');
}

function clampSampleRate(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  const offset = normalizeOffset(parts.timeZoneName);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}${offset}`;
}

function normalizeOffset(value?: string): string {
  if (!value || value === 'GMT') {
    return 'Z';
  }

  return value.replace('GMT', '');
}

function validateSensitiveKeyMaskRule(rule: SensitiveKeyMaskRule): void {
  const hasKey = typeof rule.key === 'string' && rule.key.trim().length > 0;
  const hasPath = typeof rule.path === 'string' && rule.path.trim().length > 0;

  if (!hasKey && !hasPath) {
    throw new Error('Sensitive key mask rule requires a non-empty key or path');
  }

  if (!rule.pattern) {
    return;
  }

  const source = rule.pattern.source;
  const hasNestedQuantifier = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(source);

  if (hasNestedQuantifier) {
    throw new Error(`Unsafe sensitive key regex rejected for "${rule.key ?? rule.path}"`);
  }
}
