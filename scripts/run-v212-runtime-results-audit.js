#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRIMARY_RESULTS = 'experiments/v2.1.2-real-runtime-validation-results.json';
const PRIMARY_SUMMARY = 'experiments/v2.1.2-real-runtime-validation-summary.json';
const PRIMARY_DOC = 'docs/v2.1.2-real-runtime-validation.md';
const REAL64_RESULTS = 'experiments/v2.1.2-real64-validation-results.json';
const REAL64_SUMMARY = 'experiments/v2.1.2-real64-validation-summary.json';
const REAL64_DOC = 'docs/v2.1.2-real64-validation.md';
const OUTPUT_JSON = 'experiments/v2.1.2-runtime-results-audit.json';
const OUTPUT_DOC = 'docs/v2.1.2-runtime-results-audit.md';
const REQUIRED_SOURCE_FILES = Object.freeze([
  'package.json',
  'src/runtime/aeterna-runtime-v0.js',
  'src/runtime/create-aeterna-fields.js',
  'src/runtime/step-aeterna-runtime-v0.js',
  'src/params/v2.1.2-candidate-params.js',
  'scripts/run-v212-real-runtime-validation.js',
  PRIMARY_RESULTS,
  PRIMARY_SUMMARY,
  PRIMARY_DOC,
  REAL64_RESULTS,
  REAL64_SUMMARY,
  REAL64_DOC,
  'experiments/v2.1.2-coupling-mechanism-audit-summary.json',
  'docs/v2.1.2-coupling-mechanism-audit.md',
  'docs/experiment-log.md',
  'docs/v2.1.2-candidate-notes.md',
  'docs/implementation-phases.md',
]);
const STAGE_KEYS = Object.freeze({
  'stage-1-32-smoke': 'stage32Smoke',
  'stage-2-64-smoke': 'stage64Smoke',
  'stage-3-64-full': 'stage64Full',
});

function fullPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(fullPath(relativePath));
}

function readJson(relativePath) {
  if (!exists(relativePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath(relativePath), 'utf8'));
  } catch (error) {
    return { __parseError: error.message };
  }
}

function readText(relativePath) {
  if (!exists(relativePath)) return '';
  return fs.readFileSync(fullPath(relativePath), 'utf8');
}

function gitValue(command, fallback) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch (_error) {
    return fallback;
  }
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(6) : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.join('<br>');
  return String(value);
}

function metricIssue(row) {
  const issues = [];
  const pairs = [
    ['fieldABDistance_start', row.fieldABDistance_start],
    ['fieldABDistance_end', row.fieldABDistance_end],
    ['memoryABDistance_end', row.memoryABDistance_end],
    ['memoryFieldDifferenceA_end', row.memoryFieldDifferenceA_end],
    ['memoryFieldDifferenceB_end', row.memoryFieldDifferenceB_end],
    ['pheromoneActiveRatio_end', row.pheromoneActiveRatio_end],
    ['pheromoneSpatialEntropy_end', row.pheromoneSpatialEntropy_end],
    ['amplitudeStdA_end', row.amplitudeStdA_end],
    ['amplitudeStdB_end', row.amplitudeStdB_end],
    ['fieldEnergyProxyDeltaRatio', row.fieldEnergyProxyDeltaRatio],
    ['runtimeMsTotal', row.runtimeMsTotal],
    ['memoryMBPeak', row.memoryMBPeak],
  ];
  for (const [name, value] of pairs) {
    if (value !== null && value !== undefined && !Number.isFinite(value)) issues.push(`${name} is non-finite`);
  }
  if (row.finalVortexCount === 0) issues.push('finalVortexCount is zero');
  if (row.fieldABDistance_end >= row.fieldABDistance_start) issues.push('fieldABDistance did not decrease');
  if (row.fieldABDistance_end < 0.01 || row.fieldABDistance_end > 0.15) issues.push('fieldABDistance_end outside 0.01-0.15 gate');
  if (row.memoryABDistance_end < 0.005) issues.push('memoryABDistance_end below 0.005');
  if (row.memoryFieldDifferenceA_end < 0.05 || row.memoryFieldDifferenceA_end > 0.35) issues.push('memoryFieldDifferenceA outside 0.05-0.35');
  if (row.memoryFieldDifferenceB_end < 0.05 || row.memoryFieldDifferenceB_end > 0.35) issues.push('memoryFieldDifferenceB outside 0.05-0.35');
  if (row.pheromoneActiveRatio_end === 1 || row.pheromoneActiveRatio_end >= 0.9) issues.push('pheromoneActiveRatio near fog/1.0');
  if (row.pheromoneSpatialEntropy_end >= 0.95) issues.push('pheromoneSpatialEntropy too close to uniform');
  if (row.amplitudeStdA_end < 0.01 || row.amplitudeStdB_end < 0.01) issues.push('amplitudeStd too small');
  if (Math.abs(row.fieldEnergyProxyDeltaRatio) > 0.25) issues.push('fieldEnergyProxyDeltaRatio outside ±0.25');
  return issues;
}

