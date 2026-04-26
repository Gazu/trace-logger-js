import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadEnvFile('.env');
loadEnvFile('.env.local');

function loadEnvFile(fileName: string): void {
  const path = resolve(process.cwd(), fileName);

  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, 'utf8');

  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .forEach((line) => {
      const separatorIndex = line.indexOf('=');

      if (separatorIndex === -1) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!key || process.env[key] !== undefined) {
        return;
      }

      process.env[key] = unquote(value);
    });
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
