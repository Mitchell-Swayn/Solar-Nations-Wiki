import type { CategoryMeta } from './types';

export const CATEGORY_GROUPS = [
  { id: 'world', label: 'Nations & Worlds', description: 'Countries, cultures, territories, and the worlds they inhabit.' },
  { id: 'society', label: 'Government & Society', description: 'Government, political factions, laws, and population systems.' },
  { id: 'core', label: 'Economy & Research', description: 'Resources, construction, technology, and national development.' },
  { id: 'characters', label: 'Characters', description: 'Character roles, traits, skills, equipment, and interactions.' },
  { id: 'military', label: 'Military', description: 'Unit design, combat statistics, domains, and battle stances.' },
  { id: 'diplomacy', label: 'Diplomacy & Intelligence', description: 'Diplomacy, espionage, organizations, missions, and empire actions.' },
  { id: 'reference', label: 'Game Reference', description: 'Technical definitions, modifiers, events, and interface systems.' },
] as const;

// These structures are still extracted and normalized for source fidelity and
// modifier/name resolution, but they are not player-facing wiki categories.
export const WEBSITE_HIDDEN_CATEGORY_SLUGS = new Set([
  'religions',
  'religion-traits',
  'ideologies',
  'ideology-traits',
  'region-interactions',
  'province-buildings',
  'industries',
  'consumer-demand',
  'government-forms',
  'government-types',
  'policies',
  'population-types',
  'social-metrics',
  'ethics',
  'decisions',
  'space-objects',
  'population-laws',
  'character-skills',
  'character-equipment',
  'character-interactions',
  'psychology',
  'battle-stances',
  'auto-units',
]);

// Individual definitions that remain available to the parser and curated data,
// but represent unused game structures that should not appear on the wiki.
export const WEBSITE_HIDDEN_ENTRY_KEYS = new Set([
  'government-reforms:adminStance',
  'government-reform-options:bureaucracy_secular',
  'government-reform-options:bureaucracy_ideological',
  'government-reform-options:bureaucracy_privatised',
  'government-reform-options:bureaucracy_militarized',
  'government-reform-options:bureaucracy_technocratic',
  'government-reform-options:bureaucracy_nonExistent',
]);

export function isWebsiteEntry(type: string, id: string): boolean {
  return isWebsiteCategory(type) && !WEBSITE_HIDDEN_ENTRY_KEYS.has(`${type}:${id}`);
}