function createEmptyStageAudit() {
  return {
    stage32Smoke: { executed: false, candidateFound: false, blockingIssues: [] },
    stage64Smoke: { executed: false, candidateFound: false, blockingIssues: [] },
    stage64Full: { executed: false, candidateFound: false, blockingIssues: [] },
  };
}

function auditStages(resultsData, summaryData) {
  const stageAudit = createEmptyStageAudit();
  const results = Array.isArray(resultsData?.results) ? resultsData.results : [];
  const stages = Array.isArray(resultsData?.stages) ? resultsData.stages : [];

  for (const stage of stages) {
    const key = STAGE_KEYS[stage.validationStage];
    if (!key) continue;
    const stageResults = results.filter((result) => result.validationStage === stage.validationStage);
    stageAudit[key].executed = stage.status === 'completed' || stageResults.length > 0;
    if (!stageAudit[key].executed && stage.status) stageAudit[key].blockingIssues.push(stage.status);
  }

  for (const [stageName, key] of Object.entries(STAGE_KEYS)) {
    const stageResults = results.filter((result) => result.validationStage === stageName);
    if (stageResults.length > 0) stageAudit[key].executed = true;
    const conditionDCandidates = stageResults.filter((result) => result.conditionName === 'Condition D: memory + coupling + pheromone trace' && result.candidate === true);
    stageAudit[key].candidateFound = key === 'stage64Full' ? conditionDCandidates.length >= 3 : conditionDCandidates.length > 0;
    if (stageAudit[key].executed && !stageAudit[key].candidateFound) {
      const conditionD = stageResults.filter((result) => result.conditionName === 'Condition D: memory + coupling + pheromone trace');
      const issues = conditionD.flatMap((row) => metricIssue(row));
      stageAudit[key].blockingIssues.push(...Array.from(new Set(issues)));
      if (conditionD.length === 0) stageAudit[key].blockingIssues.push('Condition D result missing');
    }
  }

  const decision = resultsData?.decision || summaryData?.decision || {};
  if (decision.runtime32CandidateFound === true) stageAudit.stage32Smoke.candidateFound = true;
  if (decision.runtime64SmokeCandidateFound === true) stageAudit.stage64Smoke.candidateFound = true;
  if (decision.runtime64FullCandidateFound === true) stageAudit.stage64Full.candidateFound = true;

  return stageAudit;
}

function normalizeTopCandidates(resultsData, summaryData) {
  const source = Array.isArray(summaryData?.topCandidates) ? summaryData.topCandidates : (Array.isArray(resultsData?.candidates) ? resultsData.candidates : []);
  return source.filter((result) => result && result.candidate === true).slice(0, 10);
}

