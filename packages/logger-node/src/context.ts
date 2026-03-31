import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';

export interface RequestTraceContext {
  mdc: Record<string, string>;
}

export interface NodeContextOptions {
  traceId?: string;
  requestId?: string;
  spanId?: string;
  mdc?: Record<string, string>;
}

export class TraceContextFactory {
  static create(options?: NodeContextOptions): RequestTraceContext {
    const requestId = options?.requestId ?? randomUUID();
    const traceId = this.resolveTraceId(options?.traceId);
    const spanId = options?.spanId ?? this.createHexId(8);

    return {
      mdc: {
        requestId,
        traceId,
        spanId,
        ...(options?.mdc ?? {})
      }
    };
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
    if (key === 'requestId' || key === 'traceId' || key === 'spanId') {
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
