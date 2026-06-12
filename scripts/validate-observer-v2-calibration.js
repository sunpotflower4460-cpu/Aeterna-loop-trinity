#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { computeFieldDistance } = require('../src/metrics/observer-v2');
const { classifyCouplingSamples, classifyLedgerSamples, classifyPerturbationSamples } = require('./run-v22-observer-v2-calibration');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-observer-v2-calibration-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-observer-v2-calibration-summary.json');
const DOC_PATH = path.join(ROOT, 'docs/v2.2-observer-v2-calibration.md');
const HISTORICAL = [
  'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json',
  'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json',
];
const PACKAGE_FILES = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const ALLOWED_LINEAGE = new Set(['synthetic-calibration', 'exp023-real']);
const EXPECTATION_IDS = new Set(['clean-recovery', 'partial-recovery', 'memory-on-vs-memory-off', 'L2-clean-W0', 'L3-clean-W2-direction', 'coupling-g0.0075', 'coupling-g0.02', 'coupling-g0.05', 'optional-L3-W2-mw0.03']);
const HARD_CASES = new Set(['tier1-clean-W1-self-distance', 'tier1-global-phase-offset-pi-over-5', 'tier1-W2-target-discrimination', 'tier1-known-low-amplitude-lines']);
const PROHIBITED = [/life appeared/i, /\beternal\b/i, /perfect proof/i, /proven permanent/i, /consciousness emerged/i, /permanent survival(?! claim)/i, /swap did not occur/i, /windingResidualMean/i, /windingResidualMax/i];
let warnedHeadFallback = false;

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function exists(file) { assert(fs.existsSync(file), `${path.relative(ROOT, file)} missing`); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
function changedAgainstHead(files) { try { git(['diff', '--exit-code', '--', ...files]); return false; } catch (_) { return true; } }
function availableBaseRef() {
  for (const ref of ['origin/main', 'main', 'master']) {
    try { git(['rev-parse', '--verify', ref]); return ref; } catch (_) { /* try next */ }
  }
  if (!warnedHeadFallback) {
    console.warn('Warning: no origin/main, main, or master ref found; merge-base diff validation is weaker and only worktree checks are active.');
    warnedHeadFallback = true;
  }
  return 'HEAD';
}
function changedAgainstBase(files) {
  const ref = availableBaseRef();
  if (ref === 'HEAD') return false;
  try { git(['diff', '--exit-code', `${ref}...HEAD`, '--', ...files]); return false; } catch (_) { return true; }
}
function finiteTolerance(row, label) { assert(Number.isFinite(row?.tolerance), `${label} must have finite tolerance`); }
function assertValidityShape(validity, label) {
  assert(validity, `${label} validity missing`);
  for (const field of ['validityAmpThreshold', 'nearPiMargin', 'lineMaxAbsPhaseStepMean', 'lineMaxAbsPhaseStepMax', 'nearPiStepCount', 'nearPiStepFraction', 'totalNearPiStepCount', 'maxNearPiStepCount', 'closedLoopFloatResidualMean', 'closedLoopFloatResidualMax']) {
    assert(Object.prototype.hasOwnProperty.call(validity, field), `${label} missing ${field}`);
  }
  assert(validity.closedLoopFloatResidualPolicy === 'floating-point sanity check only, not a reliability signal', `${label} closed-loop residual policy missing`);
  assert(!Object.prototype.hasOwnProperty.call(validity, 'windingResidualMean'), `${label} must not expose windingResidualMean`);
  assert(!Object.prototype.hasOwnProperty.call(validity, 'windingResidualMax'), `${label} must not expose windingResidualMax`);
}
function validateTier1(summary) {
  const rows = summary.tier1CorrectnessSummary || [];
  for (const caseId of HARD_CASES) {
    const row = rows.find((item) => item.caseId === caseId);
    assert(row, `Tier 1 hard case missing: ${caseId}`);
    assert(row.pass === true, `Tier 1 hard case failed: ${caseId}`);
  }
  const phase = rows.find((item) => item.caseId === 'tier1-global-phase-offset-pi-over-5');
  finiteTolerance(phase, 'phase offset case');
  assert(Math.abs(phase.measured.thetaStar - phase.measured.expectedThetaStar) <= phase.tolerance, 'thetaStar sign regression failed');
  const noise = rows.find((item) => item.caseId === 'tier1-additive-component-noise-monotonicity');
  finiteTolerance(noise, 'noise monotonicity case');
  assert(noise && noise.pass === true, 'Tier 1 noise reliability monotonicity failed');
  const values = noise.measured.residualVsEpsilon;
  assert(Array.isArray(values) && values.length >= 3, 'Tier 1 reliability-vs-epsilon values missing');
  for (let i = 1; i < values.length; i += 1) {
    const meanOk = values[i].lineMaxAbsPhaseStepMean + noise.tolerance >= values[i - 1].lineMaxAbsPhaseStepMean;
    const maxOk = values[i].lineMaxAbsPhaseStepMax + noise.tolerance >= values[i - 1].lineMaxAbsPhaseStepMax;
    assert(meanOk || maxOk, 'lineMaxAbsPhaseStepMean/Max is not non-decreasing within tolerance');
  }
  for (let i = 1; i < values.length; i += 1) assert(values[i].totalNearPiStepCount >= values[i - 1].totalNearPiStepCount, 'near-pi step counts decreased without threshold context');
  for (const item of values) {
    assert(Object.prototype.hasOwnProperty.call(item, 'nearPiStepCount') && Object.prototype.hasOwnProperty.call(item, 'nearPiStepFraction') && Object.prototype.hasOwnProperty.call(item, 'totalNearPiStepCount'), 'near-pi values missing from noise case');
    assert(Object.prototype.hasOwnProperty.call(item, 'closedLoopFloatResidualMean'), 'closed-loop float sanity missing from noise case');
    assert(!Object.prototype.hasOwnProperty.call(item, 'windingResidualMean'), 'noise case uses old windingResidualMean');
    if (item.invalidLineCount === 0) assert(item.lineMinAmpMin >= 0.1, 'invalidLineCount zero tie without lineMinAmp threshold context');
    if (item.epsilon === 1.2) assert(item.invalidLineCount > 0, 'epsilon=1.2 should produce invalid lines for the seeded noise calibration');
  }
  assert(/closedLoopFloatResidual is recorded only as float sanity/i.test(JSON.stringify(noise.measured)), 'noise case does not document closed-loop float residual as non-reliability signal');
}
function recomputeClassification(record) {
  if (record.runFamily === 'baseline_global_winding') return 'baseline_persistence_calibration';
  if (record.runFamily === 'perturbation_sweep') return classifyPerturbationSamples(record.samples, record.runConfig?.targetW ?? 1);
  if (record.runFamily === 'ledger_discrimination_matrix') return classifyLedgerSamples(record.samples, { memoryEnabled: true, memoryW: record.runConfig?.memoryInitialW, label: record.memoryConditionLabel });
  if (record.runFamily === 'memory_weight_sweep_uphill_writing') return classifyLedgerSamples(record.samples, { memoryEnabled: true, memoryW: record.runConfig?.memoryInitialW, label: record.memoryConditionLabel, memoryWeightRun: true });
  if (record.runFamily === 'one_sided_winding_coupling_sweep') return classifyCouplingSamples(record.samples);
  return record.classification;
}
function validateRecord(record) {
  assert(ALLOWED_LINEAGE.has(record.parameterLineage), `invalid parameterLineage in ${record.runId || record.caseId}`);
  for (const field of ['generatorGitHash', 'artifactGeneratedFromReachableCommit', 'artifactCommittedIn', 'observerVersion', 'observerPurpose', 'claimLevel']) assert(Object.prototype.hasOwnProperty.call(record, field), `${field} missing in ${record.runId || record.caseId}`);
  assert(record.observerPurpose === 'Observer V2 calibration only', `observerPurpose mismatch in ${record.runId || record.caseId}`);
  assert(record.observerContextV2, `observerContextV2 missing in ${record.runId || record.caseId}`);
  assert(Object.prototype.hasOwnProperty.call(record.observerContextV2, 'validityAmpThreshold'), `validityAmpThreshold missing in observer context for ${record.runId || record.caseId}`);
  assert(Object.prototype.hasOwnProperty.call(record.observerContextV2, 'nearPiMargin'), `nearPiMargin missing in observer context for ${record.runId || record.caseId}`);
  assert(Array.isArray(record.observerContextV2.reliabilityMetrics), `reliabilityMetrics missing in observer context for ${record.runId || record.caseId}`);
  assert(record.observerContextV2.targetAmplitudePolicy === 'stationary-amplitude-reference', `targetAmplitudePolicy missing/mismatch in ${record.runId || record.caseId}`);
  assert(record.observerV2Metrics || (Array.isArray(record.omittedMetrics) && record.omittedMetrics.length), `observerV2Metrics missing without omittedMetrics in ${record.runId || record.caseId}`);
  if (record.observerV2Metrics?.windingValidity) assertValidityShape(record.observerV2Metrics.windingValidity, record.runId || record.caseId);
  if (record.runConfig?.memoryEnabled === false || record.memoryEnabled === false) assert(record.effectiveMemoryWeight === 0 || record.runConfig?.effectiveMemoryWeight === 0, `memory-off effectiveMemoryWeight must be 0 in ${record.runId}`);
  if (record.runFamily === 'one_sided_winding_coupling_sweep') for (const field of ['fieldABDistanceRaw', 'fieldABDistanceAligned', 'memoryABDistanceRaw', 'memoryABDistanceAligned', 'thetaStarFieldAB', 'thetaStarMemoryAB']) assert(Object.prototype.hasOwnProperty.call(record.observerV2Metrics, field), `coupling metric ${field} missing in ${record.runId}`);
  if (record.tier === 'Tier 2') {
    const recomputed = recomputeClassification(record);
    assert(record.classification === recomputed, `classification mismatch in ${record.runId}: ${record.classification} !== ${recomputed}`);
    assert(record.observedCalibrationClassification === record.classification, `observedCalibrationClassification mismatch in ${record.runId}`);
    assert(record.constructionEquivalenceChecked === true, `construction equivalence not checked in ${record.runId}`);
    assert(record.constructionEquivalenceNotes, `construction equivalence notes missing in ${record.runId}`);
  }
}
function validateTier2Summary(summary) {
  const rows = summary.tier2ExpectationSummary;
  assert(Array.isArray(rows), 'tier2ExpectationSummary must be an array');
  for (const id of EXPECTATION_IDS) {
    const row = rows.find((item) => item.expectationId === id);
    assert(row, `tier2 expectation missing: ${id}`);
    assert(['hit', 'miss', 'indeterminate'].includes(row.result), `invalid tier2 result for ${id}`);
    assert(row.expected && Object.prototype.hasOwnProperty.call(row, 'measured') && row.notes, `tier2 expectation incomplete: ${id}`);
  }
  const directional = rows.find((item) => item.expectationId === 'memory-on-vs-memory-off');
  const m = directional.measured;
  assert(m && Number.isFinite(m.tolerance), 'memory-on/off directional measured tolerance missing');
  const expectedHit = m.memoryOnFinalFieldTargetDistanceAligned + m.tolerance < m.memoryOffFinalFieldTargetDistanceAligned;
  assert((directional.result === 'hit') === expectedHit, 'memory-on/off directional hit/miss is incorrect');
}
function main() {
  exists(RESULTS_PATH); exists(SUMMARY_PATH); exists(DOC_PATH);
  let mismatchRejected = false;
  try { computeFieldDistance({ phiRe: new Float64Array(2), phiIm: new Float64Array(2) }, { phiRe: new Float64Array(1), phiIm: new Float64Array(1) }, { gridSize: 1 }); } catch (_) { mismatchRejected = true; }
  assert(mismatchRejected, 'computeFieldDistance must reject mismatched sample counts');
  const results = readJson(RESULTS_PATH);
  const summary = readJson(SUMMARY_PATH);
  assert(['lightweight', 'full'].includes(results.runMode), 'results runMode is not official lightweight/full');
  assert(['lightweight', 'full'].includes(summary.runMode), 'summary runMode is not official lightweight/full');
  assert(results.runMode === summary.runMode, 'results and summary runMode mismatch');
  for (const field of ['generatorGitHash', 'artifactGeneratedFromReachableCommit', 'artifactCommittedIn', 'observerVersion', 'observerPurpose', 'claimLevel']) {
    assert(Object.prototype.hasOwnProperty.call(results, field), `results ${field} missing`);
    assert(Object.prototype.hasOwnProperty.call(summary, field), `summary ${field} missing`);
  }
  assert(results.observerPurpose === 'Observer V2 calibration only', 'results observerPurpose mismatch');
  assert(summary.observerPurpose === 'Observer V2 calibration only', 'summary observerPurpose mismatch');
  assert(Array.isArray(results.results), 'results.results array missing');
  for (const record of results.results) validateRecord(record);
  validateTier1(summary);
  validateTier2Summary(summary);
  const g005 = results.results.find((record) => record.runId === 'coupling-W1-W0-g0.05');
  assert(g005, 'g=0.05 coupling record missing');
  assert(!/swap did not occur/i.test(JSON.stringify(g005)), 'g=0.05 record uses prohibited swap wording');
  const allText = [fs.readFileSync(RESULTS_PATH, 'utf8'), fs.readFileSync(SUMMARY_PATH, 'utf8'), fs.readFileSync(DOC_PATH, 'utf8')].join('\n');
  for (const pattern of PROHIBITED) assert(!pattern.test(allText), `prohibited language found: ${pattern}`);
  assert(!changedAgainstHead(HISTORICAL), 'historical v2.1.2 JSON artifacts changed in worktree');
  assert(!changedAgainstBase(HISTORICAL), 'historical v2.1.2 JSON artifacts changed in merge-base diff');
  assert(!changedAgainstHead(PACKAGE_FILES), 'package files or lockfiles changed in worktree');
  assert(!changedAgainstBase(PACKAGE_FILES), 'package files or lockfiles changed in merge-base diff');
  console.log('Observer V2 calibration validation passed.');
}

if (require.main === module) main();
