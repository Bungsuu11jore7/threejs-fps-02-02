// main.ts — WHITEOUT entrypoint: copies game/ and screenshots/ from this
// repository into the output directory and writes dossier.json with the kit's
// buildDossier (vendor/makefun-threejs.ts). Deterministic: same bytes every run.
import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: false });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyTree(join(root, 'game'), join(out, 'game'));
copyTree(join(root, 'screenshots'), join(out, 'screenshots'));
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
