#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'dist-server', 'server', 'cli.js');

try {
  const stat = fs.statSync(cliPath);
  fs.chmodSync(cliPath, stat.mode | 0o755);
  console.log(`[postbuild] Marked executable: ${path.relative(repoRoot, cliPath)}`);
} catch (error) {
  console.warn(`[postbuild] Could not update CLI executable bit: ${error.message}`);
  if (process.platform !== 'win32') {
    process.exitCode = 1;
  }
}
