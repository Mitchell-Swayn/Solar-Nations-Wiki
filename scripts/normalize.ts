import { mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, basename, dirname, relative, sep } from 'node:path';
import {
  DATA_CURATED,
  DATA_RAW,
  PROJECT_ROOT,
  PUBLIC_ASSETS,
  getFlagsPath,
  getGameRoot,
  getIconsPath,
} from './paths.ts';
import { DEFINE_FILE_TO_SLUG } from '../src/lib/categories.ts';
import type {
  CuratedIndex,
  ModifierRef,
  Prerequisite,
  WikiEntry,
  WikiReference,
} from '../src/lib/types.ts';

type RawRecord = Record<string, unknown>;

const ICON_ALIASES: Record<string, string> = {
  // Entries marked (game) mirror the MiscIcons map baked into the
  // ModernityGameState blueprint — the game's own icon-name resolution.
  rareMetals: 'gold', titanium: 'earthMetal', // (game)
  clergy_atheist: 'atheist', clergy_christian: 'christian', clergy_communist: 'communist',
  clergy_fascist: 'fascist', clergy_hindu: 'hindu', clergy_islamic: 'islam', clergy_jewish: 'jewish',
  laborer_proletariat: 'communist', military_conscript: 'conscript', military_mercenary: 'mercenary',
  civilLiberty_hivemind: 'form_hivemind', economy_hivemind: 'form_hivemind', militaryDoctrine_hivemind: 'form_hivemind',
  educationSpending_high: 'spending_high', educationSpending_medium: 'spending_medium', educationSpending_low: 'spending_low',
  unitTraining_default: 'militaryEducation', unitTraining_elite: 'threeStar',
  aresColonySite: 'colony', bigBen: 'monument', colloseum: 'monument', generationShip: 'spaceHabitation',
  metaverseServer: 'holonet', northernSpaceport: 'spaceport2', redSquare: 'monument',
  bioweaponSituation: 'unleashBioweaponSituation', marsSituation: 'planet',
  mechanistCoalescence_migrantSituation: 'mechanistCoalescence',
  attack: 'smallArms0', truck: 'logistics',
  culturePower: 'cultureHex', edict: 'edictGeneric',
  industry: 'machineParts', speed: 'moveSpeed', // (game)
  unrest: 'combatPower', alignment: 'cultureCircle', // (game)
  industrial: 'industryThroughput', breakthrough: 'piercing', // (game)
  crisis: 'crisisProgress',
  ascendedAutomation: 'ascendedAI', ascendedDigital: 'ascendedCybernetic', ascendedMutation: 'ascendedGenetic',
  fascism: 'nazism', // (game)
  harmony: 'unity', immigrationIncentive: 'edictImmigration',
  liberal: 'western', // (game)
  massDeportations: 'edictEmmigration', money: 'currency',
  progressive: 'technocracy', // (game)
  spending_none: 'spending_low', supply: 'logistics',
  diplomatic: 'diplomacy',
};

function resolveIconSource(icon: string): string {
  return ICON_ALIASES[icon] ?? icon;
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

function parseJsonFile(path: string): unknown {
  const text = readFileSync(path, 'utf-8');
  return JSON.parse(stripJsonComments(text));
}

function parseModifierKey(key: string): Omit<ModifierRef, 'value'> {
  const match = key.match(
    /\(Key="([^"]*)",Value1="([^"]*)",Value2="([^"]*)",Value3="([^"]*)"\)/,
  );
  if (!match) return { key };
  return {
    key: match[1],
    value1: match[2] || undefined,
    value2: match[3] || undefined,
    value3: match[4] || undefined,
  };
}

function extractModifiers(obj: unknown): ModifierRef[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const modifiers: ModifierRef[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'number' || typeof value === 'string') {
      modifiers.push({ ...parseModifierKey(key), value });
    }
  }
  return modifiers;
}

