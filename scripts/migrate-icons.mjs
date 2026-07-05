import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../cinny/src');
const iconsModule = path.resolve(srcRoot, 'app/components/icons');

const ICON_SYMBOLS = new Set(['Icon', 'Icons', 'IconName', 'IconSrc']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(tsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getIconsImportPath(filePath) {
  const rel = path.relative(path.dirname(filePath), iconsModule).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function splitFoldsImport(importClause) {
  const match = importClause.match(/^\{([^}]+)\}(?:\s+as\s+\w+)?$/);
  if (!match) return null;

  const specifiers = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [local, imported] = part.split(/\s+as\s+/).map((s) => s.trim());
      return { local: local ?? imported, imported: imported ?? local };
    });

  const iconSpecs = specifiers.filter((s) => ICON_SYMBOLS.has(s.imported));
  const foldsSpecs = specifiers.filter((s) => !ICON_SYMBOLS.has(s.imported));

  if (iconSpecs.length === 0) return null;

  return { iconSpecs, foldsSpecs };
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const importRegex = /import\s+(\{[^}]+\})\s+from\s+['"]folds['"];?/g;
  let changed = false;
  const iconImports = new Map();

  content = content.replace(importRegex, (fullMatch, importClause) => {
    const split = splitFoldsImport(importClause);
    if (!split) return fullMatch;

    changed = true;
    for (const spec of split.iconSpecs) {
      iconImports.set(spec.local, spec.imported);
    }

    if (split.foldsSpecs.length === 0) {
      return '';
    }

    const foldsImport = split.foldsSpecs.map((s) => (s.local === s.imported ? s.local : `${s.imported} as ${s.local}`)).join(', ');
    return `import { ${foldsImport} } from 'folds';`;
  });

  if (!changed) return false;

  const iconsPath = getIconsImportPath(filePath);
  const iconExportList = [...iconImports.entries()]
    .map(([local, imported]) => (local === imported ? imported : `${imported} as ${local}`))
    .join(', ');

  const iconsImportLine = `import { ${iconExportList} } from '${iconsPath}';`;

  const foldsImportMatch = content.match(/^import\s+\{[^}]+\}\s+from\s+['"]folds['"];?\s*$/m);
  if (foldsImportMatch) {
    const insertAt = content.indexOf(foldsImportMatch[0]) + foldsImportMatch[0].length;
    content = `${content.slice(0, insertAt)}\n${iconsImportLine}${content.slice(insertAt)}`;
  } else {
    content = `${iconsImportLine}\n${content}`;
  }

  content = content.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(filePath, content);
  return true;
}

const files = walk(srcRoot);
let migrated = 0;

for (const file of files) {
  if (file.includes(`${path.sep}components${path.sep}icons${path.sep}`)) continue;
  if (migrateFile(file)) {
    migrated += 1;
  }
}

console.log(`Migrated ${migrated} files.`);
