import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_RAW, PROJECT_ROOT, getGameRoot, getPaksPath } from './paths.ts';

const LEGACY_ROOT = join(DATA_RAW, 'legacy-all');
const UNPACKED_ROOT = join(DATA_RAW, 'unpacked');
const PARSE_SCRIPT = join(PROJECT_ROOT, 'tools/parse_legacy.py');
const ICON_SCRIPT = join(PROJECT_ROOT, 'tools/extract_packed_icons.py');
const RETOC = join(PROJECT_ROOT, 'tools/retoc_cli-aarch64-apple-darwin/retoc');
const USMAP = join(PROJECT_ROOT, 'tools/jmap_dumper/mappings.usmap');
const CUE4_EXPORT_DIR = join(PROJECT_ROOT, 'tools/cue4-export');
const CONVERT_SCRIPT = join(PROJECT_ROOT, 'tools/convert_full_defines.py');
const DEFINES_FULL = join(DATA_RAW, 'DefinesFull');

function runParseLegacy() {
  console.log('Parsing legacy UE exports into Defines JSON...');
  execSync(`python3 "${PARSE_SCRIPT}"`, {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });
}

function extractPackedIcons() {
  if (!existsSync(UNPACKED_ROOT)) return;
  console.log('Decoding packed icons missing from Saved/Icons...');
  execSync(`python3 "${ICON_SCRIPT}"`, {
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
    'Planets',
  ];

  for (const target of targets) {
    execSync(
      `"${RETOC}" to-legacy --version UE5_6 -f "${target}" "${paksPath}" "${LEGACY_ROOT}"`,
      { stdio: 'pipe' },
    );
  }
}

/**
 * Full-fidelity export via CUE4Parse using the .usmap dumped from the running
 * game (see docs/extraction.md). Overwrites the legacy-parsed tables in
 * data/raw/Defines with complete structured values when available.
 */
function runFullExport(gameRoot: string) {
  if (!existsSync(USMAP)) {
    console.log('mappings.usmap not found — keeping legacy-parsed defines.');
    return;
  }
  try {
    execSync('dotnet --version', { stdio: 'pipe' });
  } catch {
    console.log('dotnet not found — keeping legacy-parsed defines.');
    return;
  }
  console.log('Exporting full define tables with CUE4Parse...');
  execSync(
    `dotnet run --project "${CUE4_EXPORT_DIR}" -- "${getPaksPath(gameRoot)}" "${USMAP}" "${DEFINES_FULL}"`,
    { stdio: 'inherit' },
  );
  console.log('Converting full exports to Defines JSON...');
  execSync(`python3 "${CONVERT_SCRIPT}"`, { stdio: 'inherit', cwd: PROJECT_ROOT });
}

function main() {
  const gameRoot = getGameRoot();
  const definesDir = join(DATA_RAW, 'Defines');
  const locDir = join(DATA_RAW, 'Localization');

  mkdirSync(definesDir, { recursive: true });
  mkdirSync(locDir, { recursive: true });

  ensureUnpacked(gameRoot);
  ensureLegacy(gameRoot);
  extractPackedIcons();
  runParseLegacy();
  runFullExport(gameRoot);

  console.log('\nExtraction complete. Run npm run normalize to update data/curated/.');
}

main();
