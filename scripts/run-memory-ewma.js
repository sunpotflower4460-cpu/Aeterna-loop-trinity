#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
} = require('../src/metrics/aeterna-metrics');
const { DEFAULT_MEMORY_PARAMS } = require('../src/params/aeterna-params');
const {
  applyEWMAMemory,
  initializeMemoryField,
} = require('../src/physics/ewma-memory');

const CONDITIONS = [
  { conditionName: 'Baseline', MEMORY_ENABLED: false },
  { conditionName: 'EWMA 0.12', MEMORY_ENABLED: true, MEMORY_WEIGHT: 0.12, HISTORY_ALPHA: 0.04 },
  { conditionName: 'EWMA 0.08', MEMORY_ENABLED: true, MEMORY_WEIGHT: 0.08, HISTORY_ALPHA: 0.04 },
  { conditionName: 'EWMA 0.15', MEMORY_ENABLED: true, MEMORY_WEIGHT: 0.15, HISTORY_ALPHA: 0.04 },
  { conditionName: 'EWMA 0.25', MEMORY_ENABLED: true, MEMORY_WEIGHT: 0.25, HISTORY_ALPHA: 0.04 },
];

const CONFIG = Object.freeze({
  gridSize: 24,
  maxSteps: 5000,
  seed: 12345,
  gamma: 0.003,
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  sampleInterval: 25,
  metricsSampleInterval: 30,
});

const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'memory-ewma-results.json');

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

function index(x, y, z, n) {
  return x + n * (y + n * z);
}

function wrap(value, n) {
  return (value + n) % n;
}

function initializeField(config, params) {
  const n = config.gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
  const memoryRe = new Float64Array(size);
  const memoryIm = new Float64Array(size);
  const rng = createRng(config.seed);

  const vortices = [
    { x: n * 0.28, y: n * 0.30, charge: 1 },
    { x: n * 0.72, y: n * 0.32, charge: -1 },
    { x: n * 0.32, y: n * 0.70, charge: -1 },
    { x: n * 0.70, y: n * 0.72, charge: 1 },
  ];

  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let phase = 0;
        let coreSuppression = 0;

        for (const vortex of vortices) {
          const dx = x - vortex.x;
          const dy = y - vortex.y;
          phase += vortex.charge * Math.atan2(dy, dx);
          const radiusSquared = dx * dx + dy * dy;
          coreSuppression += Math.exp(-radiusSquared / 5.0);
        }

        const noise = (rng() * 2 - 1) * config.noiseAmp;
        const amplitude = Math.max(0.05, config.vev * (1 - 0.85 * Math.min(1, coreSuppression)) + noise);
        const i = index(x, y, z, n);
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
  const dt = config.dt;
  const c2 = config.c2;
  const lambda = config.lambda;
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
        const i = index(x, y, z, n);

        const re = phiRe[i];
        const im = phiIm[i];
        const lapRe = phiRe[index(xp, y, z, n)] + phiRe[index(xm, y, z, n)] +
          phiRe[index(x, yp, z, n)] + phiRe[index(x, ym, z, n)] +
          phiRe[index(x, y, zp, n)] + phiRe[index(x, y, zm, n)] - 6 * re;
        const lapIm = phiIm[index(xp, y, z, n)] + phiIm[index(xm, y, z, n)] +
          phiIm[index(x, yp, z, n)] + phiIm[index(x, ym, z, n)] +
          phiIm[index(x, y, zp, n)] + phiIm[index(x, y, zm, n)] - 6 * im;
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

function computeAmplitudeStats(field) {
  const { phiRe, phiIm } = field;
  let sum = 0;
  let sumSquared = 0;

  for (let i = 0; i < phiRe.length; i += 1) {
    const amplitude = Math.hypot(phiRe[i], phiIm[i]);
    sum += amplitude;
    sumSquared += amplitude * amplitude;
  }

  const mean = sum / phiRe.length;
  const variance = Math.max(0, sumSquared / phiRe.length - mean * mean);

  return {
    mean,
    std: Math.sqrt(variance),
  };
}

function computeTotalEnergy(field) {
  const { phiRe, phiIm } = field;
  let amplitudeEnergy = 0;

  for (let i = 0; i < phiRe.length; i += 1) {
    const re = phiRe[i];
    const im = phiIm[i];
    amplitudeEnergy += re * re + im * im;
  }

  return amplitudeEnergy;
}

function phaseAt(field, x, y, z, n) {
  const i = index(x, y, z, n);
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
      const p00 = phaseAt(field, x, y, z, n);
      const p10 = phaseAt(field, xp, y, z, n);
      const p11 = phaseAt(field, xp, yp, z, n);
      const p01 = phaseAt(field, x, yp, z, n);
      const winding = phaseDelta(p00, p10) + phaseDelta(p10, p11) + phaseDelta(p11, p01) + phaseDelta(p01, p00);

      if (Math.abs(winding) > Math.PI) {
        count += 1;
      }
    }
  }

  return count;
}

function hasNonFiniteValues(field) {
  const arrays = [field.phiRe, field.phiIm, field.velRe, field.velIm, field.memoryRe, field.memoryIm];
  return arrays.some((array) => Array.from(array).some((value) => !Number.isFinite(value)));
}

function collectMemoryMetrics(field, vortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeanHistory) {
  return collectAeternaMetrics({
    fieldA: field,
    fieldB: null,
    vortexCount,
    stepCount: step,
    gridSize: config.gridSize,
    index3D: index,
    vortexTracker,
    previousMetrics,
    amplitudeMeanHistory,
    localSampleCount: 512,
  });
}

