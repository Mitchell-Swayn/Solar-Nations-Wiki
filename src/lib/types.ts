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
  group: 'core' | 'society' | 'military' | 'reference';
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
  Positivity: string;
  IsPercent: string;
  Icon?: string;
  Properties?: Record<string, unknown>;
  Scaler?: string;
  AIWeights?: Record<string, number>;
  GenerateIcons?: boolean;
  IsEffect?: boolean;
}
