import { CATEGORY_BY_SLUG } from './categories';
import { getCultureTraitPath } from './culture';
import { getCountryPath, getCountryScenarios } from './countries';
import { getAllEntries } from './data';
import { getRegionPath } from './regions';

export interface SearchEntry {
  id: string;
  name: string;
  category: string;
  path: string;
}

export function getSearchEntries(): SearchEntry[] {
  return getAllEntries().map((entry) => ({
    id: entry.id,
    name: entry.displayName,
    category: CATEGORY_BY_SLUG[entry.type]?.pluralLabel ?? entry.type,
    path: entry.type === 'culture-traits' ? getCultureTraitPath(entry.id).slice(1) : `${entry.type}/${entry.id}/`,
  })).concat(getCountryScenarios().flatMap((scenario) => scenario.countries.map((country) => ({
    id: country.logicTag,
    name: country.name,
    category: `${scenario.name} Countries`,
    path: getCountryPath(scenario.id, country.id).slice(1),
  })))).concat(getCountryScenarios().flatMap((scenario) => scenario.regions.map((region) => ({
    id: region.id,
    name: region.name,
    category: `${scenario.name} Regions`,
    path: getRegionPath(scenario.id, region.id).slice(1),
  }))));
}
