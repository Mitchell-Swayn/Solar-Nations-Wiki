import { mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, basename, dirname, relative, sep } from 'node:path';
import sharp from 'sharp';
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
import { extractScenarios } from './extract-scenarios.ts';

type RawRecord = Record<string, unknown>;

type StarMapActor = {
  Type?: string;
  Tag?: string;
  CosmeticTag?: string;
  DisplayName?: string;
};

type ResolutionIssue = {
  kind: 'display-name' | 'localization' | 'icon';
  type: string;
  id: string;
  field?: string;
  source?: string;
  value?: string;
};

const unresolvedValues: ResolutionIssue[] = [];
const inferredValues: ResolutionIssue[] = [];

function recordUnresolved(issue: ResolutionIssue) {
  unresolvedValues.push(issue);
}

let starMapDisplayNames: Map<string, string> | undefined;

function loadStarMapDisplayNames(): Map<string, string> {
  if (starMapDisplayNames) return starMapDisplayNames;

  const candidatesById = new Map<string, StarMapActor[]>();
  const starMapPath = join(DATA_RAW, 'StarMap/TopDownExampleMap.json');
  if (existsSync(starMapPath)) {
    const actors = parseJsonFile(starMapPath);
    if (Array.isArray(actors)) {
      for (const actor of actors as StarMapActor[]) {
        if (!actor.DisplayName) continue;
        for (const rawId of [actor.Tag, actor.CosmeticTag]) {
          if (!rawId) continue;
          const id = rawId.toLowerCase();
          const candidates = candidatesById.get(id) ?? [];
          if (!candidates.includes(actor)) candidates.push(actor);
          candidatesById.set(id, candidates);
        }
      }
    }
  }

  starMapDisplayNames = new Map();
  for (const [id, candidates] of candidatesById) {
    // A star and an orbiting world can share a case-insensitive tag (notably
    // 40eridaniA). Planets.json describes the surface world, so prefer its
    // Planet/MinorObject actor over the containing star actor.
    const actor = [...candidates].sort((a, b) => {
      const rank = (value: StarMapActor) => value.Type === 'Planet_C' ? 0
        : value.Type === 'MinorObject_C' ? 1
          : value.Type === 'StableOrbit_C' ? 2
            : value.Type === 'Star_C' ? 3
              : 4;
      return rank(a) - rank(b);
    })[0];
    if (actor?.DisplayName) starMapDisplayNames.set(id, cleanGameText(actor.DisplayName));
  }
  return starMapDisplayNames;
}

function localizedValue(value: unknown, localization: Record<string, string>): string | undefined {
  if (typeof value !== 'string') return undefined;
  return localization[value] ?? localization[value.toLowerCase()];
}

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

// The DamageTypes table carries only a display color; the game renders attack
// channels with the per-domain *_attack stat icons (see DamageTypes_C:
// DomainAllStats, which composes "<domain>_attack"). Typed damage uses the
// matching themed art from GFX/Icons.
const DAMAGE_TYPE_ICONS: Record<string, string> = {
  airHard: 'air_attack', airSoft: 'air_attack', airTracking: 'air_attack',
  landHard: 'land_attack', landSoft: 'land_attack', landTracking: 'land_attack',
  spaceHard: 'space_attack', spaceSoft: 'space_attack', spaceTracking: 'space_attack',
  waterHard: 'water_attack', waterSoft: 'water_attack',
  laser: 'laser_attack', biological: 'biological_attack', strategic: 'strategic_attack',
  gravometric: 'gravitons', psychological: 'Psychology',
  emp: 'emp', torpedo: 'torpedo0', depthCharge: 'missileAttack_water',
};

const ENTRY_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  // The game uses EMP as an acronym everywhere it appears in localized
  // component and technology names, but the damage-type row has only `emp`.
  'damage-types:emp': 'EMP',
};

