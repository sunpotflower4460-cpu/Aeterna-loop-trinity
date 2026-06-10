#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DEFAULT_COUPLING_PARAMS, DEFAULT_MEMORY_PARAMS, DEFAULT_PHEROMONE_PARAMS } = require('../src/params/aeterna-params');
const { runAeternaRuntimeV0Condition } = require('../src/runtime/aeterna-runtime-v0');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-retune-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-retune-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-real-runtime-stability-retune.md');
const PREVIOUS_RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-validation-results.json');
const PREVIOUS_SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-validation-summary.json');
const PREVIOUS_AUDIT_PATH = path.join(ROOT, 'experiments', 'v2.1.2-runtime-results-audit.json');

const FIXED_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  MEMORY_COUPLING_ENABLED: true,
  MEMORY_COUPLING_FORMULA: 'difference-attractor',
  MEMORY_COUPLING_ORDER: 'after-memory-update',
  MEMORY_COUPLING_WEIGHT: 1.0,
  COUPLING_TYPE: 'memory',
  PHEROMONE_ENABLED: true,
  PHEROMONE_FEEDBACK_ENABLED: false,
  PHEROMONE_DIFFUSION: 0,
  PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.95,
  PHEROMONE_DEPOSIT: 0.02,
  PHEROMONE_DEPOSIT_MODE: 'top-10-percent-amplitude',
});

const FULL_SCAN_AXES = Object.freeze({
  COUPLING_G: Object.freeze([0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03]),
  MEMORY_WEIGHT: Object.freeze([0.005, 0.01, 0.02, 0.03, 0.04]),
  HISTORY_ALPHA: Object.freeze([0.00025, 0.0005, 0.001]),
});

const PRIORITY_SCAN_AXES = Object.freeze({
  COUPLING_G: Object.freeze([0.005, 0.01, 0.02, 0.03]),
  MEMORY_WEIGHT: Object.freeze([0.01, 0.02, 0.04]),
  HISTORY_ALPHA: FULL_SCAN_AXES.HISTORY_ALPHA,
});

function gitValue(command, fallback) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = 'true'] = arg.slice(2).split('=');
    options[key] = value;
  }
  return options;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function deltaRatio(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(start) < 1e-12) return null;
  return (end - start) / Math.abs(start);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isFiniteResult(result) {
  return [
    result.fieldABDistance_end,
    result.memoryABDistance_end,
    result.memoryFieldDifferenceA_end,
    result.memoryFieldDifferenceB_end,
    result.fieldEnergyProxyDeltaRatio,
    result.amplitudeStdA_end,
    result.amplitudeStdB_end,
    result.pheromoneActiveRatio_end,
    result.pheromoneSpatialEntropy_end,
  ].every((value) => value === null || Number.isFinite(value));
}

function collapseFlags(result) {
  return {
    fieldIdentityCollapse: result.fieldABDistance_end < 0.005,
    memoryIdentityCollapse: result.memoryABDistance_end < 0.005,
    fieldFlattened: result.amplitudeStdA_end < 0.01 || result.amplitudeStdB_end < 0.01,
    vortexDisappeared: result.finalVortexCount === 0,
    pheromoneFog: result.pheromoneActiveRatio_end >= 0.9 || result.pheromoneSpatialEntropy_end >= 0.95,
    numericInstability: !isFiniteResult(result) || result.hasNaNOrInfinity === true,
  };
}

function stabilityFlags(result) {
  return {
    fieldABReduced: result.fieldABDistance_end < result.fieldABDistance_start,
    fieldABInTargetBand: result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.15,
    memoryTraceInBand: result.memoryFieldDifferenceA_end >= 0.05 && result.memoryFieldDifferenceA_end <= 0.35 && result.memoryFieldDifferenceB_end >= 0.05 && result.memoryFieldDifferenceB_end <= 0.35,
    energyStable: Math.abs(result.fieldEnergyProxyDeltaRatio) <= 0.25,
    pheromoneLocal: result.pheromoneActiveRatio_end < 0.9 && result.pheromoneSpatialEntropy_end < 0.95,
    vortexPreserved: result.finalVortexCount > 0,
    performanceAcceptable: result.stepMsAverage === null || result.stepMsAverage < 250,
  };
}