function collectModifierFields(record: RawRecord): ModifierRef[] {
  const fields = [
    'Modifier',
    'Modifiers',
    'PositiveModifier',
    'PrimaryModifier',
    'NegativeModifier',
    'RegionModifier',
    'EmpireModifier',
    'PopModifier',
    'JobModifier',
    'SkillModifiers',
    'CharacterModifiers',
    'SurplusModifier',
    'ShortageModifier',
    'BaseModifiers',
    'DepositModifier',
    'BigModifier',
    'InitialModifier',
  ];
  const scopes: Record<string, string> = {
    PrimaryModifier: 'Primary', RegionModifier: 'Region', EmpireModifier: 'Empire',
    PopModifier: 'Population', JobModifier: 'Job', CharacterModifiers: 'Character',
    DepositModifier: 'Deposit', SurplusModifier: 'Surplus', ShortageModifier: 'Shortage',
  };
  return fields.flatMap((field) => extractModifiers(record[field]).map((modifier) => ({ ...modifier, scope: scopes[field] })));
}

function parsePrerequisite(raw: unknown): Prerequisite | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { A?: string; B?: string };
  if (!obj.A || !obj.B) return null;
  const typeMap: Record<string, Prerequisite['type']> = {
    technology: 'technology',
    cultureTrait: 'cultureTrait',
    situation: 'situation',
    reformOption: 'reformOption',
  };
  const type = typeMap[obj.A];
  if (!type) return null;
  return { type, id: obj.B };
}

function collectPrerequisites(record: RawRecord): Prerequisite[] {
  const prereqs: Prerequisite[] = [];

  const addFromArray = (arr: unknown, type: Prerequisite['type']) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string') prereqs.push({ type, id: item });
      else {
        const parsed = parsePrerequisite(item);
        if (parsed) prereqs.push(parsed);
      }
    }
  };

  addFromArray(record.Prerequisites, 'technology');
  addFromArray(record.Prerequisite, 'technology');

  const hidden = parsePrerequisite(record.HiddenPrerequisite);
  if (hidden) prereqs.push(hidden);

  if (typeof record.TechPrerequisite === 'string') {
    prereqs.push({ type: 'technology', id: record.TechPrerequisite });
  }

  if (typeof record.BaseFaction === 'string') {
    prereqs.push({ type: 'reformOption', id: record.BaseFaction });
  }

  return prereqs;
}

function collectReferences(record: RawRecord, type: string): WikiReference[] {
  const refs: WikiReference[] = [];

  const addRef = (refType: string, id: unknown) => {
    if (typeof id === 'string' && id) refs.push({ type: refType, id });
  };

  if (type === 'government-reforms' && Array.isArray(record.Options)) {
    for (const opt of record.Options) addRef('government-reform-options', opt);
  }

  if (typeof record.Icon === 'string') {
    refs.push({ type: 'icon', id: record.Icon });
  }

  if (typeof record.BaseFaction === 'string') {
    refs.push({ type: 'factions', id: record.BaseFaction });
  }

  if (Array.isArray(record.Exclusives)) {
    for (const ex of record.Exclusives) addRef(type, ex);
  }

  if (Array.isArray(record.Domain)) {
    for (const d of record.Domain) addRef('domain', d);
  }

  if (Array.isArray(record.Categories)) {
    for (const c of record.Categories) addRef('category', c);
  }

  return refs;
}

function localize(
  value: unknown,
  localization: Record<string, string>,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  return localization[value] ?? localization[value.toLowerCase()] ?? value;
}

function humanizeId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanGameText(value: string): string {
  return value
    .replace(/<img\s+id="([^"]+)"\s*\/>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isConciseTitle(value: string): boolean {
  return value.length <= 70 && !/[.!?]\s|<[^>]+>/.test(value);
}

