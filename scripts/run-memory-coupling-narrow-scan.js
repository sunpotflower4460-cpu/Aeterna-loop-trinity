#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runDualFieldCondition,
} = require('./diagnostic-surrogate-utils');

const COUPLING_CONDITIONS = Object.freeze([
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 0.6, COUPLING_G: 0.05 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 0.7, COUPLING_G: 0.05 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 0.8, COUPLING_G: 0.05 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.05 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 0.8, COUPLING_G: 0.075 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.075 }),
  Object.freeze({ MEMORY_COUPLING_WEIGHT: 1.0, COUPLING_G: 0.1 }),
]);
const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'memory-coupling-narrow-scan-results.json');
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG, seed: 12345, seedA: 12345, seedB: 67890 });
const MEMORY_BASELINE = Object.freeze({ HISTORY_ALPHA: 0.002, MEMORY_WEIGHT: 0.04 });

function energyDeltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

function isRejectedCollapse(result) {
  return result.fieldABDistance_end < 0.005 ||
    result.memoryABDistance_end < 0.005 ||
    result.amplitudeStdA_end < 0.02 ||
    result.amplitudeStdB_end < 0.02 ||
    result.finalVortexCount === 0 ||
    Math.abs(result.fieldEnergyProxyDeltaRatio) >= 0.5;
}

function isCandidate(result) {
  return result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.1 &&
    result.memoryABDistance_end > 0.005 &&
    (result.finalVortexCount > 0 || result.vortexLifetimeAverage > 0) &&
    result.amplitudeStdA_end > 0.02 && result.amplitudeStdB_end > 0.02 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) < 0.5 &&
    !isRejectedCollapse(result);
}

function scoreResult(result) {
  const meetingScore = Math.max(0, 1 - Math.abs(0.055 - result.fieldABDistance_end) / 0.12);
  const nonCollapseScore = result.fieldABDistance_end >= 0.01 && result.memoryABDistance_end >= 0.005 ? 1 : 0;
  const vortexScore = result.finalVortexCount > 0 ? 1 : Math.min(1, (result.vortexLifetimeAverage ?? 0) / CONFIG.maxSteps);
  const energyScore = Math.max(0, 1 - Math.abs(result.fieldEnergyProxyDeltaRatio) / 0.5);
  return meetingScore * 0.4 + nonCollapseScore * 0.25 + vortexScore * 0.2 + energyScore * 0.15;
}