function rejectReasons(result) {
  const reasons = [];
  if (result.collapseFlags.numericInstability) reasons.push('numeric instability');
  if (result.fieldABDistance_end < 0.005) reasons.push('field identity collapse');
  if (result.memoryABDistance_end < 0.005) reasons.push('memory identity collapse');
  if (result.fieldABDistance_end > result.fieldABDistance_start) reasons.push('A/B moved apart');
  if (result.fieldABDistance_end > 0.15) reasons.push('A/B remain too separate');
  if (result.memoryFieldDifferenceA_end < 0.05 || result.memoryFieldDifferenceB_end < 0.05) reasons.push('memory trace too shallow');
  if (result.memoryFieldDifferenceA_end > 0.35 || result.memoryFieldDifferenceB_end > 0.35) reasons.push('memory trace too detached');
  if (result.pheromoneActiveRatio_end >= 0.9) reasons.push('pheromone fog');
  if (result.pheromoneSpatialEntropy_end >= 0.95) reasons.push('pheromone uniformization');
  if (result.amplitudeStdA_end < 0.01 || result.amplitudeStdB_end < 0.01) reasons.push('field flattened');
  if (result.finalVortexCount === 0) reasons.push('vortex disappeared');
  if (Math.abs(result.fieldEnergyProxyDeltaRatio) > 0.25) reasons.push('energy unstable');
  return reasons;
}

function scoreResult(result) {
  if (result.collapseFlags.fieldIdentityCollapse || result.collapseFlags.memoryIdentityCollapse || result.collapseFlags.numericInstability) return 0;
  const nonCollapseScore = 1;
  const targetCenter = 0.08;
  const abMeetingScore = result.fieldABDistance_end <= 0.15 ? clamp01(1 - Math.abs(result.fieldABDistance_end - targetCenter) / targetCenter) : clamp01(result.fieldABDistance_start / Math.max(result.fieldABDistance_end, 1e-9));
  const memoryTraceAverage = (result.memoryFieldDifferenceA_end + result.memoryFieldDifferenceB_end) / 2;
  const memoryTraceScore = memoryTraceAverage >= 0.05 && memoryTraceAverage <= 0.35 ? 1 : clamp01(1 - Math.min(Math.abs(memoryTraceAverage - 0.2), 0.2) / 0.2);
  const energyStabilityScore = clamp01(1 - Math.abs(result.fieldEnergyProxyDeltaRatio) / 0.25);
  const vortexPersistenceScore = result.finalVortexCount > 0 ? 1 : 0;
  const pheromoneLocalityScore = result.pheromoneActiveRatio_end < 0.9 && result.pheromoneSpatialEntropy_end < 0.95 ? 1 : 0;
  const performanceScore = result.stepMsAverage === null ? 0.5 : clamp01(1 - result.stepMsAverage / 250);
  return nonCollapseScore * 0.25 + abMeetingScore * 0.20 + memoryTraceScore * 0.20 + energyStabilityScore * 0.15 + vortexPersistenceScore * 0.10 + pheromoneLocalityScore * 0.05 + performanceScore * 0.05;
}

function classifyResult(result) {
  result.collapseFlags = collapseFlags(result);
  result.stabilityFlags = stabilityFlags(result);
  const reasons = rejectReasons(result);
  result.candidate = result.runType === 'real-runtime-v0' && result.stabilityFlags.vortexPreserved && result.stabilityFlags.fieldABReduced && result.stabilityFlags.fieldABInTargetBand && result.memoryABDistance_end >= 0.005 && result.stabilityFlags.memoryTraceInBand && result.stabilityFlags.pheromoneLocal && result.amplitudeStdA_end >= 0.01 && result.amplitudeStdB_end >= 0.01 && result.stabilityFlags.energyStable && !result.collapseFlags.numericInstability;
  result.directionCandidate = !result.candidate && result.stabilityFlags.fieldABReduced && result.fieldABDistance_end >= 0.005 && result.memoryABDistance_end >= 0.005 && result.stabilityFlags.vortexPreserved && result.stabilityFlags.energyStable && !result.collapseFlags.numericInstability;
  result.rejected = !result.candidate && !result.directionCandidate;
  result.score = scoreResult(result);
  if (result.candidate) result.decision = 'candidate';
  else if (result.directionCandidate) result.decision = `direction candidate: ${reasons.join('; ') || 'near stability band but incomplete'}`;
  else result.decision = `rejected: ${reasons.join('; ') || 'outside stability retune bands'}`;
  result.notes = result.hasNaNOrInfinity ? 'Non-finite values detected during real-runtime-v0 run.' : 'real-runtime-v0 stability retune row completed with pheromone feedback OFF.';
  return result;
}

