#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS_REL = 'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json';
const SUMMARY_REL = 'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json';
const DOC_REL = 'docs/v2.1.2-winding-memory-phase-slip-audit.md';
const HISTORICAL_JSON = Object.freeze([
  'experiments/v2.1.2-randomized-vortex-controls-results.json',
  'experiments/v2.1.2-randomized-vortex-controls-summary.json',
  'experiments/v2.1.2-phase-detuning-scan-results.json',
  'experiments/v2.1.2-phase-detuning-scan-summary.json',
  'experiments/v2.1.2-periodic-vortex-initialization-audit-results.json',
  'experiments/v2.1.2-periodic-vortex-initialization-audit-summary.json',
  // After PR #34, the v2.1.2 winding/memory/phase-slip audit JSON artifacts
  // are historical records. Future updates should create new artifact files or a
  // clearly named follow-up audit rather than silently rewriting these files.
  RESULTS_REL,
  SUMMARY_REL,
  // After the Topological Ledger smoke merge (2026-06), these artifacts are
  // finalized historical records. Follow-up ledger work must write new artifact
  // names. Disclosed supersession PRs are the only sanctioned exception.
  'experiments/v2.2-topological-ledger-smoke-results.json',
  'experiments/v2.2-topological-ledger-smoke-summary.json',
  // After the G8 structurally distinct interaction smoke merge (2026-06), these
  // artifacts are finalized historical records. Follow-up G8 work must write new
  // artifact names. Disclosed supersession PRs are the only sanctioned exception.
  'experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json',
  'experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json',
]);
const NEW_OUTPUTS = Object.freeze([DOC_REL]);
const PROHIBITED = [/life appeared/i, /\beternal\b/i, /perfect ledger/i, /proven permanent/i, /heart was created/i, /consciousness emerged/i];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function gitStatusPaths(paths) { return execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).trim(); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function canResolveRef(ref) {
  try { git(['rev-parse', '--verify', '--quiet', ref]); return true; }
  catch (_) { return false; }
}
function resolveAuditBaseRef() {
  const candidates = [process.env.AUDIT_BASE_REF, 'origin/main', 'main', 'HEAD~1'].filter(Boolean);
  return candidates.find(canResolveRef) || null;
}
function family(results, name) { return results.filter((r) => r.runFamily === name); }
function hasOmission(summary, fragment) { return (summary.omittedConditions || []).some((item) => item.includes(fragment)); }
function requestedValuesPresentOrOmitted(records, accessor, requested, summary, omissionFragment) {
  const values = new Set(records.map(accessor).filter((v) => v !== undefined && v !== null));
  const missing = requested.filter((v) => !values.has(v));
  assert(missing.length === 0 || hasOmission(summary, omissionFragment), `Missing requested values ${missing.join(', ')} without documented omission: ${omissionFragment}`);
}

