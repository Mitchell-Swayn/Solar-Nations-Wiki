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
  getTutorialModPath,
} from './paths.ts';
import { DEFINE_FILE_TO_SLUG } from '../src/lib/categories.ts';
import { getCultureTraitGroup } from '../src/lib/culture.ts';
import type {
  CuratedIndex,
  ModifierRef,
  Prerequisite,
  WikiEntry,
  WikiReference,
} from '../src/lib/types.ts';

type RawRecord = Record<string, unknown>;

const ICON_ALIASES: Record<string, string> = {
  rareMetals: 'rareMetalsMine', titanium: 'titaniumMine',
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
  attack: 'smallArms0', entrenchment: 'fortifications', recon: 'activeRecon', truck: 'logistics',
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
  const sourceFiles = indexPngFiles(getIconsPath(gameRoot));
  let removed = 0;
  for (const entry of entries) {
    if (!entry.icon) continue;
    const sourceName = resolveIconSource(entry.icon);
    if (!sourceFiles.has(sourceName.toLowerCase())) {
      entry.icon = undefined;
      delete entry.fields.Icon;
      entry.references = entry.references.filter((reference) => reference.type !== 'icon');
      removed++;
    }
  }
  console.log(`Icon references: ${removed} unavailable references removed`);
}

function copyWikiIcons(gameRoot: string, entries: WikiEntry[]) {
  const sourceRoot = getIconsPath(gameRoot);
  const outputRoot = join(PROJECT_ROOT, 'public/wiki-icons');
  const sourceFiles = indexPngFiles(sourceRoot);
  const requested = new Set(entries.map((entry) => entry.icon).filter((icon): icon is string => Boolean(icon)));
  for (const entry of entries) {
    if (entry.type === 'culture-traits') requested.add(getCultureTraitGroup(entry.id).icon);
  }

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  let copied = 0;
  const missing: string[] = [];
  const written = new Set<string>();
  const write = (source: string, target: string) => {
    if (written.has(target.toLowerCase())) return;
    cpSync(source, join(outputRoot, target));
    written.add(target.toLowerCase());
    copied++;
  };
  for (const icon of [...requested].sort()) {
    const sourceName = resolveIconSource(icon);
    const source = sourceFiles.get(sourceName.toLowerCase());
    if (!source) { missing.push(icon); continue; }
    write(source, `${icon}.png`);
  }
  // Bundle every remaining game icon so unreferenced art stays available.
  // Names that lose a duplicate-name collision get a directory prefix.
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.toLowerCase().endsWith('.png')) continue;
      const key = basename(entry.name, '.png').toLowerCase();
      if (sourceFiles.get(key) === path) { write(path, entry.name); continue; }
      const prefix = relative(sourceRoot, dirname(path)).split(sep).join('_');
      write(path, `${prefix}_${entry.name}`);
    }
  };
  if (existsSync(sourceRoot)) walk(sourceRoot);
  console.log(`Wiki icon bundle: ${copied} copied, ${missing.length} unavailable`);
}

