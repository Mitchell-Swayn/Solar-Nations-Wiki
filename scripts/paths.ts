import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_GAME_ROOT =
  '/Users/mitchellswayn/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(SCRIPTS_DIR, '..');
export const DATA_RAW = join(PROJECT_ROOT, 'data/raw');
export const DATA_CURATED = join(PROJECT_ROOT, 'data/curated');
export const PUBLIC_ASSETS = join(PROJECT_ROOT, 'public/assets');

export function getGameRoot(): string {
  const envPath = process.env.SN2_GAME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  if (existsSync(DEFAULT_GAME_ROOT)) return DEFAULT_GAME_ROOT;
  throw new Error(
    `Solar Nations 2 install not found. Set SN2_GAME_PATH to your twilightModernity folder.`,
  );
}

export function getFlagsPath(gameRoot: string): string {
  return join(gameRoot, 'Saved/Flags');
}

export function getIconsPath(gameRoot: string): string {
  return join(gameRoot, 'Saved/Icons');
}

export function getPaksPath(gameRoot: string): string {
  return join(gameRoot, 'Content/Paks');
}