const ENTRY_DISPLAY_NAME_LOCALIZATION_KEYS: Record<string, string> = {
  // The `manpower` localization is a full explanatory tooltip. The resource
  // string table provides its standalone display name under this key.
  'resources:manpower': 'manpowerlinearmodifier',
  // Static modifier rows add serialization-oriented suffixes or use the
  // resulting state name, while their player-facing labels live on the
  // corresponding situation/action localization keys.
  'static-modifiers:americanPolitics_corruptionPurged': 'americanpolitics_purgecorruption',
  'static-modifiers:americanPolitics_dividedPolitics': 'americanpolitics_empiredivided',
  'static-modifiers:americanPolitics_renewedMilitary': 'americanpolitics_renewmilitary',
  'static-modifiers:americanPolitics_renewedUnity': 'americanpolitics_renewunity',
  'static-modifiers:navalInvasion': 'navalinvasionpenalty',
  'static-modifiers:spaceInvasion': 'spaceinvasionpenalty',
};

function applyDamageTypeIcons(entries: WikiEntry[]) {
  for (const entry of entries) {
    if (entry.type !== 'damage-types' || entry.icon) continue;
    const icon = DAMAGE_TYPE_ICONS[entry.id];
    if (!icon) continue;
    entry.icon = icon;
    entry.fields.Icon = icon;
    entry.references.push({ type: 'icon', id: icon });
    inferredValues.push({ kind: 'icon', type: entry.type, id: entry.id, source: 'damage-type-icon-map', value: icon });
  }
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

function extractSkillModifiers(raw: unknown): Record<string, ModifierRef[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const skillModifiers: Record<string, ModifierRef[]> = {};
  for (const [skill, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const modifiers = extractModifiers((value as Record<string, unknown>).Map);
    if (modifiers.length > 0) skillModifiers[skill] = modifiers;
  }
  return Object.keys(skillModifiers).length > 0 ? skillModifiers : undefined;
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
    'BenefitModifier',
    'CostModifier',
    'SpecialModifier',
    'LoyaltyScaledModifier',
    'PowerScaledModifier',
  ];
  const scopes: Record<string, string> = {
    PrimaryModifier: 'Primary', RegionModifier: 'Region', EmpireModifier: 'Empire',
    PopModifier: 'Population', JobModifier: 'Job', CharacterModifiers: 'Character',
    DepositModifier: 'Deposit', SurplusModifier: 'Surplus', ShortageModifier: 'Shortage',
    BenefitModifier: 'Benefit', CostModifier: 'Cost',
    SpecialModifier: 'Special', LoyaltyScaledModifier: 'Loyalty-scaled',
    PowerScaledModifier: 'Power-scaled',
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

function canonicalLocalizationTitle(id: string, localization: Record<string, string>): string | undefined {
  const canonicalId = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const candidates = Object.entries(localization)
    .filter(([key, value]) => key.replace(/[^a-z0-9]/gi, '').toLowerCase() === canonicalId
      && isConciseTitle(value)
      && !/\{[^}]+\}/.test(value))
    .map(([, value]) => cleanGameText(value));
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : undefined;
}

function verifiedDisplayName(
  id: string,
  displayNames: Record<string, { displayName?: string; source?: string }>,
): string | undefined {
  const canonicalId = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const candidates = Object.entries(displayNames)
    .filter(([key, value]) => key.replace(/[^a-z0-9]/gi, '').toLowerCase() === canonicalId && value.displayName)
    .map(([, value]) => cleanGameText(value.displayName!));
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];
  const exactLocalizedValues = Object.values(displayNames)
    .map((value) => value.displayName ? cleanGameText(value.displayName) : undefined)
    .filter((value): value is string => value === id);
  return exactLocalizedValues.length > 0 ? id : undefined;
}

function highlightedLocalizationTitle(id: string, localizedText: string): string | undefined {
  const canonical = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase().replace(/s$/, '');
  const candidates = [...localizedText.matchAll(/<(?:yellow|red|green|blue|cyan)>([^<]+)<\/>/gi)]
    .map((match) => match[1].trim())
    .filter((value) => canonical(value) === canonical(id));
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : undefined;
}

function buildEntry(
  type: string,
  record: RawRecord,
  localization: Record<string, string>,
  targetLocalization: Record<string, { displayName?: string; source?: string }> = {},
): WikiEntry | null {
  const id = record.Name;
  if (typeof id !== 'string' || !id) return null;

  const titleFields = ['Title', 'Description', 'Text'];
  let displayName = id;
  let hasDisplayNameSource = false;
  let description: string | undefined;

  for (const field of titleFields) {
    const rawValue = record[field];
    const localized = localizedValue(rawValue, localization);
    if (typeof rawValue === 'string' && !localized) {
      recordUnresolved({ kind: 'localization', type, id, field, value: rawValue });
    }
    if (localized) {
      if (field === 'Description' || field === 'Text') description = localized;
      else {
        displayName = localized;
        hasDisplayNameSource = true;
      }
    }
  }

  const localizedName = localizedValue(id, localization);
  if (localizedName) {
    const cleaned = cleanGameText(localizedName);
    if (isConciseTitle(localizedName)) {
      displayName = cleaned;
      hasDisplayNameSource = true;
    }
    else if (cleaned) description ??= cleaned;
  }
  const localizedTargetName = verifiedDisplayName(id, targetLocalization);
  if (!hasDisplayNameSource && localizedTargetName) {
    displayName = cleanGameText(localizedTargetName);
    hasDisplayNameSource = true;
  }
  const canonicalLocalizedName = canonicalLocalizationTitle(id, localization);
  if (!hasDisplayNameSource && canonicalLocalizedName) {
    displayName = canonicalLocalizedName;
    hasDisplayNameSource = true;
  }
  if (!hasDisplayNameSource && localizedName) {
    const highlightedTitle = highlightedLocalizationTitle(id, localizedName);
    if (highlightedTitle) {
      displayName = highlightedTitle;
      hasDisplayNameSource = true;
    }
  }
  if (type === 'planetary-bodies') {
    const starMapDisplayName = loadStarMapDisplayNames().get(id.toLowerCase());
    if (starMapDisplayName) {
      displayName = starMapDisplayName;
      hasDisplayNameSource = true;
    }
  }
  if (!hasDisplayNameSource && type === 'static-modifiers') {
    const unsuffixedId = id.replace(/_?Effect$/, '');
    const unsuffixedTitle = canonicalLocalizationTitle(unsuffixedId, localization)
      ?? verifiedDisplayName(unsuffixedId, targetLocalization);
    if (unsuffixedTitle) {
      displayName = unsuffixedTitle;
      hasDisplayNameSource = true;
    }
  }
  if (!hasDisplayNameSource && type === 'notifications') {
    const notificationTitle = canonicalLocalizationTitle(`${id}T`, localization)
      ?? canonicalLocalizationTitle(`${id}Title`, localization);
    if (notificationTitle) {
      displayName = notificationTitle;
      hasDisplayNameSource = true;
    }
  }
  // GovtForms stores bare ids (for example `republic`), while the game's
  // corresponding localized names use the `form_` prefix shared by the
  // government-reform options (for example `form_republic` -> `Republic`).
  if (type === 'government-forms') {
    const localizedFormName = localizedValue(`form_${id}`, localization);
    if (localizedFormName) {
      displayName = cleanGameText(localizedFormName);
      hasDisplayNameSource = true;
    }
  }
  if (type === 'policy-options' && id === 'resourceIncome') {
    displayName = 'Resource Income';
    hasDisplayNameSource = true;
  }
  const displayNameLocalizationKey = ENTRY_DISPLAY_NAME_LOCALIZATION_KEYS[`${type}:${id}`];
  if (displayNameLocalizationKey) {
    const localizedDisplayName = localizedValue(displayNameLocalizationKey, localization);
    if (localizedDisplayName) {
      displayName = cleanGameText(localizedDisplayName);
      hasDisplayNameSource = true;
    } else {
      recordUnresolved({ kind: 'localization', type, id, field: 'Name', source: displayNameLocalizationKey, value: displayNameLocalizationKey });
    }
  }
  const displayNameOverride = ENTRY_DISPLAY_NAME_OVERRIDES[`${type}:${id}`];
  if (displayNameOverride) {
    displayName = displayNameOverride;
    hasDisplayNameSource = true;
  }
  if (!hasDisplayNameSource) {
    recordUnresolved({ kind: 'display-name', type, id, source: 'entry-id', value: id });
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
        'BenefitModifier',
        'CostModifier',
        'SpecialModifier',
        'LoyaltyScaledModifier',
        'PowerScaledModifier',
      ].includes(key)
    ) {
      continue;
    }
    fields[key] = value;
  }

  // Planet portraits are generated from their game surface texture. Definitions
  // without a renderable surface (orbital placeholders) retain their Symbol.
  const planetPortrait = type === 'planetary-bodies'
    && existsSync(join(PROJECT_ROOT, 'data', 'icons-extra', 'PlanetPortraits', `planet-${id}.png`))
      ? `planet-${id}`
      : undefined;
  const icon = planetPortrait
    ?? (typeof record.Icon === 'string'
      ? record.Icon
      : type === 'planetary-bodies' && typeof record.Symbol === 'string'
        ? record.Symbol
        : undefined);
  const references = collectReferences(record, type);
  if (icon && !references.some((reference) => reference.type === 'icon' && reference.id === icon)) {
    references.push({ type: 'icon', id: icon });
  }

  return {
    id,
    type,
    displayName,
    icon,
    description,
    fields,
    modifiers: collectModifierFields(record),
    skillModifiers: extractSkillModifiers(record.SkillModifiers),
    prerequisites: collectPrerequisites(record),
    references,
  };
}

