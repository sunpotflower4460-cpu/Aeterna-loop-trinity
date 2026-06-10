#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DEFAULT_COUPLING_PARAMS, DEFAULT_MEMORY_PARAMS, DEFAULT_PHEROMONE_PARAMS } = require('../src/params/aeterna-params');
const { runAeternaRuntimeV0Condition } = require('../src/runtime/aeterna-runtime-v0');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-narrow-retune-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-narrow-retune-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-real-runtime-stability-narrow-retune.md');
const PREVIOUS_RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-retune-results.json');
const PREVIOUS_SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-real-runtime-stability-retune-summary.json');
const PREVIOUS_DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-real-runtime-stability-retune.md');

const CENTER_CANDIDATE = Object.freeze({
  COUPLING_G: 0.005,
  MEMORY_WEIGHT: 0.01,
  HISTORY_ALPHA: 0.001,
});

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

const SCAN_AXES = Object.freeze({
  COUPLING_G: Object.freeze([0.003, 0.004, 0.005, 0.006, 0.0075]),
  MEMORY_WEIGHT: Object.freeze([0.0075, 0.01, 0.0125, 0.015]),
  HISTORY_ALPHA: Object.freeze([0.00075, 0.001, 0.0015, 0.002]),
});

const STAGE_ORDER = Object.freeze(['smoke32', 'confirm32', 'smoke64', 'full64']);

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
  const abMeetingScore = result.fieldABDistance_end <= 0.15 ? clamp01(1 - Math.abs(result.fieldABDistance_end - targetCenter) / targetCenter) : clamp01(0.15 / Math.max(result.fieldABDistance_end, 1e-9) * 0.5);
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
  result.candidate = result.runType === 'real-runtime-v0' && result.stabilityFlags.vortexPreserved && result.stabilityFlags.fieldABReduced && result.stabilityFlags.fieldABInTargetBand && result.fieldABDistance_end >= 0.005 && result.memoryABDistance_end >= 0.005 && result.stabilityFlags.memoryTraceInBand && result.stabilityFlags.pheromoneLocal && result.amplitudeStdA_end >= 0.01 && result.amplitudeStdB_end >= 0.01 && result.stabilityFlags.energyStable && !result.collapseFlags.numericInstability;
  result.directionCandidate = !result.candidate && result.stabilityFlags.fieldABReduced && result.fieldABDistance_end >= 0.005 && result.memoryABDistance_end >= 0.005 && result.stabilityFlags.vortexPreserved && result.stabilityFlags.energyStable && !result.collapseFlags.numericInstability;
  result.rejected = !result.candidate && !result.directionCandidate;
  result.score = scoreResult(result);
  if (result.candidate) result.decision = 'candidate';
  else if (result.directionCandidate) result.decision = `direction candidate: ${reasons.join('; ') || 'near stability band but incomplete'}`;
  else result.decision = `rejected: ${reasons.join('; ') || 'outside stability narrow retune bands'}`;
  result.notes = result.hasNaNOrInfinity ? 'Non-finite values detected during real-runtime-v0 run.' : 'real-runtime-v0 narrow stability retune row completed with pheromone feedback OFF.';
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
  const start = process.hrtime.bigint();
  const run = runAeternaRuntimeV0Condition({
    conditionParams,
    gridSize: stage.requestedGridSize,
    maxSteps: stage.maxSteps,
    seed,
    sampleInterval: stage.sampleInterval,
    metricsSampleInterval: stage.sampleInterval,
  });
  const end = process.hrtime.bigint();
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
    runtimeMsTotal: Number(end - start) / 1e6,
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

function comboKey(rowOrCombo) {
  const couplingG = rowOrCombo.COUPLING_G ?? rowOrCombo.couplingG;
  const memoryWeight = rowOrCombo.MEMORY_WEIGHT ?? rowOrCombo.memoryWeight;
  const historyAlpha = rowOrCombo.HISTORY_ALPHA ?? rowOrCombo.historyAlpha;
  return `${couplingG}|${memoryWeight}|${historyAlpha}`;
}