function buildEntry(
  type: string,
  record: RawRecord,
  localization: Record<string, string>,
): WikiEntry | null {
  const id = record.Name;
  if (typeof id !== 'string' || !id) return null;

  const titleFields = ['Title', 'Description', 'Text', 'Name'];
  let displayName = humanizeId(id);
  let description: string | undefined;

  for (const field of titleFields) {
    const localized = localize(record[field], localization);
    if (localized && field !== 'Name') {
      if (field === 'Description' || field === 'Text') description = localized;
      else displayName = localized;
    }
  }

  const localizedName = localize(id, localization);
  if (localizedName && localizedName !== id) {
    const cleaned = cleanGameText(localizedName);
    if (isConciseTitle(localizedName)) displayName = cleaned;
    else if (cleaned) description ??= cleaned;
  }

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      [
        'Modifier',
        'Modifiers',
        'PositiveModifier',
        'PrimaryModifier',
        'NegativeModifier',
        'RegionModifier',
        'EmpireModifier',
        'PopModifier',
        'JobModifier',
        'SkillModifiers',
        'CharacterModifiers',
        'SurplusModifier',
        'ShortageModifier',
        'BaseModifiers',
        'DepositModifier',
        'BigModifier',
        'InitialModifier',
      ].includes(key)
    ) {
      continue;
    }
    fields[key] = value;
  }

  return {
    id,
    type,
    displayName,
    icon: typeof record.Icon === 'string' ? record.Icon : undefined,
    description,
    fields,
    modifiers: collectModifierFields(record),
    prerequisites: collectPrerequisites(record),
    references: collectReferences(record, type),
  };
}

function copyAssets(gameRoot: string) {
  const flagsSrc = getFlagsPath(gameRoot);
  const iconsSrc = getIconsPath(gameRoot);
  const flagsDest = join(PUBLIC_ASSETS, 'flags');
  const iconsDest = join(PUBLIC_ASSETS, 'icons');

  mkdirSync(flagsDest, { recursive: true });
  mkdirSync(iconsDest, { recursive: true });

  if (existsSync(flagsSrc)) {
    for (const file of readdirSync(flagsSrc)) {
      if (file.endsWith('.png')) {
        cpSync(join(flagsSrc, file), join(flagsDest, file));
      }
    }
  }

  if (existsSync(iconsSrc)) {
    copyIconsRecursive(iconsSrc, iconsDest);
  }
}

function copyIconsRecursive(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyIconsRecursive(srcPath, destPath);
    } else if (entry.name.endsWith('.png')) {
      cpSync(srcPath, destPath);
    }
  }
}

// Winners for duplicated icon names where the default shortest-path rule
// picks the wrong art (e.g. the Reforms atom instead of the Research flask).
const ICON_SOURCE_OVERRIDES: Record<string, string> = {
  research: 'Resources/research.png',
};

// Preserve established bundle casing where the game export differs. GitHub's
// Linux filesystem is case-sensitive even though local macOS builds are not.
const ICON_BUNDLE_PATH_OVERRIDES: Record<string, string> = {
  'Population.png': 'population.png',
};

// Repo-tracked icons decoded from packed textures that are missing from Saved/Icons.
const EXTRA_ICONS_DIR = join(PROJECT_ROOT, 'data/icons-extra');

function indexIconSources(gameRoot: string): Map<string, string> {
  const files = indexPngFiles(getIconsPath(gameRoot));
  for (const [key, path] of indexPngFiles(EXTRA_ICONS_DIR)) {
    if (!files.has(key)) files.set(key, path);
  }
  return files;
}

function indexPngFiles(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.toLowerCase().endsWith('.png')) {
        const key = basename(entry.name, '.png').toLowerCase();
        const current = files.get(key);
        if (!current || path.length < current.length || path.localeCompare(current) < 0) files.set(key, path);
      }
    }
  };
  if (existsSync(root)) walk(root);
  for (const [key, rel] of Object.entries(ICON_SOURCE_OVERRIDES)) {
    const path = join(root, rel);
    if (existsSync(path)) files.set(key, path);
  }
  return files;
}

