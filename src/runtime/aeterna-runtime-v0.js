'use strict';

const { DEFAULT_COUPLING_PARAMS, DEFAULT_MEMORY_PARAMS, DEFAULT_PHASE_ROTATION_PARAMS, DEFAULT_PHEROMONE_PARAMS } = require('../params/aeterna-params');
const { collectAeternaMetrics, CountBasedVortexLifetimeTracker } = require('../metrics/aeterna-metrics');
const { createPheromoneField } = require('../physics/pheromone');
const { createAeternaFields, index3D, wrap } = require('./create-aeterna-fields');
const { stepAeternaRuntimeV0 } = require('./step-aeterna-runtime-v0');

function phaseAt(field, x, y, z, gridSize) {
  const i = index3D(x, y, z, gridSize);
  return Math.atan2(field.phiIm[i], field.phiRe[i]);
}

function phaseDelta(a, b) {
  let delta = b - a;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function computeVortexCount(field, gridSize) {
  const z = Math.floor(gridSize / 2);
  let count = 0;

  for (let y = 0; y < gridSize; y += 1) {
    const yp = wrap(y + 1, gridSize);

    for (let x = 0; x < gridSize; x += 1) {
      const xp = wrap(x + 1, gridSize);
      const winding = phaseDelta(phaseAt(field, x, y, z, gridSize), phaseAt(field, xp, y, z, gridSize)) +
        phaseDelta(phaseAt(field, xp, y, z, gridSize), phaseAt(field, xp, yp, z, gridSize)) +
        phaseDelta(phaseAt(field, xp, yp, z, gridSize), phaseAt(field, x, yp, z, gridSize)) +
        phaseDelta(phaseAt(field, x, yp, z, gridSize), phaseAt(field, x, y, z, gridSize));

      if (Math.abs(winding) > Math.PI) count += 1;
    }
  }

  return count;
}

function hasNonFiniteValues(...arrays) {
  for (const array of arrays) {
    if (!array) continue;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return true;
    }
  }
  return false;
}

function createRuntimeParams(params = {}, config = {}) {
  return {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    ...DEFAULT_PHASE_ROTATION_PARAMS,
    ...DEFAULT_PHEROMONE_PARAMS,
    MEMORY_INIT_MODE: 'copy-current',
    ...params,
    DT: config.dt ?? params.DT ?? params.dt ?? 0.03,
    dt: config.dt ?? params.DT ?? params.dt ?? 0.03,
    VEV: config.vev ?? params.VEV ?? params.vev ?? 1.0,
    vev: config.vev ?? params.VEV ?? params.vev ?? 1.0,
    runType: 'real-runtime-v0',
    RUN_TYPE: 'real-runtime-v0',
  };
}

function createAeternaRuntimeV0({ gridSize = 32, seedA = 12345, seedB = 67890, phaseOffsetB = Math.PI / 5, params = {}, config = {} } = {}) {
  const runtimeConfig = {
    gridSize,
    dt: config.dt ?? 0.03,
    c2: config.c2 ?? 1.0,
    lambda: config.lambda ?? 1.0,
    vev: config.vev ?? 1.0,
    noiseAmp: config.noiseAmp ?? 0.001,
    sampleInterval: config.sampleInterval ?? 50,
    metricsSampleInterval: config.metricsSampleInterval ?? config.sampleInterval ?? 50,
  };
  const runtimeParams = createRuntimeParams(params, runtimeConfig);
  const { fieldA, fieldB } = createAeternaFields({ gridSize, seedA, seedB, phaseOffsetB, params: runtimeParams, config: runtimeConfig });
  const size = fieldA.phiRe.length;

  return {
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    runtimeAvailable: true,
    fieldA,
    fieldB,
    pheromoneField: createPheromoneField(size),
    scratchARe: new Float64Array(size),
    scratchAIm: new Float64Array(size),
    scratchBRe: new Float64Array(size),
    scratchBIm: new Float64Array(size),
    params: runtimeParams,
    config: runtimeConfig,
    seedA,
    seedB,
    phaseOffsetB,
    stepCount: 0,
    lastCouplingMetrics: null,
    lastPheromoneMetrics: null,
    lastPhaseRotationMetrics: null,
    vortexTracker: new CountBasedVortexLifetimeTracker(),
    amplitudeMeanHistory: [],
    previousMetrics: null,
  };
}

