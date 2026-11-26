import fs from 'node:fs';
import path from 'node:path';

/** Lista recursivamente os arquivos visíveis do projeto (ignora ocultos, .git e node_modules). */
export function walkProjectFiles(dir: string, base: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) walkProjectFiles(full, base, out);
    else out.push(rel);
  }
  return out.sort();
}

/** Resolve um caminho relativo dentro de `projectRoot` bloqueando path traversal e arquivos ocultos. */
export function safeResolve(projectRoot: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, rel);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const segments = relative.split(path.sep);
  if (segments.some((s) => s === 'node_modules' || s.startsWith('.'))) return null;
  return resolved;
}
