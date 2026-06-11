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

  const pairs = [];
  for (let i = 0; i < vortices.length; i += 2) pairs.push([i, i + 1]);

  return {
    vortices,
    pairs,
    pairCount,
    minSeparationRatio,
    minSeparation,
    netCharge: vortices.reduce((sum, vortex) => sum + vortex.charge, 0),
  };
}

function phaseFromVortexAt(x, y, vortex, gridSize, phaseConstructionMode) {
  if (phaseConstructionMode === 'legacy-torus-atan2') {
    return vortex.charge * Math.atan2(nearestSignedDelta(y, vortex.y, gridSize), nearestSignedDelta(x, vortex.x, gridSize));
  }
  if (phaseConstructionMode === 'unwrapped-atan2') {
    return vortex.charge * Math.atan2(y - vortex.y, x - vortex.x);
  }
  throw new Error(`Unsupported randomized phaseConstructionMode=${phaseConstructionMode}`);
}

function dipoleImagePhaseAt(x, y, positiveVortex, negativeVortex, gridSize, imageRadius = 1) {
  let phase = 0;
  for (let ix = -imageRadius; ix <= imageRadius; ix += 1) {
    for (let iy = -imageRadius; iy <= imageRadius; iy += 1) {
      const shiftX = ix * gridSize;
      const shiftY = iy * gridSize;
      const posPhase = Math.atan2(y - (positiveVortex.y + shiftY), x - (positiveVortex.x + shiftX));
      const negPhase = Math.atan2(y - (negativeVortex.y + shiftY), x - (negativeVortex.x + shiftX));
      // Add each periodic image as a neutral +1/-1 pair. Do not sum independent single-vortex images.
      phase += posPhase - negPhase;
    }
  }
  return phase;
}

function imageRadiusForPhaseConstructionMode(phaseConstructionMode) {
  if (phaseConstructionMode === 'periodic-dipole-image-sum-radius-1') return 1;
  return null;
}

function addPhaseContributionAt(x, y, layout, gridSize, phaseConstructionMode) {
  const imageRadius = imageRadiusForPhaseConstructionMode(phaseConstructionMode);
  if (imageRadius !== null) {
    let phase = 0;
    for (const [positiveIndex, negativeIndex] of layout.pairs) {
      const positiveVortex = layout.vortices[positiveIndex];
      const negativeVortex = layout.vortices[negativeIndex];
      if (!positiveVortex || !negativeVortex || positiveVortex.charge !== 1 || negativeVortex.charge !== -1) {
        throw new Error('Dipole phase construction requires sequential neutral +1/-1 vortex pairs');
      }
      phase += dipoleImagePhaseAt(x, y, positiveVortex, negativeVortex, gridSize, imageRadius);
    }
    return phase;
  }

  let phase = 0;
  for (const vortex of layout.vortices) phase += phaseFromVortexAt(x, y, vortex, gridSize, phaseConstructionMode);
  return phase;
}

function createRandomizedAeternaField({ gridSize, seed, phaseOffset = 0, pairCount = 2, minSeparationRatio = 0.18, phaseConstructionMode = 'legacy-torus-atan2', params = {}, config = {} } = {}) {
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

        phase += addPhaseContributionAt(x, y, layout, n, phaseConstructionMode);

        for (const vortex of layout.vortices) {
          const dx = nearestSignedDelta(x, vortex.x, n);
          const dy = nearestSignedDelta(y, vortex.y, n);
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

function createRandomizedAeternaFields({ gridSize, seedA, seedB, phaseOffsetB = Math.PI / 5, pairCount = 2, minSeparationRatio = 0.18, phaseConstructionMode = 'legacy-torus-atan2', params = {}, config = {} } = {}) {
  const a = createRandomizedAeternaField({ gridSize, seed: seedA, phaseOffset: 0, pairCount, minSeparationRatio, phaseConstructionMode, params, config });
  const b = createRandomizedAeternaField({ gridSize, seed: seedB, phaseOffset: phaseOffsetB, pairCount, minSeparationRatio, phaseConstructionMode, params, config });
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
  dipoleImagePhaseAt,
  imageRadiusForPhaseConstructionMode,
  torusDistance,
};