export const CATEGORIES: CategoryMeta[] = [
  {
    slug: 'countries',
    label: 'Country',
    pluralLabel: 'Countries',
    description: 'Starting countries and their governments, cultures, economies, and territories in each scenario.',
    priority: 0,
    group: 'core',
  },
  {
    slug: 'regions',
    label: 'Region',
    pluralLabel: 'Regions',
    description: 'Starting regions, their populations, owners, planetary bodies, specializations, and deposits in each scenario.',
    priority: 0.5,
    group: 'world',
  },
  {
    slug: 'resources',
    label: 'Resource',
    pluralLabel: 'Resources',
    description: 'Tradeable and strategic resources that power your economy.',
    defineFile: 'Resources.json',
    priority: 1,
    group: 'core',
  },
  {
    slug: 'modifiers',
    label: 'Modifier',
    pluralLabel: 'Modifiers',
    description: 'Stat modifiers applied to countries, regions, and units.',
    priority: 2,
    group: 'reference',
  },
  {
    slug: 'technologies',
    label: 'Technology',
    pluralLabel: 'Technologies',
    description: 'Researchable technologies across culture, industry, and military.',
    defineFile: 'Technologies.json',
    priority: 3,
    group: 'core',
  },
  {
    slug: 'factions',
    label: 'Faction',
    pluralLabel: 'Factions',
    description: 'Political factions and their alignment effects.',
    defineFile: 'Factions.json',
    priority: 4,
    group: 'society',
  },
  {
    slug: 'faction-variants',
    label: 'Faction Variant',
    pluralLabel: 'Faction Variants',
    description: 'Variants of base factions with different modifiers.',
    defineFile: 'FactionVariants.json',
    priority: 5,
    group: 'society',
    mergedInto: 'factions',
  },
  {
    slug: 'government-reforms',
    label: 'Government Reform',
    pluralLabel: 'Government Reforms',
    description: 'Government reform categories and their options.',
    defineFile: 'GovernmentReforms.json',
    priority: 6,
    group: 'society',
  },
  {
    slug: 'government-reform-options',
    label: 'Reform Option',
    pluralLabel: 'Reform Options',
    description: 'Individual government reform choices.',
    defineFile: 'GovernmentReformOptions.json',
    priority: 7,
    group: 'society',
    mergedInto: 'government-reforms',
  },
  {
    slug: 'projects',
    label: 'Project',
    pluralLabel: 'Projects',
    description: 'Buildable projects and industries.',
    defineFile: 'Projects.json',
    priority: 8,
    group: 'core',
  },
  {
    slug: 'unit-components',
    label: 'Unit Component',
    pluralLabel: 'Unit Components',
    description: 'Military unit components and upgrades.',
    defineFile: 'UnitComponents.json',
    priority: 9,
    group: 'military',
  },
  {
    slug: 'culture-traits',
    label: 'Culture Trait',
    pluralLabel: 'Culture Traits',
    description: 'Cultural traits that shape your civilization.',
    defineFile: 'CultureTraits.json',
    priority: 10,
    group: 'society',
  },
  {
    slug: 'character-traits',
    label: 'Character Trait',
    pluralLabel: 'Character Traits',
    description: 'Personality and skill traits for characters.',
    defineFile: 'CharacterTraits.json',
    priority: 11,
    group: 'society',
  },
  {
    slug: 'character-jobs',
    label: 'Character Job',
    pluralLabel: 'Character Jobs',
    description: 'Government roles and character positions.',
    defineFile: 'CharacterJobs.json',
    priority: 12,
    group: 'society',
  },
  {
    slug: 'events',
    label: 'Event',
    pluralLabel: 'Events',
    description: 'Narrative and gameplay events.',
    defineFile: 'Events.json',
    priority: 13,
    group: 'reference',
  },
  {
    slug: 'situations',
    label: 'Situation',
    pluralLabel: 'Situations',
    description: 'Ongoing situations and crises.',
    defineFile: 'Situations.json',
    priority: 14,
    group: 'reference',
  },
  {
    slug: 'eras',
    label: 'Era',
    pluralLabel: 'Eras',
    description: 'Historical and future eras.',
    defineFile: 'Eras.json',
    priority: 15,
    group: 'military',
  },
  {
    slug: 'planetary-bodies',
    label: 'Planetary Body',
    pluralLabel: 'Planetary Bodies',
    description: 'Stars, planets, moons, dwarf planets, and other celestial bodies.',
    defineFile: 'Planets.json',
    priority: 16,
    group: 'military',
  },
  {
    slug: 'deposits',
    label: 'Deposit',
    pluralLabel: 'Deposits',
    description: 'Regional deposits and special sites.',
    defineFile: 'Deposits.json',
    priority: 17,
    group: 'military',
  },
  {
    slug: 'deposit-resources',
    label: 'Deposit Resource',
    pluralLabel: 'Deposit Resources',
    description: 'Resources extracted from deposits.',
    defineFile: 'DepositResources.json',
    priority: 18,
    group: 'core',
  },
  {
    slug: 'static-modifiers',
    label: 'Static Modifier',
    pluralLabel: 'Static Modifiers',
    description: 'Bundled static modifier packages.',
    defineFile: 'StaticModifiers.json',
    priority: 19,
    group: 'reference',
  },
  {
    slug: 'mission-components',
    label: 'Mission Component',
    pluralLabel: 'Mission Components',
    description: 'Diplomatic mission components.',
    defineFile: 'MissionComponents.json',
    priority: 20,
    group: 'reference',
  },
  // Society
  { slug: 'cultures', label: 'Culture', pluralLabel: 'Cultures', description: 'Cultures of the solar nations and their traits.', defineFile: 'Cultures.json', priority: 21, group: 'society' },
  { slug: 'culture-trait-categories', label: 'Culture Trait Category', pluralLabel: 'Culture Trait Categories', description: 'Groupings of culture traits.', defineFile: 'CultureTraitCategories.json', priority: 22, group: 'society', mergedInto: 'culture-traits' },
  { slug: 'religions', label: 'Religion', pluralLabel: 'Religions', description: 'Religions and belief systems.', defineFile: 'Religions.json', priority: 23, group: 'society' },
  { slug: 'religion-traits', label: 'Religion Trait', pluralLabel: 'Religion Traits', description: 'Traits that define each religion.', defineFile: 'ReligionTraits.json', priority: 24, group: 'society' },
  { slug: 'religion-trait-categories', label: 'Religion Trait Category', pluralLabel: 'Religion Trait Categories', description: 'Groupings of religion traits.', defineFile: 'ReligionTraitCategories.json', priority: 25, group: 'society', mergedInto: 'religion-traits' },
  { slug: 'ideologies', label: 'Ideology', pluralLabel: 'Ideologies', description: 'Political ideologies.', defineFile: 'Ideologies.json', priority: 26, group: 'society' },
  { slug: 'ideology-traits', label: 'Ideology Trait', pluralLabel: 'Ideology Traits', description: 'Tenets and traits of each ideology.', defineFile: 'IdeologyTraits.json', priority: 27, group: 'society' },
  { slug: 'government-forms', label: 'Government Form', pluralLabel: 'Government Forms', description: 'Forms of government.', defineFile: 'GovtForms.json', priority: 28, group: 'society' },
  { slug: 'government-types', label: 'Government Type', pluralLabel: 'Government Types', description: 'Types of government.', defineFile: 'GovtTypes.json', priority: 29, group: 'society' },
  { slug: 'faction-privileges', label: 'Faction Privilege', pluralLabel: 'Faction Privileges', description: 'Privileges that can be granted to factions.', defineFile: 'FactionPrivileges.json', priority: 30, group: 'society' },
  { slug: 'policies', label: 'Policy', pluralLabel: 'Policies', description: 'National policy categories.', defineFile: 'Policies.json', priority: 31, group: 'society' },
  { slug: 'policy-options', label: 'Policy Option', pluralLabel: 'Policy Options', description: 'Individual policy choices.', defineFile: 'PolicyOptions.json', priority: 32, group: 'society', mergedInto: 'policies' },
  { slug: 'default-policies', label: 'Default Policy', pluralLabel: 'Default Policies', description: 'Default policy assignments.', defineFile: 'DefaultPolicies.json', priority: 33, group: 'society', mergedInto: 'policies' },
  { slug: 'population-laws', label: 'Population Law', pluralLabel: 'Population Laws', description: 'Laws governing population rights.', defineFile: 'PopulationLaws.json', priority: 34, group: 'society' },
  { slug: 'population-law-options', label: 'Population Law Option', pluralLabel: 'Population Law Options', description: 'Individual population law choices.', defineFile: 'PopulationLawOptions.json', priority: 35, group: 'society', mergedInto: 'population-laws' },
  { slug: 'decisions', label: 'Decision', pluralLabel: 'Decisions', description: 'Empire decisions.', defineFile: 'Decisions.json', priority: 36, group: 'society' },
  { slug: 'edicts', label: 'Edict', pluralLabel: 'Edicts', description: 'Empire edicts and their effects.', defineFile: 'Edicts.json', priority: 37, group: 'society' },
  { slug: 'ethics', label: 'Ethic', pluralLabel: 'Ethics', description: 'Ethical axes shaping populations and empires.', defineFile: 'Ethics.json', priority: 38, group: 'society' },
  { slug: 'population-types', label: 'Population Type', pluralLabel: 'Population Types', description: 'Population strata and classes.', defineFile: 'PopTypes.json', priority: 39, group: 'society' },
  { slug: 'character-skills', label: 'Character Skill', pluralLabel: 'Character Skills', description: 'Skills that characters develop.', defineFile: 'CharacterSkills.json', priority: 40, group: 'society' },
  { slug: 'character-equipment', label: 'Character Equipment', pluralLabel: 'Character Equipment', description: 'Equipment usable by characters.', defineFile: 'CharacterEquipment.json', priority: 41, group: 'society' },
  { slug: 'character-interactions', label: 'Character Interaction', pluralLabel: 'Character Interactions', description: 'Interactions between characters.', defineFile: 'CharacterInteractions.json', priority: 42, group: 'society' },
  { slug: 'organization-types', label: 'Organization Type', pluralLabel: 'Organization Types', description: 'International organization types.', defineFile: 'OrganizationTypes.json', priority: 43, group: 'society' },
  { slug: 'organization-votes', label: 'Organization Vote', pluralLabel: 'Organization Votes', description: 'Votes held by international organizations.', defineFile: 'OrgVotes.json', priority: 44, group: 'society', mergedInto: 'organization-types' },
  // Diplomacy & missions (reference group)
  { slug: 'diplomatic-actions', label: 'Diplomatic Action', pluralLabel: 'Diplomatic Actions', description: 'Actions available in diplomacy.', defineFile: 'DiploActions.json', priority: 45, group: 'reference' },
  { slug: 'diplomatic-missions', label: 'Diplomatic Mission', pluralLabel: 'Diplomatic Missions', description: 'Diplomatic mission types.', defineFile: 'DiploMissions.json', priority: 46, group: 'reference' },
  { slug: 'espionage-operations', label: 'Espionage Operation', pluralLabel: 'Espionage Operations', description: 'Covert espionage operations.', defineFile: 'EspionageOperations.json', priority: 47, group: 'reference' },
  { slug: 'missions', label: 'Mission', pluralLabel: 'Missions', description: 'Missions and their objectives.', defineFile: 'Missions.json', priority: 48, group: 'reference' },
  { slug: 'mission-types', label: 'Mission Type', pluralLabel: 'Mission Types', description: 'Categories of missions.', defineFile: 'MissionTypes.json', priority: 49, group: 'reference', mergedInto: 'missions' },
  { slug: 'empire-missions', label: 'Empire Mission', pluralLabel: 'Empire Missions', description: 'Empire-level mission chains.', defineFile: 'EmpireMissions.json', priority: 50, group: 'reference', mergedInto: 'missions' },
  { slug: 'empire-actions', label: 'Empire Action', pluralLabel: 'Empire Actions', description: 'Actions an empire can take.', defineFile: 'EmpireActions.json', priority: 51, group: 'reference' },
  // Military & expansion
  { slug: 'unit-types', label: 'Unit Type', pluralLabel: 'Unit Types', description: 'Military unit types.', defineFile: 'UnitTypes.json', priority: 52, group: 'military' },
  { slug: 'unit-archetypes', label: 'Unit Archetype', pluralLabel: 'Unit Archetypes', description: 'Archetypes for unit design.', defineFile: 'UnitArchetypes.json', priority: 53, group: 'military' },
  { slug: 'unit-stats', label: 'Unit Stat', pluralLabel: 'Unit Stats', description: 'Statistics tracked for units.', defineFile: 'UnitStats.json', priority: 54, group: 'military', mergedInto: 'unit-components' },
  { slug: 'unit-qualities', label: 'Unit Quality', pluralLabel: 'Unit Qualities', description: 'Quality tiers for units.', defineFile: 'UnitQualities.json', priority: 55, group: 'military', mergedInto: 'unit-components' },
  { slug: 'damage-types', label: 'Damage Type', pluralLabel: 'Damage Types', description: 'Damage types in combat.', defineFile: 'DamageTypes.json', priority: 56, group: 'military' },
  { slug: 'battle-domains', label: 'Battle Domain', pluralLabel: 'Battle Domains', description: 'Domains where battles occur.', defineFile: 'BattleDomains.json', priority: 57, group: 'military' },
  { slug: 'battle-stances', label: 'Battle Stance', pluralLabel: 'Battle Stances', description: 'Stances units can adopt in battle.', defineFile: 'BattleStances.json', priority: 58, group: 'military' },
  { slug: 'auto-units', label: 'Auto Unit Design', pluralLabel: 'Auto Unit Designs', description: 'Automatic unit designs.', defineFile: 'AutoUnits.json', priority: 59, group: 'military' },
  { slug: 'industries', label: 'Industry', pluralLabel: 'Industries', description: 'Industrial sectors.', defineFile: 'Industries.json', priority: 60, group: 'core' },
  { slug: 'province-buildings', label: 'Province Building', pluralLabel: 'Province Buildings', description: 'Buildings constructed in provinces.', defineFile: 'ProvinceBuildings.json', priority: 61, group: 'core' },
  { slug: 'terrain-types', label: 'Terrain Type', pluralLabel: 'Terrain Types', description: 'Terrain types and their effects.', defineFile: 'TerrainTypes.json', priority: 62, group: 'military' },
  { slug: 'space-objects', label: 'Space Object', pluralLabel: 'Space Objects', description: 'Objects found in space.', defineFile: 'SpaceObjects.json', priority: 63, group: 'military' },
  { slug: 'space-zone-types', label: 'Space Zone Type', pluralLabel: 'Space Zone Types', description: 'Types of space zones.', defineFile: 'SpaceZoneTypes.json', priority: 64, group: 'military', mergedInto: 'space-objects' },
  { slug: 'orbit-types', label: 'Orbit Type', pluralLabel: 'Orbit Types', description: 'Orbital regimes around bodies.', defineFile: 'OrbitTypes.json', priority: 65, group: 'military', mergedInto: 'space-objects' },
  { slug: 'region-interactions', label: 'Region Interaction', pluralLabel: 'Region Interactions', description: 'Interactions available in regions.', defineFile: 'RegionInteractions.json', priority: 66, group: 'core' },
  { slug: 'specializations', label: 'Specialization', pluralLabel: 'Specializations', description: 'Regional specializations.', defineFile: 'Specializations.json', priority: 67, group: 'core' },
  { slug: 'project-categories', label: 'Project Category', pluralLabel: 'Project Categories', description: 'Categories of buildable projects.', defineFile: 'ProjectCategories.json', priority: 68, group: 'core', mergedInto: 'projects' },
  // Game reference
  { slug: 'technology-domains', label: 'Technology Domain', pluralLabel: 'Technology Domains', description: 'Research domains for technologies.', defineFile: 'TechDomains.json', priority: 69, group: 'core', mergedInto: 'technologies' },
  { slug: 'consumer-demand', label: 'Consumer Demand', pluralLabel: 'Consumer Demand', description: 'Goods demanded by populations.', defineFile: 'ConsumerDemand.json', priority: 70, group: 'core' },
  { slug: 'trade-categories', label: 'Trade Category', pluralLabel: 'Trade Categories', description: 'Categories of tradeable goods.', defineFile: 'TradeCategories.json', priority: 71, group: 'core', mergedInto: 'resources' },
  { slug: 'social-metrics', label: 'Social Metric', pluralLabel: 'Social Metrics', description: 'Metrics of social wellbeing.', defineFile: 'SocialMetrics.json', priority: 72, group: 'reference' },
  { slug: 'social-spending', label: 'Social Spending', pluralLabel: 'Social Spending', description: 'Social spending programs.', defineFile: 'SocialSpending.json', priority: 73, group: 'reference', mergedInto: 'social-metrics' },
  { slug: 'sliders', label: 'Slider', pluralLabel: 'Sliders', description: 'Adjustable national sliders.', defineFile: 'Sliders.json', priority: 74, group: 'reference' },
  { slug: 'situation-goals', label: 'Situation Goal', pluralLabel: 'Situation Goals', description: 'Goals within situations.', defineFile: 'SituationGoals.json', priority: 75, group: 'reference', mergedInto: 'situations' },
  { slug: 'global-flags', label: 'Global Flag', pluralLabel: 'Global Flags', description: 'Global scripting flags.', defineFile: 'GlobalFlags.json', priority: 76, group: 'reference', mergedInto: 'situations' },
  { slug: 'notifications', label: 'Notification', pluralLabel: 'Notifications', description: 'In-game notification types.', defineFile: 'Notifications.json', priority: 77, group: 'reference' },
  { slug: 'map-modes', label: 'Map Mode', pluralLabel: 'Map Modes', description: 'Map display modes.', defineFile: 'MapModes.json', priority: 78, group: 'reference' },
  { slug: 'clock-phases', label: 'Clock Phase', pluralLabel: 'Clock Phases', description: 'Phases of the game clock.', defineFile: 'ClockPhases.json', priority: 79, group: 'reference' },
  { slug: 'ai-strategies', label: 'AI Strategy', pluralLabel: 'AI Strategies', description: 'Strategies used by AI empires.', defineFile: 'AIStrategies.json', priority: 80, group: 'reference' },
  { slug: 'psychology', label: 'Psychology', pluralLabel: 'Psychology', description: 'Psychological profiles for characters.', defineFile: 'Psychology.json', priority: 81, group: 'reference' },
  { slug: 'teams', label: 'Team', pluralLabel: 'Teams', description: 'Alignment teams.', defineFile: 'Teams.json', priority: 82, group: 'reference' },
  { slug: 'assets', label: 'Asset', pluralLabel: 'Assets', description: 'Ownable assets.', defineFile: 'Assets.json', priority: 83, group: 'reference' },
  { slug: 'diplomatic-flags', label: 'Diplomatic Flag', pluralLabel: 'Diplomatic Flags', description: 'Flags describing diplomatic states.', defineFile: 'DiploFlags.json', priority: 84, group: 'reference' },
  { slug: 'reform-variant-tech', label: 'Reform Variant Tech', pluralLabel: 'Reform Variant Techs', description: 'Technology variants unlocked by reforms.', defineFile: 'ReformVariantTech.json', priority: 85, group: 'reference', mergedInto: 'government-reforms' },
];

