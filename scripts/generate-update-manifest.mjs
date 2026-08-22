#!/usr/bin/env node
/**
 * Desktop repo wrapper — manifest generator lives in cinny/scripts/.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'cinny',
  'scripts',
  'generate-update-manifest.mjs'
);

const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(result.status ?? 1);
