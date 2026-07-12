import type { CuratedIndex, ModifierDefinition, WikiEntry } from './types';
import { CATEGORIES } from './categories';

import curatedIndex from '../../data/curated/index.json';
import modifiersData from '../../data/curated/modifiers.json';

const index = curatedIndex as CuratedIndex;
const modifierEntries = modifiersData as WikiEntry[];
const modifiers = modifierEntries.map((entry) => entry.fields as unknown as ModifierDefinition);

export function getIndex(): CuratedIndex {
  return index;
}

export function getCategories() {
  return CATEGORIES.filter((c) => (index.byType[c.slug]?.length ?? 0) > 0);
}

export function getEntriesByType(type: string): WikiEntry[] {
  const ids = index.byType[type] ?? [];
  return ids.map((id) => index.entries[id]).filter(Boolean);
}

export function getEntry(type: string, id: string): WikiEntry | undefined {
  const entry = index.entries[`${type}:${id}`];
  if (entry) return entry;
  return Object.values(index.entries).find(
    (e) => e.type === type && e.id === id,
  );
}

export function getAllEntries(): WikiEntry[] {
  return Object.values(index.entries);
}

export function getModifierDefinition(name: string): ModifierDefinition | undefined {
  return modifiers.find((m) => m.Name === name);
}

export function getModifierMap(): Map<string, ModifierDefinition> {
  return new Map(modifiers.map((m) => [m.Name, m]));
}

export function formatSlug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}