function applyCultureTraitIcons(entries: WikiEntry[], modifierEntries: WikiEntry[], gameRoot: string) {
  const sourceFiles = indexPngFiles(getIconsPath(gameRoot));
  const available = (icon: string | undefined): icon is string =>
    Boolean(icon && sourceFiles.has(resolveIconSource(icon).toLowerCase()));
  const modifierIcons = new Map(
    modifierEntries
      .filter((modifier) => modifier.icon)
      .map((modifier) => [modifier.id, modifier.icon as string]),
  );
  for (const entry of entries) {
    if (entry.type !== 'culture-traits') continue;
    const candidates = [
      ...entry.modifiers.map((modifier) => modifierIcons.get(modifier.key)),
      getCultureTraitGroup(entry.id).icon,
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

function loadLocalization(modPath: string): Record<string, string> {
  const locPath = join(modPath, 'Localization/en.json');
  if (!existsSync(locPath)) return {};
  return parseJsonFile(locPath) as Record<string, string>;
}

function loadDefines(modPath: string, localization: Record<string, string>) {
  const definesDir = join(modPath, 'Defines');
  const entries: WikiEntry[] = [];

  for (const file of readdirSync(definesDir)) {
    if (!file.endsWith('.json')) continue;
    const slug = DEFINE_FILE_TO_SLUG[file];
    if (!slug) continue;
    const data = parseJsonFile(join(definesDir, file));
    if (!Array.isArray(data)) continue;
    for (const record of data) {
      const entry = buildEntry(slug, record as RawRecord, localization);
      if (entry) entries.push(entry);
    }
  }

  return entries;
}

function localizedModifierName(record: RawRecord, localization: Record<string, string>): string {
  const id = String(record.Name);
  const lookup = new Map(Object.entries(localization).map(([key, value]) => [key.toLowerCase(), value]));
  const candidates = [id];
  let base = id;
  const suffixes = ['TooltipModifier', 'PopulationMult', 'Population', 'CurrencyAdd', 'Interplanetary', 'Modifier', 'Effect', 'Override', 'Mult', 'Add', 'Max', 'Cost', 'Cap'];
  for (let i = 0; i < 4; i++) {
    const suffix = suffixes.find((candidate) => base.endsWith(candidate));
    if (!suffix) break;
    base = base.slice(0, -suffix.length);
    candidates.push(base);
  }
  const genericIcons = new Set(['political', 'military', 'industrial', 'defense', 'war', 'planet']);
  if (typeof record.Icon === 'string' && !genericIcons.has(record.Icon)) candidates.push(record.Icon);
  for (const candidate of candidates) {
    const localized = lookup.get(candidate.toLowerCase());
    if (localized) return cleanGameText(localized);
  }
  return humanizeId(id);
}

function loadModifiers(modPath: string, localization: Record<string, string>): WikiEntry[] {
  const path = join(modPath, 'modifiers.json');
  if (!existsSync(path)) return [];
  const data = parseJsonFile(path) as RawRecord[];
  if (!data.some((record) => record.Name === 'characterQuality')) {
    data.push({
      Name: 'characterQuality', Positivity: 'positive', IsPercent: 'Percentage',
      Properties: {}, Icon: 'threeStar', Scaler: 'Linear', AIWeights: { base: 1 },
      GenerateIcons: false, IsEffect: false,
    });
  }
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

function loadMissionComponents(modPath: string): WikiEntry[] {
  const path = join(modPath, 'missioncomponents.json');
  if (!existsSync(path)) return [];
  const data = parseJsonFile(path) as RawRecord[];
  return data.map((record) => {
    const id = record.Name as string;
    return {
      id,
      type: 'mission-components',
      displayName: humanizeId(id),
      icon: typeof record.Icon === 'string' ? record.Icon : undefined,
      fields: record,
      modifiers: collectModifierFields(record),
      prerequisites: collectPrerequisites(record),
      references: [],
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
      if (entry) entries.push(entry);
    }
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
  const modPath = getTutorialModPath(gameRoot);
  const rawLocalizationPath = join(DATA_RAW, 'Localization/en.json');
  const localization = existsSync(rawLocalizationPath)
    ? (parseJsonFile(rawLocalizationPath) as Record<string, string>)
    : loadLocalization(modPath);

  const rawEntries = loadRawExtract();
  const useRaw = rawEntries.length > 0;

  const defineEntries = useRaw ? rawEntries : loadDefines(modPath, localization);
  const modifierEntries = loadModifiers(modPath, localization);
  const missionEntries = loadMissionComponents(modPath);

  applyCultureTraitIcons(defineEntries, modifierEntries, gameRoot);
  const allEntries = [...defineEntries, ...modifierEntries, ...missionEntries];
  const source = useRaw
    ? 'data/raw extracted Defines + tutorialMod modifiers'
    : 'tutorialMod Defines + modifiers + mission components';

  removeUnavailableIconReferences(gameRoot, allEntries);
  const index = buildIndex(allEntries, source);
  const modifierDefs = parseJsonFile(join(modPath, 'modifiers.json')) as RawRecord[];

  copyAssets(gameRoot);
  copyWikiIcons(gameRoot, allEntries);
  writeCuratedFiles(index, modifierDefs);

  console.log(`Normalized ${allEntries.length} entries from ${source}`);
  for (const [type, keys] of Object.entries(index.byType)) {
    console.log(`  ${type}: ${keys.length}`);
  }
}

main();
