import { getCountryScenarios } from './countries';
import { getEntry } from './data';
import type { CountryRegion, CountryScenario, ScenarioCountry } from './types';

export function getRegionScenarios(): CountryScenario[] {
  return getCountryScenarios();
}

export function getRegionCount(): number {
  return getRegionScenarios().reduce((total, scenario) => total + scenario.regions.length, 0);
}

export function getRegionPath(scenarioId: string, regionId: string): string {
  return `/regions/${scenarioId}/${regionId}/`;
}

export function getScenarioRegion(scenarioId: string, regionId: string): CountryRegion | undefined {
  return getRegionScenarios().find((scenario) => scenario.id === scenarioId)?.regions.find((region) => region.id === regionId);
}

export function getRegionOwner(scenario: CountryScenario, region: CountryRegion): ScenarioCountry | undefined {
  return region.owner ? scenario.countries.find((country) => country.id === region.owner) : undefined;
}

export function getRegionTerrainIcon(region: CountryRegion): string {
  const terrain = region.terrains[0];
  return (terrain && getEntry('terrain-types', terrain.id)?.icon) || 'territory';
}
