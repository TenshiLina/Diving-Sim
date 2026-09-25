// Single registry of every asset the aquarium can spawn. The full reef build
// can import this directly; each entry is a pure factory.

import { createBrainCoral } from './coral/brainCoral.js';
import { createStaghorn } from './coral/staghorn.js';
import { createTableCoral } from './coral/tableCoral.js';
import { createAnemone } from './coral/anemone.js';
import { createSeaFan } from './coral/seaFan.js';
import { createSeagrass } from './plants/seagrass.js';
import { createRock } from './terrain/rocks.js';
import { SPECIES } from './fish/species.js';
import { buildFishSpecies } from './fish/fishBuilder.js';

export const DECOR = {
  brainCoral: { label: 'Brain coral', create: createBrainCoral, size: 0.9 },
  staghorn: { label: 'Staghorn coral', create: createStaghorn, size: 1.2 },
  tableCoral: { label: 'Table coral', create: createTableCoral, size: 1.8 },
  anemone: { label: 'Magnificent sea anemone', create: createAnemone, size: 0.9 },
  seaFan: { label: 'Gorgonian sea fan', create: createSeaFan, size: 1.4 },
  seagrass: { label: 'Seagrass', create: createSeagrass, size: 0.9 },
  rock: { label: 'Reef rock', create: createRock, size: 1.4 },
};

const builtCache = new Map();
export function getFish(name) {
  if (!builtCache.has(name)) builtCache.set(name, buildFishSpecies(SPECIES[name]));
  return builtCache.get(name);
}

export const FISH = Object.fromEntries(
  Object.entries(SPECIES).map(([k, s]) => [k, { label: s.name, latin: s.latin, size: s.length * 3 }]),
);
