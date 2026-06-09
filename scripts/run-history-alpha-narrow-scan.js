#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runSingleFieldCondition,
} = require('./diagnostic-surrogate-utils');

const HISTORY_ALPHA_VALUES = Object.freeze([0.002, 0.0015, 0.001, 0.00075, 0.0005, 0.00025]);
const MEMORY_WEIGHT_VALUES = Object.freeze([0.005, 0.01, 0.015, 0.02, 0.03, 0.04]);
const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'history-alpha-narrow-scan-results.json');
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG, seed: 12345 });

function energyDeltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

function isCandidate(result) {
  return (result.finalVortexCount > 0 || result.vortexLifetimeAverage > 0) &&
    result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.3 &&
    (result.memoryFieldDifferenceB_end === null || (result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.3)) &&
    result.amplitudeMeanA_end > 0.25 && result.amplitudeMeanA_end < 1.4 &&
    result.amplitudeStdA_end > 0.02 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) < 0.5 &&
    result.R_A_local_average_end > 0.05;
}

function scoreResult(result) {
  const memoryScore = Math.max(0, 1 - Math.abs(0.08 - result.memoryFieldDifferenceA_end) / 0.08);
  const vortexScore = result.finalVortexCount > 0 ? 1 : Math.min(1, (result.vortexLifetimeAverage ?? 0) / CONFIG.maxSteps);
  const energyScore = Math.max(0, 1 - Math.abs(result.fieldEnergyProxyDeltaRatio) / 0.5);
  const amplitudeScore = Math.max(0, 1 - Math.abs(0.4 - result.amplitudeMeanA_end) / 0.4);
  return memoryScore * 0.4 + vortexScore * 0.25 + energyScore * 0.2 + amplitudeScore * 0.15;
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
    fieldEnergyProxyDeltaRatio: energyDeltaRatio(initialMetrics.fieldEnergyProxyCombined, finalMetrics.fieldEnergyProxyCombined),
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    runType: 'surrogate-headless',
    gridSize: CONFIG.gridSize,
    dynamicsType: 'diagnostic-surrogate',
    candidate: false,
    provisional: false,
    score: 0,
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Diagnostic surrogate narrow scan completed; not a real 64^3 validation.',
  };
  result.candidate = isCandidate(result);
  result.score = scoreResult(result);
  if (!result.candidate && result.memoryFieldDifferenceA_end < 0.05) result.notes += ' Memory-field difference remains below the provisional non-copy range.';
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

  results.sort((a, b) => b.score - a.score);
  const candidates = results.filter((result) => result.candidate);
  if (candidates.length === 0 && results[0]) results[0].provisional = true;

  const runMeta = createRunMeta({
    experimentName: 'experiment:history-alpha-narrow-scan',
    config: CONFIG,
    notes: 'Narrow HISTORY_ALPHA x MEMORY_WEIGHT diagnostic surrogate scan below the previous provisional row. GAMMA=0.005, MEMORY_WEIGHT_MODE=fixed, MEMORY_VELOCITY_SCALE=0.1.',
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
      'vortices remain or lifetime clearly extends',
      'memoryFieldDifferenceA/B land in the 0.05-0.3 range',
      'amplitude mean and standard deviation do not collapse',
      'fieldEnergyProxyDeltaRatio remains bounded',
      'R_local does not disappear',
    ],
    results,
    candidates: results.filter((result) => result.candidate).map((result) => result.conditionName),
    provisionalCandidates: results.filter((result) => result.provisional).map((result) => result.conditionName),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.slice(0, 10).map((result) => ({
    condition: result.conditionName,
    finalVortex: result.finalVortexCount,
    memoryDiffA: Number(result.memoryFieldDifferenceA_end?.toFixed(6)),
    energyDeltaRatio: Number(result.fieldEnergyProxyDeltaRatio?.toFixed(6)),
    candidate: result.candidate,
    provisional: result.provisional,
  })));
}

main();
