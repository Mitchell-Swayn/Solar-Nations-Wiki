const ORBIT_PARENT: Record<string, string> = {
  mercury: 'sol', venus: 'sol', earth: 'sol', mars: 'sol', ceres: 'sol', pallas: 'sol', vesta: 'sol',
  jupiter: 'sol', saturn: 'sol', uranus: 'sol', neptune: 'sol', pluto: 'sol', planetNine: 'sol', tiamat: 'sol',
  lowSolarOrbit1: 'sol', lowSolarOrbit2: 'sol', beltSO1: 'sol', beltSO2: 'sol', beltSO3: 'sol', beltSO4: 'sol', beltSO5: 'sol', beltSO6: 'sol',
  luna: 'earth', earthStableOrbit0: 'earth', earthStableOrbit1: 'earth', lunaSO1: 'luna',
  phobos: 'mars', deimos: 'mars', marsSO1: 'mars', marsSO2: 'mars',
  io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter',
  jupiterSO1: 'jupiter', jupiterSO2: 'jupiter', jupiterSO3: 'jupiter', jupiterSO4: 'jupiter', jupiterSO5: 'jupiter', ganymedeSO1: 'ganymede',
  titan: 'saturn', enceladus: 'saturn', tethys: 'saturn', dione: 'saturn', rhea: 'saturn', iapetus: 'saturn',
  saturnSO1: 'saturn', saturnSO2: 'saturn', saturnSO3: 'saturn', saturnSO4: 'saturn',
  ariel: 'uranus', titania: 'uranus', oberon: 'uranus', uranusSO1: 'uranus', uranusSO2: 'uranus', uranusSO3: 'uranus', uranusSO4: 'uranus',
  triton: 'neptune', proteus: 'neptune', neptuneSO1: 'neptune', neptuneSO2: 'neptune', neptuneSO3: 'neptune',
  charon: 'pluto', plutoBarycenter: 'pluto', planetNineMoon1: 'planetNine', planetNineMoon2: 'planetNine',
  aegir: 'epsilonEridani', aegir1: 'aegir', epsilonEridaniJumpPoint: 'epsilonEridani',
  proxima1: 'proximaCentauri', proxima2: 'proximaCentauri', proxima3: 'proximaCentauri', proxima4: 'proximaCentauri', 'proxima4-1': 'proxima4',
  centauriSO1: 'proximaCentauri', centauriJumpPoint: 'proximaCentauri',
  siriusA1: 'sirius', siriusA2: 'sirius', siriusA3: 'sirius', 'siriusA3-1': 'siriusA3', siriusB: 'sirius', siriusB1: 'siriusB', siriusJumpPoint: 'sirius',
  '40eridaniA': '40Eridani', '40eridaniA2': '40Eridani', '40eridaniA3': '40Eridani', '40eridaniA4': '40Eridani',
  '40a2': '40Eridani', '40a3': '40Eridani', '40eridaniM1': '40Eridani', '40eridaniM2': '40Eridani', '40eridaniM3': '40Eridani',
  '40eridaniA3-1': '40eridaniA3', '40e3so1': '40eridaniM3', '40e3so2': '40eridaniM3', '40EridaniJumpPoint': '40Eridani',
  altair4: 'altair', altairJumpPoint: 'altair', barnardsStarJumpPoint: 'barnardsStar',
  deltaPavonisJumpPoint: 'deltaPavonis', epsilonIndiSo1: 'epsilonIndi', epsilonIndiSo2: 'epsilonIndi', epsilonIndiSo3: 'epsilonIndi', epsilonIndiJumpPoint: 'epsilonIndi',
  groombridge34so1: 'groombridge34', groombridge34JumpPoint: 'groombridge34', procyonSo1: 'procyon', procyonJumpPoint: 'procyon',
  sigmaDraconisJumpPoint: 'sigmaDraconis', tauCetiJumpPoint: 'tauCeti', vanMaanenStarSO1: 'vanMaanenStar', vanMaanenStarJumpPoint: 'vanMaanenStar',
  wolf359SO1: 'wolf359', wolf359JumpPoint: 'wolf359',
};

const ORBIT_LABELS: Record<string, string> = {
  sol: 'Solar System', epsilonEridani: 'Epsilon Eridani System', proximaCentauri: 'Proxima Centauri System',
  sirius: 'Sirius System', '40Eridani': '40 Eridani System', altair: 'Altair System', barnardsStar: "Barnard's Star System",
  deltaPavonis: 'Delta Pavonis System', epsilonIndi: 'Epsilon Indi System', groombridge34: 'Groombridge 34 System',
  procyon: 'Procyon System', sigmaDraconis: 'Sigma Draconis System', tauCeti: 'Tau Ceti System',
  vanMaanenStar: "Van Maanen's Star System", wolf359: 'Wolf 359 System',
};

// Some stellar-system containers exist in the scenario navigation data but do
// not have their own Planets definition. Use a real body from that system so
// the heading retains the extracted in-game portrait instead of planet.png.
const ORBIT_ICON_BODY: Record<string, string> = {
  sol: 'sol', proximaCentauri: 'proximaCentauri', sirius: 'sirius',
  epsilonEridani: 'sol', '40Eridani': 'sol', altair: 'sol', barnardsStar: 'sol',
  deltaPavonis: 'sol', epsilonIndi: 'sol', groombridge34: 'sol', procyon: 'sol',
  sigmaDraconis: 'sol', tauCeti: 'sol', vanMaanenStar: 'sol', wolf359: 'sol',
};

export function getOrbitParent(bodyId: string): string | undefined {
  return ORBIT_PARENT[bodyId];
}

export function getOrbitLabel(bodyId: string): string | undefined {
  return ORBIT_LABELS[bodyId];
}

export function getOrbitIconBody(bodyId: string): string {
  return ORBIT_ICON_BODY[bodyId] ?? bodyId;
}
