export interface BrowserTraceContext {
  mdc: Record<string, string>;
}

export interface BrowserContextOptions {
  traceId?: string;
  requestId?: string;
  spanId?: string;
  parentSpanId?: string;
  mdc?: Record<string, string>;
}

const TRACE_KEYS = new Set(['requestId', 'traceId', 'spanId', 'parentSpanId']);

function createHexId(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, '0')).join('');
}

export class BrowserTraceContextFactory {
  static create(options?: BrowserContextOptions): BrowserTraceContext {
    const requestId = options?.requestId ?? crypto.randomUUID();
    const traceId = options?.traceId ?? createHexId(16);
    const spanId = options?.spanId ?? createHexId(8);

    return {
      mdc: {
        requestId,
        traceId,
        spanId,
        ...(options?.parentSpanId ? { parentSpanId: options.parentSpanId } : {}),
        ...(options?.mdc ?? {})
      }
    };
  }

  static createExecution(options?: BrowserContextOptions): BrowserTraceContext {
    const inheritedMdc = BrowserContextStore.getPersistentMdc();

    return this.create({
      ...options,
      mdc: {
        ...inheritedMdc,
        ...(options?.mdc ?? {})
      }
    });
  }

  static createChildExecution(options?: BrowserContextOptions): BrowserTraceContext {
    const currentMdc = BrowserContextStore.getMdc();
    const inheritedMdc = BrowserContextStore.getPersistentMdc();

    return this.create({
      ...options,
      traceId: options?.traceId ?? currentMdc.traceId,
      parentSpanId: options?.parentSpanId ?? currentMdc.spanId,
      mdc: {
        ...inheritedMdc,
        ...(options?.mdc ?? {})
      }
    });
  }
}

export class BrowserContextStore {
  private static context: BrowserTraceContext | null = null;

  static set(context: BrowserTraceContext): void {
    this.context = context;
  }

  static get(): BrowserTraceContext | null {
    return this.context;
  }

  static getMdc(): Record<string, string> {
    return this.context?.mdc ?? {};
  }

  static getPersistentMdc(): Record<string, string> {
    const mdc = this.getMdc();

    return Object.fromEntries(
      Object.entries(mdc).filter(([key]) => !TRACE_KEYS.has(key))
    );
  }

  static setMdc(key: string, value: string): void {
    if (!this.context) {
      this.context = { mdc: {} };
    }

    this.context.mdc[key] = value;
  }

  static setManyMdc(values: Record<string, string>): void {
    if (!this.context) {
      this.context = { mdc: {} };
    }

    Object.assign(this.context.mdc, values);
  }

  static clear(): void {
    this.context = null;
  }
}
