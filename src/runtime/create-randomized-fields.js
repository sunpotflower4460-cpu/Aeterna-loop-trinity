'use strict';

const { initializeMemoryField } = require('../physics/ewma-memory');
const { createRng, index3D } = require('./create-aeterna-fields');

function torusDelta(a, b, gridSize) {
  const direct = Math.abs(a - b);
  return Math.min(direct, gridSize - direct);
}

function torusDistance(a, b, gridSize) {
  return Math.hypot(torusDelta(a.x, b.x, gridSize), torusDelta(a.y, b.y, gridSize));
}

function nearestSignedDelta(value, center, gridSize) {
  let delta = value - center;
  if (delta > gridSize / 2) delta -= gridSize;
  if (delta <= -gridSize / 2) delta += gridSize;
  return delta;
}

function createRandomizedVortexLayout({ rng, gridSize, pairCount = 2, minSeparationRatio = 0.18 } = {}) {
  if (typeof rng !== 'function') throw new Error('createRandomizedVortexLayout requires rng');
  const minSeparation = gridSize * minSeparationRatio;
  const vortices = [];
  const charges = [];
  for (let i = 0; i < pairCount; i += 1) {
    charges.push(1, -1);
  }

  for (const charge of charges) {
    let accepted = null;
    for (let attempt = 0; attempt < 2000 && !accepted; attempt += 1) {
      const candidate = {
        x: rng() * gridSize,
        y: rng() * gridSize,
        charge,
      };
      if (vortices.every((vortex) => torusDistance(candidate, vortex, gridSize) >= minSeparation)) {
        accepted = candidate;
      }
    }
    if (!accepted) {
      throw new Error(`Unable to place randomized vortex with minSeparationRatio=${minSeparationRatio}`);
    }
    vortices.push(accepted);
  }

  return {
    vortices,
    pairCount,
    minSeparationRatio,
    minSeparation,
    netCharge: vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
  };
}

function createRandomizedAeternaField({ gridSize, seed, phaseOffset = 0, pairCount = 2, minSeparationRatio = 0.18, params = {}, config = {} } = {}) {
  const n = gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(seed);
  const layout = createRandomizedVortexLayout({ rng, gridSize: n, pairCount, minSeparationRatio });
  const vev = config.vev ?? params.VEV ?? params.vev ?? 1.0;
  const noiseAmp = config.noiseAmp ?? 0.001;

  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let phase = phaseOffset;
        let coreSuppression = 0;

        for (const vortex of layout.vortices) {
          const dx = nearestSignedDelta(x, vortex.x, n);
          const dy = nearestSignedDelta(y, vortex.y, n);
          phase += vortex.charge * Math.atan2(dy, dx);
          coreSuppression += Math.exp(-(dx * dx + dy * dy) / 5.0);
        }

        const noise = (rng() * 2 - 1) * noiseAmp;
        const amplitude = Math.max(0.05, vev * (1 - 0.85 * Math.min(1, coreSuppression)) + noise);
        const i = index3D(x, y, z, n);
        phiRe[i] = amplitude * Math.cos(phase);
        phiIm[i] = amplitude * Math.sin(phase);
      }
    }
  }

  const field = { phiRe, phiIm, velRe, velIm, memoryRe, memoryIm };
  initializeMemoryField(field, params.MEMORY_INIT_MODE ?? 'copy-current');
  return { field, vortexLayout: layout };
}

function createRandomizedAeternaFields({ gridSize, seedA, seedB, phaseOffsetB = Math.PI / 5, pairCount = 2, minSeparationRatio = 0.18, params = {}, config = {} } = {}) {
  const a = createRandomizedAeternaField({ gridSize, seed: seedA, phaseOffset: 0, pairCount, minSeparationRatio, params, config });
  const b = createRandomizedAeternaField({ gridSize, seed: seedB, phaseOffset: phaseOffsetB, pairCount, minSeparationRatio, params, config });
  return {
    fieldA: a.field,
    fieldB: b.field,
    vortexLayoutA: a.vortexLayout,
    vortexLayoutB: b.vortexLayout,
  };
}

module.exports = {
  createRandomizedAeternaField,
  createRandomizedAeternaFields,
  createRandomizedVortexLayout,
  torusDistance,
};
