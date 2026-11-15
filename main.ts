// main.ts — WHITEOUT entrypoint (improved): copies game/ and screenshots/
// from this repository into the output directory and writes dossier.json
// with the kit's buildDossier (vendor/makefun-threejs.ts). Deterministic:
// same bytes every run.
//
// The output directory itself is never removed. In the grader's sandbox
// this program runs as an unprivileged user (65534), and deleting /output
// would need write permission on its parent directory (/), which it does
// not have — rmSync(out) fails with EACCES before anything is written.
// Only the directory's *contents* are cleared (each file and subdirectory
// inside it), which needs write permission on the directory itself only.
import { buildDossier } from './vendor/makefun-threejs.ts';
import { chmodSync, cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function clearDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    forceRemove(join(dir, name));
  }
}

// Remove a file or directory tree even when it is read-only: cpSync
// preserves the repository's read-only modes on the copies, so a plain
// rmSync would fail deleting them on a later run (removing an entry needs
// write permission on its parent directory). Chmod each directory before
// descending into it and each file before unlinking it.
function forceRemove(path: string): void {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (st === undefined) return;
  if (st.isDirectory()) {
    chmodSync(path, 0o755);
    for (const name of readdirSync(path)) forceRemove(join(path, name));
  } else {
    chmodSync(path, 0o644);
  }
  rmSync(path, { recursive: true, force: true });
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: false });
}

clearDir(out);
copyTree(join(root, 'game'), join(out, 'game'));
copyTree(join(root, 'screenshots'), join(out, 'screenshots'));
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
const parsed = JSON.parse(new TextDecoder().decode(dossier)) as { schema?: string };
if (parsed.schema !== 'makefun/dossier/v1') throw new Error(`unexpected dossier schema: ${parsed.schema}`);
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