function buildCondition(couplingG, memoryWeight, historyAlpha, pheromoneEnabled = true) {
  return {
    ...DEFAULT_MEMORY_PARAMS,
    ...DEFAULT_COUPLING_PARAMS,
    ...DEFAULT_PHEROMONE_PARAMS,
    ...FIXED_PARAMS,
    COUPLING_G: couplingG,
    MEMORY_WEIGHT: memoryWeight,
    HISTORY_ALPHA: historyAlpha,
    PHEROMONE_ENABLED: pheromoneEnabled,
    PHEROMONE_FEEDBACK_ENABLED: false,
    COUPLING_ENABLED: true,
  };
}

function buildCombos(axes) {
  const combos = [];
  for (const couplingG of axes.COUPLING_G) {
    for (const memoryWeight of axes.MEMORY_WEIGHT) {
      for (const historyAlpha of axes.HISTORY_ALPHA) {
        combos.push({ couplingG, memoryWeight, historyAlpha });
      }
    }
  }
  return combos;
}

function resultFromRun({ stage, seed, combo, conditionName, pheromoneEnabled }) {
  const conditionParams = buildCondition(combo.couplingG, combo.memoryWeight, combo.historyAlpha, pheromoneEnabled);
  const run = runAeternaRuntimeV0Condition({
    conditionParams,
    gridSize: stage.requestedGridSize,
    maxSteps: stage.maxSteps,
    seed,
    sampleInterval: stage.sampleInterval,
    metricsSampleInterval: stage.sampleInterval,
  });
  const initial = run.initialMetrics;
  const final = run.finalMetrics;
  return classifyResult({
    conditionName,
    stageName: stage.name,
    validationStage: stage.name,
    seed,
    requestedGridSize: stage.requestedGridSize,
    actualGridSize: stage.actualGridSize,
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    GAMMA: conditionParams.GAMMA,
    HISTORY_ALPHA: conditionParams.HISTORY_ALPHA,
    MEMORY_WEIGHT: conditionParams.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: conditionParams.MEMORY_WEIGHT_MODE,
    MEMORY_VELOCITY_SCALE: conditionParams.MEMORY_VELOCITY_SCALE,
    MEMORY_COUPLING_ENABLED: conditionParams.MEMORY_COUPLING_ENABLED,
    MEMORY_COUPLING_FORMULA: conditionParams.MEMORY_COUPLING_FORMULA,
    MEMORY_COUPLING_ORDER: conditionParams.MEMORY_COUPLING_ORDER,
    MEMORY_COUPLING_WEIGHT: conditionParams.MEMORY_COUPLING_WEIGHT,
    COUPLING_G: conditionParams.COUPLING_G,
    COUPLING_TYPE: conditionParams.COUPLING_TYPE,
    PHEROMONE_ENABLED: conditionParams.PHEROMONE_ENABLED,
    PHEROMONE_FEEDBACK_ENABLED: conditionParams.PHEROMONE_FEEDBACK_ENABLED,
    PHEROMONE_DIFFUSION: conditionParams.PHEROMONE_DIFFUSION,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: conditionParams.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DEPOSIT: conditionParams.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_MODE: conditionParams.PHEROMONE_DEPOSIT_MODE,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    vortexLifetimeAverage: final.vortexLifetimeAverage,
    vortexLifetimeMax: final.vortexLifetimeMax,
    stepWhenVortexCountReachedZero: run.stepWhenVortexCountReachedZero,
    fieldABDistance_start: initial.fieldABDistance,
    fieldABDistance_end: final.fieldABDistance,
    fieldABDistanceDelta: final.fieldABDistance - initial.fieldABDistance,
    fieldABDistanceDeltaRatio: deltaRatio(initial.fieldABDistance, final.fieldABDistance),
    memoryABDistance_start: initial.memoryABDistance,
    memoryABDistance_end: final.memoryABDistance,
    memoryABDistanceDelta: final.memoryABDistance - initial.memoryABDistance,
    memoryABDistanceDeltaRatio: deltaRatio(initial.memoryABDistance, final.memoryABDistance),
    memoryFieldDifferenceA_end: final.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: final.memoryFieldDifferenceB,
    R_A_global_end: final.R_A_global,
    R_B_global_end: final.R_B_global,
    R_AB_orderDifferenceRatio_end: final.R_AB_orderDifferenceRatio,
    R_A_local_average_end: final.R_A_local_average,
    R_B_local_average_end: final.R_B_local_average,
    pheromoneActiveRatio_end: final.pheromoneActiveRatio,
    pheromoneSpatialEntropy_end: final.pheromoneSpatialEntropy,
    pheromoneEnergyL2_end: final.pheromoneEnergyL2,
    pheromoneMax_end: final.pheromoneMax,
    amplitudeMeanA_end: final.amplitudeMeanA,
    amplitudeMeanB_end: final.amplitudeMeanB,
    amplitudeStdA_end: final.amplitudeStdA,
    amplitudeStdB_end: final.amplitudeStdB,
    fieldEnergyProxy_start: initial.fieldEnergyProxyCombined,
    fieldEnergyProxy_end: final.fieldEnergyProxyCombined,
    fieldEnergyProxyDeltaRatio: deltaRatio(initial.fieldEnergyProxyCombined, final.fieldEnergyProxyCombined),
    stepMsAverage: run.stepMsAverage,
    stepMsMax: run.stepMsMax,
    runtimeMsTotal: run.stepMsAverage * stage.maxSteps,
    memoryMBStart: run.memoryMBStart,
    memoryMBEnd: run.memoryMBEnd,
    memoryMBPeak: run.memoryMBPeak,
    hasNaNOrInfinity: run.nonFiniteDetected,
    collapseFlags: {},
    stabilityFlags: {},
    score: 0,
    candidate: false,
    directionCandidate: false,
    rejected: false,
    decision: 'pending',
    notes: '',
  });
}

