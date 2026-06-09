'use strict';

const { execSync } = require('child_process');
const {
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
} = require('../src/metrics/aeterna-metrics');
const {
  DEFAULT_COUPLING_PARAMS,
  DEFAULT_MEMORY_PARAMS,
  DEFAULT_PHASE_ROTATION_PARAMS,
  DEFAULT_PHEROMONE_PARAMS,
} = require('../src/params/aeterna-params');
const {
  applyEWMAMemory,
  initializeMemoryField,
} = require('../src/physics/ewma-memory');
const { applySelectedCoupling } = require('../src/physics/memory-coupling');
const {
  computePheromoneStats,
  createPheromoneField,
  diffusePheromoneField,
  updatePheromoneField,
} = require('../src/physics/pheromone');

const DEFAULT_SCAN_CONFIG = Object.freeze({
  gridSize: Number(process.env.AETERNA_SCAN_GRID_SIZE || 16),
  maxSteps: Number(process.env.AETERNA_SCAN_MAX_STEPS || 600),
  seed: Number(process.env.AETERNA_SCAN_SEED || 12345),
  seedA: Number(process.env.AETERNA_SCAN_SEED_A || 12345),
  seedB: Number(process.env.AETERNA_SCAN_SEED_B || 67890),
  gamma: Number(process.env.AETERNA_SCAN_GAMMA || 0.005),
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  phaseOffsetB: Math.PI / 5,
  sampleInterval: Number(process.env.AETERNA_SCAN_SAMPLE_INTERVAL || 25),
  metricsSampleInterval: Number(process.env.AETERNA_SCAN_METRICS_INTERVAL || 30),
});

function getGitValue(command, fallback) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function createRunMeta({ experimentName, config, notes }) {
  return {
    experimentName,
    version: 'v2.1.2',
    createdAt: new Date().toISOString(),
    commit: getGitValue('git rev-parse HEAD', 'unknown'),
    branch: getGitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
    seed: config.seed ?? config.seedA ?? 12345,
    maxSteps: config.maxSteps,
    sampleInterval: config.sampleInterval,
    runType: 'surrogate-headless',
    gridSize: config.gridSize,
    dynamicsType: 'diagnostic-surrogate',
    notes,
  };
}

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

function index3D(x, y, z, n) {
  return x + n * (y + n * z);
}

function wrap(value, n) {
  return (value + n) % n;
}

function initializeField(config, params, seed, phaseOffset = 0) {
  const n = config.gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(seed);
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

        const noise = (rng() * 2 - 1) * config.noiseAmp;
        const amplitude = Math.max(0.05, config.vev * (1 - 0.85 * Math.min(1, coreSuppression)) + noise);
        const i = index3D(x, y, z, n);
        phiRe[i] = amplitude * Math.cos(phase);
        phiIm[i] = amplitude * Math.sin(phase);
      }
    }
  }

  const field = { phiRe, phiIm, velRe, velIm, memoryRe, memoryIm };
  initializeMemoryField(field, params.MEMORY_INIT_MODE);
  return field;
}

function stepField(field, gamma, config, scratchRe, scratchIm) {
  const n = config.gridSize;
  const { dt, c2, lambda } = config;
  const vevSquared = config.vev * config.vev;
  const { phiRe, phiIm, velRe, velIm } = field;

  for (let z = 0; z < n; z += 1) {
    const zp = wrap(z + 1, n);
    const zm = wrap(z - 1, n);

    for (let y = 0; y < n; y += 1) {
      const yp = wrap(y + 1, n);
      const ym = wrap(y - 1, n);

      for (let x = 0; x < n; x += 1) {
        const xp = wrap(x + 1, n);
        const xm = wrap(x - 1, n);
        const i = index3D(x, y, z, n);
        const re = phiRe[i];
        const im = phiIm[i];
        const lapRe = phiRe[index3D(xp, y, z, n)] + phiRe[index3D(xm, y, z, n)] +
          phiRe[index3D(x, yp, z, n)] + phiRe[index3D(x, ym, z, n)] +
          phiRe[index3D(x, y, zp, n)] + phiRe[index3D(x, y, zm, n)] - 6 * re;
        const lapIm = phiIm[index3D(xp, y, z, n)] + phiIm[index3D(xm, y, z, n)] +
          phiIm[index3D(x, yp, z, n)] + phiIm[index3D(x, ym, z, n)] +
          phiIm[index3D(x, y, zp, n)] + phiIm[index3D(x, y, zm, n)] - 6 * im;
        const ampSquared = re * re + im * im;
        const potentialForce = -lambda * (ampSquared - vevSquared);
        const accRe = c2 * lapRe + potentialForce * re - gamma * velRe[i];
        const accIm = c2 * lapIm + potentialForce * im - gamma * velIm[i];
        const nextVelRe = velRe[i] + dt * accRe;
        const nextVelIm = velIm[i] + dt * accIm;

        velRe[i] = nextVelRe;
        velIm[i] = nextVelIm;
        scratchRe[i] = re + dt * nextVelRe;
        scratchIm[i] = im + dt * nextVelIm;
      }
    }
  }

  phiRe.set(scratchRe);
  phiIm.set(scratchIm);
}