function groupCandidateCombos(results, limit, requireAllSeedsCandidate = false) {
  const grouped = new Map();
  for (const result of results.filter((row) => row.candidate || row.directionCandidate)) {
    const key = comboKey(result);
    const current = grouped.get(key) || { combo: { couplingG: result.COUPLING_G, memoryWeight: result.MEMORY_WEIGHT, historyAlpha: result.HISTORY_ALPHA }, rows: [] };
    current.rows.push(result);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .filter((item) => !requireAllSeedsCandidate || item.rows.length >= 3 && item.rows.every((row) => row.candidate))
    .map((item) => ({ ...item, score: item.rows.reduce((sum, row) => sum + row.score, 0) / Math.max(item.rows.length, 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.combo);
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
      const conditionName = `Condition D: narrow retune G=${combo.couplingG} MEMORY_WEIGHT=${combo.memoryWeight} HISTORY_ALPHA=${combo.historyAlpha}`;
      // eslint-disable-next-line no-console
      console.log(`[${stage.name}] ${conditionName} seed=${seed}`);
      results.push(resultFromRun({ stage, seed, combo, conditionName, pheromoneEnabled: true }));
    }
  }
}

function shortRow(row) {
  return {
    stage: row.validationStage || row.stageName,
    conditionName: row.conditionName,
    seed: row.seed,
    grid: row.actualGridSize || row.requestedGridSize,
    COUPLING_G: row.COUPLING_G,
    MEMORY_WEIGHT: row.MEMORY_WEIGHT,
    HISTORY_ALPHA: row.HISTORY_ALPHA,
    fieldABDistance_start: row.fieldABDistance_start,
    fieldABDistance_end: row.fieldABDistance_end,
    memoryABDistance_end: row.memoryABDistance_end,
    memoryFieldDifferenceA_end: row.memoryFieldDifferenceA_end,
    memoryFieldDifferenceB_end: row.memoryFieldDifferenceB_end,
    finalVortexCount: row.finalVortexCount,
    fieldEnergyProxyDeltaRatio: row.fieldEnergyProxyDeltaRatio,
    pheromoneActiveRatio_end: row.pheromoneActiveRatio_end,
    pheromoneSpatialEntropy_end: row.pheromoneSpatialEntropy_end,
    candidate: row.candidate,
    directionCandidate: row.directionCandidate,
    decision: row.decision,
  };
}

function auditPreviousDirectionCandidate(previousResults, previousSummary) {
  const rows = [
    ...(Array.isArray(previousSummary?.topDirectionCandidates) ? previousSummary.topDirectionCandidates : []),
    ...(Array.isArray(previousResults?.directionCandidates) ? previousResults.directionCandidates : []),
    ...(Array.isArray(previousResults?.results) ? previousResults.results : []),
  ];
  const match = rows.find((row) => row.COUPLING_G === CENTER_CANDIDATE.COUPLING_G && row.MEMORY_WEIGHT === CENTER_CANDIDATE.MEMORY_WEIGHT && row.HISTORY_ALPHA === CENTER_CANDIDATE.HISTORY_ALPHA && row.directionCandidate);
  if (!match) {
    return {
      found: false,
      centerCandidate: CENTER_CANDIDATE,
      notes: 'Previous direction candidate row was not found in summary/results artifacts.',
    };
  }
  return {
    found: true,
    centerCandidate: CENTER_CANDIDATE,
    row: shortRow(match),
    whyNotFullCandidate: match.decision || 'Direction candidate only.',
    unmetGuardrails: Object.entries(match.stabilityFlags || {}).filter(([, value]) => value === false).map(([key]) => key),
    collapseAvoided: !Object.values(match.collapseFlags || {}).some(Boolean),
    fieldABReduced: match.fieldABDistance_end < match.fieldABDistance_start,
    memoryTraceAssessment: match.memoryFieldDifferenceA_end > 0.35 || match.memoryFieldDifferenceB_end > 0.35 ? 'too detached' : (match.memoryFieldDifferenceA_end < 0.05 || match.memoryFieldDifferenceB_end < 0.05 ? 'too shallow' : 'in band'),
    energyStable: Math.abs(match.fieldEnergyProxyDeltaRatio) <= 0.25,
    vortexPreserved: match.finalVortexCount > 0,
    pheromoneLocal: match.pheromoneActiveRatio_end < 0.9 && match.pheromoneSpatialEntropy_end < 0.95,
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
  const confirm32Groups = new Map();
  for (const row of results.filter((item) => item.stageName === 'confirm32')) {
    const key = comboKey(row);
    const current = confirm32Groups.get(key) || [];
    current.push(row);
    confirm32Groups.set(key, current);
  }
  const stabilityCandidateFound32 = [...confirm32Groups.values()].some((rows) => rows.length >= 3 && rows.every((row) => row.candidate));
  const stabilityCandidateFound64Smoke = results.some((row) => row.stageName === 'smoke64' && row.candidate);
  const full64Rows = results.filter((row) => row.stageName === 'full64');
  const stabilityCandidateFound64Full = full64Rows.length >= 3 && full64Rows.every((row) => row.candidate);
  const full64Attempted = full64Rows.length > 0;
  const blockingIssues = [];
  if (!stabilityCandidateFound32) blockingIssues.push('No 32³ three-seed full stability candidate found in narrow retune.');
  if (stabilityCandidateFound32 && !stabilityCandidateFound64Smoke) blockingIssues.push('64³ smoke candidate evidence is not present.');
  if (stabilityCandidateFound64Smoke && !stabilityCandidateFound64Full) blockingIssues.push(full64Attempted ? '64³ full three-seed validation was attempted but did not remain a full candidate.' : '64³ full three-seed candidate evidence is not present.');
  for (const stage of stages.filter((item) => item.skipped && item.skipReason && !String(item.skipReason).startsWith('Loaded from existing'))) blockingIssues.push(stage.skipReason);
  return {
    stabilityCandidateFound32,
    stabilityCandidateFound64Smoke,
    stabilityCandidateFound64Full,
    canProceedTo64Smoke: stabilityCandidateFound32,
    canProceedTo64FullValidation: stabilityCandidateFound64Smoke,
    canProceedToV22Planning: false,
    needsAdditionalStabilityRetune: !stabilityCandidateFound64Full,
    needsRuntimeRework: !stabilityCandidateFound32,
    blockingIssues: [...new Set(blockingIssues)],
    recommendedNextStep: stabilityCandidateFound64Full
      ? 'Continue v2.1.2 metrics audit before any v2.2 planning.'
      : (stabilityCandidateFound64Smoke ? (full64Attempted ? 'Continue narrow stability retune; the 64³ full three-seed run collapsed below the identity guardrail.' : 'Run 64³ full three-seed validation.') : (stabilityCandidateFound32 ? 'Proceed to 64³ smoke for the top 32³ full candidate.' : 'Continue narrow stability retune or rework real-runtime-v0 coupling / memory dynamics.')),
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
  const previous = payload.previousDirectionCandidateAudit;
  const previousRow = previous.row || {};
  const fixedRows = Object.entries(FIXED_PARAMS).map(([key, value]) => `| ${key} | ${formatValue(value)} |`).join('\n');
  const axesRows = Object.entries(payload.scanAxes).map(([key, value]) => `| ${key} | ${value.join(', ')} |`).join('\n');
  const stageRows = payload.stages.map((stage) => `| ${stage.name} | ${stage.requestedGridSize} | ${stage.maxSteps} | ${stage.seeds.join(', ')} | ${stage.conditionCount} | ${stage.executed ? 'executed' : `skipped: ${stage.skipReason}`} |`).join('\n');
  const topCandidates = payload.candidates.length > 0 ? payload.candidates.slice(0, 10).map((row, index) => candidateRow(row, index, true)).join('\n') : '|  |  |  |  |  |  |  |  |  |  |  |  |  |  |';
  const topDirectionCandidates = payload.directionCandidates.length > 0 ? payload.directionCandidates.slice(0, 10).map((row, index) => candidateRow(row, index, false)).join('\n') : '|  |  |  |  |  |  |  |  |  |  |  |  |  |';
  const rejectedPatterns = payload.rejectedPatterns.slice(0, 20).map((row) => `- ${row.stageName} / ${row.conditionName} / seed ${row.seed}: ${row.decision}`).join('\n') || '- None recorded.';
  const recommendedParams = Object.keys(summary.recommendedParams).length > 0 ? Object.entries(summary.recommendedParams).map(([key, value]) => `- ${key}: ${formatValue(value)}`).join('\n') : '- None. No full runtime stability candidate was found.';
  const doc = `# AeternaLoop-Trinity v2.1.2 Real Runtime Stability Narrow Retune

## Summary

Experiment 023 narrow-retuned the Experiment 022 direction candidate neighborhood on real-runtime-v0 with Condition D and pheromone feedback OFF.

Decision: ${payload.decision.recommendedNextStep}

## Why This Narrow Retune Was Needed

Experiment 022 found a direction candidate around COUPLING_G=0.005, MEMORY_WEIGHT=0.01, HISTORY_ALPHA=0.001, but no full stability candidate. The row avoided collapse and preserved vortices, yet it missed the full guardrails, so a narrow scan was required before any 64³ smoke.

## Previous Direction Candidate

| param | value |
|---|---:|
| COUPLING_G | ${formatValue(CENTER_CANDIDATE.COUPLING_G)} |
| MEMORY_WEIGHT | ${formatValue(CENTER_CANDIDATE.MEMORY_WEIGHT)} |
| HISTORY_ALPHA | ${formatValue(CENTER_CANDIDATE.HISTORY_ALPHA)} |

## Previous Remaining Blockers

- Previous candidate found: ${previous.found}
- Why not full candidate: ${previous.whyNotFullCandidate || previous.notes}
- Unmet guardrails: ${(previous.unmetGuardrails || []).join(', ') || 'not available'}
- Collapse avoided: ${previous.collapseAvoided}
- fieldABDistance decreased: ${previous.fieldABReduced} (${formatValue(previousRow.fieldABDistance_start)} → ${formatValue(previousRow.fieldABDistance_end)})
- Memory trace assessment: ${previous.memoryTraceAssessment || 'not available'} (${formatValue(previousRow.memoryFieldDifferenceA_end)} / ${formatValue(previousRow.memoryFieldDifferenceB_end)})
- Energy stable: ${previous.energyStable}
- Vortex preserved: ${previous.vortexPreserved}
- Pheromone remained local trace: ${previous.pheromoneLocal}

## Fixed Params

| param | value |
|---|---:|
${fixedRows}

## Narrow Scan Axes

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

### Did narrow coupling avoid identity collapse?

${payload.failureModeSummary.fieldIdentityCollapseCount === 0 ? 'Yes for executed rows: no field identity collapse was recorded.' : `No. ${payload.failureModeSummary.fieldIdentityCollapseCount} rows hit field identity collapse.`}

### Did A/B still meet?

${payload.results.some((row) => row.stabilityFlags.fieldABReduced) ? 'Some rows reduced A/B distance. Full candidacy still required the 0.01–0.15 target band and all other guardrails.' : 'No executed row reduced A/B distance.'}

### Did memory remain a trace?

${payload.results.some((row) => row.stabilityFlags.memoryTraceInBand) ? 'At least one row held memory trace in band.' : 'No executed row fully held memory trace in band across A/B.'}

### Did energy stabilize?

${payload.failureModeSummary.energyUnstableCount === 0 ? 'Yes. All executed rows stayed within the ±0.25 energy delta guardrail.' : `No. ${payload.failureModeSummary.energyUnstableCount} rows exceeded the energy guardrail.`}

### Did pheromone remain local?

${payload.failureModeSummary.pheromoneFogCount === 0 ? 'Yes. Pheromone stayed below fog / uniformization thresholds in executed rows.' : `No. ${payload.failureModeSummary.pheromoneFogCount} rows triggered pheromone fog flags.`}

### Did vortices persist?

${payload.failureModeSummary.vortexDisappearedCount === 0 ? 'Yes for executed rows.' : `No. ${payload.failureModeSummary.vortexDisappearedCount} rows lost vortices.`}

### Did performance hold?

${payload.results.every((row) => row.stabilityFlags.performanceAcceptable) ? 'Yes. Step timing stayed below the conservative performance gate.' : 'Some rows exceeded the conservative performance gate.'}

## Recommended Params

${recommendedParams}

## Decision

- ${payload.decision.stabilityCandidateFound64Full ? 'Continue v2.1.2 metrics audit' : (payload.decision.stabilityCandidateFound64Smoke && !payload.results.some((row) => row.stageName === 'full64') ? 'Proceed to 64³ full validation' : (payload.decision.stabilityCandidateFound32 && !payload.decision.stabilityCandidateFound64Smoke ? 'Proceed to 64³ smoke' : (payload.decision.needsRuntimeRework ? 'Rework real-runtime-v0' : 'Continue narrow stability retune')))}

v2.2 planning remains blocked. canProceedToV22Planning is ${payload.decision.canProceedToV22Planning}.

## Recommended Next Step

${payload.decision.recommendedNextStep}
`;
  fs.writeFileSync(DOC_PATH, doc);
}

function loadSeedResults(stageOption) {
  if (stageOption === 'all') return [];
  const existing = readJson(RESULTS_PATH);
  const rows = Array.isArray(existing?.results) ? existing.results.map((row) => classifyResult(row)) : [];
  if (stageOption === 'smoke32') return [];
  if (stageOption === 'confirm32') return rows.filter((row) => row.stageName === 'smoke32');
  if (stageOption === 'smoke64') return rows.filter((row) => row.stageName === 'smoke32' || row.stageName === 'confirm32');
  if (stageOption === 'full64') return rows.filter((row) => row.stageName === 'smoke32' || row.stageName === 'confirm32' || row.stageName === 'smoke64');
  return rows;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const stageOption = options.stage || 'all';
  if (stageOption !== 'all' && !STAGE_ORDER.includes(stageOption)) throw new Error(`Unknown --stage=${stageOption}`);

  const previousResults = readJson(PREVIOUS_RESULTS_PATH);
  const previousSummary = readJson(PREVIOUS_SUMMARY_PATH);
  const previousDirectionCandidateAudit = auditPreviousDirectionCandidate(previousResults, previousSummary);
  const allResults = loadSeedResults(stageOption);
  const stages = [];

  const smoke32Conditions = buildCombos(SCAN_AXES);
  const smoke32 = createStage('smoke32', 32, 1000, 50, [12345], smoke32Conditions);
  stages.push(smoke32);
  if (stageOption === 'all' || stageOption === 'smoke32') runStage(smoke32, smoke32Conditions, allResults);
  else if (allResults.some((row) => row.stageName === 'smoke32')) { smoke32.executed = true; smoke32.conditionCount = smoke32Conditions.length; }
  else { smoke32.skipped = true; smoke32.skipReason = `Skipped by --stage=${stageOption}.`; }

  const confirm32Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'smoke32'), 10);
  const confirm32 = createStage('confirm32', 32, 1000, 50, [12345, 23456, 34567], confirm32Conditions);
  stages.push(confirm32);
  if (stageOption === 'all' || stageOption === 'confirm32') {
    if (confirm32Conditions.length > 0) runStage(confirm32, confirm32Conditions, allResults);
    else { confirm32.skipped = true; confirm32.skipReason = 'No 32³ single-seed candidate or direction candidate available for three-seed confirmation.'; }
  } else if (allResults.some((row) => row.stageName === 'confirm32')) { confirm32.executed = true; confirm32.conditionCount = confirm32Conditions.length; }
  else { confirm32.skipped = true; confirm32.skipReason = `Skipped by --stage=${stageOption}.`; }

  const smoke64Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'confirm32'), 3, true);
  const smoke64 = createStage('smoke64', 64, 1000, 50, [12345], smoke64Conditions);
  stages.push(smoke64);
  if (stageOption === 'all' || stageOption === 'smoke64') {
    if (smoke64Conditions.length > 0) runStage(smoke64, smoke64Conditions, allResults);
    else { smoke64.skipped = true; smoke64.skipReason = 'No 32³ three-seed full stability candidate available for 64³ smoke.'; }
  } else if (allResults.some((row) => row.stageName === 'smoke64')) { smoke64.executed = true; smoke64.conditionCount = smoke64Conditions.length; }
  else { smoke64.skipped = true; smoke64.skipReason = `Skipped by --stage=${stageOption}.`; }

  const full64Conditions = groupCandidateCombos(allResults.filter((row) => row.stageName === 'smoke64' && row.candidate), 1);
  const full64 = createStage('full64', 64, 3000, 50, [12345, 23456, 34567], full64Conditions);
  stages.push(full64);
  if (stageOption === 'all' || stageOption === 'full64') {
    if (full64Conditions.length > 0) runStage(full64, full64Conditions, allResults);
    else { full64.skipped = true; full64.skipReason = 'No 64³ smoke stability candidate available for full three-seed validation.'; }
  } else if (allResults.some((row) => row.stageName === 'full64')) { full64.executed = true; full64.conditionCount = full64Conditions.length; }
  else { full64.skipped = true; full64.skipReason = `Skipped by --stage=${stageOption}.`; }

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
    experimentName: 'experiment:v212-real-runtime-stability-narrow-retune',
    version: 'v2.1.2',
    createdAt,
    commit: gitValue('git rev-parse HEAD', 'unknown'),
    branch: gitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
    runType: 'real-runtime-v0',
    dynamicsType: 'aeterna-runtime-v0',
    runtimeAvailable: true,
    validationPurpose: 'narrow retune around best direction candidate',
    notes: 'Condition D narrow scan around Experiment 022 direction candidate. PHEROMONE_FEEDBACK_ENABLED remained false.',
  };
  const payload = {
    runMeta,
    sourceArtifacts: {
      previousResults: 'experiments/v2.1.2-real-runtime-stability-retune-results.json',
      previousSummary: 'experiments/v2.1.2-real-runtime-stability-retune-summary.json',
      previousDoc: 'docs/v2.1.2-real-runtime-stability-retune.md',
    },
    centerCandidate: CENTER_CANDIDATE,
    fixedParams: FIXED_PARAMS,
    scanAxes: SCAN_AXES,
    previousDirectionCandidateAudit,
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
      sourceExperiment: 'experiments/v2.1.2-real-runtime-stability-narrow-retune-results.json',
      interpretationRunType: 'real-runtime-v0-stability-narrow-retune',
    },
    centerCandidate: CENTER_CANDIDATE,
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
  if (!fs.existsSync(PREVIOUS_DOC_PATH)) {
    // eslint-disable-next-line no-console
    console.log(`Missing previous doc artifact: ${path.relative(ROOT, PREVIOUS_DOC_PATH)}`);
  }
}

main();
