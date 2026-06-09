#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runDualFieldCondition,
} = require('./diagnostic-surrogate-utils');

const MEMORY_COUPLING_WEIGHT_VALUES = Object.freeze([0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5]);
const COUPLING_G_VALUES = Object.freeze([0.01, 0.02, 0.03, 0.05]);
const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'memory-coupling-micro-scan-results.json');
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG });

function isCandidate(result) {
  const energyStart = Math.max(result.fieldEnergyProxy_start ?? 0, 1e-8);
  const energyRatio = (result.fieldEnergyProxy_end ?? 0) / energyStart;
  return result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.1 &&
    result.memoryABDistance_end > 0.005 &&
    result.R_AB_orderDifferenceRatio_end <= result.R_AB_orderDifferenceRatio_start &&
    (result.finalVortexCount > 0 || result.vortexLifetimeAverage > 0) &&
    result.amplitudeStdA_end > 0.02 && result.amplitudeStdB_end > 0.02 &&
    energyRatio > 0.5 && energyRatio < 1.5;
}

function buildResult(memoryCouplingWeight, couplingG) {
  const conditionName = `MEMORY_COUPLING_WEIGHT=${memoryCouplingWeight} COUPLING_G=${couplingG}`;
  const condition = {
    conditionName,
    COUPLING_ENABLED: true,
    COUPLING_TYPE: 'memory',
    COUPLING_G: couplingG,
    MEMORY_ENABLED: true,
    HISTORY_ALPHA: 0.04,
    MEMORY_WEIGHT: 0.12,
    MEMORY_COUPLING_ENABLED: true,
    MEMORY_COUPLING_WEIGHT: memoryCouplingWeight,
  };
  const run = runDualFieldCondition(condition, CONFIG);
  const { params, initialMetrics, finalMetrics, couplingMetrics } = run;
  const result = {
    conditionName,
    COUPLING_TYPE: params.COUPLING_TYPE,
    COUPLING_G: params.COUPLING_G,
    MEMORY_COUPLING_ENABLED: params.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    effectiveMemoryCoupling: couplingMetrics?.effectiveMemoryCoupling ?? params.COUPLING_G * params.MEMORY_COUPLING_WEIGHT,
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
    R_AB_relative_start: initialMetrics.R_AB_relative,
    R_AB_relative_end: finalMetrics.R_AB_relative,
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
    candidate: false,
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Diagnostic surrogate micro scan completed; fieldABDistance near zero is not treated as success.',
  };
  result.candidate = isCandidate(result);
  if (result.fieldABDistance_end < 0.01) result.notes += ' A/B distance is near complete identity and is rejected as over-fusion.';
  return result;
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];

  for (const memoryCouplingWeight of MEMORY_COUPLING_WEIGHT_VALUES) {
    for (const couplingG of COUPLING_G_VALUES) {
      results.push(buildResult(memoryCouplingWeight, couplingG));
    }
  }

  const runMeta = createRunMeta({
    experimentName: 'experiment:memory-coupling-micro-scan',
    config: CONFIG,
    notes: 'Full MEMORY_COUPLING_WEIGHT x COUPLING_G diagnostic surrogate micro scan. A/B identity collapse is not counted as success.',
  });
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    scanValues: {
      MEMORY_COUPLING_WEIGHT: MEMORY_COUPLING_WEIGHT_VALUES,
      COUPLING_G: COUPLING_G_VALUES,
    },
    config: CONFIG,
    candidateCriteria: [
      'fieldABDistance_end remains around 0.01-0.1',
      'memoryABDistance_end does not pin to zero',
      'R_AB_orderDifferenceRatio decreases',
      'vortices remain or lifetime extends',
      'amplitudeStd does not collapse',
      'A/B do not become completely identical',
    ],
    results,
    candidates: results.filter((result) => result.candidate).map((result) => result.conditionName),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    fieldABEnd: Number(result.fieldABDistance_end?.toFixed(6)),
    memoryABEnd: Number(result.memoryABDistance_end?.toFixed(6)),
    rABEnd: Number(result.R_AB_orderDifferenceRatio_end?.toFixed(6)),
    candidate: result.candidate,
  })));
}

main();