async function optimizePng(source: string, target: string, width = 128, height = 128) {
  mkdirSync(dirname(target), { recursive: true });
  await sharp(source)
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(target);
}

async function optimizePngBatch(files: Array<{ source: string; target: string; width?: number; height?: number }>) {
  const concurrency = 16;
  for (let index = 0; index < files.length; index += concurrency) {
    await Promise.all(files.slice(index, index + concurrency).map((file) =>
      optimizePng(file.source, file.target, file.width, file.height)));
  }
}

async function copyAssets(gameRoot: string) {
  const flagsSrc = getFlagsPath(gameRoot);
  const flagsDest = join(PUBLIC_ASSETS, 'flags');
  const iconsDest = join(PUBLIC_ASSETS, 'icons');

  rmSync(flagsDest, { recursive: true, force: true });
  // Game icons are exposed through /wiki-icons. Remove the legacy duplicate.
  rmSync(iconsDest, { recursive: true, force: true });
  mkdirSync(flagsDest, { recursive: true });

  if (existsSync(flagsSrc)) {
    const flags = readdirSync(flagsSrc)
      .filter((file) => file.endsWith('.png'))
      .map((file) => ({ source: join(flagsSrc, file), target: join(flagsDest, file), width: 192, height: 128 }));
    await optimizePngBatch(flags);
    console.log(`Flag bundle: ${flags.length} optimized`);
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
  // Scoped aliases preserve assets whose basenames collide across game icon
  // folders, such as CharacterTraits/logical and Ideology/logical.
  for (const [key, path] of indexPngFiles(join(getIconsPath(gameRoot), 'CharacterTraits'))) {
    files.set(`charactertrait:${key}`, path);
  }
  // Terrain ids overlap with other icon basenames. Scoped aliases guarantee
  // terrain entries use the game's terrain illustrations rather than whichever
  // same-named icon wins the general shortest-path lookup.
  for (const [key, path] of indexPngFiles(join(getIconsPath(gameRoot), 'Terrain'))) {
    files.set(`terrain:${key}`, path);
  }
  for (const [key, path] of indexPngFiles(EXTRA_ICONS_DIR)) {
    if (!files.has(key)) files.set(key, path);
  }
  return files;
}

function applyCharacterTraitIconAliases(entries: WikiEntry[], gameRoot: string) {
  const allIcons = indexIconSources(gameRoot);
  const characterTraitIcons = indexPngFiles(join(getIconsPath(gameRoot), 'CharacterTraits'));
  for (const entry of entries) {
    if (entry.type !== 'character-traits' || !entry.icon) continue;
    const sourceIcon = entry.icon;
    const key = sourceIcon.toLowerCase();
    const scopedSource = characterTraitIcons.get(key);
    if (!scopedSource || allIcons.get(key) === scopedSource) continue;
    const alias = `charactertrait:${sourceIcon}`;
    entry.icon = alias;
    entry.references = entry.references.filter((reference) => reference.type !== 'icon');
    entry.references.push({ type: 'icon', id: alias });
    inferredValues.push({ kind: 'icon', type: entry.type, id: entry.id, source: 'type-scoped-character-trait-icon', value: alias });
  }
}

function applyTerrainTypeIcons(entries: WikiEntry[], gameRoot: string) {
  const terrainIcons = indexPngFiles(join(getIconsPath(gameRoot), 'Terrain'));
  for (const entry of entries) {
    if (entry.type !== 'terrain-types') continue;
    const sourceId = terrainIcons.has(entry.id.toLowerCase())
      ? entry.id
      : entry.id === 'river' && terrainIcons.has('ocean')
        ? 'ocean'
        : undefined;
    if (!sourceId) {
      recordUnresolved({ kind: 'icon', type: entry.type, id: entry.id, field: 'Icon', source: 'terrain-image' });
      continue;
    }
    const icon = `terrain:${sourceId}`;
    entry.icon = icon;
    entry.fields.Icon = icon;
    entry.references = entry.references.filter((reference) => reference.type !== 'icon');
    entry.references.push({ type: 'icon', id: icon });
    inferredValues.push({
      kind: 'icon',
      type: entry.type,
      id: entry.id,
      source: sourceId === entry.id ? 'terrain-image' : 'terrain-ocean-fallback',
      value: icon,
    });
  }
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
      recordUnresolved({ kind: 'icon', type: entry.type, id: entry.id, field: 'Icon', source: 'icon-manifest', value: entry.icon });
      entry.icon = undefined;
      delete entry.fields.Icon;
      entry.references = entry.references.filter((reference) => reference.type !== 'icon');
      removed++;
    }
  }
  console.log(`Icon references: ${removed} unavailable references removed`);
  if (missing.size > 0) console.log(`  Missing: ${[...missing].sort().join(', ')}`);
}