function collectRuntimeMetrics(runtime, vortexCount) {
  const metrics = collectAeternaMetrics({
    fieldA: runtime.fieldA,
    fieldB: runtime.fieldB,
    pheromoneField: runtime.pheromoneField,
    vortexCount,
    stepCount: runtime.stepCount,
    gridSize: runtime.config.gridSize,
    index3D,
    vortexTracker: runtime.vortexTracker,
    previousMetrics: runtime.previousMetrics,
    amplitudeMeanHistory: runtime.amplitudeMeanHistory,
    localSampleCount: 512,
    couplingMetrics: runtime.lastCouplingMetrics,
    couplingParams: runtime.params,
    pheromoneMetrics: runtime.lastPheromoneMetrics,
    phaseRotationMetrics: runtime.lastPhaseRotationMetrics,
  });

  runtime.previousMetrics = metrics;
  if (metrics.amplitudeMeanA !== null && metrics.amplitudeMeanB !== null) {
    runtime.amplitudeMeanHistory.push((metrics.amplitudeMeanA + metrics.amplitudeMeanB) / 2);
  }
  return metrics;
}

function runAeternaRuntimeV0Condition({ conditionParams = {}, gridSize = 32, maxSteps = 1000, seed = 12345, seedB = 67890, sampleInterval = 50, metricsSampleInterval = 50, config = {} } = {}) {
  const params = { ...conditionParams };
  const runtime = createAeternaRuntimeV0({
    gridSize,
    seedA: seed,
    seedB,
    params,
    config: { ...config, sampleInterval, metricsSampleInterval },
  });
  const initialVortexCount = computeVortexCount(runtime.fieldA, gridSize) + computeVortexCount(runtime.fieldB, gridSize);
  let finalVortexCount = initialVortexCount;
  let stepWhenVortexCountReachedZero = initialVortexCount === 0 ? 0 : null;
  let nonFiniteDetected = hasNonFiniteValues(runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldB.phiRe, runtime.fieldB.phiIm);
  let initialMetrics = collectRuntimeMetrics(runtime, initialVortexCount);
  let finalMetrics = initialMetrics;
  const stepMsSamples = [];
  const memoryMBStart = process.memoryUsage().rss / 1024 / 1024;
  let memoryMBPeak = memoryMBStart;

  for (let step = 1; step <= maxSteps; step += 1) {
    const start = process.hrtime.bigint();
    stepAeternaRuntimeV0(runtime);
    const end = process.hrtime.bigint();
    stepMsSamples.push(Number(end - start) / 1e6);

    if (step % sampleInterval === 0 || step === maxSteps) {
      finalVortexCount = computeVortexCount(runtime.fieldA, gridSize) + computeVortexCount(runtime.fieldB, gridSize);
      if (stepWhenVortexCountReachedZero === null && finalVortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(
        runtime.fieldA.phiRe,
        runtime.fieldA.phiIm,
        runtime.fieldA.velRe,
        runtime.fieldA.velIm,
        runtime.fieldA.memoryRe,
        runtime.fieldA.memoryIm,
        runtime.fieldB.phiRe,
        runtime.fieldB.phiIm,
        runtime.fieldB.velRe,
        runtime.fieldB.velIm,
        runtime.fieldB.memoryRe,
        runtime.fieldB.memoryIm,
        runtime.pheromoneField,
      );
    }

    if (step % metricsSampleInterval === 0 || step === maxSteps) {
      finalMetrics = collectRuntimeMetrics(runtime, finalVortexCount);
      memoryMBPeak = Math.max(memoryMBPeak, process.memoryUsage().rss / 1024 / 1024);
    }
  }

  const memoryMBEnd = process.memoryUsage().rss / 1024 / 1024;
  const stepMsAverage = stepMsSamples.length > 0 ? stepMsSamples.reduce((sum, value) => sum + value, 0) / stepMsSamples.length : null;
  const stepMsMax = stepMsSamples.length > 0 ? Math.max(...stepMsSamples) : null;

  return {
    runtime,
    params: runtime.params,
    initialMetrics,
    finalMetrics,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    nonFiniteDetected,
    stepMsAverage,
    stepMsMax,
    memoryMBStart,
    memoryMBEnd,
    memoryMBPeak,
  };
}

module.exports = {
  collectRuntimeMetrics,
  computeVortexCount,
  createAeternaRuntimeV0,
  createRuntimeParams,
  hasNonFiniteValues,
  runAeternaRuntimeV0Condition,
};