function main() {
  for (const output of NEW_OUTPUTS) assert(!HISTORICAL_JSON.includes(output), `New output overlaps historical JSON path: ${output}`);
  assert(gitStatusPaths(HISTORICAL_JSON) === '', `Historical JSON files are modified:\n${gitStatusPaths(HISTORICAL_JSON)}`);
  const baseRef = resolveAuditBaseRef();
  assert(baseRef, 'Unable to resolve audit base ref. Set AUDIT_BASE_REF or ensure origin/main/main/HEAD~1 exists.');
  const mergeBase = git(['merge-base', 'HEAD', baseRef]);
  const changedHistorical = git(['diff', '--name-only', `${mergeBase}..HEAD`, '--', ...HISTORICAL_JSON]);
  assert(!changedHistorical, `Protected historical JSON changed in committed diff:\n${changedHistorical}`);
  assert(exists(RESULTS_REL), 'Results JSON is missing');
  assert(exists(SUMMARY_REL), 'Summary JSON is missing');
  assert(exists(DOC_REL), 'Audit doc is missing');

  const resultsDoc = JSON.parse(read(RESULTS_REL));
  const summary = JSON.parse(read(SUMMARY_REL));
  const records = resultsDoc.results || [];
  const doc = read(DOC_REL);

  assert(summary.parameterLineage === 'exp023-real', `Summary parameterLineage must be exp023-real, got ${summary.parameterLineage}`);
  assert(summary.runMode === resultsDoc.runMode, 'Results/summary runMode mismatch');
  assert(['lightweight', 'full'].includes(summary.runMode), `Official summary runMode must be lightweight or full, got ${summary.runMode}`);
  assert(['lightweight', 'full'].includes(resultsDoc.runMode), `Official results runMode must be lightweight or full, got ${resultsDoc.runMode}`);
  assert(!String(summary.runMode).includes('runtime-limited'), 'Official summary must not be the runtime-limited smoke artifact');
  assert(!String(resultsDoc.runMode).includes('runtime-limited'), 'Official results must not be runtime-limited');
  assert(summary.costPolicy?.mode === summary.runMode, 'Summary costPolicy.mode must match summary.runMode');
  for (const docLike of [resultsDoc, summary]) {
    assert(docLike.generatorGitHash, 'Artifact provenance missing generatorGitHash');
    assert(Object.prototype.hasOwnProperty.call(docLike, 'artifactGeneratedFromReachableCommit'), 'Artifact provenance missing artifactGeneratedFromReachableCommit');
    assert(docLike.artifactGeneratedFromReachableCommit === (Boolean(docLike.generatorGitHash) && docLike.generatorGitHash !== 'git-hash-unavailable'), 'Artifact reachable provenance does not match generatorGitHash availability');
    assert(docLike.artifactCommittedIn, 'Artifact provenance missing artifactCommittedIn');
  }
  const allText = `${JSON.stringify(resultsDoc)}\n${JSON.stringify(summary)}\n${doc}`;

  assert(records.length > 0, 'No run records found');
  for (const record of records) {
    assert(record.physicsContext, `physicsContext missing in ${record.runId}`);
    assert(record.observerContext, `observerContext missing in ${record.runId}`);
    assert(record.phaseConstructionMode === 'legacy-torus-atan2', `Unexpected phaseConstructionMode in ${record.runId}`);
    assert(record.windingInitializationMode === 'manual-global-x-winding-ramp', `Unexpected windingInitializationMode in ${record.runId}`);
    assert(record.initializerComparisonMode === 'not-tested-in-this-audit', `Unexpected initializerComparisonMode in ${record.runId}`);
    assert(record.runtimeInitializerContext === 'legacy-torus-atan2', `Unexpected runtimeInitializerContext in ${record.runId}`);
    assert(record.parameterLineage === 'exp023-real' || record.runConfig?.parameterLineage === 'exp023-real', `parameterLineage missing or non-canonical in ${record.runId}`);
    assert(record.physicsContext?.parameterLineage === 'exp023-real', `physicsContext parameterLineage missing in ${record.runId}`);
  }

  const baselines = family(records, 'baseline_global_winding');
  for (const w of [0, 1, 2]) assert(baselines.some((r) => r.initialW === w), `Baseline W=${w} missing`);

  const ledger = family(records, 'ledger_discrimination_matrix');
  for (const label of ['L0_memory_OFF', 'L1_noisy_W1_copy', 'L1b_clean_W1', 'L2_clean_W0', 'L3_clean_W2']) {
    assert(ledger.some((r) => r.memoryConditionLabel === label), `Ledger matrix condition ${label} missing`);
  }
  for (const record of records) {
    if (record.classification === 'persistent_without_break') {
      assert(record.firstNonTargetStep === null || record.firstNonTargetStep === undefined, `persistent_without_break used after target break in ${record.runId}`);
    }
    if (record.classification === 'break_then_recover') {
      const finalW = record.finalDominantW ?? record.finalFieldDominantW;
      const finalFraction = record.finalDominantFraction ?? record.finalFieldDominantFraction ?? record.fieldWindingHistogram?.dominantFraction;
      const targetW = record.runConfig?.targetW ?? record.runConfig?.fieldInitialW ?? 1;
      assert(finalW === targetW && finalFraction >= 0.99, `break_then_recover final state is not recovered in ${record.runId}`);
    }
    if (record.classification === 'field_rewrites_memory') {
      assert(record.memoryInitialW !== record.fieldInitialW, `field_rewrites_memory used without differing initial memory in ${record.runId}`);
      assert(record.memoryRewriteStep !== null && record.memoryRewriteStep > 0, `field_rewrites_memory missing post-initial rewrite step in ${record.runId}`);
    }
    if (['memory_off_field_returns_to_W1', 'field_returns_to_W1', 'clean_W1_memory_recovery'].includes(record.classification)) {
      assert(record.finalFieldDominantW === 1 && record.finalFieldDominantFraction >= 0.99, `clean W=1 return classification lacks recovery-threshold support in ${record.runId}`);
    }
    if (record.classification === 'field_follows_clean_W0_memory') {
      assert(record.finalFieldDominantW === 0 && record.finalFieldDominantFraction >= 0.99, `clean W=0 follow classification lacks recovery-threshold support in ${record.runId}`);
    }
    if (record.classification === 'memory_writes_W2_to_field') {
      assert(record.finalFieldDominantW === 2 && record.finalFieldDominantFraction >= 0.99, `W2 write classification lacks recovery-threshold support in ${record.runId}`);
    }
  }
  const mainLedger = ledger.filter((r) => ['L1_noisy_W1_copy', 'L1b_clean_W1', 'L2_clean_W0', 'L3_clean_W2'].includes(r.memoryConditionLabel));
  for (const record of mainLedger) assert(record.memoryWeight === 0.0075, `Main ledger condition ${record.runId} did not use MEMORY_WEIGHT=0.0075`);
  const memoryOffRecords = records.filter((r) => r.runConfig?.memoryEnabled === false || r.memoryEnabled === false);
  for (const record of memoryOffRecords) {
    assert(record.effectiveMemoryWeight === 0, `Memory-off record effectiveMemoryWeight must be zero in ${record.runId}`);
    assert(record.runConfig?.effectiveMemoryWeight === 0, `Memory-off runConfig effectiveMemoryWeight must be zero in ${record.runId}`);
    assert(record.runConfig?.nominalComparisonMemoryWeight === 0.0075, `Memory-off nominal comparison weight missing in ${record.runId}`);
  }
  const pureNoise = family(records, 'pure_noise_control');
  for (const record of pureNoise) {
    assert(record.runConfig?.controlType === 'memory_off_W0_noise_control', `Pure noise control must be explicitly memory-off in ${record.runId}`);
    assert(record.runConfig?.memoryEnabled === false && record.runConfig?.effectiveMemoryWeight === 0, `Pure noise control has active memory metadata in ${record.runId}`);
  }

  const l1b = ledger.find((r) => r.memoryConditionLabel === 'L1b_clean_W1');
  assert(!l1b || l1b.memoryRewriteStep === null, 'L1b clean W=1 must not report memoryRewriteStep');

  const weightSweep = family(records, 'memory_weight_sweep_uphill_writing');
  requestedValuesPresentOrOmitted(weightSweep, (r) => r.memoryWeight, [0.0075, 0.03, 0.05], summary, 'MEMORY_WEIGHT');
  const couplingSweep = family(records, 'one_sided_winding_coupling_sweep');
  requestedValuesPresentOrOmitted(couplingSweep, (r) => r.runConfig && r.runConfig.couplingG, [0.0075, 0.02, 0.05], summary, 'COUPLING_G');
  for (const record of couplingSweep) {
    assert(record.runConfig?.memoryCouplingUseBidirectional === true, `One-sided winding coupling did not preserve bidirectional coupling in ${record.runId}`);
    assert(record.runConfig?.couplingDirectionality === 'bidirectional', `Coupling directionality not recorded as bidirectional in ${record.runId}`);
    assert(record.runConfig?.oneSidedMeaning === 'winding_asymmetry_only', `One-sided meaning not recorded as winding asymmetry in ${record.runId}`);
    assert(record.physicsContext?.memoryCouplingUseBidirectional === true, `One-sided winding coupling physicsContext did not record bidirectional=true in ${record.runId}`);
    if (record.classification === 'double_slip_exchange') {
      assert(record.fieldWindingHistogramA?.dominantW === 0 && record.fieldWindingHistogramB?.dominantW === 1, `double_slip_exchange must end with swapped A/B winding assignments in ${record.runId}`);
    }
  }
  const couplingSummary = summary.byFamily?.one_sided_winding_coupling_sweep || [];
  assert(couplingSummary.length === couplingSweep.length, 'Coupling summary count mismatch');
  for (const item of couplingSummary) {
    assert(Object.prototype.hasOwnProperty.call(item, 'finalWA') && Object.prototype.hasOwnProperty.call(item, 'finalWB'), `Coupling summary missing A/B final W fields for ${item.runId}`);
    assert(!Object.prototype.hasOwnProperty.call(item, 'finalW') && !Object.prototype.hasOwnProperty.call(item, 'finalMemoryW'), `Coupling summary still uses generic final fields for ${item.runId}`);
  }
  assert(family(records, 'pure_noise_control').length >= 1, 'Pure W=0 noise control missing');

  assert(/claim-level|claim level/i.test(doc), 'Docs do not include claim-level cautions');
  assert(/lightweight/i.test(doc) && /full mode/i.test(doc), 'Docs do not mention lightweight vs full mode');
  assert(doc.includes('P_m = |mean(phi * exp(-i2πmx/N))|^2'), 'Docs do not include exact mode power formula');
  for (const pattern of PROHIBITED) assert(!pattern.test(allText), `Prohibited language found: ${pattern}`);
  assert(allText.includes('memory_biased_basin_selection'), 'Preferred memory_biased_basin_selection tag missing');

  console.log('Winding/memory/phase-slip audit validation passed.');
}

if (require.main === module) main();
