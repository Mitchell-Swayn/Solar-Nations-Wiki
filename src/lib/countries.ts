import ageOfInformationData from '../../data/curated/scenarios/age-of-information.json';
import twilightOfModernityData from '../../data/curated/scenarios/twilight-of-modernity.json';
import type { CountryScenario, ScenarioCountry } from './types';

const scenarios = [ageOfInformationData, twilightOfModernityData] as CountryScenario[];

type CultureIconCountry = Pick<ScenarioCountry, 'name' | 'flag'>;

// Event-spawned countries do not exist in either starting scenario and cannot
// be discovered by the normal primary/accepted/present culture ranking.
const MANUAL_CULTURE_ICON_COUNTRIES: Record<string, CultureIconCountry> = {
  superhumanCulture: {
    name: 'The Eugenarchy',
    flag: 'superhumanCountry.png',
  },
};

export function getCountryScenarios(): CountryScenario[] {
  return scenarios;
}

export function getCountryScenario(id: string): CountryScenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}

export function getScenarioCountry(scenarioId: string, countryId: string): ScenarioCountry | undefined {
  return getCountryScenario(scenarioId)?.countries.find((country) => country.id === countryId);
}

export function getCountryCount(): number {
  return scenarios.reduce((total, scenario) => total + scenario.countries.length, 0);
}

export function getCountryPath(scenarioId: string, countryId: string): string {
  return `/countries/${scenarioId}/${countryId}/`;
}

function culturePopulation(country: ScenarioCountry, cultureId: string): number {
  return country.regions.reduce((countryTotal, region) => {
    const share = region.cultures.find((culture) => culture.id === cultureId)?.share ?? 0;
    return countryTotal + region.population * share;
  }, 0);
}

export function getCultureIconCountry(cultureId: string, scenarioId?: string): CultureIconCountry | undefined {
  const manualCountry = MANUAL_CULTURE_ICON_COUNTRIES[cultureId];
  if (manualCountry) return manualCountry;
  const candidates = scenarioId
    ? scenarios.filter((scenario) => scenario.id === scenarioId)
    : scenarios;
  for (const scenario of candidates) {
    const ranked = (countries: ScenarioCountry[]) => countries.sort((left, right) => culturePopulation(right, cultureId) - culturePopulation(left, cultureId)
        || right.population - left.population
        || left.name.localeCompare(right.name));
    const primary = ranked(scenario.countries.filter((country) => country.primaryCulture === cultureId));
    if (primary[0]) return primary[0];
    const accepted = ranked(scenario.countries.filter((country) => country.acceptedCultures.includes(cultureId)));
    if (accepted[0]) return accepted[0];
    const present = ranked(scenario.countries.filter((country) => culturePopulation(country, cultureId) > 0));
    if (present[0]) return present[0];
  }
  return undefined;
}