function phaseAt(field, x, y, z, n) {
  const i = index3D(x, y, z, n);
  return Math.atan2(field.phiIm[i], field.phiRe[i]);
}

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function computeVortexCount(field, config) {
  const n = config.gridSize;
  const z = Math.floor(n / 2);
  let count = 0;

  for (let y = 0; y < n; y += 1) {
    const yp = wrap(y + 1, n);

    for (let x = 0; x < n; x += 1) {
      const xp = wrap(x + 1, n);
      const winding = phaseDelta(phaseAt(field, x, y, z, n), phaseAt(field, xp, y, z, n)) +
        phaseDelta(phaseAt(field, xp, y, z, n), phaseAt(field, xp, yp, z, n)) +
        phaseDelta(phaseAt(field, xp, yp, z, n), phaseAt(field, x, yp, z, n)) +
        phaseDelta(phaseAt(field, x, yp, z, n), phaseAt(field, x, y, z, n));

      if (Math.abs(winding) > Math.PI) count += 1;
    }
  }

  return count;
}

function hasNonFiniteValues(...arrays) {
  return arrays.filter(Boolean).some((array) => Array.from(array).some((value) => !Number.isFinite(value)));
}

function collectMetrics(options) {
  return collectAeternaMetrics({
    ...options,
    gridSize: options.config.gridSize,
    index3D,
    localSampleCount: 512,
  });
}

function createBaseParams(condition, config) {
  return {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    ...DEFAULT_PHASE_ROTATION_PARAMS,
    ...DEFAULT_PHEROMONE_PARAMS,
    MEMORY_INIT_MODE: 'copy-current',
    ...condition,
    DT: config.dt,
    dt: config.dt,
    VEV: config.vev,
    vev: config.vev,
  };
}

function runSingleFieldCondition(condition, config) {
  const params = createBaseParams(condition, config);
  const field = initializeField(config, params, config.seed, 0);
  const scratchRe = new Float64Array(field.phiRe.length);
  const scratchIm = new Float64Array(field.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const initialVortexCount = computeVortexCount(field, config);
  const amplitudeMeanHistory = [];
  let previousMetrics = collectMetrics({ fieldA: field, fieldB: null, vortexCount: initialVortexCount, stepCount: 0, config, vortexTracker, previousMetrics: null, amplitudeMeanHistory });
  const initialMetrics = previousMetrics;
  amplitudeMeanHistory.push(initialMetrics.amplitudeMeanA);
  let finalVortexCount = initialVortexCount;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let nonFiniteDetected = false;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(field, config.gamma, config, scratchRe, scratchIm);
    if (params.MEMORY_ENABLED) applyEWMAMemory(field, params);

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCount = computeVortexCount(field, config);
      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(field.phiRe, field.phiIm, field.velRe, field.velIm, field.memoryRe, field.memoryIm);
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      previousMetrics = collectMetrics({ fieldA: field, fieldB: null, vortexCount: finalVortexCount, stepCount: step, config, vortexTracker, previousMetrics, amplitudeMeanHistory });
      amplitudeMeanHistory.push(previousMetrics.amplitudeMeanA);
    }
  }

  return { params, initialMetrics, finalMetrics: previousMetrics, initialVortexCount, finalVortexCount, stepWhenVortexCountReachedZero, nonFiniteDetected };
}

