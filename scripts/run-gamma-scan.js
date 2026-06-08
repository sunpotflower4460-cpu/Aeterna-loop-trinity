#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  CountBasedVortexLifetimeTracker,
  collectAeternaMetrics,
} = require('../src/metrics/aeterna-metrics');

const GAMMA_VALUES = [0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01];

const CONFIG = Object.freeze({
  gridSize: 24,
  maxSteps: 5000,
  seed: 12345,
  dt: 0.03,
  c2: 1.0,
  lambda: 1.0,
  vev: 1.0,
  noiseAmp: 0.001,
  sampleInterval: 25,
  metricsSampleInterval: 30,
});

const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'gamma-scan-results.json');

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

function initializeField(config) {
  const n = config.gridSize;
  const size = n * n * n;
  const phiRe = new Float64Array(size);
  const phiIm = new Float64Array(size);
  const velRe = new Float64Array(size);
  const velIm = new Float64Array(size);
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

  return { phiRe, phiIm, velRe, velIm };
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
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < phiRe.length; i += 1) {
    const amplitude = Math.hypot(phiRe[i], phiIm[i]);
    sum += amplitude;
    sumSquared += amplitude * amplitude;
    if (amplitude < min) min = amplitude;
    if (amplitude > max) max = amplitude;
  }

  const mean = sum / phiRe.length;
  const variance = Math.max(0, sumSquared / phiRe.length - mean * mean);

  return {
    mean,
    std: Math.sqrt(variance),
    min,
    max,
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

function detectMonotonicDecrease(values) {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[i - 1]) return false;
  }

  return true;
}

function detectPossibleBreathing(amplitudeMeans, vev) {
  if (amplitudeMeans.length < 8) return false;

  let crossings = 0;
  let previous = amplitudeMeans[0] - vev;
  const minSwing = vev * 0.002;
  const min = Math.min(...amplitudeMeans);
  const max = Math.max(...amplitudeMeans);

  for (let i = 1; i < amplitudeMeans.length; i += 1) {
    const current = amplitudeMeans[i] - vev;
    if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) {
      crossings += 1;
    }
    if (current !== 0) previous = current;
  }

  return crossings >= 2 && max - min >= minSwing;
}

function formatNumber(value) {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);
  return Number(value.toFixed(6));
}

function collectGammaMetrics(field, vortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeanHistory) {
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

function runGamma(gamma, config) {
  const field = initializeField(config);
  const scratchRe = new Float64Array(field.phiRe.length);
  const scratchIm = new Float64Array(field.phiIm.length);
  const vortexTracker = new CountBasedVortexLifetimeTracker();
  const initialAmplitude = computeAmplitudeStats(field);
  const initialEnergy = computeTotalEnergy(field);
  const initialVortexCount = computeVortexCount(field, config);
  const vortexCounts = [initialVortexCount];
  const amplitudeMeans = [initialAmplitude.mean];
  const energies = [initialEnergy];
  const metricsSamples = [];
  let previousMetrics = null;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let finalVortexCount = initialVortexCount;
  let finalAmplitude = initialAmplitude;
  let finalEnergy = initialEnergy;

  const initialMetrics = collectGammaMetrics(field, initialVortexCount, 0, config, vortexTracker, previousMetrics, amplitudeMeans);
  metricsSamples.push(initialMetrics);
  previousMetrics = initialMetrics;

  for (let step = 1; step <= config.maxSteps; step += 1) {
    stepField(field, gamma, config, scratchRe, scratchIm);

    if (step % config.sampleInterval === 0 || step === config.maxSteps) {
      finalVortexCount = computeVortexCount(field, config);
      finalAmplitude = computeAmplitudeStats(field);
      finalEnergy = computeTotalEnergy(field);
      vortexCounts.push(finalVortexCount);
      amplitudeMeans.push(finalAmplitude.mean);
      energies.push(finalEnergy);

      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) {
        stepWhenVortexCountReachedZero = step;
      }
    }

    if (step % config.metricsSampleInterval === 0 || step === config.maxSteps) {
      const sampledVortexCount = step % config.sampleInterval === 0 || step === config.maxSteps
        ? finalVortexCount
        : computeVortexCount(field, config);
      const metrics = collectGammaMetrics(field, sampledVortexCount, step, config, vortexTracker, previousMetrics, amplitudeMeans);
      metricsSamples.push(metrics);
      previousMetrics = metrics;
    }
  }

  const finalMetrics = metricsSamples[metricsSamples.length - 1];
  globalThis.__AETERNA_METRICS__ = finalMetrics;

  const vortexSum = vortexCounts.reduce((sum, value) => sum + value, 0);
  const energyDelta = finalEnergy - initialEnergy;
  const totalEnergyDeltaPercent = initialEnergy === 0 ? null : (energyDelta / initialEnergy) * 100;
  const possibleBreathingDetected = detectPossibleBreathing(amplitudeMeans, config.vev);

  return {
    gamma,
    seed: config.seed,
    gridSize: config.gridSize,
    maxSteps: config.maxSteps,
    sampleInterval: config.sampleInterval,
    metricsSampleInterval: config.metricsSampleInterval,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    averageVortexCount: vortexSum / vortexCounts.length,
    maxVortexCount: Math.max(...vortexCounts),
    amplitudeMeanStart: initialAmplitude.mean,
    amplitudeMeanEnd: finalAmplitude.mean,
    amplitudeStdStart: initialAmplitude.std,
    amplitudeStdEnd: finalAmplitude.std,
    totalEnergyStart: initialEnergy,
    totalEnergyEnd: finalEnergy,
    totalEnergyDelta: energyDelta,
    totalEnergyDeltaPercent,
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
    totalEnergyCombined_start: initialMetrics.totalEnergyCombined,
    totalEnergyCombined_end: finalMetrics.totalEnergyCombined,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    vortexLifetimeMax: finalMetrics.vortexLifetimeMax,
    vortexLifetimeTrackingMode: finalMetrics.vortexLifetimeTrackingMode,
    latestMetrics: finalMetrics,
    averageAmplitudeMean: amplitudeMeans.reduce((sum, value) => sum + value, 0) / amplitudeMeans.length,
    minAmplitudeMean: Math.min(...amplitudeMeans),
    maxAmplitudeMean: Math.max(...amplitudeMeans),
    vortexSurvivalRatio: initialVortexCount === 0 ? null : finalVortexCount / initialVortexCount,
    energyMonotonicDecreaseDetected: detectMonotonicDecrease(energies),
    possibleBreathingDetected,
    notes: possibleBreathingDetected ? 'Possible VEV-adjacent amplitude breathing in sampled means.' : 'No VEV-adjacent breathing detected in sampled means.',
  };
}

