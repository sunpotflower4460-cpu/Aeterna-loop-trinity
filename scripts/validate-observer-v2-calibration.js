#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
const HARD_CASES = new Set([
  'tier1-clean-W1-self-distance',
  'tier1-global-phase-offset-pi-over-5',
  'tier1-W2-target-discrimination',
  'tier1-known-low-amplitude-lines',
]);
const PROHIBITED = [
  /life appeared/i,
  /\beternal\b/i,
  /perfect proof/i,
  /proven permanent/i,
  /consciousness emerged/i,
  /permanent survival(?! claim)/i,
  /swap did not occur/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function exists(file) { assert(fs.existsSync(file), `${path.relative(ROOT, file)} missing`); }
function textOfExisting(files) {
  return files.filter((file) => fs.existsSync(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
function changedAgainstHead(files) {
  try { git(['diff', '--exit-code', '--', ...files]); return false; }
  catch (_) { return true; }
}
function availableBaseRef() {
  for (const ref of ['origin/main', 'main', 'master']) {
    try { git(['rev-parse', '--verify', ref]); return ref; }
    catch (_) { /* try next */ }
  }
  return 'HEAD';
}
function changedAgainstBase(files) {
  const ref = availableBaseRef();
  if (ref === 'HEAD') return false;
  try { git(['diff', '--exit-code', `${ref}...HEAD`, '--', ...files]); return false; }
  catch (_) { return true; }
}
function validateTier1(summary) {
  const rows = summary.tier1CorrectnessSummary || [];
  for (const caseId of HARD_CASES) {
    const row = rows.find((item) => item.caseId === caseId);
    assert(row, `Tier 1 hard case missing: ${caseId}`);
    assert(row.pass === true, `Tier 1 hard case failed: ${caseId}`);
  }
  const phase = rows.find((item) => item.caseId === 'tier1-global-phase-offset-pi-over-5');
  assert(Math.abs(phase.measured.thetaStar - phase.measured.expectedThetaStar) <= phase.tolerance, 'thetaStar sign regression failed');
  const noise = rows.find((item) => item.caseId === 'tier1-additive-component-noise-monotonicity');
  assert(noise && noise.pass === true, 'Tier 1 noise monotonicity failed');
  const values = noise.measured.residualVsEpsilon;
  assert(Array.isArray(values) && values.length >= 3, 'Tier 1 residual-vs-epsilon values missing');
  for (let i = 1; i < values.length; i += 1) {
    assert(values[i].windingResidualMean + noise.tolerance >= values[i - 1].windingResidualMean, 'windingResidualMean is not non-decreasing within tolerance');
  }
  for (const item of values) {
    if (item.invalidLineCount === 0) {
      assert(item.lineMinAmpMin >= 0.1, 'invalidLineCount zero tie without lineMinAmp threshold context');
      assert(/threshold.?context/i.test(JSON.stringify(noise.measured)), 'invalidLineCount zero tie lacks threshold context text');
    }
  }
}
function validateRecord(record) {
  assert(ALLOWED_LINEAGE.has(record.parameterLineage), `invalid parameterLineage in ${record.runId || record.caseId}`);
  for (const field of ['generatorGitHash', 'artifactGeneratedFromReachableCommit', 'artifactCommittedIn', 'observerVersion', 'observerPurpose', 'claimLevel']) {
    assert(Object.prototype.hasOwnProperty.call(record, field), `${field} missing in ${record.runId || record.caseId}`);
  }
  assert(record.observerPurpose === 'Observer V2 calibration only', `observerPurpose mismatch in ${record.runId || record.caseId}`);
  assert(record.observerContextV2, `observerContextV2 missing in ${record.runId || record.caseId}`);
  assert(Object.prototype.hasOwnProperty.call(record.observerContextV2, 'validityAmpThreshold'), `validityAmpThreshold missing in observer context for ${record.runId || record.caseId}`);
  assert(record.observerContextV2.targetAmplitudePolicy === 'stationary-amplitude-reference', `targetAmplitudePolicy missing/mismatch in ${record.runId || record.caseId}`);
  assert(record.observerV2Metrics || (Array.isArray(record.omittedMetrics) && record.omittedMetrics.length), `observerV2Metrics missing without omittedMetrics in ${record.runId || record.caseId}`);
  if (record.runConfig?.memoryEnabled === false || record.memoryEnabled === false) {
    assert(record.effectiveMemoryWeight === 0 || record.runConfig?.effectiveMemoryWeight === 0, `memory-off effectiveMemoryWeight must be 0 in ${record.runId}`);
  }
  if (record.runFamily === 'one_sided_winding_coupling_sweep') {
    for (const field of ['fieldABDistanceRaw', 'fieldABDistanceAligned', 'memoryABDistanceRaw', 'memoryABDistanceAligned', 'thetaStarFieldAB', 'thetaStarMemoryAB']) {
      assert(Object.prototype.hasOwnProperty.call(record.observerV2Metrics, field), `coupling metric ${field} missing in ${record.runId}`);
    }
  }
}
function main() {
  exists(RESULTS_PATH); exists(SUMMARY_PATH); exists(DOC_PATH);
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
  const g005 = results.results.find((record) => record.runId === 'coupling-W1-W0-g0.05');
  assert(g005, 'g=0.05 coupling record missing');
  assert(!/swap did not occur/i.test(JSON.stringify(g005)), 'g=0.05 record uses prohibited swap wording');

  const allText = [
    fs.readFileSync(RESULTS_PATH, 'utf8'),
    fs.readFileSync(SUMMARY_PATH, 'utf8'),
    fs.readFileSync(DOC_PATH, 'utf8'),
  ].join('\n');
  for (const pattern of PROHIBITED) assert(!pattern.test(allText), `prohibited language found: ${pattern}`);
  assert(!changedAgainstHead(HISTORICAL), 'historical v2.1.2 JSON artifacts changed in worktree');
  assert(!changedAgainstBase(HISTORICAL), 'historical v2.1.2 JSON artifacts changed in merge-base diff');
  assert(!changedAgainstHead(PACKAGE_FILES), 'package files or lockfiles changed in worktree');

  console.log('Observer V2 calibration validation passed.');
}

if (require.main === module) main();
