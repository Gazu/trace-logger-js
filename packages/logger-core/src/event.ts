import type { EventType, NormalizedLogEvent } from './types.js';

export class LogEvent {
  private messageValue = '';
  private dataValue: Record<string, unknown> = {};
  private tagsValue = new Set<string>();
  private typeValue: EventType = 'APP';
  private errorValue?: unknown;
  private sensitiveValue = false;

  type(type: EventType): this {
    this.typeValue = type;
    return this;
  }

  tag(tag: string): this {
    this.tagsValue.add(tag);
    return this;
  }

  sensitive(): this {
    this.sensitiveValue = true;
    this.tagsValue.add('SENSITIVE');
    return this;
  }

  message(message: string): this {
    this.messageValue = message;
    return this;
  }

  with(key: string, value: unknown): this {
    this.dataValue[key] = value;
    return this;
  }

  error(error: unknown): this {
    this.errorValue = error;
    return this;
  }

  toJSON(): NormalizedLogEvent {
    return {
      type: this.typeValue,
      msg: this.messageValue,
      data: { ...this.dataValue },
      tags: [...this.tagsValue].filter((tag) => tag !== 'SENSITIVE'),
      pii: this.sensitiveValue,
      error: this.errorValue
    };
  }
}