function groupCandidateCombos(results, limit) {
  const grouped = new Map();
  for (const result of results.filter((row) => row.candidate || row.directionCandidate)) {
    const key = `${result.COUPLING_G}|${result.MEMORY_WEIGHT}|${result.HISTORY_ALPHA}`;
    const current = grouped.get(key) || { combo: { couplingG: result.COUPLING_G, memoryWeight: result.MEMORY_WEIGHT, historyAlpha: result.HISTORY_ALPHA }, rows: [], score: 0 };
    current.rows.push(result);
    current.score = current.rows.reduce((sum, row) => sum + row.score, 0) / current.rows.length;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.combo);
}

function createStage(name, gridSize, maxSteps, sampleInterval, seeds, conditions) {
  return {
    name,
    requestedGridSize: gridSize,
    actualGridSize: gridSize,
    maxSteps,
    sampleInterval,
    seeds,
    conditionCount: conditions.length,
    executed: false,
    skipped: false,
    skipReason: '',
  };
}

function runStage(stage, conditions, results) {
  stage.conditionCount = conditions.length;
  stage.executed = conditions.length > 0;
  stage.skipped = conditions.length === 0;
  if (stage.skipped && !stage.skipReason) stage.skipReason = 'No candidate conditions were available from the previous gated stage.';
  for (const combo of conditions) {
    for (const seed of stage.seeds) {
      const conditionName = `Condition D: weak coupling retune G=${combo.couplingG} MEMORY_WEIGHT=${combo.memoryWeight} HISTORY_ALPHA=${combo.historyAlpha}`;
      // eslint-disable-next-line no-console
      console.log(`[${stage.name}] ${conditionName} seed=${seed}`);
      results.push(resultFromRun({ stage, seed, combo, conditionName, pheromoneEnabled: true }));
    }
  }
}

function summarizePreviousFailures(previousResults, previousAudit) {
  const rows = Array.isArray(previousResults?.results) ? previousResults.results : [];
  const rejected = rows.filter((row) => row.rejected || String(row.decision || '').startsWith('rejected'));
  const countWhere = (predicate) => rows.filter(predicate).length;
  return {
    rejectedStages: [...new Set(rejected.map((row) => row.validationStage || row.stageName).filter(Boolean))],
    rejectedConditions: [...new Set(rejected.map((row) => row.conditionName).filter(Boolean))],
    fieldIdentityCollapseRows: rows.filter((row) => row.fieldABDistance_end < 0.005).map(shortRow),
    fieldABDistanceBelow005Rows: rows.filter((row) => row.fieldABDistance_end < 0.005).map(shortRow),
    memoryABDistanceBelow005Rows: rows.filter((row) => row.memoryABDistance_end < 0.005).map(shortRow),
    energyInstabilityRows: rows.filter((row) => Math.abs(row.fieldEnergyProxyDeltaRatio) > 0.25).map(shortRow),
    memoryFieldDifferenceOutOfBandRows: rows.filter((row) => row.memoryFieldDifferenceA_end < 0.05 || row.memoryFieldDifferenceA_end > 0.35 || row.memoryFieldDifferenceB_end < 0.05 || row.memoryFieldDifferenceB_end > 0.35).map(shortRow),
    vortexDisappearedRows: rows.filter((row) => row.finalVortexCount === 0).map(shortRow),
    pheromoneFogRows: rows.filter((row) => row.pheromoneActiveRatio_end >= 0.9 || row.pheromoneSpatialEntropy_end >= 0.95).map(shortRow),
    counts: {
      rejected: rejected.length,
      fieldIdentityCollapse: countWhere((row) => row.fieldABDistance_end < 0.005),
      memoryIdentityCollapse: countWhere((row) => row.memoryABDistance_end < 0.005),
      energyInstability: countWhere((row) => Math.abs(row.fieldEnergyProxyDeltaRatio) > 0.25),
      memoryDifferenceOutOfBand: countWhere((row) => row.memoryFieldDifferenceA_end < 0.05 || row.memoryFieldDifferenceA_end > 0.35 || row.memoryFieldDifferenceB_end < 0.05 || row.memoryFieldDifferenceB_end > 0.35),
      vortexDisappeared: countWhere((row) => row.finalVortexCount === 0),
      pheromoneFog: countWhere((row) => row.pheromoneActiveRatio_end >= 0.9 || row.pheromoneSpatialEntropy_end >= 0.95),
    },
    full64SkipReason: previousAudit?.stageAudit?.stage64Full?.blockingIssues?.join('; ') || previousResults?.stages?.find((stage) => stage.validationStage === 'stage-3-64-full')?.status || '64³ full validation was skipped because 32³ / 64³ smoke prerequisites did not produce a Condition D candidate.',
  };
}

