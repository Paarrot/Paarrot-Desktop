#!/usr/bin/env node
/**
 * Regenerates cinny/public/update/manifest.json from markdown files.
 *
 * - currentupdate.md is always the "current" entry
 * - Other *.md files matching X.Y.Z.md become "older" (sorted newest first)
 * - title, date, version come from YAML frontmatter when present
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPDATE_DIR = path.join(ROOT, 'cinny', 'public', 'update');
const MANIFEST_PATH = path.join(UPDATE_DIR, 'manifest.json');
const CURRENT_FILE = 'currentupdate.md';
const VERSION_FILE_RE = /^(\d+\.\d+\.\d+)\.md$/;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(source) {
  const match = FRONTMATTER_RE.exec(source.trimStart());
  if (!match) return {};

  const frontmatter = {};
  match[1].split('\n').forEach((line) => {
    const colon = line.indexOf(':');
    if (colon <= 0) return;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    frontmatter[key] = raw.replace(/^['"]|['"]$/g, '');
  });
  return frontmatter;
}

function compareVersions(a, b) {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10));
  const pb = b.split('.').map((part) => Number.parseInt(part, 10));
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}

function readMarkdownMeta(fileName) {
  const filePath = path.join(UPDATE_DIR, fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(source);
  const versionFromName = VERSION_FILE_RE.exec(fileName)?.[1];

  return {
    file: fileName,
    version: frontmatter.version ?? versionFromName,
    title: frontmatter.title,
    date: frontmatter.date,
  };
}

function buildManifest() {
  if (!fs.existsSync(UPDATE_DIR)) {
    throw new Error(`Update directory not found: ${UPDATE_DIR}`);
  }

  const currentPath = path.join(UPDATE_DIR, CURRENT_FILE);
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Missing ${CURRENT_FILE} in ${UPDATE_DIR}`);
  }

  const older = fs
    .readdirSync(UPDATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VERSION_FILE_RE.test(entry.name))
    .map((entry) => readMarkdownMeta(entry.name))
    .filter((entry) => entry.version)
    .sort((a, b) => compareVersions(a.version, b.version));

  return {
    current: CURRENT_FILE,
    older: older.map(({ file, version, title, date }) => {
      const item = { file };
      if (version) item.version = version;
      if (title) item.title = title;
      if (date) item.date = date;
      return item;
    }),
  };
}

function main() {
  const manifest = buildManifest();
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  let previous = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    previous = fs.readFileSync(MANIFEST_PATH, 'utf8');
  }

  if (previous === json) {
    console.log('[update-manifest] manifest.json is already up to date');
    return;
  }

  fs.writeFileSync(MANIFEST_PATH, json, 'utf8');
  console.log(
    `[update-manifest] wrote manifest.json (${manifest.older.length} older version(s))`
  );
}

main();