function buildResult({ MEMORY_COUPLING_WEIGHT, COUPLING_G }) {
  const effective = MEMORY_COUPLING_WEIGHT * COUPLING_G;
  const conditionName = `effectiveMemoryCoupling=${effective.toFixed(3)} MEMORY_COUPLING_WEIGHT=${MEMORY_COUPLING_WEIGHT} COUPLING_G=${COUPLING_G}`;
  const condition = {
    conditionName,
    COUPLING_ENABLED: true,
    COUPLING_TYPE: 'memory',
    COUPLING_G,
    MEMORY_ENABLED: true,
    MEMORY_WEIGHT_MODE: 'fixed',
    MEMORY_BLEND_VELOCITY: true,
    MEMORY_VELOCITY_SCALE: 0.1,
    HISTORY_ALPHA: MEMORY_BASELINE.HISTORY_ALPHA,
    MEMORY_WEIGHT: MEMORY_BASELINE.MEMORY_WEIGHT,
    MEMORY_COUPLING_ENABLED: true,
    MEMORY_COUPLING_WEIGHT,
  };
  const run = runDualFieldCondition(condition, CONFIG);
  const { params, initialMetrics, finalMetrics, couplingMetrics } = run;
  const result = {
    conditionName,
    COUPLING_TYPE: params.COUPLING_TYPE,
    COUPLING_G: params.COUPLING_G,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    effectiveMemoryCoupling: couplingMetrics?.effectiveMemoryCoupling ?? effective,
    MEMORY_ENABLED: params.MEMORY_ENABLED,
    HISTORY_ALPHA: params.HISTORY_ALPHA,
    MEMORY_WEIGHT: params.MEMORY_WEIGHT,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    stepWhenVortexCountReachedZero: run.stepWhenVortexCountReachedZero,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    fieldABDistance_start: initialMetrics.fieldABDistance,
    fieldABDistance_end: finalMetrics.fieldABDistance,
    memoryABDistance_start: initialMetrics.memoryABDistance,
    memoryABDistance_end: finalMetrics.memoryABDistance,
    R_AB_orderDifferenceRatio_start: initialMetrics.R_AB_orderDifferenceRatio,
    R_AB_orderDifferenceRatio_end: finalMetrics.R_AB_orderDifferenceRatio,
    R_A_global_end: finalMetrics.R_A_global,
    R_B_global_end: finalMetrics.R_B_global,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_end: finalMetrics.amplitudeStdA,
    amplitudeStdB_end: finalMetrics.amplitudeStdB,
    fieldEnergyProxy_start: initialMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxy_end: finalMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxyDeltaRatio: energyDeltaRatio(initialMetrics.fieldEnergyProxyCombined, finalMetrics.fieldEnergyProxyCombined),
    runType: 'surrogate-headless',
    gridSize: CONFIG.gridSize,
    dynamicsType: 'diagnostic-surrogate',
    candidate: false,
    rejected: false,
    provisional: false,
    score: 0,
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Diagnostic surrogate narrow scan completed; fieldABDistance near zero is rejected as identity collapse.',
  };
  result.rejected = isRejectedCollapse(result);
  result.candidate = isCandidate(result);
  result.score = scoreResult(result);
  if (result.rejected) result.notes += ' Rejected by collapse/stability guardrail.';
  if (!result.candidate && !result.rejected && result.fieldABDistance_end > 0.1) result.notes += ' A/B remain too separate for the target meeting band.';
  return result;
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = COUPLING_CONDITIONS.map(buildResult).sort((a, b) => b.score - a.score);
  const candidates = results.filter((result) => result.candidate);
  if (candidates.length === 0) {
    const provisional = results.find((result) => !result.rejected) ?? results[0];
    if (provisional) provisional.provisional = true;
  }

  const runMeta = createRunMeta({
    experimentName: 'experiment:memory-coupling-narrow-scan',
    config: CONFIG,
    notes: 'Narrow effectiveMemoryCoupling diagnostic surrogate scan above 0.025 using the previous HISTORY_ALPHA provisional baseline. A/B identity collapse is rejected.',
  });
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    scanValues: {
      effectiveMemoryCoupling: COUPLING_CONDITIONS.map((condition) => condition.MEMORY_COUPLING_WEIGHT * condition.COUPLING_G),
      conditions: COUPLING_CONDITIONS,
      MEMORY_BASELINE,
    },
    config: CONFIG,
    candidateCriteria: [
      'fieldABDistance_end lands in 0.01-0.1',
      'memoryABDistance_end does not pin to zero',
      'vortices remain',
      'amplitudeStd remains non-zero',
      'fieldEnergyProxyDeltaRatio remains bounded',
      'A/B do not become completely identical',
    ],
    results,
    candidates: results.filter((result) => result.candidate).map((result) => result.conditionName),
    provisionalCandidates: results.filter((result) => result.provisional).map((result) => result.conditionName),
    rejectedPatterns: results.filter((result) => result.rejected).map((result) => result.conditionName),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    fieldABEnd: Number(result.fieldABDistance_end?.toFixed(6)),
    memoryABEnd: Number(result.memoryABDistance_end?.toFixed(6)),
    energyDeltaRatio: Number(result.fieldEnergyProxyDeltaRatio?.toFixed(6)),
    candidate: result.candidate,
    rejected: result.rejected,
    provisional: result.provisional,
  })));
}

main();
