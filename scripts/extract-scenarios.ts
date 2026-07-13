import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_CURATED, DATA_RAW, PROJECT_ROOT, getFlagsPath, getGameRoot } from './paths.ts';
import type { CountryFaction, CountryRegion, CountryScenario, ScenarioCountry, ScenarioCulture } from '../src/lib/types.ts';

type JsonObject = Record<string, unknown>;
type MapEntry = { key: string; value: JsonObject };

const SCENARIOS = [
  { id: 'age-of-information', file: 'Modern Day.sav' },
  { id: 'twilight-of-modernity', file: 'scenario_default.sav' },
] as const;

// These two IDs are misspelled in the shipped scenario saves and do not exist
// in CultureTraits. Map them to the corresponding defined traits explicitly.
const CULTURE_TRAIT_ID_CORRECTIONS: Record<string, string> = {
  idea_individuaism: 'idea_individualism',
  idea_irridentist: 'irridentist',
};

type RegionGeography = {
  provinceCount: number;
  terrains: Map<string, number>;
};

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function field<T = unknown>(record: JsonObject, name: string): T | undefined {
  const entry = Object.entries(record).find(([key]) => key === name || key.startsWith(`${name}_`));
  return entry?.[1] as T | undefined;
}

function array<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function mapValues<T = unknown>(value: unknown): Array<{ key: string; value: T }> {
  return array<{ key?: unknown; value?: T }>(value)
    .filter((entry) => typeof entry?.key === 'string')
    .map((entry) => ({ key: entry.key as string, value: entry.value as T }));
}

function unrealText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonObject;
  if (typeof object(record.variant).None === 'object') {
    const text = object(object(record.variant).None).culture_invariant;
    if (typeof text === 'string') return text;
  }
  const base = object(object(record.variant).Base);
  if (typeof base.source_string === 'string') return base.source_string;
  const argumentFormat = object(object(record.variant).ArgumentFormat);
  const formatted = unrealText(argumentFormat.format_text);
  if (formatted) return formatted;
  for (const nested of Object.values(record)) {
    const text = unrealText(nested);
    if (text) return text;
  }
  return undefined;
}

function cleanLore(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/<img\s+id="[^"]+"\s*\/>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || undefined;
}

function normalizeFaction(entry: { key: string; value: unknown }): CountryFaction {
  const value = object(entry.value);
  const variant = string(field(value, 'Variant'));
  return {
    id: entry.key,
    loyalty: number(field(value, 'Loyalty')),
    power: number(field(value, 'PowerBase')),
    isRuling: Boolean(field(value, 'IsRuling')),
    variant: variant && variant !== 'None' ? variant : undefined,
  };
}

function normalizePlanetId(id: string, canonicalPlanetIds: Map<string, string>): string {
  return canonicalPlanetIds.get(id.toLowerCase()) ?? id;
}

function geographyFields(geography: RegionGeography | undefined) {
  return {
    provinceCount: geography?.provinceCount ?? 0,
    terrains: [...(geography?.terrains ?? new Map<string, number>())]
      .map(([id, provinces]) => ({ id, provinces }))
      .sort((left, right) => right.provinces - left.provinces || left.id.localeCompare(right.id)),
  };
}

function normalizeRegion(entry: MapEntry, geography: RegionGeography | undefined, canonicalPlanetIds: Map<string, string>): CountryRegion {
  const value = object(entry.value);
  const cultures = mapValues<number>(field(value, 'Culture'))
    .map((culture) => ({ id: culture.key, share: number(culture.value) }))
    .sort((a, b) => b.share - a.share);
  return {
    id: entry.key,
    name: string(field(value, 'Name'), entry.key),
    planet: normalizePlanetId(string(field(value, 'Planet'), 'unknown'), canonicalPlanetIds),
    regionType: 'economic',
    owner: (() => { const id = string(field(value, 'Overlord')); return id && id !== 'None' ? id : undefined; })(),
    population: array<number>(field(value, 'PopAges')).reduce((sum, amount) => sum + number(amount), 0),
    development: number(field(value, 'Development')),
    education: number(field(value, 'Education')),
    specialization: (() => {
      const specialization = string(field(value, 'Specialization'));
      return specialization && specialization !== 'None' ? specialization : undefined;
    })(),
    cultures,
    deposits: mapValues<number>(field(value, 'Deposits'))
      .map((deposit) => ({ id: deposit.key, quantity: number(deposit.value) }))
      .filter((deposit) => deposit.quantity !== 0)
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...geographyFields(geography),
  };
}