function judgeCase(results) {
  const gammaZero = results.find((result) => result.gamma === 0);
  const gammaHigh = results[results.length - 1];
  const gamma003 = results.find((result) => result.gamma === 0.003);
  const gamma002 = results.find((result) => result.gamma === 0.002);
  const finiteZeroSteps = results
    .filter((result) => result.stepWhenVortexCountReachedZero !== null)
    .map((result) => result.stepWhenVortexCountReachedZero);
  const earliestZeroStep = finiteZeroSteps.length > 0 ? Math.min(...finiteZeroSteps) : null;
  const bestLifetime = Math.max(...results.map((result) => result.stepWhenVortexCountReachedZero ?? result.maxSteps));
  const longest = results.filter((result) => (result.stepWhenVortexCountReachedZero ?? result.maxSteps) === bestLifetime);
  const lowerGammaExtendsLifetime = results.every((result, index) => {
    if (index === 0) return true;
    const previous = results[index - 1].stepWhenVortexCountReachedZero ?? results[index - 1].maxSteps;
    const current = result.stepWhenVortexCountReachedZero ?? result.maxSteps;
    return previous >= current;
  });
  const higherGammaLosesMoreEnergy = gammaZero && gammaHigh &&
    gammaHigh.totalEnergyDeltaPercent < 0 &&
    gammaHigh.totalEnergyDeltaPercent < gammaZero.totalEnergyDeltaPercent;

  if (gamma002 && gamma002.possibleBreathingDetected && gamma002.finalVortexCount > 0) {
    return {
      selectedCase: 'Case D',
      recommendedNextStep: 'Proceed to Step 0.5 metrics before deciding whether Step 2 Gentle Pulse can be weakened or omitted.',
    };
  }

  if (gamma003) {
    const lifetime003 = gamma003.stepWhenVortexCountReachedZero ?? gamma003.maxSteps;
    const neighborLifetimes = results
      .filter((result) => result.gamma >= 0.001 && result.gamma <= 0.005 && result.gamma !== 0.003)
      .map((result) => result.stepWhenVortexCountReachedZero ?? result.maxSteps);
    const neighborBest = Math.max(...neighborLifetimes);

    if (lifetime003 > neighborBest) {
      return {
        selectedCase: 'Case C',
        recommendedNextStep: 'Use GAMMA = 0.003 as a provisional reference and proceed to Step 0.5 metrics.',
      };
    }
  }

  if (lowerGammaExtendsLifetime && higherGammaLosesMoreEnergy) {
    return {
      selectedCase: 'Case B',
      recommendedNextStep: 'Prioritize Step 2 Gentle Pulse after Step 0.5 metrics confirms the trend.',
    };
  }

  if (gammaZero && gammaZero.finalVortexCount === 0 && earliestZeroStep !== null && gammaZero.stepWhenVortexCountReachedZero === earliestZeroStep && Math.abs(gammaZero.totalEnergyDeltaPercent) < 5) {
    return {
      selectedCase: 'Case A',
      recommendedNextStep: 'Prioritize Step 3 phase circulation after checking numerical details.',
    };
  }

  return {
    selectedCase: 'Inconclusive',
    recommendedNextStep: 'Proceed to Step 0.5 metrics and investigate numerical dissipation first.',
  };
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = GAMMA_VALUES.map((gamma) => runGamma(gamma, CONFIG));
  const finishedAt = new Date().toISOString();
  const judgment = judgeCase(results);
  const output = {
    experiment: 'Experiment 001: Step 0 GAMMA Scan',
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    implementationNote: 'Isolated headless diagnostic surrogate; no application simulation code was present in this repository snapshot.',
    config: CONFIG,
    gammaValues: GAMMA_VALUES,
    judgment,
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    gamma: result.gamma.toFixed(3),
    initialVortex: result.initialVortexCount,
    finalVortex: result.finalVortexCount,
    zeroStep: result.stepWhenVortexCountReachedZero,
    energyDeltaPercent: formatNumber(result.totalEnergyDeltaPercent),
    ampMeanStart: formatNumber(result.amplitudeMeanStart),
    ampMeanEnd: formatNumber(result.amplitudeMeanEnd),
    notes: result.notes,
  })));
  console.log(`${judgment.selectedCase}: ${judgment.recommendedNextStep}`);
}

main();