function createDecision(stageAudit, runtimeFoundationAudit, sourceDecision, blockingIssues) {
  const runtime64FullCandidateFound = sourceDecision?.runtime64FullCandidateFound === true || stageAudit.stage64Full.candidateFound === true;
  const canProceedToV22Planning = runtime64FullCandidateFound;
  const realRuntimeReady = runtimeFoundationAudit.realRuntimeV0Found && runtimeFoundationAudit.usesDiagnosticSurrogate === false;
  let recommendedNextStep = '';

  if (!realRuntimeReady) {
    recommendedNextStep = 'Continue real-runtime-v0 implementation.';
  } else if (canProceedToV22Planning) {
    recommendedNextStep = 'Proceed to v2.2 planning only; do not start v2.2 implementation.';
  } else if (stageAudit.stage64Smoke.candidateFound && !stageAudit.stage64Full.candidateFound) {
    recommendedNextStep = 'Run real-runtime-v0 64³ full three-seed validation.';
  } else if (stageAudit.stage32Smoke.candidateFound && !stageAudit.stage64Smoke.candidateFound) {
    recommendedNextStep = 'Run real-runtime-v0 64³ smoke.';
  } else if (stageAudit.stage64Full.executed && !stageAudit.stage64Full.candidateFound) {
    recommendedNextStep = 'Continue v2.1.2 runtime tuning or inspect failure mode.';
  } else {
    recommendedNextStep = 'Continue v2.1.2 runtime tuning before v2.2 planning.';
  }

  return {
    canProceedToV22Planning,
    canStartV22Implementation: false,
    needs64Smoke: realRuntimeReady && stageAudit.stage32Smoke.candidateFound && !stageAudit.stage64Smoke.candidateFound,
    needs64FullValidation: realRuntimeReady && stageAudit.stage64Smoke.candidateFound && !stageAudit.stage64Full.candidateFound,
    needsRuntimeRework: !realRuntimeReady || sourceDecision?.needsRuntimeRework === true,
    needsAdditionalV212Scan: !canProceedToV22Planning && realRuntimeReady,
    needsMetricsRework: blockingIssues.some((issue) => issue.toLowerCase().includes('non-finite') || issue.toLowerCase().includes('missing')),
    recommendedNextStep,
  };
}

function stageRow(label, stage) {
  return `| ${label} | ${stage.executed} | ${stage.candidateFound} | ${stage.blockingIssues.length > 0 ? stage.blockingIssues.join('<br>') : 'No blocking issue recorded.'} |`;
}

function candidateRow(result) {
  const memoryTrace = `${formatValue(result.memoryFieldDifferenceA_end)} / ${formatValue(result.memoryFieldDifferenceB_end)}`;
  return `| ${result.validationStage || ''} | ${result.conditionName || ''} | ${formatValue(result.seed)} | ${formatValue(result.actualGridSize || result.requestedGridSize)} | ${formatValue(result.fieldABDistance_start)} | ${formatValue(result.fieldABDistance_end)} | ${memoryTrace} | ${formatValue(result.finalVortexCount)} | ${formatValue(result.pheromoneActiveRatio_end)} | ${formatValue(result.fieldEnergyProxyDeltaRatio)} | ${formatValue(result.runtimeMsTotal)} | ${result.decision || result.auditNote || ''} |`;
}