async function copyWikiIcons(gameRoot: string, entries: WikiEntry[]) {
  const sourceRoot = getIconsPath(gameRoot);
  const outputRoot = join(PROJECT_ROOT, 'public/wiki-icons');
  const sourceFiles = indexIconSources(gameRoot);
  const requested = new Set(entries.map((entry) => entry.icon).filter((icon): icon is string => Boolean(icon)));

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

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
  const iconFiles: Array<{ source: string; target: string; width?: number; height?: number }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.toLowerCase().endsWith('.png')) continue;
      const target = join(outputRoot, ...bundleRelPath(path).split('/'));
      const isTerrain = path.includes(`${sep}Terrain${sep}`);
      iconFiles.push({ source: path, target, width: isTerrain ? 192 : 128, height: 128 });
    }
  };
  if (existsSync(sourceRoot)) walk(sourceRoot);
  if (existsSync(EXTRA_ICONS_DIR)) walk(EXTRA_ICONS_DIR);
  await optimizePngBatch(iconFiles);
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
  console.log(`Wiki icon bundle: ${iconFiles.length} optimized, ${missing.length} unavailable`);
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
    'character-skills', 'damage-types', 'unit-stats', 'unit-qualities', 'unit-types',
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
  const entryFallbackIcons: Record<string, string> = {
    explorersMastery: 'prestige',
  };
  for (const entry of entries) {
    if (entry.type !== 'culture-traits') continue;
    const family = typeof entry.fields.Family === 'string' ? entry.fields.Family : undefined;
    const familyIcon = rootIcons.get(family ?? entry.id) ?? 'cultural';
    const firstModifier = entry.modifiers[0];
    const prefersModifierIcon = firstModifier?.key === 'unitCostMult' || firstModifier?.key === 'projectBuildCostMult';
    const candidates: Array<{ icon?: string; source: string }> = !family
      ? [{ icon: entry.icon, source: 'source-field' }, { icon: familyIcon, source: rootIcons.has(entry.id) ? 'family' : 'default-cultural' }]
      : prefersModifierIcon ? [
          { icon: modifierIcons.get(firstModifier.key), source: 'modifier' },
          { icon: targetIcons.get(firstModifier.value1 ?? ''), source: 'target' },
          { icon: familyIcon, source: rootIcons.has(family) ? 'family' : 'default-cultural' },
        ] : [
          { icon: targetIcons.get(firstModifier?.value1 ?? ''), source: 'target' },
          { icon: modifierIcons.get(firstModifier?.key ?? ''), source: 'modifier' },
          { icon: entryFallbackIcons[entry.id], source: 'entry-fallback' },
          { icon: familyIcon, source: rootIcons.has(family) ? 'family' : 'default-cultural' },
        ];
    const resolution = candidates.find((candidate) => available(candidate.icon));
    const icon = resolution?.icon;
    entry.references = entry.references.filter((reference) => reference.type !== 'icon');
    if (!icon) {
      recordUnresolved({ kind: 'icon', type: entry.type, id: entry.id, field: 'Icon', source: 'culture-trait-icon-resolution' });
      entry.icon = undefined;
      delete entry.fields.Icon;
      continue;
    }
    entry.icon = icon;
    entry.fields.Icon = icon;
    entry.references.push({ type: 'icon', id: icon });
    if (resolution?.source !== 'source-field') {
      inferredValues.push({ kind: 'icon', type: entry.type, id: entry.id, source: resolution?.source, value: icon });
    }
  }
}

