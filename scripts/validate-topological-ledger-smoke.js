#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments/v2.2-topological-ledger-smoke-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments/v2.2-topological-ledger-smoke-summary.json');
const DOC_PATH = path.join(ROOT, 'docs/v2.2-topological-ledger-smoke.md');
const PREREG_PATH = path.join(ROOT, 'docs/pre-registered-expectations.md');
const ROADMAP_PATH = path.join(ROOT, 'docs/regime-roadmap-and-hypothesis-provenance.md');
const HISTORICAL = [
  'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json',
  'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json',
  'experiments/v2.2-observer-v2-calibration-results.json',
  'experiments/v2.2-observer-v2-calibration-summary.json',
  // After the Topological Ledger smoke merge (2026-06), these artifacts are
  // finalized historical records. Follow-up ledger work must write new artifact
  // names. Disclosed supersession PRs are the only sanctioned exception.
  'experiments/v2.2-topological-ledger-smoke-results.json',
  'experiments/v2.2-topological-ledger-smoke-summary.json',
];
const PACKAGE_FILES = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const PROHIBITED = [/life appeared/i, /\beternal\b/i, /perfect proof/i, /proven permanent/i, /consciousness emerged/i, /biological life appeared/i, /proves? biological life/i, /permanent survival is proven/i, /\bsoul\b/i, /particle-being/i];

function assert(condition, message) { if (!condition) throw new Error(message); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
function changed(files, range) { try { git(['diff', '--exit-code', ...(range ? [range] : []), '--', ...files]); return false; } catch (_) { return true; } }
function baseRef() { for (const ref of ['origin/main', 'main', 'master']) { try { git(['rev-parse', '--verify', ref]); return ref; } catch (_) {} } console.warn('Warning: no origin/main, main, or master ref found; merge-base diff validation is weaker and only worktree checks are active.'); return null; }
function validateContext(ctx) {
  assert(ctx, 'ledger context missing');
  assert(ctx.boundaryCondition === 'periodic', 'boundaryCondition must be periodic');
  assert(ctx.orientation === 'xy', 'orientation must be xy');
  assert(ctx.sliceAxis === 'z', 'sliceAxis must be z');
  assert(Array.isArray(ctx.supportedOrientations) && ctx.supportedOrientations.length === 1 && ctx.supportedOrientations[0] === 'xy', 'supported orientations mismatch');
  assert(ctx.validityAmpThreshold === 0.1, 'validityAmpThreshold missing/mismatch');
  assert(ctx.nearPiMargin === 0.3, 'nearPiMargin missing/mismatch');
  assert(/shared periodic x\/y edge/i.test(ctx.edgeSharingPolicy), 'edge sharing policy missing');
}
function main() {
  for (const file of [RESULTS_PATH, SUMMARY_PATH, DOC_PATH, PREREG_PATH, ROADMAP_PATH]) assert(fs.existsSync(file), `${path.relative(ROOT, file)} missing`);
  const results = readJson(RESULTS_PATH); const summary = readJson(SUMMARY_PATH);
  assert(Array.isArray(results) && results.length >= 7, 'results must contain smoke records');
  assert(['lightweight', 'full'].includes(summary.runMode), 'runMode must be official lightweight/full');
  for (const field of ['audit', 'runMode', 'generatorGitHash', 'artifactGeneratedFromReachableCommit', 'artifactCommittedIn', 'observerPurpose', 'claimLevel']) assert(Object.prototype.hasOwnProperty.call(summary, field), `summary missing ${field}`);
  assert(summary.audit === 'v2.2-topological-ledger-smoke', 'audit mismatch');
  assert(summary.observerPurpose === 'Topological Ledger smoke observer only', 'observer purpose mismatch');
  validateContext(summary.ledgerContext);
  for (const record of results) { for (const field of ['generatorGitHash', 'artifactGeneratedFromReachableCommit', 'artifactCommittedIn', 'observerPurpose', 'claimLevel']) assert(Object.prototype.hasOwnProperty.call(record, field), `${record.caseId} missing ${field}`); validateContext(record.ledgerContext); }
  assert(summary.allStrictSyntheticIntegerGatesPass === true, 'strict synthetic integer gates failed');
  assert(summary.c1GlobalPhaseShiftInvariancePass === true, 'C-1 map equality failed');
  const known = results.find((r) => r.caseId === 'known-paired-vortex-layout');
  assert(known && (known.pass === true || (known.downgraded === true && known.downgradeReason)), 'known paired vortex layout did not pass or downgrade with reason');
  const invalid = results.find((r) => r.caseId === 'low-amplitude-invalid-plaquette-case');
  assert(invalid && invalid.measured.invalidPlaquetteCount > 0 && invalid.strictTopologyClaimsMade === false, 'invalid plaquette case failed');
  const metrics = results.find((r) => r.caseId === 'existing-metric-distinction-and-compatibility');
  assert(metrics?.legacyComputeVortexCountComparison?.pass === true, 'computeVortexCount compatibility missing/failed');
  assert(metrics?.globalXWindingDistinction?.pass === true, 'global x-winding distinction missing/failed');
  const equiv = results.find((r) => r.caseId === 'u1-equivariance-regression');
  assert(equiv?.pass === true && /not a universal G8 identity gate/i.test(equiv.policy), 'fieldA/fieldB equivariance regression failed or overbroad');
  const runtime = results.find((r) => r.caseId === 'limited-runtime-smoke');
  assert(runtime?.ledgerDeltaPolicy && /not a strict invariant/i.test(runtime.ledgerDeltaPolicy), 'ledgerDelta must be diagnostic only');
  const text = [fs.readFileSync(DOC_PATH, 'utf8'), fs.readFileSync(PREREG_PATH, 'utf8'), fs.readFileSync(ROADMAP_PATH, 'utf8'), JSON.stringify(results), JSON.stringify(summary)].join('\n');
  for (const pattern of PROHIBITED) assert(!pattern.test(text), `prohibited language found: ${pattern}`);
  assert(/v2\.2 Topological Ledger Smoke/.test(fs.readFileSync(PREREG_PATH, 'utf8')), 'pre-registration section missing');
  assert(/Topological Ledger smoke adds an XY plaquette integer ledger per z-slice/i.test(fs.readFileSync(ROADMAP_PATH, 'utf8')), 'roadmap note missing');
  assert(!changed(HISTORICAL), 'historical artifacts modified in worktree');
  assert(!changed(PACKAGE_FILES), 'package or lockfile modified in worktree');
  const ref = baseRef();
  if (ref) { assert(!changed(HISTORICAL, `${ref}...HEAD`), 'historical artifacts changed against base ref'); assert(!changed(PACKAGE_FILES, `${ref}...HEAD`), 'package or lockfile changed against base ref'); }
  console.log('Topological Ledger smoke validation passed.');
}

if (require.main === module) main();
