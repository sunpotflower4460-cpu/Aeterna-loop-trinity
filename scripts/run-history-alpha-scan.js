#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runSingleFieldCondition,
} = require('./diagnostic-surrogate-utils');

const HISTORY_ALPHA_VALUES = Object.freeze([0.04, 0.02, 0.01, 0.004, 0.002]);
const MEMORY_WEIGHT_VALUES = Object.freeze([0.04, 0.08, 0.12, 0.16]);
const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'history-alpha-scan-results.json');
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG });

function isCandidate(result) {
  const differenceA = result.memoryFieldDifferenceA_end ?? 0;
  const differenceB = result.memoryFieldDifferenceB_end ?? differenceA;
  const energyStart = Math.max(result.fieldEnergyProxy_start ?? 0, 1e-8);
  const energyRatio = (result.fieldEnergyProxy_end ?? 0) / energyStart;
  return (result.finalVortexCount > 0 || result.vortexLifetimeAverage > 0) &&
    differenceA >= 0.05 && differenceA <= 0.3 &&
    differenceB >= 0.05 && differenceB <= 0.3 &&
    result.amplitudeMeanA_end > 0.6 && result.amplitudeMeanA_end < 1.4 &&
    energyRatio > 0.5 && energyRatio < 1.5;
}

function buildResult(historyAlpha, memoryWeight) {
  const conditionName = `HISTORY_ALPHA=${historyAlpha} MEMORY_WEIGHT=${memoryWeight}`;
  const condition = {
    conditionName,
    MEMORY_ENABLED: true,
    HISTORY_ALPHA: historyAlpha,
    MEMORY_WEIGHT: memoryWeight,
    MEMORY_WEIGHT_MODE: 'fixed',
    MEMORY_BLEND_VELOCITY: true,
    MEMORY_VELOCITY_SCALE: 0.1,
  };
  const run = runSingleFieldCondition(condition, CONFIG);
  const { params, initialMetrics, finalMetrics } = run;
  const result = {
    conditionName,
    HISTORY_ALPHA: historyAlpha,
    MEMORY_WEIGHT: memoryWeight,
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE,
    MEMORY_ENABLED: params.MEMORY_ENABLED,
    MEMORY_BLEND_VELOCITY: params.MEMORY_BLEND_VELOCITY,
    MEMORY_VELOCITY_SCALE: params.MEMORY_VELOCITY_SCALE,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    stepWhenVortexCountReachedZero: run.stepWhenVortexCountReachedZero,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    vortexLifetimeMax: finalMetrics.vortexLifetimeMax,
    memoryEnergyA_end: finalMetrics.memoryEnergyA,
    memoryEnergyB_end: finalMetrics.memoryEnergyB,
    memoryFieldDifferenceA_end: finalMetrics.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: finalMetrics.memoryFieldDifferenceB,
    amplitudeMeanA_start: initialMetrics.amplitudeMeanA,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_start: initialMetrics.amplitudeMeanB,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_end: finalMetrics.amplitudeStdA,
    amplitudeStdB_end: finalMetrics.amplitudeStdB,
    fieldEnergyProxy_start: initialMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxy_end: finalMetrics.fieldEnergyProxyCombined,
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    candidate: false,
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Diagnostic surrogate scan completed; not a real 64^3 loop validation.',
  };
  result.candidate = isCandidate(result);
  if (!result.candidate && result.memoryFieldDifferenceA_end < 0.05) result.notes += ' Memory-field difference is below the provisional non-copy range.';
  return result;
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];

  for (const historyAlpha of HISTORY_ALPHA_VALUES) {
    for (const memoryWeight of MEMORY_WEIGHT_VALUES) {
      results.push(buildResult(historyAlpha, memoryWeight));
    }
  }

  const runMeta = createRunMeta({
    experimentName: 'experiment:history-alpha-scan',
    config: CONFIG,
    notes: 'Full HISTORY_ALPHA x MEMORY_WEIGHT diagnostic surrogate scan. GAMMA=0.005 is a v2.1.1 baseline candidate, not an ideal value claim.',
  });
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    scanValues: {
      HISTORY_ALPHA: HISTORY_ALPHA_VALUES,
      MEMORY_WEIGHT: MEMORY_WEIGHT_VALUES,
    },
    config: CONFIG,
    candidateCriteria: [
      'vortex remains or lifetime extends',
      'memoryFieldDifferenceA/B remain roughly 0.05-0.3',
      'amplitudeMean remains near VEV',
      'fieldEnergyProxy does not rapidly increase or decrease',
      'memory is not a near-copy of the current field',
    ],
    results,
    candidates: results.filter((result) => result.candidate).map((result) => result.conditionName),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    finalVortex: result.finalVortexCount,
    memoryDiffA: Number(result.memoryFieldDifferenceA_end?.toFixed(6)),
    ampMeanA: Number(result.amplitudeMeanA_end?.toFixed(6)),
    energyEnd: Number(result.fieldEnergyProxy_end?.toFixed(6)),
    candidate: result.candidate,
  })));
}

main();
