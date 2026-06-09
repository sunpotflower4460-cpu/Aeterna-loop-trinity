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

const ROOT = path.join(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'experiments', 'history-alpha-narrow-scan-results.json');
const COUPLING_PATH = path.join(ROOT, 'experiments', 'memory-coupling-narrow-scan-results.json');
const OUTPUT_PATH = path.join(ROOT, 'experiments', 'v2.1.2-combined-validation-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-follow-up-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-follow-up-results.md');
const SEEDS = Object.freeze([12345, 23456, 34567]);
const PHEROMONE_CANDIDATE = Object.freeze({
  PHEROMONE_DIFFUSION: 0,
  PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.95,
  PHEROMONE_DEPOSIT: 0.02,
  PHEROMONE_DEPOSIT_MODE: 'top-10-percent-amplitude',
});
const BASE_CONFIG = Object.freeze({ ...DEFAULT_SCAN_CONFIG, seed: 12345, seedA: 12345, seedB: 67890 });

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureInputs() {
  const missing = [HISTORY_PATH, COUPLING_PATH].filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) throw new Error(`Missing required narrow scan result files: ${missing.join(', ')}`);
}

function energyDeltaRatio(start, end) {
  return (end - start) / Math.max(Math.abs(start), 1e-8);
}

function averageMemoryDifference(result) {
  const values = [result.memoryFieldDifferenceA_end, result.memoryFieldDifferenceB_end].filter((value) => value !== null && value !== undefined);
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectResult(output) {
  return output.results.find((result) => result.candidate) ?? output.results.find((result) => result.provisional) ?? output.results[0] ?? null;
}

function combinedDecision(result) {
  const memoryDifference = averageMemoryDifference(result) ?? 0;
  const passes = result.finalVortexCount > 0 &&
    memoryDifference >= 0.05 &&
    result.fieldABDistance_end >= 0.01 && result.fieldABDistance_end <= 0.1 &&
    result.memoryABDistance_end > 0.005 &&
    result.pheromoneActiveRatio_end < 0.95 &&
    result.pheromoneSpatialEntropy_end < 0.9 &&
    result.amplitudeStdA_end > 0.02 && result.amplitudeStdB_end > 0.02 &&
    Math.abs(result.fieldEnergyProxyDeltaRatio) < 0.5;
  if (passes) return 'candidate';

  const blockers = [];
  if (result.finalVortexCount <= 0) blockers.push('vortex lost');
  if (memoryDifference < 0.05) blockers.push('memoryFieldDifference below 0.05');
  if (result.fieldABDistance_end < 0.01) blockers.push('A/B identity collapse risk');
  if (result.fieldABDistance_end > 0.1) blockers.push('A/B remain too separate');
  if (result.pheromoneActiveRatio_end >= 0.95) blockers.push('pheromone active ratio too broad');
  if (result.pheromoneSpatialEntropy_end >= 0.9) blockers.push('pheromone entropy too broad');
  if (Math.abs(result.fieldEnergyProxyDeltaRatio) >= 0.5) blockers.push('field energy proxy changed too much');
  return `not accepted: ${blockers.join('; ')}`;
}

function buildValidationResult(seed, historyCandidate, couplingCandidate) {
  const config = Object.freeze({ ...BASE_CONFIG, seed, seedA: seed, seedB: seed + 555 });
  const condition = {
    conditionName: `combined seed=${seed}`,
    MEMORY_ENABLED: true,
    HISTORY_ALPHA: historyCandidate.HISTORY_ALPHA,
    MEMORY_WEIGHT: historyCandidate.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: 'fixed',
    MEMORY_BLEND_VELOCITY: true,
    MEMORY_VELOCITY_SCALE: 0.1,
    COUPLING_ENABLED: true,
    COUPLING_TYPE: 'memory',
    COUPLING_G: couplingCandidate.COUPLING_G,
    MEMORY_COUPLING_ENABLED: true,
    MEMORY_COUPLING_WEIGHT: couplingCandidate.MEMORY_COUPLING_WEIGHT,
    PHEROMONE_ENABLED: true,
    PHEROMONE_FEEDBACK_ENABLED: false,
    PHEROMONE_UPDATE_INTERVAL: 10,
    PHEROMONE_RETENTION: 0.99005,
    ...PHEROMONE_CANDIDATE,
  };
  const run = runDualFieldCondition(condition, config, {
    createPheromoneField: true,
    updatePheromoneField: updatePheromoneFieldByDepositMode,
  });
  const { params, initialMetrics, finalMetrics, couplingMetrics, pheromoneStats } = run;
  const result = {
    seed,
    HISTORY_ALPHA: params.HISTORY_ALPHA,
    MEMORY_WEIGHT: params.MEMORY_WEIGHT,
    MEMORY_WEIGHT_MODE: params.MEMORY_WEIGHT_MODE,
    MEMORY_VELOCITY_SCALE: params.MEMORY_VELOCITY_SCALE,
    MEMORY_COUPLING_WEIGHT: params.MEMORY_COUPLING_WEIGHT,
    COUPLING_G: params.COUPLING_G,
    effectiveMemoryCoupling: couplingMetrics?.effectiveMemoryCoupling ?? params.COUPLING_G * params.MEMORY_COUPLING_WEIGHT,
    PHEROMONE_DIFFUSION: params.PHEROMONE_DIFFUSION,
    PHEROMONE_DEPOSIT_THRESHOLD_RATIO: params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO,
    PHEROMONE_DEPOSIT: params.PHEROMONE_DEPOSIT,
    PHEROMONE_DEPOSIT_MODE: params.PHEROMONE_DEPOSIT_MODE,
    initialVortexCount: run.initialVortexCount,
    finalVortexCount: run.finalVortexCount,
    vortexLifetimeAverage: finalMetrics.vortexLifetimeAverage,
    memoryFieldDifferenceA_end: finalMetrics.memoryFieldDifferenceA,
    memoryFieldDifferenceB_end: finalMetrics.memoryFieldDifferenceB,
    fieldABDistance_end: finalMetrics.fieldABDistance,
    memoryABDistance_end: finalMetrics.memoryABDistance,
    R_AB_orderDifferenceRatio_end: finalMetrics.R_AB_orderDifferenceRatio,
    pheromoneActiveRatio_end: pheromoneStats.pheromoneActiveRatio,
    pheromoneSpatialEntropy_end: pheromoneStats.pheromoneSpatialEntropy,
    pheromoneEnergyL2_end: pheromoneStats.pheromoneEnergyL2,
    pheromoneMax_end: pheromoneStats.pheromoneMax,
    amplitudeMeanA_end: finalMetrics.amplitudeMeanA,
    amplitudeMeanB_end: finalMetrics.amplitudeMeanB,
    amplitudeStdA_end: finalMetrics.amplitudeStdA,
    amplitudeStdB_end: finalMetrics.amplitudeStdB,
    fieldEnergyProxy_start: initialMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxy_end: finalMetrics.fieldEnergyProxyCombined,
    fieldEnergyProxyDeltaRatio: energyDeltaRatio(initialMetrics.fieldEnergyProxyCombined, finalMetrics.fieldEnergyProxyCombined),
    runType: 'surrogate-headless',
    gridSize: config.gridSize,
    dynamicsType: 'diagnostic-surrogate',
    decision: 'pending',
    notes: run.nonFiniteDetected ? 'Non-finite values detected in sampled arrays.' : 'Combined surrogate validation completed with pheromone feedback disabled.',
  };
  result.decision = combinedDecision(result);
  return result;
}

function sortedTop(output, count = 5) {
  return [...output.results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, count);
}

function createSummary({ historyOutput, couplingOutput, validationOutput }) {
  const historyTop = sortedTop(historyOutput, 5);
  const couplingTop = sortedTop(couplingOutput, 5);
  const historySelected = selectResult(historyOutput);
  const couplingSelected = selectResult(couplingOutput);
  const acceptedCombined = validationOutput.results.filter((result) => result.decision === 'candidate');
  const combinedSkipped = validationOutput.status === 'skipped';
  const historyHasCandidate = historyOutput.results.some((result) => result.candidate);
  const couplingHasCandidate = couplingOutput.results.some((result) => result.candidate);
  const canProceedReal64 = acceptedCombined.length === validationOutput.results.length && acceptedCombined.length > 0;
  const blockingIssues = [];

  if (!historyHasCandidate) blockingIssues.push('HISTORY_ALPHA narrow scan did not reach memoryFieldDifference >= 0.05.');
  if (!couplingHasCandidate) blockingIssues.push('Memory Coupling narrow scan did not find an accepted meeting-with-distinction row.');
  if (combinedSkipped) blockingIssues.push(validationOutput.skipReason);
  if (!combinedSkipped && acceptedCombined.length !== validationOutput.results.length) blockingIssues.push('Combined surrogate validation was not accepted for every seed.');

  return {
    runMeta: {
      version: 'v2.1.2',
      createdAt: new Date().toISOString(),
      sourceExperiments: [
        'experiments/history-alpha-narrow-scan-results.json',
        'experiments/memory-coupling-narrow-scan-results.json',
        'experiments/v2.1.2-combined-validation-results.json',
      ],
      interpretationRunType: 'surrogate-headless-follow-up',
    },
    historyAlphaNarrow: {
      status: historyHasCandidate ? 'candidate-found' : 'provisional-only',
      topCandidates: historyTop,
      rejectedPatterns: historyOutput.results.filter((result) => !result.candidate && !result.provisional).slice(0, 5).map((result) => result.conditionName),
      recommendedParams: historySelected ? {
        HISTORY_ALPHA: historySelected.HISTORY_ALPHA,
        MEMORY_WEIGHT: historySelected.MEMORY_WEIGHT,
        MEMORY_WEIGHT_MODE: historySelected.MEMORY_WEIGHT_MODE,
        MEMORY_VELOCITY_SCALE: historySelected.MEMORY_VELOCITY_SCALE,
      } : {},
      needsRescan: !historyHasCandidate,
      notes: historyHasCandidate ? 'At least one row reached the provisional memory trace band.' : 'Closest row is provisional; memoryFieldDifference remains below 0.05.',
    },
    memoryCouplingNarrow: {
      status: couplingHasCandidate ? 'candidate-found' : 'provisional-only',
      topCandidates: couplingTop,
      rejectedPatterns: couplingOutput.rejectedPatterns ?? [],
      recommendedParams: couplingSelected ? {
        MEMORY_COUPLING_WEIGHT: couplingSelected.MEMORY_COUPLING_WEIGHT,
        COUPLING_G: couplingSelected.COUPLING_G,
        effectiveMemoryCoupling: couplingSelected.effectiveMemoryCoupling,
      } : {},
      needsRescan: !couplingHasCandidate,
      notes: couplingHasCandidate ? 'At least one row reached the A/B meeting-with-distinction band.' : 'Closest row is provisional; accepted coupling candidate was not found.',
    },
    combinedValidation: {
      status: combinedSkipped ? 'skipped' : (canProceedReal64 ? 'accepted' : 'not-accepted'),
      results: validationOutput.results,
      recommendedParams: !combinedSkipped && validationOutput.results[0] ? {
        HISTORY_ALPHA: validationOutput.results[0].HISTORY_ALPHA,
        MEMORY_WEIGHT: validationOutput.results[0].MEMORY_WEIGHT,
        MEMORY_WEIGHT_MODE: validationOutput.results[0].MEMORY_WEIGHT_MODE,
        MEMORY_VELOCITY_SCALE: validationOutput.results[0].MEMORY_VELOCITY_SCALE,
        MEMORY_COUPLING_WEIGHT: validationOutput.results[0].MEMORY_COUPLING_WEIGHT,
        COUPLING_G: validationOutput.results[0].COUPLING_G,
        effectiveMemoryCoupling: validationOutput.results[0].effectiveMemoryCoupling,
        ...PHEROMONE_CANDIDATE,
      } : {},
      needsRescan: !canProceedReal64,
      notes: combinedSkipped ? validationOutput.skipReason : 'Combined surrogate run completed across configured seeds.',
    },
    decision: {
      canProceedToV22Planning: false,
      canProceedToReal64Validation: canProceedReal64,
      needsAdditionalV212Scan: !canProceedReal64,
      blockingIssues,
      recommendedNextStep: canProceedReal64 ? 'Proceed to real 64^3 validation before v2.2 planning.' : 'Run another v2.1.2 narrow scan focused on the listed blocking metrics before real 64^3 validation or v2.2 planning.',
    },
  };
}

function fmt(value, digits = 6) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

function writeDoc(summary) {
  const historyRows = summary.historyAlphaNarrow.topCandidates.map((result, index) => (
    `| ${index + 1} | ${result.HISTORY_ALPHA} | ${result.MEMORY_WEIGHT} | ${fmt(result.memoryFieldDifferenceA_end)} | ${result.finalVortexCount}/${result.initialVortexCount} | ${fmt(result.amplitudeMeanA_end)} | ${fmt(result.fieldEnergyProxyDeltaRatio)} | ${result.candidate ? 'candidate' : (result.provisional ? 'provisional' : 'not accepted')} |`
  )).join('\n');
  const couplingRows = summary.memoryCouplingNarrow.topCandidates.map((result, index) => (
    `| ${index + 1} | ${fmt(result.effectiveMemoryCoupling, 3)} | ${result.MEMORY_COUPLING_WEIGHT} | ${result.COUPLING_G} | ${fmt(result.fieldABDistance_end)} | ${fmt(result.memoryABDistance_end)} | ${result.finalVortexCount}/${result.initialVortexCount} | ${result.candidate ? 'candidate' : (result.provisional ? 'provisional' : (result.rejected ? 'rejected' : 'not accepted'))} |`
  )).join('\n');
  const validationRows = summary.combinedValidation.results.length > 0
    ? summary.combinedValidation.results.map((result) => `| ${result.seed} | ${result.finalVortexCount}/${result.initialVortexCount} | ${fmt(averageMemoryDifference(result))} | ${fmt(result.fieldABDistance_end)} | ${fmt(result.pheromoneActiveRatio_end)} | ${fmt(result.pheromoneSpatialEntropy_end)} | ${fmt(result.fieldEnergyProxyDeltaRatio)} | ${result.decision} |`).join('\n')
    : '| n/a | skipped | n/a | n/a | n/a | n/a | n/a | skipped |';
  const chosenDecision = summary.decision.canProceedToReal64Validation
    ? 'Proceed to real 64³ validation'
    : 'Proceed to another v2.1.2 narrow scan';

  const markdown = `# AeternaLoop-Trinity v2.1.2 Follow-up Results

## Summary

The follow-up scan stayed within the v2.1.2 surrogate/headless tuning scope. It did not start v2.2 features or real 64³ validation. HISTORY_ALPHA and Memory Coupling results determine whether the combined validation can be accepted.

## 1. HISTORY_ALPHA Narrow Scan

### Top Candidates

| rank | HISTORY_ALPHA | MEMORY_WEIGHT | memoryFieldDifference | vortex | amplitude | energy | decision |
|---:|---:|---:|---:|---|---:|---:|---|
${historyRows}

### Interpretation

${summary.historyAlphaNarrow.notes}

### Recommended Params

\`${JSON.stringify(summary.historyAlphaNarrow.recommendedParams)}\`

### Need Rescan?

${summary.historyAlphaNarrow.needsRescan ? 'Yes.' : 'No for the surrogate candidate band.'}

---

## 2. Memory Coupling Narrow Scan

### Top Candidates

| rank | effectiveCoupling | MEMORY_COUPLING_WEIGHT | COUPLING_G | fieldABDistance | memoryABDistance | vortex | decision |
|---:|---:|---:|---:|---:|---:|---|---|
${couplingRows}

### Interpretation

${summary.memoryCouplingNarrow.notes}

### Recommended Params

\`${JSON.stringify(summary.memoryCouplingNarrow.recommendedParams)}\`

### Need Rescan?

${summary.memoryCouplingNarrow.needsRescan ? 'Yes.' : 'No for the surrogate candidate band.'}

---

## 3. Combined Validation

### Result Summary

| seed | vortex | memoryFieldDifference | fieldABDistance | pheromoneActiveRatio | entropy | energy | decision |
|---:|---|---:|---:|---:|---:|---:|---|
${validationRows}

### Interpretation

${summary.combinedValidation.notes}

### Recommended Params

\`${JSON.stringify(summary.combinedValidation.recommendedParams)}\`

### Need Rescan?

${summary.combinedValidation.needsRescan ? 'Yes.' : 'No.'}

---

## 4. Decision

${chosenDecision}

- Proceed to another v2.1.2 narrow scan: ${summary.decision.needsAdditionalV212Scan ? 'Yes' : 'No'}
- Proceed to real 64³ validation: ${summary.decision.canProceedToReal64Validation ? 'Yes' : 'No'}
- Proceed to v2.2 planning: ${summary.decision.canProceedToV22Planning ? 'Yes' : 'No'}
- Rework model or metrics before continuing: ${summary.decision.blockingIssues.length > 0 ? 'Maybe, if the next narrow scan repeats these blockers.' : 'No immediate rework required.'}

Blocking issues:
${summary.decision.blockingIssues.map((issue) => `- ${issue}`).join('\n') || '- None.'}

## 5. Recommended Next Step

${summary.decision.recommendedNextStep}
`;

  fs.writeFileSync(DOC_PATH, markdown);
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  ensureInputs();
  const historyOutput = readJson(HISTORY_PATH);
  const couplingOutput = readJson(COUPLING_PATH);
  const historyCandidate = selectResult(historyOutput);
  const couplingCandidate = selectResult(couplingOutput);
  const historyHasCandidate = historyOutput.results.some((result) => result.candidate);
  const couplingHasCandidate = couplingOutput.results.some((result) => result.candidate);
  const startedAt = new Date().toISOString();
  const runMeta = createRunMeta({
    experimentName: 'experiment:v212-combined-validation',
    config: BASE_CONFIG,
    notes: 'Combined surrogate validation using selected narrow-scan candidates and the fixed pheromone localization candidate. Pheromone feedback remains disabled.',
  });
  let validationOutput;

  if (!historyCandidate || !couplingCandidate || !historyHasCandidate || !couplingHasCandidate) {
    const missing = [];
    if (!historyHasCandidate) missing.push('HISTORY_ALPHA narrow scan has no accepted candidate');
    if (!couplingHasCandidate) missing.push('Memory Coupling narrow scan has no accepted candidate');
    validationOutput = {
      runMeta,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'skipped',
      skipReason: `Combined validation skipped because ${missing.join(' and ')}. Provisional rows are recorded in the follow-up summary but are not treated as stable enough for combined acceptance.`,
      seeds: [],
      fixedPheromoneCandidate: PHEROMONE_CANDIDATE,
      selectedHistoryCandidate: historyCandidate,
      selectedMemoryCouplingCandidate: couplingCandidate,
      results: [],
    };
  } else {
    const results = SEEDS.map((seed) => buildValidationResult(seed, historyCandidate, couplingCandidate));
    validationOutput = {
      runMeta,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'completed',
      seeds: SEEDS,
      fixedPheromoneCandidate: PHEROMONE_CANDIDATE,
      selectedHistoryCandidate: historyCandidate,
      selectedMemoryCouplingCandidate: couplingCandidate,
      candidateCriteria: [
        'vortices remain',
        'memoryFieldDifference reaches or approaches 0.05',
        'fieldABDistance_end lands in 0.01-0.1',
        'pheromoneActiveRatio_end does not pin to 1',
        'pheromoneSpatialEntropy_end is not near 1',
        'amplitudeStd remains non-zero',
        'fieldEnergyProxyDeltaRatio remains bounded',
        'A/B do not become completely identical',
      ],
      results,
      candidates: results.filter((result) => result.decision === 'candidate').map((result) => result.seed),
    };
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(validationOutput, null, 2)}\n`);
  const summary = createSummary({ historyOutput, couplingOutput, validationOutput });
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(summary);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(`Wrote ${DOC_PATH}`);
  if (validationOutput.status === 'skipped') console.warn(validationOutput.skipReason);
}

main();
