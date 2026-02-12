/**
 * Resolves markdown file paths from configured roots.
 * Used by the observability UI Docs tab.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import path, { join, resolve } from 'path';
import { assertSafePath } from '../security/path-traversal';
import { homedir } from 'os';

export interface DocEntry {
  id: string;
  title: string;
  path: string;
}

export interface DocListItem {
  id: string;
  title: string;
}

const DEFAULT_ROOTS = ['README.md', 'docs/'];
const CACHE_TTL_MS = 10_000;

let cachedDocs: DocEntry[] | null = null;
let cacheTimestamp = 0;

function expandPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('~/')) {
    return join(homedir(), trimmed.slice(2));
  }
  return resolve(trimmed);
}

function collectMdFiles(rootPath: string, baseDir: string, prefix = ''): DocEntry[] {
  const result: DocEntry[] = [];
  try {
    const stat = statSync(rootPath);
    if (stat.isFile() && rootPath.toLowerCase().endsWith('.md')) {
      const rel = prefix || path.relative(baseDir, rootPath) || path.basename(rootPath);
      const id = rel.replace(/[/\\\s]/g, '_').replace(/\.md$/i, '').replace(/^_+/, '') || 'doc';
      result.push({
        id,
        title: rel,
        path: rootPath
      });
      return result;
    }
    if (!stat.isDirectory()) {
      return result;
    }
    const entries = readdirSync(rootPath, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(rootPath, ent.name);
      const relPrefix = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        result.push(...collectMdFiles(full, baseDir, relPrefix));
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        const id = relPrefix.replace(/[/\\\s]/g, '_').replace(/\.md$/i, '') || 'doc';
        result.push({
          id,
          title: relPrefix,
          path: full
        });
      }
    }
  } catch {
    /* ignore missing/inaccessible paths */
  }
  return result;
}

function getRoots(): string[] {
  const envRoots = process.env.OBS_UI_MD_ROOTS;
  if (envRoots) {
    return envRoots.split(',').map((r) => r.trim()).filter(Boolean);
  }
  return DEFAULT_ROOTS;
}

function getDocEntries(baseDir: string): DocEntry[] {
  const now = Date.now();
  if (cachedDocs !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDocs;
  }
  const roots = getRoots();
  const all: DocEntry[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const expanded = root.trim().startsWith('~/')
      ? expandPath(root)
      : resolve(baseDir, root);
    const entries = collectMdFiles(expanded, baseDir);
    for (const e of entries) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        all.push(e);
      }
    }
  }
  all.sort((a, b) => a.title.localeCompare(b.title));
  cachedDocs = all;
  cacheTimestamp = now;
  return all;
}

export function listDocs(baseDir: string): DocListItem[] {
  return getDocEntries(baseDir).map((d) => ({ id: d.id, title: d.title }));
}

function isPathUnderRoot(filePath: string, rootPath: string): boolean {
  const normalized = resolve(filePath);
  const root = resolve(rootPath);
  return normalized === root || normalized.startsWith(root + path.sep);
}

export function getDocContent(baseDir: string, id: string): string {
  const docs = getDocEntries(baseDir);
  const doc = docs.find((d) => d.id === id);
  if (!doc) {
    throw new Error('Doc not found');
  }
  if (!doc.path.toLowerCase().endsWith('.md')) {
    throw new Error('Invalid doc');
  }
  const base = resolve(baseDir);
  const relPath = path.relative(base, doc.path);
  const isOutsideBase = relPath.startsWith('..') || path.isAbsolute(relPath);
  if (isOutsideBase) {
    // Allow paths outside baseDir only if they are under an explicitly configured root
    const roots = getRoots();
    const underConfiguredRoot = roots.some((r) => {
      const expanded = r.trim().startsWith('~/') ? expandPath(r) : resolve(baseDir, r);
      return isPathUnderRoot(doc.path, expanded);
    });
    if (!underConfiguredRoot) {
      throw new Error('Path traversal detected');
    }
    if (doc.path.includes('\0')) {
      throw new Error('Invalid path');
    }
  } else {
    assertSafePath(base, relPath || '.');
  }
  return readFileSync(doc.path, 'utf-8');
}

export function invalidateDocsCache(): void {
  cachedDocs = null;
}
