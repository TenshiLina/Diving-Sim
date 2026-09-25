// Single registry of every asset the aquarium can spawn. The full reef build
// can import this directly; each entry is a pure factory.

import { createBrainCoral } from './coral/brainCoral.js';
import { createStaghorn } from './coral/staghorn.js';
import { createTableCoral } from './coral/tableCoral.js';
import { createAnemone } from './coral/anemone.js';
import { createSeaFan } from './coral/seaFan.js';
import { createSeagrass } from './plants/seagrass.js';
import { createRock } from './terrain/rocks.js';
import { createGiantClam } from './invertebrates/giantClam.js';
import { RAY_SPECIES } from './rays/rays.js';
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
  giantClam: { label: 'Giant clam', create: createGiantClam, size: 0.9 },
};

const builtCache = new Map();
/** Built species (shared). `lite` is a lower-poly build for large schools. */
export function getFish(name, { lite = false } = {}) {
  const key = name + (lite ? ':lite' : '');
  if (!builtCache.has(key)) {
    builtCache.set(key, buildFishSpecies(SPECIES[name], lite ? { nx: 24, nt: 14, ns: 10, nr: 4 } : undefined));
  }
  return builtCache.get(key);
}

export const FISH = Object.fromEntries(
  Object.entries(SPECIES).map(([k, s]) => [k, { label: s.name, latin: s.latin, size: s.length * 3 }]),
);

export const RAYS = Object.fromEntries(
  Object.entries(RAY_SPECIES).map(([k, s]) => [k, { label: s.name, latin: s.latin, size: s.length }]),
);
