'use strict';

const { initializeMemoryField } = require('../physics/ewma-memory');

function createRng(seed) {
  let state = seed >>> 0;

  return function nextRandom() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function index3D(x, y, z, gridSize) {
  return x + gridSize * (y + gridSize * z);
}

function wrap(value, gridSize) {
  return (value + gridSize) % gridSize;
}

function createAeternaField({ gridSize, seed, phaseOffset = 0, params = {}, config = {} } = {}) {
  const n = gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(seed);
  const vev = config.vev ?? params.VEV ?? params.vev ?? 1.0;
  const noiseAmp = config.noiseAmp ?? 0.001;
  const vortices = [
    { x: n * 0.28, y: n * 0.30, charge: 1 },
    { x: n * 0.72, y: n * 0.32, charge: -1 },
    { x: n * 0.32, y: n * 0.70, charge: -1 },
    { x: n * 0.70, y: n * 0.72, charge: 1 },
  ];

  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let phase = phaseOffset;
        let coreSuppression = 0;

        for (const vortex of vortices) {
          const dx = x - vortex.x;
          const dy = y - vortex.y;
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
  return field;
}

function createAeternaFields({ gridSize, seedA, seedB, phaseOffsetB = Math.PI / 5, params = {}, config = {} } = {}) {
  return {
    fieldA: createAeternaField({ gridSize, seed: seedA, phaseOffset: 0, params, config }),
    fieldB: createAeternaField({ gridSize, seed: seedB, phaseOffset: phaseOffsetB, params, config }),
  };
}

module.exports = {
  createAeternaField,
  createAeternaFields,
  createRng,
  index3D,
  wrap,
};