function runDualFieldCondition(condition, config, hooks = {}) {
  const params = createBaseParams(condition, config);
  const fieldA = initializeField(config, params, config.seedA, 0);
  const fieldB = initializeField(config, params, config.seedB, config.phaseOffsetB);
  const scratchARe = new Float64Array(fieldA.phiRe.length);
  const scratchAIm = new Float64Array(fieldA.phiIm.length);
  const scratchBRe = new Float64Array(fieldB.phiRe.length);
  const scratchBIm = new Float64Array(fieldB.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const pheromoneField = hooks.createPheromoneField ? createPheromoneField(fieldA.phiRe.length) : null;
  const initialVortexCount = computeVortexCount(fieldA, config) + computeVortexCount(fieldB, config);
  const amplitudeMeanHistory = [];
  let couplingMetrics = null;
  let pheromoneMetrics = null;
  let previousMetrics = collectMetrics({ fieldA, fieldB, pheromoneField, vortexCount: initialVortexCount, stepCount: 0, config, vortexTracker, previousMetrics: null, amplitudeMeanHistory, couplingMetrics, couplingParams: params, pheromoneMetrics });
  const initialMetrics = previousMetrics;
  amplitudeMeanHistory.push((initialMetrics.amplitudeMeanA + initialMetrics.amplitudeMeanB) / 2);
  let finalVortexCount = initialVortexCount;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let nonFiniteDetected = false;
  let pheromoneDepositedCellsTotal = 0;
  let pheromoneTotalDepositTotal = 0;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(fieldA, config.gamma, config, scratchARe, scratchAIm);
    stepField(fieldB, config.gamma, config, scratchBRe, scratchBIm);
    if (params.MEMORY_ENABLED) {
      applyEWMAMemory(fieldA, params);
      applyEWMAMemory(fieldB, params);
    }
    couplingMetrics = applySelectedCoupling(fieldA, fieldB, params);

    if (hooks.updatePheromoneField) {
      pheromoneMetrics = hooks.updatePheromoneField({ pheromoneField, fieldA, fieldB, params, stepCount: step, index3D, gridSize: config.gridSize });
    } else if (pheromoneField) {
      pheromoneMetrics = updatePheromoneField({ pheromoneField, fieldA, fieldB, params, stepCount: step, index3D, gridSize: config.gridSize });
    }
    pheromoneDepositedCellsTotal += pheromoneMetrics?.pheromoneDepositedCells ?? 0;
    pheromoneTotalDepositTotal += pheromoneMetrics?.pheromoneTotalDeposit ?? 0;

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCount = computeVortexCount(fieldA, config) + computeVortexCount(fieldB, config);
      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(fieldA.phiRe, fieldA.phiIm, fieldA.velRe, fieldA.velIm, fieldA.memoryRe, fieldA.memoryIm, fieldB.phiRe, fieldB.phiIm, fieldB.velRe, fieldB.velIm, fieldB.memoryRe, fieldB.memoryIm, pheromoneField);
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      previousMetrics = collectMetrics({ fieldA, fieldB, pheromoneField, vortexCount: finalVortexCount, stepCount: step, config, vortexTracker, previousMetrics, amplitudeMeanHistory, couplingMetrics, couplingParams: params, pheromoneMetrics });
      amplitudeMeanHistory.push((previousMetrics.amplitudeMeanA + previousMetrics.amplitudeMeanB) / 2);
    }
  }

  return {
    params,
    initialMetrics,
    finalMetrics: previousMetrics,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    nonFiniteDetected,
    pheromoneField,
    pheromoneStats: computePheromoneStats(pheromoneField),
    pheromoneDepositedCellsTotal,
    pheromoneTotalDepositTotal,
    couplingMetrics,
  };
}

function updatePheromoneFieldByDepositMode({ pheromoneField, fieldA, fieldB, params = {}, stepCount = 0, index3D: indexFn = index3D, gridSize } = {}) {
  const mode = params.PHEROMONE_DEPOSIT_MODE ?? params.pheromoneDepositMode ?? 'all-above-threshold';
  if (mode === 'all-above-threshold') {
    return updatePheromoneField({ pheromoneField, fieldA, fieldB, params, stepCount, index3D: indexFn, gridSize });
  }

  if (!pheromoneField || !params.PHEROMONE_ENABLED) return { pheromoneUpdated: false, pheromoneDepositedCells: 0, pheromoneTotalDeposit: 0, pheromoneTotal: 0 };
  const updateInterval = params.PHEROMONE_UPDATE_INTERVAL ?? 10;
  if (stepCount % updateInterval !== 0) return { pheromoneUpdated: false, pheromoneDepositedCells: 0, pheromoneTotalDeposit: 0, pheromoneTotal: 0 };

  const retention = Math.pow(params.PHEROMONE_RETENTION ?? 0.99005, updateInterval);
  const deposit = params.PHEROMONE_DEPOSIT ?? 0.01;
  const vev = params.VEV ?? params.vev ?? 1.0;
  const maxValue = params.PHEROMONE_MAX_VALUE ?? 10.0;
  const count = Math.min(pheromoneField.length, fieldA.phiRe.length, fieldB.phiRe.length);
  const topRatio = mode === 'top-5-percent-amplitude' ? 0.05 : 0.10;
  const amplitudes = [];
  let depositedCells = 0;
  let totalDeposit = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const retained = pheromoneField[i] * retention;
    pheromoneField[i] = Number.isFinite(retained) ? Math.max(0, retained) : 0;
  }

  for (let i = 0; i < count; i += 1) {
    const ampA = Math.hypot(fieldA.phiRe[i], fieldA.phiIm[i]);
    const ampB = Math.hypot(fieldB.phiRe[i], fieldB.phiIm[i]);
    const avgAmp = (ampA + ampB) / 2;
    if (Number.isFinite(avgAmp)) amplitudes.push([avgAmp, i]);
  }

  amplitudes.sort((a, b) => b[0] - a[0]);
  const keep = Math.max(1, Math.floor(amplitudes.length * topRatio));
  for (let rank = 0; rank < keep; rank += 1) {
    const [avgAmp, i] = amplitudes[rank];
    const amount = deposit * (avgAmp / Math.max(vev, 1e-8));
    pheromoneField[i] = Math.min(maxValue, pheromoneField[i] + amount);
    depositedCells += 1;
    totalDeposit += amount;
  }

  diffusePheromoneField({ pheromoneField, params, index3D: indexFn, gridSize });
  const stats = computePheromoneStats(pheromoneField);
  return { pheromoneUpdated: true, pheromoneDepositedCells: depositedCells, pheromoneTotalDeposit: totalDeposit, pheromoneTotal: stats.pheromoneTotal };
}

module.exports = {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  index3D,
  runDualFieldCondition,
  runSingleFieldCondition,
  updatePheromoneFieldByDepositMode,
};
