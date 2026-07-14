export type PrerequisiteType =
  | 'technology'
  | 'cultureTrait'
  | 'situation'
  | 'reformOption';

export interface Prerequisite {
  type: PrerequisiteType;
  id: string;
}

export interface WikiReference {
  type: string;
  id: string;
  label?: string;
}

export interface ModifierRef {
  key: string;
  value: number | string;
  value1?: string;
  value2?: string;
  value3?: string;
  scope?: string;
}

export interface WikiEntry {
  id: string;
  type: string;
  displayName: string;
  icon?: string;
  description?: string;
  fields: Record<string, unknown>;
  modifiers: ModifierRef[];
  skillModifiers?: Record<string, ModifierRef[]>;
  prerequisites: Prerequisite[];
  references: WikiReference[];
}

export interface CategoryMeta {
  slug: string;
  label: string;
  pluralLabel: string;
  description: string;
  defineFile?: string;
  priority: number;
  group: 'nations' | 'world' | 'society' | 'core' | 'characters' | 'military' | 'diplomacy' | 'progression' | 'reference';
  mergedInto?: string;
}

export interface CuratedIndex {
  generatedAt: string;
  source: string;
  entries: Record<string, WikiEntry>;
  byType: Record<string, string[]>;
}

export interface ModifierDefinition {
  Name: string;
  DisplayName?: string;
  Positivity: string;
  IsPercent: string;
  Icon?: string;
  Properties?: Record<string, unknown>;
  Scaler?: string;
  AIWeights?: Record<string, number>;
  GenerateIcons?: boolean;
  IsEffect?: boolean;
}

export interface CountryFaction {
  id: string;
  loyalty: number;
  power: number;
  isRuling: boolean;
  variant?: string;
}

export interface CountryReform {
  id: string;
  optionIndex: number;
}

export interface CountryRegion {
  id: string;
  name: string;
  planet: string;
  regionType: 'economic' | 'planetary';
  owner?: string;
  population: number;
  development: number;
  education: number;
  specialization?: string;
  cultures: Array<{ id: string; share: number }>;
  deposits: Array<{ id: string; quantity: number }>;
  provinceCount: number;
  terrains: Array<{ id: string; provinces: number }>;
}

export interface ScenarioCountry {
  id: string;
  logicTag: string;
  name: string;
  flag: string;
  color: { r: number; g: number; b: number; a: number };
  capital: string;
  capitalRegion?: string;
  capitalRegionName?: string;
  integrity: number;
  treasury: number;
  governmentForm?: string;
  governmentType?: string;
  rulingIdeology?: string;
  overlord?: string;
  isRebel: boolean;
  primaryCulture?: string;
  acceptedCultures: string[];
  promotedCultures: string[];
  oppressedCultures: string[];
  reforms: CountryReform[];
  factions: CountryFaction[];
  technologies: string[];
  staticModifiers: string[];
  stockpile: Array<{ id: string; value: number }>;
  tradeBalance: Array<{ id: string; value: number }>;
  taxes: Array<{ id: string; value: number }>;
  regions: CountryRegion[];
  population: number;
  planets: string[];
  selectable?: {
    name: string;
    lore?: string;
    difficulty: number;
  };
}

export interface ScenarioCulture {
  id: string;
  traits: string[];
  traitIdeas: string[];
}

export interface CountryScenario {
  id: string;
  name: string;
  sourceFile: string;
  profileCount: number;
  selectableCount: number;
  profiles: Array<{
    tag: string;
    name: string;
    lore?: string;
    difficulty: number;
    countryId?: string;
  }>;
  cultures: ScenarioCulture[];
  regions: CountryRegion[];
  countries: ScenarioCountry[];
}