function runCondition(condition, config) {
  const params = {
    ...DEFAULT_MEMORY_PARAMS,
    ...condition,
    DT: config.dt,
    dt: config.dt,
  };
  const field = initializeField(config, params);
  const scratchRe = new Float64Array(field.phiRe.length);
  const scratchIm = new Float64Array(field.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const initialAmplitude = computeAmplitudeStats(field);
  const initialEnergy = computeTotalEnergy(field);
  const initialVortexCount = computeVortexCount(field, config);
  const amplitudeMeans = [initialAmplitude.mean];
  let previousMetrics = null;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let finalVortexCount = initialVortexCount;
  let finalAmplitude = initialAmplitude;
  let finalEnergy = initialEnergy;
  let nonFiniteDetected = false;

  const initialMetrics = collectMemoryMetrics(field, initialVortexCount, 0, config, vortexTracker, previousMetrics, amplitudeMeans);
  previousMetrics = initialMetrics;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(field, config.gamma, config, scratchRe, scratchIm);

    if (params.MEMORY_ENABLED) {
      applyEWMAMemory(field, params);
    }

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCount = computeVortexCount(field, config);
      finalAmplitude = computeAmplitudeStats(field);
      finalEnergy = computeTotalEnergy(field);
      amplitudeMeans.push(finalAmplitude.mean);

      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) {
        stepWhenVortexCountReachedZero = step;
      }

      if (!nonFiniteDetected) {
        nonFiniteDetected = hasNonFiniteValues(field);
      }
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      const sampledVortexCount = step % config.sampleInterval === 0 || step === config.maxSteps
        ? finalVortexCount
        : computeVortexCount(field, config);
      previousMetrics = collectMemoryMetrics(field, sampledVortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeans);
      globalThis.__AETERNA_MEMORY_METRICS__ = {
        memoryEnergyA: previousMetrics.memoryEnergyA,
        memoryEnergyB: previousMetrics.memoryEnergyB,
        memoryFieldDifferenceA: previousMetrics.memoryFieldDifferenceA,
        memoryFieldDifferenceB: previousMetrics.memoryFieldDifferenceB,
      };
    }
  }

  const finalMetrics = previousMetrics;
  const notes = [];
  if (nonFiniteDetected) notes.push('Non-finite values detected during sampled checks.');
  if (!params.MEMORY_ENABLED) notes.push('Baseline memory disabled; memory arrays remain initialized but are not blended.');
  if (params.MEMORY_ENABLED && finalMetrics.memoryFieldDifferenceA > 1) notes.push('Memory-field difference remained large in this surrogate.');
  if (notes.length === 0) notes.push('Completed without sampled non-finite values.');

  return {
    conditionName: condition.conditionName,
    MEMORY_ENABLED: params.MEMORY_ENABLED,
    MEMORY_WEIGHT: params.MEMORY_ENABLED ? params.MEMORY_WEIGHT : null,
    HISTORY_ALPHA: params.MEMORY_ENABLED ? params.HISTORY_ALPHA : null,
    MEMORY_WEIGHT_MODE: params.MEMORY_ENABLED ? params.MEMORY_WEIGHT_MODE : null,
    MEMORY_BLEND_VELOCITY: params.MEMORY_ENABLED ? params.MEMORY_BLEND_VELOCITY : null,
    MEMORY_INIT_MODE: params.MEMORY_INIT_MODE,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    vortexLifetimeMax: finalMetrics.vortexLifetimeMax,
    R_A_global_start: initialMetrics.R_A_global,
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_start: initialMetrics.R_B_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_AB_relative_start: initialMetrics.R_AB_relative,
    R_AB_relative_end: finalMetrics.R_AB_relative,
    R_A_local_average_start: initialMetrics.R_A_local_average,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_start: initialMetrics.R_B_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    amplitudeMeanA_start: initialMetrics.amplitudeMeanA,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_start: initialMetrics.amplitudeMeanB,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_start: initialAmplitude.std,
    amplitudeStdA_end: finalAmplitude.std,
    totalEnergyCombined_start: initialMetrics.totalEnergyCombined,
    totalEnergyCombined_end: finalMetrics.totalEnergyCombined,
    totalEnergyStart: initialEnergy,
    totalEnergyEnd: finalEnergy,
    memoryEnergyA_end: finalMetrics.memoryEnergyA,
    memoryEnergyB_end: finalMetrics.memoryEnergyB,
    memoryFieldDifferenceA_end: finalMetrics.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: finalMetrics.memoryFieldDifferenceB,
    nonFiniteDetected,
    notes: notes.join(' '),
    latestMetrics: finalMetrics,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);
  return Number(value.toFixed(6));
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = CONDITIONS.map((condition) => runCondition(condition, CONFIG));
  const finishedAt = new Date().toISOString();
  const output = {
    experiment: 'Experiment 003: Step 1 EWMA Memory Only',
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    implementationNote: 'Isolated headless diagnostic surrogate; no application simulation code was present in this repository snapshot. EWMA is applied after field dynamics and before sampled metrics.',
    config: CONFIG,
    conditions: CONDITIONS,
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    memory: result.MEMORY_ENABLED,
    weight: result.MEMORY_WEIGHT,
    initialVortex: result.initialVortexCount,
    finalVortex: result.finalVortexCount,
    zeroStep: result.stepWhenVortexCountReachedZero,
    lifetimeAvg: formatNumber(result.vortexLifetimeAverage),
    ampMeanEnd: formatNumber(result.amplitudeMeanA_end),
    energyEnd: formatNumber(result.totalEnergyCombined_end),
    memoryDiffA: formatNumber(result.memoryFieldDifferenceA_end),
  })));
}

main();
