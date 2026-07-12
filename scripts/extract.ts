import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_RAW, PROJECT_ROOT, getGameRoot, getPaksPath } from './paths.ts';

const LEGACY_ROOT = join(DATA_RAW, 'legacy-all');
const UNPACKED_ROOT = join(DATA_RAW, 'unpacked');
const PARSE_SCRIPT = join(PROJECT_ROOT, 'tools/parse_legacy.py');
const RETOC = join(PROJECT_ROOT, 'tools/retoc_cli-aarch64-apple-darwin/retoc');

function runParseLegacy() {
  console.log('Parsing legacy UE exports into Defines JSON...');
  execSync(`python3 "${PARSE_SCRIPT}"`, {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });
}

function ensureUnpacked(gameRoot: string) {
  if (existsSync(UNPACKED_ROOT)) {
    console.log(`Using unpacked assets at ${UNPACKED_ROOT}`);
    return;
  }

  if (!existsSync(RETOC)) {
    console.log('retoc not found — skipping unpack step.');
    return;
  }

  const paksPath = getPaksPath(gameRoot);
  console.log('Unpacking IoStore containers (first run only)...');
  mkdirSync(UNPACKED_ROOT, { recursive: true });
  execSync(`"${RETOC}" unpack "${paksPath}" "${UNPACKED_ROOT}"`, {
    stdio: 'inherit',
  });
}

function ensureLegacy(gameRoot: string) {
  const definesUexp = join(
    LEGACY_ROOT,
    'twilightModernity/Content/Blueprints/Struct/Defines/Factions.uexp',
  );
  if (existsSync(definesUexp)) {
    console.log(`Using legacy exports at ${LEGACY_ROOT}`);
    return;
  }

  if (!existsSync(RETOC)) {
    console.log('retoc not found — skipping to-legacy conversion.');
    return;
  }

  const paksPath = getPaksPath(gameRoot);
  mkdirSync(LEGACY_ROOT, { recursive: true });
  console.log('Converting define assets to legacy format...');
  const targets = [
    'Factions',
    'Technologies',
    'resources',
    'Projects',
    'Events',
    'Eras',
    'CultureTraits',
    'CharacterTraits',
    'CharacterJobs',
    'GovernmentReforms',
    'GovernmentReformOptions',
    'UnitComponents',
    'Deposit',
    'DepositResources',
    'Situations',
    'StaticModifiers',
    'FactionVariants',
  ];

  for (const target of targets) {
    execSync(
      `"${RETOC}" to-legacy --version UE5_6 -f "${target}" "${paksPath}" "${LEGACY_ROOT}"`,
      { stdio: 'pipe' },
    );
  }
}

function main() {
  const gameRoot = getGameRoot();
  const definesDir = join(DATA_RAW, 'Defines');
  const locDir = join(DATA_RAW, 'Localization');

  mkdirSync(definesDir, { recursive: true });
  mkdirSync(locDir, { recursive: true });

  ensureUnpacked(gameRoot);
  ensureLegacy(gameRoot);
  runParseLegacy();

  console.log('\nExtraction complete. Run npm run normalize to update data/curated/.');
}

main();