function writeAuditDoc(audit) {
  const foundationRows = Object.entries(audit.runtimeFoundationAudit).map(([key, value]) => `| ${key} | ${formatValue(value)} |`).join('\n');
  const candidateRows = audit.topCandidates.length > 0 ? audit.topCandidates.map(candidateRow).join('\n') : '| None |  |  |  |  |  |  |  |  |  |  |  |';
  const rejectedRows = audit.rejectedPatterns.length > 0
    ? audit.rejectedPatterns.map((pattern) => `- ${pattern.validationStage || 'unknown'} / ${pattern.conditionName || 'unknown'} / seed ${formatValue(pattern.seed)}: ${pattern.decision || pattern.reason || 'rejected'}`).join('\n')
    : '- None recorded.';
  const blockingRows = audit.blockingIssues.length > 0 ? audit.blockingIssues.map((issue) => `- ${issue}`).join('\n') : '- None recorded.';
  const decisionLabel = audit.decision.canProceedToV22Planning
    ? 'Proceed to v2.2 planning'
    : (!audit.runtimeFoundationAudit.realRuntimeV0Found ? 'Continue real-runtime-v0 implementation' : (audit.decision.needs64Smoke ? 'Run 64³ smoke' : (audit.decision.needs64FullValidation ? 'Run 64³ full validation' : 'Continue v2.1.2 tuning')));

  const doc = `# AeternaLoop-Trinity v2.1.2 Runtime Results Audit

## Summary

Experiment 021 audited existing v2.1.2 validation artifacts without rerunning the heavy simulation. The audit separates real-runtime-v0 evidence from older surrogate/real64 gate evidence and keeps v2.2 implementation blocked.

Result: ${audit.decision.canProceedToV22Planning ? 'v2.2 planning is allowed because 64³ three-seed validation passed.' : 'v2.2 planning is not allowed because 64³ three-seed real-runtime-v0 candidate evidence is not present.'}

## Source Files

${audit.runMeta.sourceResults.map((file) => `- ${file}`).join('\n')}

Missing files checked during audit:
${audit.blockingIssues.filter((issue) => issue.startsWith('Missing required source file')).map((issue) => `- ${issue.replace('Missing required source file: ', '')}`).join('\n') || '- None.'}

## Runtime Foundation Audit

| item | result |
|---|---|
${foundationRows}

## Stage Audit

| stage | executed | candidateFound | notes |
|---|---:|---:|---|
${stageRow('32³ smoke', audit.stageAudit.stage32Smoke)}
${stageRow('64³ smoke', audit.stageAudit.stage64Smoke)}
${stageRow('64³ full', audit.stageAudit.stage64Full)}

## Top Candidates

| stage | condition | seed | grid | fieldABDistance start | fieldABDistance end | memoryTrace | vortex | pheromoneActiveRatio | energyDelta | runtime | decision |
|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---|
${candidateRows}

## Rejected Patterns

${rejectedRows}

## Blocking Issues

${blockingRows}

## Interpretation

### Did real-runtime-v0 exist?

${audit.runtimeFoundationAudit.realRuntimeV0Found ? 'Yes. The audited artifacts report a real-runtime-v0 foundation with A/B fields and live metrics.' : 'No. The audited artifacts do not prove a usable real-runtime-v0 foundation.'}

### Did 32³ smoke pass?

${audit.stageAudit.stage32Smoke.candidateFound ? 'Yes.' : 'No. The 32³ smoke stage did not produce a qualifying Condition D candidate.'}

### Did 64³ smoke pass?

${audit.stageAudit.stage64Smoke.candidateFound ? 'Yes.' : 'No. The 64³ smoke stage did not produce a qualifying Condition D candidate.'}

### Did 64³ full validation pass?

${audit.stageAudit.stage64Full.candidateFound ? 'Yes.' : 'No. The 64³ three-seed full validation did not produce the required candidate evidence.'}

### Is v2.2 planning allowed?

${audit.decision.canProceedToV22Planning ? 'Yes. Planning is allowed, but implementation remains blocked.' : 'No. Planning is blocked until real-runtime-v0 64³ three-seed candidate evidence exists.'}

### Is v2.2 implementation allowed?

No. This audit is a planning gate only, and canStartV22Implementation remains false.

## Decision

- ${decisionLabel}

## Recommended Next Step

${audit.decision.recommendedNextStep}
`;

  fs.writeFileSync(fullPath(OUTPUT_DOC), doc);
}

