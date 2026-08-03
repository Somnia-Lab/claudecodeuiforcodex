#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const cliRelativePath = packageJson.bin?.cloudcli;
  if (typeof cliRelativePath !== 'string' || !cliRelativePath.trim()) {
    throw new Error('package.json does not define bin.cloudcli');
  }

  const cliPath = path.resolve(repoRoot, cliRelativePath);
  if (!cliPath.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`bin.cloudcli resolves outside the package: ${cliRelativePath}`);
  }

  const stat = fs.statSync(cliPath);
  fs.chmodSync(cliPath, stat.mode | 0o755);
  console.log(`[postbuild] Marked executable: ${path.relative(repoRoot, cliPath)}`);
} catch (error) {
  console.warn(`[postbuild] Could not update CLI executable bit: ${error.message}`);
  if (process.platform !== 'win32') {
    process.exitCode = 1;
  }
}