function normalizePlanetaryRegion(entry: MapEntry, geography: RegionGeography | undefined, canonicalPlanetIds: Map<string, string>): CountryRegion {
  const value = object(entry.value);
  const planet = normalizePlanetId(string(field(value, 'Planet'), 'unknown'), canonicalPlanetIds);
  const geographyData = geographyFields(geography);
  // Jump-point nodes use the generic desert/None province terrain in scenario
  // saves, but the game represents them as space-station locations. Normalize
  // the node type so its label and extracted terrain icon agree.
  if (/jumpPoint$/i.test(planet)) {
    const provinceCount = Math.max(geographyData.provinceCount, 1);
    geographyData.provinceCount = provinceCount;
    geographyData.terrains = [{ id: 'spaceStation', provinces: provinceCount }];
  }
  return {
    id: entry.key,
    name: string(field(value, 'Name'), entry.key),
    planet,
    regionType: 'planetary',
    population: mapValues<number>(field(value, 'ColonyPopulation')).reduce((sum, item) => sum + number(item.value), 0),
    development: 0,
    education: 0,
    cultures: [],
    deposits: mapValues<number>(field(value, 'Deposits'))
      .map((deposit) => ({ id: deposit.key, quantity: number(deposit.value) }))
      .filter((deposit) => deposit.quantity !== 0)
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...geographyData,
  };
}

function extractRegionGeography(properties: JsonObject): Map<string, RegionGeography> {
  const geography = new Map<string, RegionGeography>();
  for (const planet of mapValues<JsonObject>(properties.Planets_0)) {
    for (const province of mapValues<JsonObject>(field(object(planet.value), 'Provinces'))) {
      const value = object(province.value);
      const regionId = string(field(value, 'Region'));
      if (!regionId || regionId === 'None') continue;
      const terrain = string(field(value, 'Terrain'), 'unknown');
      const current = geography.get(regionId) ?? { provinceCount: 0, terrains: new Map<string, number>() };
      current.provinceCount++;
      current.terrains.set(terrain, (current.terrains.get(terrain) ?? 0) + 1);
      geography.set(regionId, current);
    }
  }
  return geography;
}

function normalizeCulture(entry: MapEntry): ScenarioCulture {
  const value = object(entry.value);
  const normalizeTrait = (id: string) => CULTURE_TRAIT_ID_CORRECTIONS[id] ?? id;
  return {
    id: entry.key,
    traits: array<string>(field(value, 'Traits')).filter(Boolean).map(normalizeTrait),
    traitIdeas: array<string>(field(value, 'TraitIdeas')).filter(Boolean).map(normalizeTrait),
  };
}