function main() {
  const resultsData = readJson(PRIMARY_RESULTS);
  const summaryData = readJson(PRIMARY_SUMMARY);
  const real64Summary = readJson(REAL64_SUMMARY);
  const missingFiles = REQUIRED_SOURCE_FILES.filter((file) => !exists(file));
  const primaryResultsFound = Boolean(resultsData && !resultsData.__parseError);
  const primarySummaryFound = Boolean(summaryData && !summaryData.__parseError);
  const primaryDocsFound = exists(PRIMARY_DOC);
  const runtimeText = ['src/runtime/aeterna-runtime-v0.js', 'src/runtime/create-aeterna-fields.js', 'src/runtime/step-aeterna-runtime-v0.js'].map(readText).join('\n');
  const validationText = readText('scripts/run-v212-real-runtime-validation.js');
  const sourceDecision = resultsData?.decision || summaryData?.decision || {};
  const sourceFoundation = resultsData?.runtimeFoundation || summaryData?.runtimeFoundation || {};

  const runtimeFoundationAudit = {
    realRuntimeV0Found: sourceFoundation.created === true || (runtimeText.includes('createAeternaRuntimeV0') && validationText.includes('runType: \'real-runtime-v0\'')),
    usesDiagnosticSurrogate: sourceFoundation.usesDiagnosticSurrogate ?? (validationText.includes('diagnostic-surrogate-utils') ? true : false),
    hasFieldA: sourceFoundation.hasFieldA ?? runtimeText.includes('fieldA'),
    hasFieldB: sourceFoundation.hasFieldB ?? runtimeText.includes('fieldB'),
    hasMemory: sourceFoundation.hasMemory ?? runtimeText.includes('memoryRe'),
    hasCoupling: sourceFoundation.hasCoupling ?? runtimeText.includes('applySelectedCoupling'),
    hasPheromone: sourceFoundation.hasPheromone ?? runtimeText.includes('pheromoneField'),
    hasMetrics: sourceFoundation.hasMetrics ?? runtimeText.includes('collectAeternaMetrics'),
    supportsGrid32: sourceFoundation.supportsGrid32 ?? (Array.isArray(resultsData?.results) && resultsData.results.some((result) => result.actualGridSize === 32)),
    supportsGrid64: sourceFoundation.supportsGrid64 ?? (Array.isArray(resultsData?.results) && resultsData.results.some((result) => result.actualGridSize === 64)),
    limitations: sourceFoundation.limitations || [],
  };

  const stageAudit = auditStages(resultsData, summaryData);
  const topCandidates = normalizeTopCandidates(resultsData, summaryData);
  const rejectedPatterns = Array.isArray(resultsData?.rejectedPatterns) ? resultsData.rejectedPatterns.slice(0, 20) : (Array.isArray(summaryData?.rejectedPatterns) ? summaryData.rejectedPatterns.slice(0, 20) : []);
  const blockingIssues = [
    ...missingFiles.map((file) => `Missing required source file: ${file}`),
    ...(resultsData?.__parseError ? [`Could not parse ${PRIMARY_RESULTS}: ${resultsData.__parseError}`] : []),
    ...(summaryData?.__parseError ? [`Could not parse ${PRIMARY_SUMMARY}: ${summaryData.__parseError}`] : []),
    ...(Array.isArray(resultsData?.blockedReasons) ? resultsData.blockedReasons : []),
    ...(Array.isArray(summaryData?.blockedReasons) ? summaryData.blockedReasons : []),
    ...(Array.isArray(sourceDecision.blockingIssues) ? sourceDecision.blockingIssues : []),
  ];

  if (stageAudit.stage32Smoke.executed && !stageAudit.stage32Smoke.candidateFound) blockingIssues.push('32³ smoke executed but no real-runtime-v0 Condition D candidate was found.');
  if (stageAudit.stage64Smoke.executed && !stageAudit.stage64Smoke.candidateFound) blockingIssues.push('64³ smoke executed but no real-runtime-v0 Condition D candidate was found.');
  if (!stageAudit.stage64Full.executed) blockingIssues.push('64³ full three-seed real-runtime-v0 validation was not executed.');
  if (stageAudit.stage64Full.executed && !stageAudit.stage64Full.candidateFound) blockingIssues.push('64³ full three-seed real-runtime-v0 validation did not find a candidate.');

  if (real64Summary?.decision?.surrogate64CandidateFound === true && sourceDecision.runtime64FullCandidateFound !== true) {
    blockingIssues.push('Previous surrogate/real64 gate cannot be used as real-runtime-v0 64³ full evidence.');
  }
  if (!primaryResultsFound) blockingIssues.push(`${PRIMARY_RESULTS} unavailable; audit is blocked.`);
  if (!primarySummaryFound) blockingIssues.push(`${PRIMARY_SUMMARY} unavailable; audit is blocked.`);

  const decision = createDecision(stageAudit, runtimeFoundationAudit, sourceDecision, blockingIssues);
  const audit = {
    runMeta: {
      experimentName: 'experiment:v212-runtime-results-audit',
      version: 'v2.1.2',
      createdAt: new Date().toISOString(),
      commit: gitValue('git rev-parse HEAD', 'unknown'),
      branch: gitValue('git rev-parse --abbrev-ref HEAD', 'unknown'),
      sourceResults: [PRIMARY_RESULTS, PRIMARY_SUMMARY, REAL64_RESULTS, REAL64_SUMMARY],
      notes: 'Audit of v2.1.2 real-runtime-v0 validation results before v2.2 planning.',
    },
    inputAvailability: {
      resultsJsonFound: primaryResultsFound,
      summaryJsonFound: primarySummaryFound,
      docsFound: primaryDocsFound,
    },
    runtimeFoundationAudit,
    stageAudit,
    topCandidates,
    rejectedPatterns,
    blockingIssues: Array.from(new Set(blockingIssues)),
    decision,
  };

  fs.writeFileSync(fullPath(OUTPUT_JSON), `${JSON.stringify(audit, null, 2)}\n`);
  writeAuditDoc(audit);
  console.log(`Wrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_DOC}`);
  console.log(`canProceedToV22Planning=${audit.decision.canProceedToV22Planning}`);
  console.log(`canStartV22Implementation=${audit.decision.canStartV22Implementation}`);
}

main();
