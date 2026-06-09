#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_SCAN_CONFIG,
  createRunMeta,
  runDualFieldCondition,
  updatePheromoneFieldByDepositMode,
} = require('./diagnostic-surrogate-utils');

const PHEROMONE_DIFFUSION_VALUES = Object.freeze([0, 0.00005, 0.0001, 0.0002, 0.0005]);
const PHEROMONE_DEPOSIT_THRESHOLD_RATIO_VALUES = Object.freeze([0.85, 0.9, 0.95]);
const PHEROMONE_DEPOSIT_VALUES = Object.freeze([0.005, 0.01, 0.02]);
const PHEROMONE_DEPOSIT_MODES = Object.freeze(['all-above-threshold', 'top-10-percent-amplitude', 'top-5-percent-amplitude']);
const OUTPUT_PATH = path.join(__dirname, '..', 'experiments', 'pheromone-localization-scan-results.json');
const CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG });

function isCandidate(result) {
  return result.pheromoneActiveRatio_end < 0.95 &&
    result.pheromoneSpatialEntropy_end < 0.9 &&
    result.pheromoneEnergyL2_end > 0 &&
    result.pheromoneMax_end < 9.5 &&
    result.pheromoneStd_end > 0;
}

function buildResult(diffusion, thresholdRatio, deposit, depositMode) {
  const conditionName = `diff=${diffusion} threshold=${thresholdRatio} deposit=${deposit} mode=${depositMode}`;
  const condition = {
    conditionName,
    MEMORY_ENABLED: true,
    HISTORY_ALPHA: 0.04,
    MEMORY_WEIGHT: 0.12,
    COUPLING_ENABLED: false,
    PHEROMONE_ENABLED: true,
    PHEROMONE_FEEDBACK_ENABLED: false,
    PHEROMONE_UPDATE_INTERVAL: 10,
    PHEROMONE_RETENTION: 0.99005,
    PHEROMONE_DEPOSIT: deposit,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: thresholdRatio,
    PHEROMONE_DIFFUSION: diffusion,
    PHEROMONE_DEPOSIT_MODE: depositMode,
  };
  const run = runDualFieldCondition(condition, CONFIG, {
    createPheromoneField: true,
    updatePheromoneField: updatePheromoneFieldByDepositMode,
  });
  const { params, finalMetrics, pheromoneStats } = run;
  const result = {
    conditionName,
    PHEROMONE_ENABLED: params.PHEROMONE_ENABLED,
    PHEROMONE_FEEDBACK_ENABLED: params.PHEROMONE_FEEDBACK_ENABLED,
    PHEROMONE_UPDATE_INTERVAL: params.PHEROMONE_UPDATE_INTERVAL,
    PHEROMONE_RETENTION: params.PHEROMONE_RETENTION,
    PHEROMONE_DEPOSIT: params.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DIFFUSION: params.PHEROMONE_DIFFUSION,
    pheromoneDepositMode: depositMode,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    pheromoneMass_end: pheromoneStats.pheromoneMass,
    pheromoneEnergyL2_end: pheromoneStats.pheromoneEnergyL2,
    pheromoneMean_end: pheromoneStats.pheromoneMean,
    pheromoneStd_end: pheromoneStats.pheromoneStd,
    pheromoneMax_end: pheromoneStats.pheromoneMax,
    pheromoneActiveRatio_end: pheromoneStats.pheromoneActiveRatio,
    pheromoneSpatialEntropy_end: pheromoneStats.pheromoneSpatialEntropy,
    pheromoneDepositedCells_total: run.pheromoneDepositedCellsTotal,
    pheromoneTotalDeposit_total: run.pheromoneTotalDepositTotal,
    R_A_local_average_end: finalMetrics.R_A_local_average,
    R_B_local_average_end: finalMetrics.R_B_local_average,
    fieldEnergyProxy_end: finalMetrics.fieldEnergyProxyCombined,
    candidate: false,
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Diagnostic surrogate localization scan completed with pheromone feedback disabled.',
  };
  result.candidate = isCandidate(result);
  if (result.pheromoneActiveRatio_end >= 0.95) result.notes += ' Pheromone active ratio remains close to global background fog.';
  if (result.pheromoneSpatialEntropy_end >= 0.9) result.notes += ' Spatial entropy remains high; trace is broad rather than localized.';
  return result;
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];

  for (const diffusion of PHEROMONE_DIFFUSION_VALUES) {
    for (const thresholdRatio of PHEROMONE_DEPOSIT_THRESHOLD_RATIO_VALUES) {
      for (const deposit of PHEROMONE_DEPOSIT_VALUES) {
        for (const depositMode of PHEROMONE_DEPOSIT_MODES) {
          results.push(buildResult(diffusion, thresholdRatio, deposit, depositMode));
        }
      }
    }
  }

  const runMeta = createRunMeta({
    experimentName: 'experiment:pheromone-localization-scan',
    config: CONFIG,
    notes: 'Full diffusion x threshold x deposit x deposit-mode diagnostic surrogate scan. PHEROMONE_FEEDBACK_ENABLED remains false; no true gradient feedback is implemented.',
  });
  const output = {
    runMeta,
    startedAt,
    finishedAt: new Date().toISOString(),
    scanValues: {
      PHEROMONE_DIFFUSION: PHEROMONE_DIFFUSION_VALUES,
      PHEROMONE_DEPOSIT_THRESHOLD_RATIO: PHEROMONE_DEPOSIT_THRESHOLD_RATIO_VALUES,
      PHEROMONE_DEPOSIT: PHEROMONE_DEPOSIT_VALUES,
      pheromoneDepositMode: PHEROMONE_DEPOSIT_MODES,
    },
    config: CONFIG,
    candidateCriteria: [
      'pheromoneActiveRatio_end does not pin to 1',
      'pheromoneSpatialEntropy is not too high',
      'pheromoneEnergyL2 remains finite',
      'pheromoneMax does not pin to PHEROMONE_MAX_VALUE',
      'local high-density regions remain',
    ],
    results,
    candidates: results.filter((result) => result.candidate).map((result) => result.conditionName),
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.table(results.map((result) => ({
    condition: result.conditionName,
    activeRatio: Number(result.pheromoneActiveRatio_end?.toFixed(6)),
    entropy: Number(result.pheromoneSpatialEntropy_end?.toFixed(6)),
    max: Number(result.pheromoneMax_end?.toFixed(6)),
    candidate: result.candidate,
  })));
}

main();