function removeUnavailableIconReferences(gameRoot: string, entries: WikiEntry[]) {
  const sourceFiles = indexIconSources(gameRoot);
  let removed = 0;
  const missing = new Set<string>();
  for (const entry of entries) {
    if (!entry.icon) continue;
    const sourceName = resolveIconSource(entry.icon);
    if (!sourceFiles.has(sourceName.toLowerCase())) {
      missing.add(sourceName);
      entry.icon = undefined;
      delete entry.fields.Icon;
      entry.references = entry.references.filter((reference) => reference.type !== 'icon');
      removed++;
    }
  }
  console.log(`Icon references: ${removed} unavailable references removed`);
  if (missing.size > 0) console.log(`  Missing: ${[...missing].sort().join(', ')}`);
}

function copyWikiIcons(gameRoot: string, entries: WikiEntry[]) {
  const sourceRoot = getIconsPath(gameRoot);
  const outputRoot = join(PROJECT_ROOT, 'public/wiki-icons');
  const sourceFiles = indexIconSources(gameRoot);
  const requested = new Set(entries.map((entry) => entry.icon).filter((icon): icon is string => Boolean(icon)));

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  let copied = 0;
  const missing: string[] = [];
  // Bundle every game icon, mirroring the source folder layout.
  const bundleRelPath = (path: string) => {
    const relativePath = (path.startsWith(sourceRoot)
      ? relative(sourceRoot, path)
      : path.startsWith(EXTRA_ICONS_DIR)
        ? relative(EXTRA_ICONS_DIR, path)
        : basename(path)
    ).split(sep).join('/');
    return ICON_BUNDLE_PATH_OVERRIDES[relativePath] ?? relativePath;
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.toLowerCase().endsWith('.png')) continue;
      const target = join(outputRoot, ...bundleRelPath(path).split('/'));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(path, target);
      copied++;
    }
  };
  if (existsSync(sourceRoot)) walk(sourceRoot);
  if (existsSync(EXTRA_ICONS_DIR)) walk(EXTRA_ICONS_DIR);
  // Manifest maps lowercased icon names (and aliases) to bundle paths.
  const manifest: Record<string, string> = {};
  for (const [key, path] of sourceFiles) manifest[key] = bundleRelPath(path);
  for (const icon of [...requested].sort()) {
    const source = sourceFiles.get(resolveIconSource(icon).toLowerCase());
    if (!source) { missing.push(icon); continue; }
    manifest[icon.toLowerCase()] = bundleRelPath(source);
  }
  mkdirSync(DATA_CURATED, { recursive: true });
  writeFileSync(join(DATA_CURATED, 'icon-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wiki icon bundle: ${copied} copied, ${missing.length} unavailable`);
}

function applyCultureTraitIcons(entries: WikiEntry[], modifierEntries: WikiEntry[], gameRoot: string) {
  const sourceFiles = indexIconSources(gameRoot);
  const available = (icon: string | undefined): icon is string =>
    Boolean(icon && sourceFiles.has(resolveIconSource(icon).toLowerCase()));
  const modifierIcons = new Map(
    modifierEntries
      .filter((modifier) => modifier.icon)
      .map((modifier) => [modifier.id, modifier.icon as string]),
  );
  // Icons for the entry a modifier's first target names (faction, resource,
  // project, ...), so e.g. christianityTithes (factionLoyaltyAdd -> clergy)
  // inherits the clergy faction icon. Earlier types win on id collisions.
  const targetIconTypes = [
    'resources', 'deposit-resources', 'factions', 'projects', 'situations',
    'character-skills', 'unit-stats', 'unit-qualities', 'unit-types',
    'battle-domains', 'industries', 'sliders', 'technology-domains',
  ];
  const targetIcons = new Map<string, string>();
  for (const type of targetIconTypes) {
    for (const entry of entries) {
      if (entry.type !== type || !entry.icon || targetIcons.has(entry.id)) continue;
      targetIcons.set(entry.id, entry.icon);
    }
  }
  const rootIcons = new Map(
    entries
      .filter((entry) => entry.type === 'culture-traits' && !entry.fields.Family && entry.icon)
      .map((entry) => [entry.id, entry.icon as string]),
  );
  for (const entry of entries) {
    if (entry.type !== 'culture-traits') continue;
    const family = typeof entry.fields.Family === 'string' ? entry.fields.Family : undefined;
    const familyIcon = rootIcons.get(family ?? entry.id) ?? 'cultural';
    const firstModifier = entry.modifiers[0];
    const candidates = !family
      ? [entry.icon, familyIcon]
      : [
          targetIcons.get(firstModifier?.value1 ?? ''),
          modifierIcons.get(firstModifier?.key ?? ''),
          familyIcon,
        ];
    const icon = candidates.find(available);
    entry.references = entry.references.filter((reference) => reference.type !== 'icon');
    if (!icon) {
      entry.icon = undefined;
      delete entry.fields.Icon;
      continue;
    }
    entry.icon = icon;
    entry.fields.Icon = icon;
    entry.references.push({ type: 'icon', id: icon });
  }
}

function localizedModifierName(record: RawRecord, localization: Record<string, string>): string {
  const id = String(record.Name);
  const lookup = new Map(Object.entries(localization).map(([key, value]) => [key.toLowerCase(), value]));
  const localizationOverrides: Record<string, string> = {
    unitReinforceRateMult: 'reinforceRate',
  };
  const candidates = [localizationOverrides[id], id].filter((candidate): candidate is string => Boolean(candidate));
  let base = id;
  const suffixes = ['TooltipModifier', 'PopulationMult', 'Population', 'CurrencyAdd', 'Interplanetary', 'Modifier', 'Effect', 'Override', 'Mult', 'Add', 'Max', 'Cost', 'Cap'];
  for (let i = 0; i < 4; i++) {
    const suffix = suffixes.find((candidate) => base.endsWith(candidate));
    if (!suffix) break;
    base = base.slice(0, -suffix.length);
    candidates.push(base);
  }
  const genericIcons = new Set(['political', 'military', 'industrial', 'defense', 'war', 'planet']);
  for (const candidate of candidates) {
    const localized = lookup.get(candidate.toLowerCase());
    if (localized) return cleanGameText(localized);
  }
  if (typeof record.Icon === 'string' && !genericIcons.has(record.Icon)) {
    const localized = lookup.get(record.Icon.toLowerCase());
    if (localized) {
      const cleaned = cleanGameText(localized);
      if (cleaned.length <= 80 && !/[.!?]\s/.test(cleaned)) return cleaned;
    }
  }
  return humanizeId(id);
}

function loadModifiers(localization: Record<string, string>): WikiEntry[] {
  const path = join(DATA_RAW, 'Defines/ModifierProperties.json');
  if (!existsSync(path)) return [];
  const data = parseJsonFile(path) as RawRecord[];
  return data.map((record) => {
    const id = record.Name as string;
    const displayName = localizedModifierName(record, localization);
    record.DisplayName = displayName;
    return {
      id,
      type: 'modifiers',
      displayName,
      icon: typeof record.Icon === 'string' ? record.Icon : undefined,
      fields: record,
      modifiers: [],
      prerequisites: [],
      references: record.Icon
        ? [{ type: 'icon', id: record.Icon as string }]
        : [],
    };
  });
}

function loadRawExtract(): WikiEntry[] {
  const rawDefines = join(DATA_RAW, 'Defines');
  if (!existsSync(rawDefines)) return [];

  const localizationPath = join(DATA_RAW, 'Localization/en.json');
  const localization = existsSync(localizationPath)
    ? (parseJsonFile(localizationPath) as Record<string, string>)
    : {};

  const entries: WikiEntry[] = [];
  for (const file of readdirSync(rawDefines)) {
    if (!file.endsWith('.json')) continue;
    const slug = DEFINE_FILE_TO_SLUG[file];
    if (!slug) continue;
    const data = parseJsonFile(join(rawDefines, file));
    if (!Array.isArray(data)) continue;
    for (const record of data) {
      const entry = buildEntry(slug, record as RawRecord, localization);
      if (!entry) continue;
      entries.push(entry);
      if (slug === 'culture-traits') {
        entries.push(...buildCultureIdeaEntries(record as RawRecord, localization));
        delete entry.fields.Ideas;
      }
    }
  }
  return entries;
}

/**
 * Each culture trait family row nests its idea sub-traits in an Ideas array
 * (1 family trait + 7 ideas in the shipped data). Promote every idea to its
 * own wiki entry, tagged with the family root id and the game's category.
 */
function buildCultureIdeaEntries(
  record: RawRecord,
  localization: Record<string, string>,
): WikiEntry[] {
  if (!Array.isArray(record.Ideas)) return [];
  const entries: WikiEntry[] = [];
  for (const idea of record.Ideas as RawRecord[]) {
    const entry = buildEntry(
      'culture-traits',
      { ...idea, Family: record.Name, Category: record.Category },
      localization,
    );
    if (entry) entries.push(entry);
  }
  return entries;
}

function buildIndex(entries: WikiEntry[], source: string): CuratedIndex {
  const index: CuratedIndex = {
    generatedAt: new Date().toISOString(),
    source,
    entries: {},
    byType: {},
  };

  for (const entry of entries) {
    const key = `${entry.type}:${entry.id}`;
    index.entries[key] = entry;
    if (!index.byType[entry.type]) index.byType[entry.type] = [];
    index.byType[entry.type].push(key);
  }

  for (const type of Object.keys(index.byType)) {
    index.byType[type].sort((a, b) => {
      const ea = index.entries[a];
      const eb = index.entries[b];
      return ea.displayName.localeCompare(eb.displayName);
    });
  }

  return index;
}

function writeCuratedFiles(index: CuratedIndex, modifierDefs: RawRecord[]) {
  mkdirSync(DATA_CURATED, { recursive: true });
  writeFileSync(join(DATA_CURATED, 'index.json'), JSON.stringify(index, null, 2));
  writeFileSync(
    join(DATA_CURATED, 'modifiers.json'),
    JSON.stringify(modifierDefs, null, 2),
  );

  for (const [type, keys] of Object.entries(index.byType)) {
    const entries = keys.map((k) => index.entries[k]);
    writeFileSync(
      join(DATA_CURATED, `${type}.json`),
      JSON.stringify(entries, null, 2),
    );
  }
}

function main() {
  const gameRoot = getGameRoot();
  const rawLocalizationPath = join(DATA_RAW, 'Localization/en.json');
  const localization = existsSync(rawLocalizationPath)
    ? (parseJsonFile(rawLocalizationPath) as Record<string, string>)
    : {};

  const defineEntries = loadRawExtract();
  if (defineEntries.length === 0) {
    throw new Error('No extracted defines found in data/raw/Defines — run npm run extract first.');
  }
  const modifierEntries = loadModifiers(localization);

  applyCultureTraitIcons(defineEntries, modifierEntries, gameRoot);
  const allEntries = [...defineEntries, ...modifierEntries];
  const source = 'base game defines extracted via CUE4Parse';

  removeUnavailableIconReferences(gameRoot, allEntries);
  const index = buildIndex(allEntries, source);
  const modifierDefs = parseJsonFile(join(DATA_RAW, 'Defines/ModifierProperties.json')) as RawRecord[];

  copyAssets(gameRoot);
  copyWikiIcons(gameRoot, allEntries);
  writeCuratedFiles(index, modifierDefs);

  console.log(`Normalized ${allEntries.length} entries from ${source}`);
  for (const [type, keys] of Object.entries(index.byType)) {
    console.log(`  ${type}: ${keys.length}`);
  }
}

main();
