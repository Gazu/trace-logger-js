import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';

export interface RequestTraceContext {
  mdc: Record<string, string>;
}

export interface NodeContextOptions {
  traceId?: string;
  requestId?: string;
  spanId?: string;
  parentSpanId?: string;
  mdc?: Record<string, string>;
}

const TRACE_KEYS = new Set(['requestId', 'traceId', 'spanId', 'parentSpanId']);

export class TraceContextFactory {
  static create(options?: NodeContextOptions): RequestTraceContext {
    const requestId = options?.requestId ?? randomUUID();
    const traceId = this.resolveTraceId(options?.traceId);
    const spanId = this.resolveSpanId(options?.spanId) ?? this.createHexId(8);
    const parentSpanId = this.resolveSpanId(options?.parentSpanId);

    return {
      mdc: {
        requestId,
        traceId,
        spanId,
        ...(parentSpanId ? { parentSpanId } : {}),
        ...(options?.mdc ?? {})
      }
    };
  }

  static createChild(options?: NodeContextOptions): RequestTraceContext {
    const traceId = this.resolveTraceId(options?.traceId);
    const parentSpanId =
      this.resolveSpanId(options?.parentSpanId) ??
      this.resolveSpanId(options?.spanId);

    return this.create({
      ...options,
      traceId,
      spanId: undefined,
      parentSpanId
    });
  }

  private static resolveTraceId(incomingTraceId?: string): string {
    if (incomingTraceId && this.isValidTraceId(incomingTraceId)) {
      return incomingTraceId.toLowerCase();
    }

    return this.createHexId(16);
  }

  private static isValidTraceId(value: string): boolean {
    return /^[0-9a-fA-F]{16}$|^[0-9a-fA-F]{32}$/.test(value);
  }

  private static resolveSpanId(value?: string): string | undefined {
    if (value && /^[0-9a-fA-F]{16}$/.test(value)) {
      return value.toLowerCase();
    }

    return undefined;
  }

  private static createHexId(bytes: number): string {
    return randomBytes(bytes).toString('hex');
  }
}

export class RequestContextStore {
  private static readonly storage = new AsyncLocalStorage<RequestTraceContext>();

  static run<T>(context: RequestTraceContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  static get(): RequestTraceContext | undefined {
    return this.storage.getStore();
  }

  static getOrThrow(): RequestTraceContext {
    const context = this.get();

    if (!context) {
      throw new Error('Request context is not available');
    }

    return context;
  }

  static getMdc(): Record<string, string> {
    return this.get()?.mdc ?? {};
  }

  static getPersistentMdc(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.getMdc()).filter(([key]) => !TRACE_KEYS.has(key))
    );
  }

  static setMdc(key: string, value: string): void {
    const context = this.getOrThrow();
    context.mdc[key] = value;
  }

  static setManyMdc(values: Record<string, string>): void {
    const context = this.getOrThrow();
    Object.assign(context.mdc, values);
  }

  static getMdcValue(key: string): string | undefined {
    return this.get()?.mdc[key];
  }

  static removeMdc(key: string): void {
    if (key === 'requestId' || key === 'traceId' || key === 'spanId' || key === 'parentSpanId') {
      throw new Error(`Cannot remove protected MDC key: ${key}`);
    }

    const context = this.getOrThrow();
    delete context.mdc[key];
  }
}

export function runWithNodeContext<T>(callback: () => T, options?: NodeContextOptions): T {
  const context = TraceContextFactory.create(options);
  return RequestContextStore.run(context, callback);
}

export function runWithNodeChildContext<T>(callback: () => T, options?: NodeContextOptions): T {
  const currentMdc = RequestContextStore.getMdc();
  const context = TraceContextFactory.createChild({
    requestId: options?.requestId ?? currentMdc.requestId,
    traceId: options?.traceId ?? currentMdc.traceId,
    spanId: options?.spanId ?? currentMdc.spanId,
    parentSpanId: options?.parentSpanId,
    mdc: {
      ...RequestContextStore.getPersistentMdc(),
      ...(options?.mdc ?? {})
    }
  });
  return RequestContextStore.run(context, callback);
}