function shortRow(row) {
  return {
    stage: row.validationStage || row.stageName,
    conditionName: row.conditionName,
    seed: row.seed,
    grid: row.actualGridSize || row.requestedGridSize,
    fieldABDistance_end: row.fieldABDistance_end,
    memoryABDistance_end: row.memoryABDistance_end,
    memoryFieldDifferenceA_end: row.memoryFieldDifferenceA_end,
    memoryFieldDifferenceB_end: row.memoryFieldDifferenceB_end,
    finalVortexCount: row.finalVortexCount,
    fieldEnergyProxyDeltaRatio: row.fieldEnergyProxyDeltaRatio,
    decision: row.decision,
  };
}

function failureModeSummary(results) {
  return {
    fieldIdentityCollapseCount: results.filter((row) => row.collapseFlags.fieldIdentityCollapse).length,
    memoryIdentityCollapseCount: results.filter((row) => row.collapseFlags.memoryIdentityCollapse).length,
    energyUnstableCount: results.filter((row) => !row.stabilityFlags.energyStable).length,
    memoryTraceTooShallowCount: results.filter((row) => row.memoryFieldDifferenceA_end < 0.05 || row.memoryFieldDifferenceB_end < 0.05).length,
    memoryTraceTooDetachedCount: results.filter((row) => row.memoryFieldDifferenceA_end > 0.35 || row.memoryFieldDifferenceB_end > 0.35).length,
    vortexDisappearedCount: results.filter((row) => row.collapseFlags.vortexDisappeared).length,
    pheromoneFogCount: results.filter((row) => row.collapseFlags.pheromoneFog).length,
    numericInstabilityCount: results.filter((row) => row.collapseFlags.numericInstability).length,
  };
}

function createDecision(results, stages) {
  const stabilityCandidateFound32 = results.some((row) => row.stageName === 'smoke32' || row.stageName === 'confirm32' ? row.candidate : false);
  const stabilityCandidateFound64Smoke = results.some((row) => row.stageName === 'smoke64' && row.candidate);
  const full64Rows = results.filter((row) => row.stageName === 'full64');
  const stabilityCandidateFound64Full = full64Rows.length >= 3 && full64Rows.every((row) => row.candidate);
  const canProceedTo64Smoke = stabilityCandidateFound32;
  const canProceedTo64FullValidation = stabilityCandidateFound64Smoke;
  const blockingIssues = [];
  if (!stabilityCandidateFound32) blockingIssues.push('No 32³ stability candidate found in weak coupling / weak memory retune.');
  if (stabilityCandidateFound32 && !stabilityCandidateFound64Smoke) blockingIssues.push('64³ smoke candidate evidence is not present.');
  if (stabilityCandidateFound64Smoke && !stabilityCandidateFound64Full) blockingIssues.push('64³ full three-seed candidate evidence is not present.');
  const full64Stage = stages.find((stage) => stage.name === 'full64');
  if (full64Stage?.skipped) blockingIssues.push(full64Stage.skipReason);
  return {
    stabilityCandidateFound32,
    stabilityCandidateFound64Smoke,
    stabilityCandidateFound64Full,
    canProceedTo64Smoke,
    canProceedTo64FullValidation,
    canProceedToV22Planning: false,
    needsAdditionalStabilityRetune: !stabilityCandidateFound64Full,
    needsRuntimeRework: !stabilityCandidateFound32,
    blockingIssues: [...new Set(blockingIssues)],
    recommendedNextStep: stabilityCandidateFound64Full
      ? 'Run an independent audit of the real-runtime-v0 64³ full candidate before v2.2 planning.'
      : (stabilityCandidateFound64Smoke ? 'Run or repeat 64³ full three-seed validation.' : (stabilityCandidateFound32 ? 'Run 64³ smoke for the top real-runtime-v0 retune candidates.' : 'Continue stability retune or rework real-runtime-v0 coupling / memory dynamics.')),
  };
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(6);
  return String(value);
}

