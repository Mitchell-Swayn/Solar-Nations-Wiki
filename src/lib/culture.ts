export type CultureDomain = 'Species & Faith' | 'Cultural' | 'Economic' | 'Diplomatic' | 'Administrative' | 'Military';

const FAMILY_ALIASES: Record<string, string> = {
  speciesHuman: 'humanity', speciesRobot: 'robotic', christian: 'christianity',
  communist: 'marxism', fascist: 'hegelian', jewish: 'judaism',
  moumentalist: 'monumentalist', social: 'socialContract',
};

const FAMILY_ICONS: Record<string, string> = {
  humanity: 'speciesHuman', robotic: 'speciesRobot', christianity: 'christian', islam: 'islam',
  judaism: 'jewish', marxism: 'communist', occult: 'occult', atheist: 'atheist',
  hegelian: 'fascist', hinduism: 'hindu',
};

const ECONOMIC = new Set(['consumers', 'diligent', 'industry', 'innovative', 'plutocratic', 'prosperism', 'robophile', 'thrifty', 'urbanophile']);
const DIPLOMATIC = new Set(['assimilationist', 'diplomacy', 'influence', 'irridentist', 'isolationist']);
const ADMINISTRATIVE = new Set(['aristocratic', 'individualism', 'mandate', 'socialContract', 'statism']);
const MILITARY = new Set(['air', 'defensive', 'explorers', 'firearms', 'land', 'navy', 'offensive', 'quality', 'quantity', 'space']);
const FAITH = new Set(Object.keys(FAMILY_ICONS));

function rawFamily(id: string): string {
  if (id === 'speciesHuman' || id === 'speciesRobot') return id;
  return id.match(/^([a-z]+?)(?=[A-Z_]|$)/)?.[1] ?? id;
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

export function getCultureTraitGroup(id: string) {
  const raw = rawFamily(id);
  const family = FAMILY_ALIASES[id] ?? FAMILY_ALIASES[raw] ?? raw;
  const domain: CultureDomain = FAITH.has(family) ? 'Species & Faith'
    : ECONOMIC.has(family) ? 'Economic'
    : DIPLOMATIC.has(family) ? 'Diplomatic'
    : ADMINISTRATIVE.has(family) ? 'Administrative'
    : MILITARY.has(family) ? 'Military'
    : 'Cultural';
  const icon = FAMILY_ICONS[family] ?? ({ Economic: 'economic', Diplomatic: 'charisma', Administrative: 'management', Military: 'strategy', Cultural: 'cultural' } as Record<string, string>)[domain] ?? 'cultural';
  return { id: family, label: humanize(family), domain, icon };
}

export function isCultureFamilyRoot(id: string): boolean {
  const family = getCultureTraitGroup(id).id;
  return id === family || FAMILY_ALIASES[id] === family;
}

export function getCultureTraitPath(id: string): string {
  return `/culture-traits/${getCultureTraitGroup(id).id}/#${id}`;
}
