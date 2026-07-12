import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_RAW, getGameRoot, getPaksPath } from './paths.ts';
import { DEFINE_FILE_TO_SLUG } from '../src/lib/categories.ts';

/**
 * Attempts to extract readable strings from UE5 pak/utoc files.
 * Full Defines JSON requires FModel — see docs/extraction.md.
 */
function extractStringsFromFile(filePath: string): string[] {
  try {
    const output = execSync(`strings "${filePath}"`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return output.split('\n').filter((line: string) => line.trim().length > 0);
  } catch {
    return [];
  }
}

function findLocalizationStrings(strings: string[]): Record<string, string> {
  const loc: Record<string, string> = {};
  for (const line of strings) {
    // UE localization entries often appear as key/value pairs in string tables
    if (line.includes('_title') || line.includes('_desc')) {
      loc[line] = line;
    }
  }
  return loc;
}

function main() {
  const gameRoot = getGameRoot();
  const paksPath = getPaksPath(gameRoot);
  const definesDir = join(DATA_RAW, 'Defines');
  const locDir = join(DATA_RAW, 'Localization');

  mkdirSync(definesDir, { recursive: true });
  mkdirSync(locDir, { recursive: true });

  const utocPath = join(paksPath, 'twilightModernity-Windows.utoc');
  if (!existsSync(utocPath)) {
    console.log('No utoc file found — skipping automated extraction.');
    console.log('Use FModel per docs/extraction.md for full Defines export.');
    return;
  }

  console.log('Scanning UE5 asset index for define types...');
  const strings = extractStringsFromFile(utocPath);
  const defineStructs = strings.filter((s) => s.endsWith('DefineStruct.uasset'));
  console.log(`Found ${defineStructs.length} DefineStruct assets in utoc index.`);

  const defineFiles = Object.keys(DEFINE_FILE_TO_SLUG);
  const foundDefines = defineFiles.filter((f) =>
    strings.some((s) => s.includes(basenameWithoutExt(f))),
  );
  console.log(`Matched define types: ${foundDefines.join(', ') || 'none as loose JSON'}`);

  const locStrings = findLocalizationStrings(strings);
  if (Object.keys(locStrings).length > 0) {
    writeFileSync(
      join(locDir, 'en-strings-preview.json'),
      JSON.stringify(locStrings, null, 2),
    );
    console.log(`Wrote ${Object.keys(locStrings).length} localization string previews.`);
  }

  writeFileSync(
    join(DATA_RAW, 'extraction-manifest.json'),
    JSON.stringify(
      {
        extractedAt: new Date().toISOString(),
        gameRoot,
        defineStructs,
        foundDefines,
        note: 'Full JSON Defines require manual FModel export to data/raw/Defines/',
      },
      null,
      2,
    ),
  );

  console.log('\nAutomated extraction is limited for UE5 IoStore packs.');
  console.log('For full base-game data, export Defines/*.json via FModel to:');
  console.log(`  ${definesDir}/`);
  console.log('Then re-run: npm run normalize');
}

function basenameWithoutExt(filename: string): string {
  return filename.replace(/\.json$/, '');
}

main();