function normalizeScenario(raw: JsonObject, config: typeof SCENARIOS[number], canonicalPlanetIds: Map<string, string>): CountryScenario {
  const root = object(raw.root);
  const properties = object(root.properties);
  const data = object(properties.Data_0);
  const scenarioName = unrealText(field(data, 'Name')) ?? config.id;
  const profiles = array<JsonObject>(field(data, 'Countries')).map((record) => ({
      tag: string(field(record, 'Tag')),
      name: string(field(record, 'NameInternal')),
      lore: cleanLore(unrealText(field(record, 'Lore'))),
      difficulty: number(field(record, 'Difficulty')),
  }));
  const selectable = new Map(profiles.map((profile) => [profile.tag, profile]));
  const cultures = mapValues<JsonObject>(properties.Cultures_0).map((entry) => normalizeCulture({ key: entry.key, value: object(entry.value) }));
  const regionGeography = extractRegionGeography(properties);
  const economicRegions = mapValues<JsonObject>(properties.Regions_0)
    .map((entry) => normalizeRegion({ key: entry.key, value: object(entry.value) }, regionGeography.get(entry.key), canonicalPlanetIds));
  const planetaryRegions = mapValues<JsonObject>(properties.PlanetaryNodes_0)
    .map((entry) => normalizePlanetaryRegion({ key: entry.key, value: object(entry.value) }, regionGeography.get(entry.key), canonicalPlanetIds));
  const regions = [...economicRegions, ...planetaryRegions]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const regionsByOwner = new Map<string, CountryRegion[]>();
  for (const region of regions) {
    const owner = region.owner;
    if (!owner || owner === 'None') continue;
    const owned = regionsByOwner.get(owner) ?? [];
    owned.push(region);
    regionsByOwner.set(owner, owned);
  }

  const countries = mapValues<JsonObject>(properties.Empires_0).map((entry): ScenarioCountry => {
    const value = object(entry.value);
    const ownedRegions = (regionsByOwner.get(entry.key) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const capitalRegion = string(field(value, 'CapitalRegion'));
    const capitalRegionName = ownedRegions.find((region) => region.id === capitalRegion)?.name;
    const logicTag = string(field(value, 'LogicTag'), entry.key);
    const descriptor = selectable.get(entry.key);
    return {
      id: entry.key,
      logicTag,
      name: string(field(value, 'Name'), logicTag),
      flag: string(field(value, 'FlagKey')),
      color: { r: 0, g: 0, b: 0, a: 255, ...object(field(value, 'Color')) } as ScenarioCountry['color'],
      capital: string(field(value, 'Capital')),
      capitalRegion: capitalRegion && capitalRegion !== 'None' ? capitalRegion : undefined,
      capitalRegionName,
      integrity: number(field(value, 'Integrity')),
      treasury: number(field(value, 'Treasury')),
      governmentForm: (() => { const id = string(field(value, 'GovtForm')); return id && id !== 'None' ? id : undefined; })(),
      governmentType: (() => { const id = string(field(value, 'GovtType')); return id && id !== 'None' ? id : undefined; })(),
      rulingIdeology: (() => { const id = string(field(value, 'RulingIdeology')); return id && id !== 'None' ? id : undefined; })(),
      overlord: (() => { const id = string(field(value, 'Overlord')); return id && id !== 'None' ? id : undefined; })(),
      isRebel: Boolean(field(value, 'IsRebel')),
      primaryCulture: (() => { const id = string(field(value, 'PrimaryCulture')); return id && id !== 'None' ? id : undefined; })(),
      acceptedCultures: array<string>(field(value, 'AcceptedCulture')).filter((id) => id && id !== 'None'),
      promotedCultures: array<string>(field(value, 'PromotedCulture')).filter((id) => id && id !== 'None'),
      oppressedCultures: array<string>(field(value, 'OppressedCulture')).filter((id) => id && id !== 'None'),
      reforms: mapValues<number>(field(value, 'Reforms')).map((reform) => ({ id: reform.key, optionIndex: number(reform.value) })),
      factions: mapValues(field(value, 'Factions')).map(normalizeFaction).sort((a, b) => Number(b.isRuling) - Number(a.isRuling) || b.power - a.power),
      technologies: array<string>(field(value, 'Technology')).filter(Boolean),
      staticModifiers: array<string>(field(value, 'StaticModifiers')).filter(Boolean),
      stockpile: mapValues<number>(field(value, 'GvtStockpile')).map((item) => ({ id: item.key, value: number(item.value) })),
      tradeBalance: mapValues<number>(field(value, 'TradePolicy')).map((item) => ({ id: item.key, value: number(item.value) })),
      taxes: mapValues<number>(field(value, 'Taxes')).map((item) => ({ id: item.key, value: number(item.value) })),
      regions: ownedRegions,
      population: ownedRegions.reduce((sum, region) => sum + region.population, 0),
      planets: [...new Set(ownedRegions.map((region) => region.planet))].sort(),
      selectable: descriptor,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const cultureIds = new Set(cultures.map((culture) => culture.id));
  const missingCultureIds = new Set(countries.flatMap((country) => [
    country.primaryCulture,
    ...country.acceptedCultures,
    ...country.promotedCultures,
    ...country.oppressedCultures,
    ...country.regions.flatMap((region) => region.cultures.map((culture) => culture.id)),
  ]).filter((id): id is string => Boolean(id && !cultureIds.has(id))));
  if (missingCultureIds.size > 0) {
    throw new Error(`${config.id} references cultures absent from its culture state: ${[...missingCultureIds].sort().join(', ')}`);
  }

  return {
    id: config.id,
    name: scenarioName,
    sourceFile: config.file,
    profileCount: selectable.size,
    selectableCount: countries.filter((country) => country.selectable).length,
    profiles: profiles.map((profile) => ({
      ...profile,
      countryId: countries.find((country) => country.id === profile.tag)?.id,
    })),
    cultures,
    regions,
    countries,
  };
}

export function extractScenarios() {
  const gameRoot = getGameRoot();
  const parserManifest = join(PROJECT_ROOT, 'tools/gvas-export/Cargo.toml');
  const outputDir = join(DATA_CURATED, 'scenarios');
  const flagsDir = getFlagsPath(gameRoot);
  const publicFlagsDir = join(PROJECT_ROOT, 'public/assets/flags');
  const tempDir = mkdtempSync(join(tmpdir(), 'solar-nations-scenarios-'));
  const planetDefinitions = JSON.parse(readFileSync(join(DATA_RAW, 'Defines/Planets.json'), 'utf8')) as JsonObject[];
  const canonicalPlanetIds = new Map(planetDefinitions
    .map((planet) => string(planet.Name))
    .filter(Boolean)
    .map((id) => [id.toLowerCase(), id]));
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(publicFlagsDir, { recursive: true });
  try {
    for (const config of SCENARIOS) {
      const input = join(gameRoot, 'Saved/Scenarios', config.file);
      if (!existsSync(input)) throw new Error(`Scenario save not found: ${input}`);
      const parsed = join(tempDir, `${config.id}.json`);
      console.log(`Parsing scenario ${config.file}...`);
      execFileSync('cargo', ['run', '--quiet', '--release', '--manifest-path', parserManifest, '--', input, parsed], { stdio: 'inherit' });
      const scenario = normalizeScenario(JSON.parse(readFileSync(parsed, 'utf8')) as JsonObject, config, canonicalPlanetIds);
      for (const country of scenario.countries) {
        const sourceFlag = join(flagsDir, country.flag);
        if (!country.flag || !existsSync(sourceFlag)) throw new Error(`Missing flag ${country.flag || '(empty)'} for ${scenario.id}/${country.id}`);
        cpSync(sourceFlag, join(publicFlagsDir, country.flag));
      }
      writeFileSync(join(outputDir, `${config.id}.json`), JSON.stringify(scenario, null, 2));
      console.log(`  ${scenario.name}: ${scenario.countries.length} countries, ${scenario.selectableCount}/${scenario.profileCount} country briefings linked`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) extractScenarios();