// Player-facing navigation order. Keeping this separate from extraction order
// lets the parser retain the game's structure while the wiki follows the way
// readers move through its systems.
const WEBSITE_CATEGORY_ORDER: Array<{ group: CategoryMeta['group']; slugs: string[] }> = [
  {
    group: 'world',
    slugs: ['countries', 'regions', 'cultures', 'culture-traits', 'planetary-bodies', 'terrain-types', 'deposits', 'specializations', 'space-objects', 'eras'],
  },
  {
    group: 'society',
    slugs: ['government-types', 'government-reforms', 'factions', 'faction-privileges', 'population-laws', 'population-types', 'ethics', 'social-metrics', 'edicts', 'decisions'],
  },
  {
    group: 'core',
    slugs: ['resources', 'deposit-resources', 'projects', 'technologies', 'sliders'],
  },
  {
    group: 'characters',
    slugs: ['character-jobs', 'character-traits', 'character-skills', 'character-equipment', 'character-interactions', 'psychology'],
  },
  {
    group: 'military',
    slugs: ['unit-components', 'auto-units', 'unit-types', 'unit-archetypes', 'battle-domains', 'damage-types', 'battle-stances'],
  },
  {
    group: 'diplomacy',
    slugs: ['diplomatic-actions', 'diplomatic-missions', 'espionage-operations', 'organization-types', 'missions', 'empire-actions', 'assets'],
  },
  {
    group: 'reference',
    slugs: ['modifiers', 'static-modifiers', 'events', 'situations', 'mission-components', 'map-modes', 'notifications', 'diplomatic-flags', 'clock-phases', 'ai-strategies', 'teams'],
  },
];

let websitePriority = 0;
for (const placement of WEBSITE_CATEGORY_ORDER) {
  for (const slug of placement.slugs) {
    const category = CATEGORIES.find((item) => item.slug === slug);
    if (!category) continue;
    category.group = placement.group;
    category.priority = websitePriority++;
  }
}

export const CATEGORY_BY_SLUG = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
);

export function isWebsiteCategory(slug: string): boolean {
  const category = CATEGORY_BY_SLUG[slug];
  return !WEBSITE_HIDDEN_CATEGORY_SLUGS.has(slug)
    && !(category?.mergedInto && WEBSITE_HIDDEN_CATEGORY_SLUGS.has(category.mergedInto));
}

export const DEFINE_FILE_TO_SLUG: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.defineFile).map((c) => [c.defineFile!, c.slug]),
);
