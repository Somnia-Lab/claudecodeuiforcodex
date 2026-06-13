#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const PACKAGE_NAME = '@cloudcli-ai/cloudcli';
const DEFAULT_DB = path.join(os.homedir(), '.cloudcli', 'auth.db');

function findPackageJsonFrom(startPath) {
  let current = fs.realpathSync(startPath);
  if (fs.statSync(current).isFile()) {
    current = path.dirname(current);
  }

  while (true) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (pkg.name === PACKAGE_NAME) {
          return candidate;
        }
      } catch {
        // Keep walking upward.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveCloudcliPackage() {
  const explicitPackage = process.env.CLOUDCLI_PACKAGE_JSON;
  if (explicitPackage) {
    return explicitPackage;
  }

  const explicitInstallDir = process.env.CLOUDCLI_INSTALL_DIR;
  if (explicitInstallDir) {
    const candidate = path.join(explicitInstallDir, 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const binPath = (() => {
    if (process.platform === 'win32') {
      return execFileSync('where.exe', ['cloudcli'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).split(/\r?\n/)[0].trim();
    }

    return execFileSync('/bin/sh', ['-lc', 'command -v cloudcli'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  })();

  const packageJson = findPackageJsonFrom(binPath);
  if (!packageJson) {
    throw new Error('could not locate CloudCLI package.json from cloudcli in PATH');
  }
  return packageJson;
}

const requireFromCloudcli = createRequire(resolveCloudcliPackage());
const bcrypt = requireFromCloudcli('bcrypt');
const Database = requireFromCloudcli('better-sqlite3');

function usage() {
  console.log(`Usage: cloudcli-passwd [username]

Changes the CloudCLI self-hosted login password.

Environment:
  CLOUDCLI_DB_PATH       Override database path. Default: ${DEFAULT_DB}
  CLOUDCLI_USER          Default username when no positional username is passed.
  CLOUDCLI_INSTALL_DIR   Override CloudCLI install directory.
  CLOUDCLI_PACKAGE_JSON  Override CloudCLI package.json path.
`);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('interactive terminal required'));
      return;
    }

    let value = '';
    const wasRaw = stdin.isRaw;

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
    };

    const finish = () => {
      cleanup();
      resolve(value);
    };

    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('cancelled'));
          return;
        }

        if (char === '\r' || char === '\n' || char === '\u0004') {
          finish();
          return;
        }

        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }

        if (char >= ' ') {
          value += char;
        }
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    usage();
    return;
  }

  const dbPath = process.env.CLOUDCLI_DB_PATH || DEFAULT_DB;
  const db = new Database(dbPath);
  const explicitUsername = args[0] || process.env.CLOUDCLI_USER || '';
  const username = explicitUsername || (() => {
    const users = db.prepare('SELECT username FROM users WHERE is_active = 1 ORDER BY id').all();
    if (users.length === 1) {
      return users[0].username;
    }
    if (users.length > 1) {
      throw new Error('multiple active users found; pass the username explicitly');
    }
    throw new Error('no active CloudCLI user found');
  })();

  const password = await readHidden(`New CloudCLI password for ${username}: `);
  const confirm = await readHidden('Confirm new password: ');

  if (password !== confirm) {
    throw new Error('passwords do not match');
  }

  if (password.length < 6) {
    throw new Error('password must be at least 6 characters');
  }

  const user = db.prepare('SELECT id, username FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) {
    throw new Error(`active CloudCLI user not found: ${username}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
  db.close();

  console.log(`CloudCLI password updated for ${username}.`);
}

main().catch((error) => {
  console.error(`cloudcli-passwd: ${error.message}`);
  process.exit(1);
});
