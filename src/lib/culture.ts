import { getEntriesByType } from './data';
import type { WikiEntry } from './types';

export type CultureDomain = 'Species' | 'Religion' | 'Idea' | 'Heritage' | 'Special';

const CATEGORY_DOMAINS: Record<string, CultureDomain> = {
  species: 'Species',
  religion: 'Religion',
  idea: 'Idea',
  heritage: 'Heritage',
  special: 'Special',
};

let traitById: Map<string, WikiEntry> | undefined;

function traits(): Map<string, WikiEntry> {
  traitById ??= new Map(getEntriesByType('culture-traits').map((entry) => [entry.id, entry]));
  return traitById;
}

function familyRoot(id: string): WikiEntry | undefined {
  const entry = traits().get(id);
  if (!entry) return undefined;
  const family = typeof entry.fields.Family === 'string' ? entry.fields.Family : undefined;
  return family ? traits().get(family) : entry;
}

export function getCultureTraitGroup(id: string) {
  const root = familyRoot(id);
  const category = typeof root?.fields.Category === 'string' ? root.fields.Category : '';
  return {
    id: root?.id ?? id,
    label: root?.displayName ?? id,
    domain: CATEGORY_DOMAINS[category] ?? 'Idea',
    icon: root?.icon ?? 'cultural',
  };
}

export function isCultureFamilyRoot(id: string): boolean {
  return !traits().get(id)?.fields.Family;
}

export function getCultureTraitPath(id: string): string {
  return `/culture-traits/${getCultureTraitGroup(id).id}/#${id}`;
}