function candidateRow(result, index, includePheromone = true) {
  const memoryTrace = `${formatValue(result.memoryFieldDifferenceA_end)} / ${formatValue(result.memoryFieldDifferenceB_end)}`;
  const base = `| ${index + 1} | ${result.stageName} | ${formatValue(result.COUPLING_G)} | ${formatValue(result.MEMORY_WEIGHT)} | ${formatValue(result.HISTORY_ALPHA)} | ${formatValue(result.fieldABDistance_start)} | ${formatValue(result.fieldABDistance_end)} | ${memoryTrace} | ${formatValue(result.memoryABDistance_end)} | ${formatValue(result.finalVortexCount)} | ${formatValue(result.fieldEnergyProxyDeltaRatio)} |`;
  if (includePheromone) return `${base} ${formatValue(result.pheromoneActiveRatio_end)} | ${formatValue(result.score)} | ${result.decision} |`;
  return `${base} ${formatValue(result.score)} | ${result.decision} |`;
}

function writeDoc(payload, summary) {
  const previous = payload.previousFailureAudit;
  const fixedRows = Object.entries(FIXED_PARAMS).map(([key, value]) => `| ${key} | ${formatValue(value)} |`).join('\n');
  const axesRows = Object.entries(payload.scanAxes).map(([key, value]) => `| ${key} | ${value.join(', ')} |`).join('\n');
  const stageRows = payload.stages.map((stage) => `| ${stage.name} | ${stage.requestedGridSize} | ${stage.maxSteps} | ${stage.seeds.join(', ')} | ${stage.conditionCount} | ${stage.executed ? 'executed' : `skipped: ${stage.skipReason}`} |`).join('\n');
  const topCandidates = payload.candidates.length > 0 ? payload.candidates.slice(0, 10).map((row, index) => candidateRow(row, index, true)).join('\n') : '|  |  |  |  |  |  |  |  |  |  |  |  |  |  |';
  const topDirectionCandidates = payload.directionCandidates.length > 0 ? payload.directionCandidates.slice(0, 10).map((row, index) => candidateRow(row, index, false)).join('\n') : '|  |  |  |  |  |  |  |  |  |  |  |  |  |';
  const rejectedPatterns = payload.rejectedPatterns.slice(0, 20).map((row) => `- ${row.stageName} / ${row.conditionName} / seed ${row.seed}: ${row.decision}`).join('\n') || '- None recorded.';
  const recommendedParams = Object.keys(summary.recommendedParams).length > 0 ? Object.entries(summary.recommendedParams).map(([key, value]) => `- ${key}: ${formatValue(value)}`).join('\n') : '- None. No full runtime stability candidate was found.';
  const doc = `# AeternaLoop-Trinity v2.1.2 Real Runtime Stability Retune

## Summary

Experiment 022 retuned real-runtime-v0 using weaker coupling and weaker fixed memory weight while keeping pheromone feedback OFF. The run used the priority 32³ scan subset because the full 105-row grid is heavy in this runtime.

Decision: ${payload.decision.recommendedNextStep}

## Why This Retune Was Needed

The previous v2.1.2 surrogate-64 candidate transferred into real-runtime-v0 as an overly strong interaction. Condition D collapsed A/B identity in both 32³ and 64³ smoke, and the 64³ three-seed full validation remained gated.

## Previous Failure Modes

| failure mode | count / notes |
|---|---|
| rejected stages | ${previous.rejectedStages.join(', ') || 'None'} |
| rejected conditions | ${previous.rejectedConditions.join('<br>') || 'None'} |
| field identity collapse / fieldABDistance_end < 0.005 | ${previous.counts.fieldIdentityCollapse} |
| memoryABDistance_end < 0.005 | ${previous.counts.memoryIdentityCollapse} |
| energy instability | ${previous.counts.energyInstability} |
| memoryFieldDifference A/B out of band | ${previous.counts.memoryDifferenceOutOfBand} |
| vortex disappeared | ${previous.counts.vortexDisappeared} |
| pheromone fog | ${previous.counts.pheromoneFog} |
| 64³ full skip reason | ${previous.full64SkipReason} |

## Fixed Params

| param | value |
|---|---:|
${fixedRows}

## Scan Axes

| axis | values |
|---|---|
${axesRows}

## Stages

| stage | grid | steps | seeds | conditions | status |
|---|---:|---:|---|---:|---|
${stageRows}

## Top Candidates

| rank | stage | COUPLING_G | MEMORY_WEIGHT | HISTORY_ALPHA | fieldABDistance start | fieldABDistance end | memoryTrace | memoryABDistance | vortex | energyDelta | pheromoneActiveRatio | score | decision |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---|
${topCandidates}

## Top Direction Candidates

| rank | stage | COUPLING_G | MEMORY_WEIGHT | HISTORY_ALPHA | fieldABDistance start | fieldABDistance end | memoryTrace | memoryABDistance | vortex | energyDelta | score | decision |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|
${topDirectionCandidates}

## Rejected Patterns

${rejectedPatterns}

## Interpretation

### Did lower coupling avoid identity collapse?

${payload.failureModeSummary.fieldIdentityCollapseCount === 0 ? 'Yes for the executed retune rows: no field identity collapse was recorded.' : `No. ${payload.failureModeSummary.fieldIdentityCollapseCount} executed rows still hit field identity collapse.`}

### Did A/B still meet?

${payload.results.some((row) => row.stabilityFlags.fieldABReduced) ? 'Some rows reduced A/B distance, but the candidate gate also required the 0.01–0.15 target band.' : 'No executed row reduced A/B distance enough to qualify.'}

### Did memory remain a trace?

${payload.results.some((row) => row.stabilityFlags.memoryTraceInBand) ? 'Some rows kept memory trace in band.' : 'No executed row kept both memory trace differences inside the 0.05–0.35 band.'}

### Did energy stabilize?

${payload.results.some((row) => row.stabilityFlags.energyStable) ? 'Some rows kept energy delta within ±0.25.' : 'Energy remained outside the ±0.25 stability band for all executed rows.'}

### Did pheromone remain local?

${payload.failureModeSummary.pheromoneFogCount === 0 ? 'Yes. Pheromone feedback stayed OFF, and no pheromone fog / uniformization was recorded.' : `No. ${payload.failureModeSummary.pheromoneFogCount} rows triggered pheromone fog flags.`}

### Did vortices persist?

${payload.failureModeSummary.vortexDisappearedCount === 0 ? 'Yes for executed retune rows.' : `No. ${payload.failureModeSummary.vortexDisappearedCount} rows lost vortices.`}

### Did performance hold?

${payload.results.every((row) => row.stabilityFlags.performanceAcceptable) ? 'Yes. Step timing stayed below the conservative performance gate.' : 'Some rows exceeded the conservative performance gate.'}

## Recommended Params

${recommendedParams}

## Decision

- ${payload.decision.stabilityCandidateFound64Full ? 'Continue v2.1.2 metrics audit' : (payload.decision.stabilityCandidateFound64Smoke ? 'Proceed to 64³ full validation' : (payload.decision.stabilityCandidateFound32 ? 'Proceed to 64³ smoke' : (payload.decision.needsRuntimeRework ? 'Rework real-runtime-v0' : 'Continue stability retune')))}

v2.2 planning remains blocked. canProceedToV22Planning is ${payload.decision.canProceedToV22Planning}.

## Recommended Next Step

${payload.decision.recommendedNextStep}
`;
  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const stageOption = options.stage || 'all';
  const axes = options['full-scan'] === 'true' ? FULL_SCAN_AXES : PRIORITY_SCAN_AXES;
  const allResults = [];
  const previousResults = readJson(PREVIOUS_RESULTS_PATH);
  const previousSummary = readJson(PREVIOUS_SUMMARY_PATH);
  const previousAudit = readJson(PREVIOUS_AUDIT_PATH);
  const previousFailureAudit = summarizePreviousFailures(previousResults, previousAudit);
  const smoke32Conditions = buildCombos(axes);
  const stages = [];

  const smoke32 = createStage('smoke32', 32, 1000, 50, [12345], smoke32Conditions);
  stages.push(smoke32);
  if (stageOption === 'all' || stageOption === 'smoke32') runStage(smoke32, smoke32Conditions, allResults);
  else { smoke32.skipped = true; smoke32.skipReason = `Skipped by --stage=${stageOption}.`; }

  const confirm32Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'smoke32'), 5);
  const confirm32 = createStage('confirm32', 32, 1000, 50, [12345, 23456, 34567], confirm32Conditions);
  stages.push(confirm32);
  if ((stageOption === 'all' || stageOption === 'smoke32') && confirm32Conditions.length > 0) runStage(confirm32, confirm32Conditions, allResults);
  else { confirm32.skipped = true; confirm32.skipReason = confirm32Conditions.length === 0 ? 'No 32³ broad candidate or direction candidate available for three-seed confirmation.' : `Skipped by --stage=${stageOption}.`; }

  const smoke64Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'confirm32' && row.candidate), 3);
  const smoke64 = createStage('smoke64', 64, 1000, 50, [12345], smoke64Conditions);
  stages.push(smoke64);
  if ((stageOption === 'all' || stageOption === 'smoke64') && smoke64Conditions.length > 0) runStage(smoke64, smoke64Conditions, allResults);
  else { smoke64.skipped = true; smoke64.skipReason = smoke64Conditions.length === 0 ? 'No 32³ three-seed stability candidate available for 64³ smoke.' : `Skipped by --stage=${stageOption}.`; }

  const full64Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'smoke64' && row.candidate), 1);
  const full64 = createStage('full64', 64, 3000, 50, [12345, 23456, 34567], full64Conditions);
  stages.push(full64);
  if ((stageOption === 'all' || stageOption === 'full64') && full64Conditions.length > 0) runStage(full64, full64Conditions, allResults);
  else { full64.skipped = true; full64.skipReason = full64Conditions.length === 0 ? 'No 64³ smoke stability candidate available for full three-seed validation.' : `Skipped by --stage=${stageOption}.`; }

  const candidates = allResults.filter((row) => row.candidate).sort((a, b) => b.score - a.score);
  const directionCandidates = allResults.filter((row) => row.directionCandidate).sort((a, b) => b.score - a.score);
  const rejectedPatterns = allResults.filter((row) => row.rejected);
  const summaryFailures = failureModeSummary(allResults);
  const decision = createDecision(allResults, stages);
  const recommendedSource = candidates[0] || directionCandidates[0] || null;
  const recommendedParams = recommendedSource ? {
    COUPLING_G: recommendedSource.COUPLING_G,
    MEMORY_WEIGHT: recommendedSource.MEMORY_WEIGHT,
    HISTORY_ALPHA: recommendedSource.HISTORY_ALPHA,
    MEMORY_COUPLING_WEIGHT: recommendedSource.MEMORY_COUPLING_WEIGHT,
    PHEROMONE_FEEDBACK_ENABLED: recommendedSource.PHEROMONE_FEEDBACK_ENABLED,
  } : {};
  const createdAt = new Date().toISOString();
  const runMeta = {
    experimentName: 'experiment:v212-real-runtime-stability-retune',
    version: 'v2.1.2',
    createdAt,
    commit: gitValue('git rev-parse HEAD', 'unknown'),
    branch: gitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    runtimeAvailable: true,
    validationPurpose: 'collapse-safe real-runtime-v0 retune',
    notes: options['full-scan'] === 'true' ? 'Full 105-row scan axes executed where stage gates allowed.' : 'Priority 36-row 32³ scan subset used because full 105-row real-runtime-v0 scan is heavy.',
  };
  const payload = {
    runMeta,
    sourceArtifacts: {
      previousResults: 'experiments/v2.1.2-real-runtime-validation-results.json',
      previousSummary: 'experiments/v2.1.2-real-runtime-validation-summary.json',
      previousAudit: 'experiments/v2.1.2-runtime-results-audit.json',
    },
    fixedParams: FIXED_PARAMS,
    scanAxes: FULL_SCAN_AXES,
    executedScanAxes: axes,
    previousFailureAudit,
    stages,
    results: allResults,
    candidates,
    directionCandidates,
    rejectedPatterns,
    failureModeSummary: summaryFailures,
    decision,
  };
  const summary = {
    runMeta: {
      version: 'v2.1.2',
      createdAt,
      sourceExperiment: 'experiments/v2.1.2-real-runtime-stability-retune-results.json',
      interpretationRunType: 'real-runtime-v0-stability-retune',
    },
    topCandidates: candidates.slice(0, 10),
    topDirectionCandidates: directionCandidates.slice(0, 10),
    failureModeSummary: summaryFailures,
    recommendedParams,
    decision,
  };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(payload, summary);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}, ${path.relative(ROOT, SUMMARY_PATH)}, and ${path.relative(ROOT, DOC_PATH)}.`);
}

main();
