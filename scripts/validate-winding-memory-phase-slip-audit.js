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
]);
const NEW_OUTPUTS = Object.freeze([RESULTS_REL, SUMMARY_REL, DOC_REL]);
const PROHIBITED = [/life appeared/i, /\beternal\b/i, /perfect ledger/i, /proven permanent/i, /heart was created/i, /consciousness emerged/i];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function gitStatusPaths(paths) { return execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).trim(); }
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
  assert(exists(RESULTS_REL), 'Results JSON is missing');
  assert(exists(SUMMARY_REL), 'Summary JSON is missing');
  assert(exists(DOC_REL), 'Audit doc is missing');

  const resultsDoc = JSON.parse(read(RESULTS_REL));
  const summary = JSON.parse(read(SUMMARY_REL));
  const records = resultsDoc.results || [];
  const doc = read(DOC_REL);

  assert(['lightweight', 'full'].includes(summary.runMode), `Official summary runMode must be lightweight or full, got ${summary.runMode}`);
  assert(!String(summary.runMode).includes('runtime-limited'), 'Official summary must not be the runtime-limited smoke artifact');
  const allText = `${JSON.stringify(resultsDoc)}\n${JSON.stringify(summary)}\n${doc}`;

  assert(records.length > 0, 'No run records found');
  for (const record of records) {
    assert(record.physicsContext, `physicsContext missing in ${record.runId}`);
    assert(record.observerContext, `observerContext missing in ${record.runId}`);
    assert(record.phaseConstructionMode === 'legacy-torus-atan2', `Unexpected phaseConstructionMode in ${record.runId}`);
  }

  const baselines = family(records, 'baseline_global_winding');
  for (const w of [0, 1, 2]) assert(baselines.some((r) => r.initialW === w), `Baseline W=${w} missing`);

  const ledger = family(records, 'ledger_discrimination_matrix');
  for (const label of ['L0_memory_OFF', 'L1_noisy_W1_copy', 'L2_clean_W0', 'L3_clean_W2']) {
    assert(ledger.some((r) => r.memoryConditionLabel === label), `Ledger matrix condition ${label} missing`);
  }
  for (const record of records) {
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
  }
  const mainLedger = ledger.filter((r) => ['L1_noisy_W1_copy', 'L1b_clean_W1', 'L2_clean_W0', 'L3_clean_W2'].includes(r.memoryConditionLabel));
  for (const record of mainLedger) assert(record.memoryWeight === 0.0075, `Main ledger condition ${record.runId} did not use MEMORY_WEIGHT=0.0075`);
  const l1b = ledger.find((r) => r.memoryConditionLabel === 'L1b_clean_W1');
  assert(!l1b || l1b.memoryRewriteStep === null, 'L1b clean W=1 must not report memoryRewriteStep');

  const weightSweep = family(records, 'memory_weight_sweep_uphill_writing');
  requestedValuesPresentOrOmitted(weightSweep, (r) => r.memoryWeight, [0.0075, 0.03, 0.05], summary, 'MEMORY_WEIGHT');
  const couplingSweep = family(records, 'one_sided_coupling_sweep');
  requestedValuesPresentOrOmitted(couplingSweep, (r) => r.runConfig && r.runConfig.couplingG, [0.0075, 0.02, 0.05], summary, 'COUPLING_G');
  assert(family(records, 'pure_noise_control').length >= 1, 'Pure W=0 noise control missing');

  assert(/claim-level|claim level/i.test(doc), 'Docs do not include claim-level cautions');
  assert(/lightweight/i.test(doc) && /full mode/i.test(doc), 'Docs do not mention lightweight vs full mode');
  assert(doc.includes('P_m = |mean(phi * exp(-i2πmx/N))|^2'), 'Docs do not include exact mode power formula');
  for (const pattern of PROHIBITED) assert(!pattern.test(allText), `Prohibited language found: ${pattern}`);
  assert(allText.includes('memory_biased_basin_selection'), 'Preferred memory_biased_basin_selection tag missing');

  console.log('Winding/memory/phase-slip audit validation passed.');
}

if (require.main === module) main();
