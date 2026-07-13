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

// Editorial wiki summaries derived from each family's extracted modifiers and
// ideas. These are intentionally separate from game localisation.
const FAMILY_DESCRIPTIONS: Record<string, string> = {
  militaryAirforce: 'Airforce Primacy builds a culture around control of the skies, expanding air capacity while improving aircraft construction, air attacks, reconnaissance, speed, and command experience.',
  aristocratic: 'Aristocratic cultures entrust wealth and authority to a loyal upper class, gaining stability, leadership, military strength, and cheaper upkeep while further concentrating political power among elites.',
  militaryLand: 'Army Primacy makes land warfare the centre of national life, strengthening morale, reinforcement, command, industry, and the quality of infantry, artillery, and armoured forces.',
  assimilationist: 'Assimilationist cultures integrate conquered and immigrant populations more efficiently and suppress separatism, but their focus on social control comes with weaker research.',
  militarySpaceforce: 'Astronautical Primacy expands space capacity and supports cheaper spaceports, faster fleets, stronger void combat, higher space morale, and greater income from off-world activity.',
  religion_atheist: 'Atheist cultures favour secular institutions, education, industry, and scientific research, shifting influence toward corporate and middle-class factions at the cost of stability.',
  religion_christian: 'Christian cultures draw stability, economic output, unity, and morale from an organised clergy, with ideas supporting conversion, education, reduced unrest, and prolonged warfare.',
  idea_tribalism: 'Communalist cultures organise society through kinship and martial tradition, gaining unity, recruits, morale, and combat power while becoming less receptive to assimilation.',
  consumerCulture: 'Consumer Culture promotes commerce, exports, private-sector influence, and consumer-goods production, but dependence on consumption weakens overall unity.',
  militaristDefensive: 'Defensive Orientation favours fortifications, entrenchment, morale, and resistance to occupation, producing armies that endure attacks and command fortified positions effectively.',
  religion_hegelian: 'Dialectician cultures pursue social progress through competing worldviews, combining cheaper military forces with education, population growth, cultural development, and stronger unity.',
  diligent: 'Diligent cultures reward sustained work and learning with higher output, research, resource income, construction speed, and leader development, though constant exertion slightly reduces stability.',
  diplomatic: 'Diplomatic cultures invest in envoys, alliances, cultural understanding, and international networks, improving foreign opinion, assimilation, integration, unity, and recovery from war exhaustion.',
  easygoing: 'Easygoing cultures are tolerant, cohesive, and attractive to outsiders, gaining unity, diplomacy, assimilation, administration, and population growth at the expense of economic output.',
  eugenicist: 'Eugenicist cultures pursue directed biological improvement, accelerating genetic research and production while supporting experienced leaders, assimilation, and genetically equipped armies.',
  firearmAffinity: 'Firearm Affinity normalises an armed population, increasing recruitment, militia strength, resistance, morale, and attack power while reducing the cost of equipping units.',
  idea_guiltComplex: 'Flagellant cultures seek atonement through taxation, reparations, welfare, and openness to outsiders; these policies reduce unrest and integration costs but weaken income, output, unity, and stability.',
  frontierSpirit: 'Frontier Spirit celebrates migration, exploration, and settlement, improving colonial range and progress, space capacity, leader experience, and the rewards of expansion.',
  heritageAmerican: 'American Heritage emphasises education, enterprise, construction, innovation, and frontier expansion, culminating in stronger naval and space forces and greater international prestige.',
  heritageBritish: 'British Heritage combines commerce, naval morale, industrial construction, diplomacy, education, and experienced administration, supporting a prosperous maritime power.',
  religion_hindu: 'Hindu cultures support population growth, social continuity, diplomacy, and spiritual unity through an influential clergy, but their established social order makes integration more expensive.',
  idea_individualism: 'Individualist cultures favour personal freedom, merit, enterprise, immigration, and commercial output, but decentralised initiative slightly reduces administrative efficiency.',
  industrious: 'Industrious cultures excel at construction and mass production, lowering project costs while expanding workforce participation, resource capacity, build speed, and factory efficiency.',
  influential: 'Influential cultures specialise in political organisation and persuasion, reducing reform costs while improving administration, loyalty, leadership, ruling power, and attraction to outsiders.',
  innovative: 'Innovative cultures prioritise experimentation and education, accelerating research, improving administration and military adaptability, and reducing the costs of universities and project upkeep.',
  insular: 'Insular cultures turn inward for exceptional unity, stability, self-reliance, and defence, but sacrifice resource income, prestige, and their ability to assimilate outsiders.',
  idea_intellectualism: 'Intellectualist cultures place exceptional value on reason, education, universities, and research, producing capable academics and administrators at a steep cost to social unity.',
  irridentist: 'Irridentist cultures seek territorial reunification and expansion, making colonies and integration easier while improving administration and assimilation; their aggressive claims reduce stability and foreign opinion.',
  religion_islam: 'Islamic cultures unite clergy and military influence around faith, strengthening recruitment, unity, morale, mobility, and conquest, though their most aggressive warriors trade resilience for attack power.',
  isolationist: 'Isolationist cultures avoid foreign entanglements in favour of stability, population growth, education, fortification, and domestic construction, sacrificing international prestige.',
  religion_jewish: 'Jewish cultures combine organised faith with commerce, education, industry, diplomacy, and communal unity, but a strong sense of distinct identity makes integration more costly.',
  luddite: 'Luddite cultures reject technological dependence in favour of faith, unity, population growth, stability, and improvisation, gaining formidable cohesion while suffering severe research penalties.',
  mandateOfHeaven: 'Mandate of Heaven ties legitimate rule to prosperity and public order, supporting stability, output, cheaper construction and edicts, and strong defence while making faction loyalty harder to maintain.',
  militaryNaval: 'Maritime Primacy makes sea power an economic and military priority, expanding naval capacity while improving trade, morale, command size, shipbuilding, tactics, and naval attack.',
  religion_marxist: 'Marxist cultures mobilise society through bureaucratic organisation and class solidarity, improving education, unity, resources, and combat power while reducing upper-class loyalty.',
  militaristQuality: 'Military Quality builds a smaller professional force around training, discipline, experienced commanders, resilience, and superior combat performance, but reduces the available recruit pool.',
  militaristQuantity: 'Military Quantity favours cheap mass armies, large commands, rapid recovery, and sustained mobilisation, trading individual morale, attack power, and unit size for overwhelming numbers.',
  monumentalist: 'Monumentalist cultures express national ambition through great works, gaining cheaper and faster construction, stronger infrastructure and industry, and reduced cost growth from repeated projects.',
  idea_moralism: 'Moralist cultures use shared ethical duty to strengthen unity, administration, stability, morale, and public order, with ideas that also justify disciplined warfare.',
  nuclearFamily: 'Nuclear Family cultures treat stable households as the basis of prosperity, improving administration, population growth, output, unity, construction, and political cohesion.',
  religion_occult: 'Occultist cultures draw unity, morale, defence, and elite loyalty from secret traditions and ritual, while forbidden knowledge greatly improves education at the cost of stability.',
  militaristOffensive: 'Offensive Orientation trains forces for rapid, persistent attacks, increasing breakthrough, speed, siege ability, morale recovery, command capacity, health, and attack power.',
  passivist: 'Passivist cultures favour diplomacy, resources, population growth, and defensive entrenchment over aggression, but suffer greater war exhaustion, weaker breakthrough, and reduced prestige.',
  plutocratic: 'Plutocratic cultures place economic and political authority in wealthy hands, improving income, research, administration, investment, education, and project efficiency while strengthening corporate influence.',
  polygamist: 'Polygamist cultures support rapid population growth and flexible social hierarchies, eventually gaining output, unity, and administration, but begin with lower workforce participation and stability.',
  prideful: 'Prideful cultures pursue prestige, ambition, unity, and military assertiveness, gaining influence and easier integration while damaging economic output and foreign relations.',
  idea_prosperism: 'Prosperist cultures relentlessly pursue growth, output, industry, construction, immigration, and development, creating abundant economic opportunity with few direct military benefits.',
  robophile: 'Robophile cultures embrace automation and robotics for research, construction, output, and mechanised armies, but their reliance on machines slows organic population growth.',
  socialContract: 'Social Contract cultures build a capable state around law, mutual obligation, and organised institutions, increasing capacity, stability, unity, construction, morale, and bureaucratic influence.',
  species_human: 'Human cultures are adaptable and expansion-minded, with ideas improving aggression, endurance, habitability, population growth, stability, education, morale, and resource capacity.',
  species_robotic: 'Robotic cultures replace organic labour and population growth with robot consumption, automation, computation, and machine capacity; they cannot recruit normally but gain powerful research, industry, and immunity to war exhaustion.',
  idea_statism: 'Statist cultures centralise power to secure stability, administration, mobilisation, and industrial capacity, but their rigid institutions reduce research.',
  idea_stoicism: 'Stoic cultures cultivate endurance and self-control, producing healthier, disciplined forces with stronger defence, morale, reinforcement, stability, and resistance to war exhaustion.',
  thrifty: 'Thrifty cultures maximise the value of commerce and natural resources, increasing income, extraction, production efficiency, colonial growth, education, and corporate loyalty.',
  idea_obliterationOfSelf: 'Totalist cultures subordinate individual interests to the state, strengthening unity, assimilation, obedience, stability, morale, administration, and mobilisation while empowering bureaucracy.',
  idea_traditionalism: 'Traditionalist cultures preserve hierarchy and inherited customs to gain output, unity, stability, administration, and social order, but resistance to change slows research.',
  traitSuperiorGenes: 'Superior Genes represents a deliberately enhanced population with longer lifespans, room for an additional culture trait, and broad project-efficiency benefits, sustained by genetic-material consumption.',
  idea_transformationism: 'Transformationist cultures celebrate continual change, prestige, research, reform, education, and ambitious expansion, but their enthusiasm for disruption slightly reduces stability.',
  urbanophile: 'Urbanophile cultures concentrate people and resources in dense cities, improving infrastructure, capacity, monuments, administration, and construction while rendering open-air farming ineffective.',
  idea_utopianism: 'Utopian cultures pursue reform, equality, unity, morale, prestige, and lower upkeep in service of an ideal society, but their aspirations reduce immediate economic output.',
};

export function getCultureTraitFamilyDescription(id: string): string {
  const description = FAMILY_DESCRIPTIONS[id];
  if (!description) throw new Error(`Missing editorial description for culture trait family ${id}`);
  return description;
}

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
  if (!root) throw new Error(`Unknown culture trait family for ${id}`);
  const category = typeof root.fields.Category === 'string' ? root.fields.Category : '';
  const domain = CATEGORY_DOMAINS[category];
  if (!domain) throw new Error(`Unknown culture trait category ${category} for ${root.id}`);
  if (!root.icon) throw new Error(`Culture trait ${root.id} has no resolved icon`);
  return {
    id: root.id,
    label: root.displayName,
    domain,
    icon: root.icon,
  };
}

export function isCultureFamilyRoot(id: string): boolean {
  return !traits().get(id)?.fields.Family;
}

export function getCultureTraitPath(id: string): string {
  return `/culture-traits/${getCultureTraitGroup(id).id}/#${id}`;
}
