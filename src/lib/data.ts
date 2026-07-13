import type { CuratedIndex, ModifierDefinition, WikiEntry } from './types';
import { CATEGORIES, isWebsiteCategory, isWebsiteEntry } from './categories';
import { getCountryCount } from './countries';
import { getRegionCount } from './regions';

import curatedIndex from '../../data/curated/index.json';
import modifiersData from '../../data/curated/modifiers.json';
import modifierTargetData from '../../data/curated/modifier-targets.json';

const index = curatedIndex as CuratedIndex;
const modifierEntries = modifiersData as WikiEntry[];
const modifiers = modifierEntries.map((entry) => entry.fields as unknown as ModifierDefinition);
const modifierTargetLocalization = modifierTargetData as Record<string, { displayName: string; source: string }>;

const MODIFIER_KEY_ALIASES: Record<string, { definition: string; preserveFlatValue?: boolean }> = {
  // CultureTraits uses this flat-value variant, while ModifierProperties only
  // defines workforceRatioAdd. Share its label/icon without percent scaling.
  workforceRatio: { definition: 'workforceRatioAdd', preserveFlatValue: true },
};

export function getCanonicalModifierKey(name: string): string {
  return MODIFIER_KEY_ALIASES[name]?.definition ?? name;
}

export function getIndex(): CuratedIndex {
  return index;
}

export function getCategories() {
  return CATEGORIES.filter((c) => isWebsiteCategory(c.slug)
    && (c.slug === 'countries' ? getCountryCount() > 0 : c.slug === 'regions' ? getRegionCount() > 0 : (index.byType[c.slug]?.length ?? 0) > 0))
    .sort((left, right) => left.priority - right.priority);
}

export function getCategoryCount(type: string): number {
  return type === 'countries' ? getCountryCount() : type === 'regions' ? getRegionCount() : getEntriesByType(type).length;
}

export function getEntriesByType(type: string): WikiEntry[] {
  const ids = index.byType[type] ?? [];
  return ids.map((id) => index.entries[id]).filter((entry): entry is WikiEntry => Boolean(entry) && isWebsiteEntry(entry.type, entry.id));
}

const TARGET_TYPE_BY_PROPERTY: Record<string, string[]> = {
  alignment: ['ideologies'],
  archetype: ['unit-archetypes'],
  augmentorDamageType: ['damage-types'],
  damageType: ['damage-types'],
  deposit: ['deposit-resources'],
  diploFlag: ['diplomatic-flags'],
  edict: ['edicts'],
  faction: ['factions'],
  factionType: ['factions'],
  factionVariant: ['faction-variants'],
  ideology: ['ideologies'],
  industry: ['industries'],
  operation: ['espionage-operations'],
  organizationType: ['organization-types'],
  policy: ['policies'],
  popJob: ['population-types', 'character-jobs'],
  project: ['projects'],
  reform: ['government-reforms'],
  reformOption: ['government-reform-options'],
  resource: ['resources', 'deposit-resources'],
  situation: ['situations'],
  skill: ['character-skills'],
  slider: ['sliders'],
  socialMetric: ['social-metrics'],
  socialSpending: ['social-spending'],
  techCategory: ['technology-domains'],
  unitAttribute: ['unit-stats'],
  unitCategory: ['unit-types', 'unit-archetypes'],
  unitDomain: ['battle-domains'],
  unitQuality: ['unit-qualities'],
  unitStat: ['unit-stats'],
  unitType: ['unit-types'],
};

const TARGET_TYPE_OVERRIDES: Record<string, string[]> = {
  factionVariant: ['factions'],
  projectEfficiency: ['projects'],
  projectBuildCostMult: ['projects'],
  unitCostMult: ['resources', 'deposit-resources'],
  unitMoraleMult: ['battle-domains'],
  unitReinforceRateMult: ['battle-domains'],
};

const TARGET_POSITION_OVERRIDES: Record<string, Record<number, string[]>> = {
  unitStatMult: { 2: ['unit-archetypes'] },
  unitStatAdd: { 2: ['unit-archetypes'] },
};

export function getModifierTargetTypes(modifierKey: string, position = 1): string[] {
  const positionOverride = TARGET_POSITION_OVERRIDES[modifierKey]?.[position];
  if (positionOverride) return positionOverride;
  if (position === 1 && TARGET_TYPE_OVERRIDES[modifierKey]) return TARGET_TYPE_OVERRIDES[modifierKey];
  const definition = getModifierDefinition(modifierKey);
  const property = Object.keys(definition?.Properties ?? {})[position - 1];
  return TARGET_TYPE_BY_PROPERTY[property] ?? [];
}

export function getModifierTargetIcon(modifierKey: string, target?: string): string | undefined {
  if (!target) return undefined;
  const types = getModifierTargetTypes(modifierKey);
  for (const type of types) {
    const icon = index.entries[`${type}:${target}`]?.icon;
    if (icon) return icon;
  }
  return undefined;
}

export function getEntry(type: string, id: string): WikiEntry | undefined {
  return index.entries[`${type}:${id}`];
}

export function getLocalizedName(id: string): string | undefined {
  return modifierTargetLocalization[id]?.displayName
    ?? modifierTargetLocalization[id.toLowerCase()]?.displayName;
}

export function getDisplayName(types: string[], id: string): string | undefined {
  for (const type of types) {
    const entry = getEntry(type, id);
    const displayName = entry?.displayName;
    if (displayName && displayName !== id) return displayName;
    const defaultDesignName = entry?.fields.DefaultDesignName;
    if (typeof defaultDesignName === 'string' && defaultDesignName) return defaultDesignName;
  }
  return getLocalizedName(id);
}

export function getModifierTargetName(modifierKey: string, position: number, id: string): string {
  if (modifierKey === 'projectEfficiency' && position === 1) {
    // The project label is localized as an activity ("Open-Air Farming"),
    // while the modifier template requires the noun naming the affected asset.
    if (id === 'openFarm') return 'Open-Air Farm';
    return getLocalizedName(id) ?? getDisplayName(['projects'], id) ?? id;
  }
  return getDisplayName(getModifierTargetTypes(modifierKey, position), id) ?? getLocalizedName(id) ?? id;
}

export function getAllEntries(): WikiEntry[] {
  return Object.values(index.entries).filter((entry) => isWebsiteEntry(entry.type, entry.id));
}

export function getModifierDefinition(name: string): ModifierDefinition | undefined {
  return modifiers.find((m) => m.Name === getCanonicalModifierKey(name));
}

export function getModifierMap(): Map<string, ModifierDefinition> {
  const map = new Map(modifiers.map((modifier) => [modifier.Name, modifier]));
  for (const [alias, config] of Object.entries(MODIFIER_KEY_ALIASES)) {
    const definition = map.get(config.definition);
    if (!definition) continue;
    map.set(alias, config.preserveFlatValue
      ? { ...definition, Name: alias, IsPercent: 'Flat' }
      : { ...definition, Name: alias });
  }
  return map;
}

export function formatSlug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}
