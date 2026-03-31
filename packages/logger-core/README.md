# @smb-tech/logger-core

Core library for structured logging.

## Features

- LogEvent builder
- JSON serialization
- Logging levels
- Tags and metadata

## Installation

```bash
npm install @smb-tech/logger-core
```

## Usage

```ts
import { Logger } from '@smb-tech/logger-core';

const logger = Logger.get('MyClass');

logger.info((event) => {
  event.message('Hello world');
});
```