function modifierConceptName(template: string): string {
  const withoutValues = cleanGameText(template)
    .replace(/\$?\{val\}/g, '')
    .replace(/\{[123](?:_img)?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (withoutValues.includes(':') ? withoutValues.slice(0, withoutValues.indexOf(':')) : withoutValues)
    .replace(/\s+([.,;)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

function localizedModifierTemplate(record: RawRecord, localization: Record<string, string>): string {
  const id = String(record.Name);
  if (id === 'leaderXPGain') return 'Leader Experience Gain: {val}';
  const lookup = new Map(Object.entries(localization).map(([key, value]) => [key.toLowerCase(), value]));
  const localized = lookup.get(id.toLowerCase());
  if (localized) return localized;
  recordUnresolved({ kind: 'display-name', type: 'modifiers', id, source: 'modifier-id', value: id });
  return id;
}

function loadModifiers(localization: Record<string, string>): WikiEntry[] {
  const path = join(DATA_RAW, 'Defines/ModifierProperties.json');
  if (!existsSync(path)) return [];
  const data = parseJsonFile(path) as RawRecord[];
  return data.map((record) => {
    const id = record.Name as string;
    const displayTemplate = localizedModifierTemplate(record, localization);
    const displayName = modifierConceptName(displayTemplate) || id;
    record.DisplayName = displayTemplate;
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
  const targetLocalizationPath = join(DATA_RAW, 'Localization/modifier-targets.json');
  const modifierTargetLocalization = existsSync(targetLocalizationPath)
    ? (parseJsonFile(targetLocalizationPath) as Record<string, { displayName?: string; source?: string }>)
    : {};
  const displayNameLocalizationPath = join(DATA_RAW, 'Localization/display-names.json');
  const displayNameLocalization = existsSync(displayNameLocalizationPath)
    ? (parseJsonFile(displayNameLocalizationPath) as Record<string, { displayName?: string; source?: string }>)
    : {};
  const targetLocalization = { ...displayNameLocalization, ...modifierTargetLocalization };

  const entries: WikiEntry[] = [];
  for (const file of readdirSync(rawDefines)) {
    if (!file.endsWith('.json')) continue;
    const slug = DEFINE_FILE_TO_SLUG[file];
    if (!slug) continue;
    const data = parseJsonFile(join(rawDefines, file));
    if (!Array.isArray(data)) continue;
    for (const record of data) {
      const entry = buildEntry(slug, record as RawRecord, localization, targetLocalization);
      if (!entry) continue;
      entries.push(entry);
      if (slug === 'culture-traits') {
        entries.push(...buildCultureIdeaEntries(record as RawRecord, localization, targetLocalization));
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
  targetLocalization: Record<string, { displayName?: string; source?: string }>,
): WikiEntry[] {
  if (!Array.isArray(record.Ideas)) return [];
  const entries: WikiEntry[] = [];
  for (const [index, idea] of (record.Ideas as RawRecord[]).entries()) {
    const entry = buildEntry(
      'culture-traits',
      // IdeaIndex preserves the array order, which is the in-game unlock order.
      { ...idea, Family: record.Name, Category: record.Category, IdeaIndex: index },
      localization,
      targetLocalization,
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
  const modifierTargetsPath = join(DATA_RAW, 'Localization/modifier-targets.json');
  if (existsSync(modifierTargetsPath)) {
    writeFileSync(
      join(DATA_CURATED, 'modifier-targets.json'),
      JSON.stringify(parseJsonFile(modifierTargetsPath), null, 2),
    );
  }
  const countBy = (values: ResolutionIssue[], key: keyof ResolutionIssue) => Object.fromEntries(
    [...new Set(values.map((value) => value[key]).filter(Boolean) as string[])]
      .sort()
      .map((value) => [value, values.filter((issue) => issue[key] === value).length]),
  );
  const report = {
    generatedAt: index.generatedAt,
    unresolved: {
      count: unresolvedValues.length,
      byKind: countBy(unresolvedValues, 'kind'),
      byType: countBy(unresolvedValues, 'type'),
      values: [...unresolvedValues].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id) || (a.field ?? '').localeCompare(b.field ?? '')),
    },
    inferred: {
      count: inferredValues.length,
      byKind: countBy(inferredValues, 'kind'),
      bySource: countBy(inferredValues, 'source'),
      values: [...inferredValues].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
    },
  };
  writeFileSync(join(DATA_CURATED, 'normalization-report.json'), JSON.stringify(report, null, 2));

  for (const [type, keys] of Object.entries(index.byType)) {
    const entries = keys.map((k) => index.entries[k]);
    writeFileSync(
      join(DATA_CURATED, `${type}.json`),
      JSON.stringify(entries, null, 2),
    );
  }
}

async function main() {
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

  applyDamageTypeIcons(defineEntries);
  applyCultureTraitIcons(defineEntries, modifierEntries, gameRoot);
  applyCharacterTraitIconAliases(defineEntries, gameRoot);
  applyTerrainTypeIcons(defineEntries, gameRoot);
  const allEntries = [...defineEntries, ...modifierEntries];
  const source = 'base game defines extracted via CUE4Parse';

  removeUnavailableIconReferences(gameRoot, allEntries);
  const index = buildIndex(allEntries, source);
  const modifierDefs = parseJsonFile(join(DATA_RAW, 'Defines/ModifierProperties.json')) as RawRecord[];

  // Scenario extraction ensures all referenced flags exist; the web bundle is
  // optimized afterward so those source-sized files are not shipped as-is.
  extractScenarios();
  await copyAssets(gameRoot);
  await copyWikiIcons(gameRoot, allEntries);
  writeCuratedFiles(index, modifierDefs);

  console.log(`Normalized ${allEntries.length} entries from ${source}`);
  for (const [type, keys] of Object.entries(index.byType)) {
    console.log(`  ${type}: ${keys.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
