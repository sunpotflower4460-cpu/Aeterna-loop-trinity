#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-results.json';
const SUMMARY_PATH = 'experiments/v2.2-structurally-distinct-beings-interaction-smoke-summary.json';
const AUDIT = 'v2.2-structurally-distinct-beings-interaction-smoke';
const OVERALL_SMOKE_PASS_MEANING = 'artifact/schema/control/validator pass only; not evidence of relation, maintenance, persistence, life-like behavior, consciousness, agency, subjectivity, soul, or permanent survival';
const ALLOWED_LABELS = new Set([
  'topological_frustration_plateau',
  'single_slip_merge',
  'synchronized_double_phase_slip_candidate',
  'winding_transfer_candidate',
  'phase_locking',
  'phase_drift',
  'structural_identity_collapse',
  'near_identical_from_start',
  'raw_distance_collapse',
  'structural_fusion',
  'phase_locking_with_structural_preservation',
  'phase_drift_with_interaction',
  'common_vacuum_relaxation',
  'asymmetric_persistence_candidate',
  'winding_destroyed',
  'indeterminate',
  'boundary',
]);
const PROTECTED_FILES = [
  'experiments/v2.1.2-winding-memory-phase-slip-audit-results.json',
  'experiments/v2.1.2-winding-memory-phase-slip-audit-summary.json',
  'experiments/v2.2-observer-v2-calibration-results.json',
  'experiments/v2.2-observer-v2-calibration-summary.json',
  'experiments/v2.2-topological-ledger-smoke-results.json',
  'experiments/v2.2-topological-ledger-smoke-summary.json',
];
const PACKAGE_FILES = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} missing`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}
function asText(value) {
  return JSON.stringify(value);
}
function gitClean(files) {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'origin/main'], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('git', ['diff', '--exit-code', 'origin/main...HEAD', '--', ...files], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch (_) {
    const status = execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim();
    return status.length === 0;
  }
}
function independentlyClassify(run, condition) {
  const samples = run.samples;
  const last = samples[samples.length - 1];
  const minAlignedDistance = Math.min(...samples.map((sample) => sample.observerV2.fieldABDistanceAligned));
  const maxInvalidLines = Math.max(...samples.map((sample) => sample.observerV2.reliability.invalidLineCountA + sample.observerV2.reliability.invalidLineCountB));
  const effectiveCoupling = condition.isControl || run.couplingSummary.anyMemoryCouplingApplied;
  let classificationLabel = 'phase_drift';
  let outcomeCategory = 'no_relation_or_unrelated_drift';
  if (!effectiveCoupling || maxInvalidLines > 0) {
    classificationLabel = 'indeterminate';
    outcomeCategory = 'reliability_limited_or_indeterminate';
  } else if (last.observerV2.fieldABDistanceAligned < 0.08) {
    classificationLabel = 'structural_identity_collapse';
    outcomeCategory = 'immediate_fusion_or_identity_collapse';
  } else if (condition.family === 'T' && run.controlComparison?.couplingHadMeasurableEffectVsControl && minAlignedDistance < 0.6) {
    classificationLabel = 'phase_drift_with_interaction';
    outcomeCategory = 'transient_interaction_candidate';
  } else if (condition.family === 'P' && run.controlComparison?.couplingHadMeasurableEffectVsControl && last.observerV2.fieldABDistanceAligned >= 0.12 && minAlignedDistance < 0.8) {
    classificationLabel = 'phase_locking_with_structural_preservation';
    outcomeCategory = 'persistent_distinct_interaction_candidate';
  }
  if (condition.family === 'P' && Math.abs(last.energyBalance.energyDeltaFromPreviousSample || 0) > 2) outcomeCategory = 'boundary';
  if (!condition.isControl && !run.controlComparison?.couplingHadMeasurableEffectVsControl) {
    classificationLabel = 'indeterminate';
    outcomeCategory = 'reliability_limited_or_indeterminate';
  }
  return { classificationLabel, outcomeCategory };
}
function main() {
  const results = readJson(RESULTS_PATH);
  const summary = readJson(SUMMARY_PATH);
  assert(results.metadata.audit === AUDIT && summary.audit === AUDIT, 'audit mismatch');
  assert(/finite-horizon operational/.test(results.metadata.claimLevel), 'claimLevel mismatch');
  assert(results.preRegistration.doc === 'docs/g8-structurally-distinct-interaction-preregistration.md', 'pre-registration doc reference mismatch');
  assert(fs.existsSync(path.join(ROOT, results.preRegistration.doc)), 'pre-registration doc missing');
  assert(results.families.T && results.families.P, 'both Family T and Family P required');
  const docPath = path.join(ROOT, 'docs/v2.2-structurally-distinct-beings-interaction-smoke.md');
  const text = [asText(results), asText(summary), fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : ''].join('\n');
  assert(!text.includes('energy_' + 'injection_confound_possible'), 'forbidden energy injection confound term present');
  for (const bad of ['asymmetric_survival', 'winding_transferred_candidate']) assert(!text.includes(bad), `forbidden label ${bad}`);
  for (const pattern of [/life appeared/i, /consciousness emerged/i, /agency emerged/i, /permanent survival proven/i, /eternal/i, /proof of life/i, /biological life appeared/i, /true being/i]) assert(!pattern.test(text), `prohibited positive claim ${pattern}`);
  assert(text.includes('does not prove: biological life') || text.includes('does not prove biological life'), 'biological-life caution missing');
  assert(text.includes('consciousness') && text.includes('agency') && text.includes('subjectivity') && (text.includes('soul') || text.includes('s-o-u-l')) && text.includes('permanent survival'), 'required caution terms missing');
  const runs = new Map(results.runs.map((run) => [run.runId, run]));
  const conditions = new Map(results.conditions.map((condition) => [condition.conditionId, condition]));
  for (const condition of results.conditions) {
    for (const key of ['seedA', 'seedB', 'initializationMode', 'initialWindingA', 'initialWindingB', 'horizon', 'parameterStatus', 'couplingGReference', 'parameterLineage']) assert(key in condition, `condition ${condition.conditionId} missing ${key}`);
    assert(condition.vortexLayoutA || condition.layoutProvenance?.vortexLayoutA, `condition ${condition.conditionId} missing compact layout summary`);
    assert(!/seed-only|fixed-layout/i.test(condition.initializationMode), `condition ${condition.conditionId} appears seed-only/fixed-layout`);
    if (!condition.isControl) {
      const control = runs.get(condition.controlRunId);
      assert(control, `missing matched control ${condition.controlRunId}`);
      assert(control.family === condition.family, 'matched control must be in same family');
    }
  }
  for (const run of results.runs) {
    const condition = conditions.get(run.conditionId);
    assert(condition, `missing condition for ${run.runId}`);
    assert(Array.isArray(run.samples) && run.samples.length > 0, `${run.runId} has no samples`);
    assert(run.observerV2Summary, `${run.runId} missing Observer V2 summary`);
    assert(run.topologicalLedgerSummary, `${run.runId} missing Topological Ledger summary`);
    assert(run.couplingSummary, `${run.runId} missing couplingSummary`);
    assert(run.couplingSummary.couplingType === 'memory', `${run.runId} did not use implemented memory coupling path`);
    assert(run.topologicalLedgerSummary.ledgerAgreementIsNotSuccess === true && run.topologicalLedgerSummary.ledgerMismatchIsNotFailure === true, `${run.runId} missing ledger claim discipline`);
    assert(ALLOWED_LABELS.has(run.classification.classificationLabel), `${run.runId} uses invalid classification label`);
    assert(!/\bproof\b|relation success|maintenance success|persistence success/i.test(asText(run.classification)), `${run.runId} classification overclaims`);
    for (const sample of run.samples) {
      assert(sample.coupling, `${run.runId} sample missing coupling record`);
      assert(sample.topologicalLedger.firstLedgerAgreementStep === null || sample.topologicalLedger.firstLedgerAgreementStep <= sample.step, `${run.runId} first agreement semantics invalid`);
      assert(sample.topologicalLedger.firstLedgerDisagreementStep === null || sample.topologicalLedger.firstLedgerDisagreementStep <= sample.step, `${run.runId} first disagreement semantics invalid`);
    }
    if (condition.family === 'P') {
      assert(run.energyBalanceSummary && 'energy_balance_confound_possible' in run.energyBalanceSummary, `${run.runId} missing Family P energy-balance context`);
    }
    if (!condition.isControl) {
      assert(run.controlComparison, `${run.runId} missing controlComparison`);
      assert(run.controlComparison.controlRunId === condition.controlRunId, `${run.runId} controlComparison points to wrong control`);
      assert(Number.isFinite(run.controlComparison.deltaVsControlEnd), `${run.runId} missing deltaVsControlEnd`);
      assert(Number.isFinite(run.controlComparison.memoryDeltaVsControlEnd), `${run.runId} missing memoryDeltaVsControlEnd`);
      assert(run.samples.some((sample) => sample.topologicalLedger.plaquetteMapDistanceToControl !== null), `${run.runId} has no plaquetteMapDistanceToControl values`);
      assert(condition.couplingG > 0, `${run.runId} coupled condition must have couplingG > 0`);
      assert(run.samples.some((sample) => sample.coupling.MEMORY_COUPLING_ENABLED === true), `${run.runId} missing MEMORY_COUPLING_ENABLED true samples`);
      assert(run.samples.some((sample) => sample.coupling.effectiveMemoryCoupling > 0), `${run.runId} missing positive effectiveMemoryCoupling`);
      assert(run.samples.some((sample) => sample.coupling.memoryCouplingApplied === true), `${run.runId} memory coupling was never applied`);
      if (!run.couplingSummary.couplingHadMeasurableEffectVsControl) assert(run.limitations.includes('coupling_had_no_measurable_effect'), `${run.runId} no measurable coupling effect but limitation missing`);
      assert(run.couplingSummary.couplingHadMeasurableEffectVsControl === true || ['indeterminate', 'common_vacuum_relaxation', 'phase_drift'].includes(run.classification.classificationLabel), `${run.runId} no coupling effect promoted too strongly`);
    } else {
      assert(run.samples.every((sample) => sample.coupling.MEMORY_COUPLING_ENABLED === false && sample.coupling.effectiveMemoryCoupling === 0), `${run.runId} control has effective coupling`);
    }
    const recomputed = independentlyClassify(run, condition);
    assert(recomputed.classificationLabel === run.classification.classificationLabel && recomputed.outcomeCategory === run.classification.outcomeCategory, `${run.runId} classification recompute mismatch`);
    assert(!(condition.family === 'T' && run.classification.outcomeCategory === 'persistent_distinct_interaction_candidate'), `${run.runId} Family T cannot be maintenance`);
    if (condition.family === 'P' && run.classification.outcomeCategory === 'persistent_distinct_interaction_candidate') {
      assert(run.controlComparison?.couplingHadMeasurableEffectVsControl === true, `${run.runId} persistent candidate lacks control separation`);
      assert(run.observerV2Summary.end.reliability.invalidLineCountA + run.observerV2Summary.end.reliability.invalidLineCountB === 0, `${run.runId} persistent candidate reliability not interpretable`);
    }
  }
  for (const key of ['couplingEffectivenessPass', 'allCoupledRunsUseImplementedCoupling', 'allCoupledRunsHaveEffectiveMemoryCoupling', 'allControlsMatched', 'observerV2AxisReported', 'topologicalLedgerAxisReported', 'energyBalanceForFamilyPReported', 'classificationRecomputePass', 'noForbiddenLabelsPass', 'noOverclaimLanguagePass', 'overallSmokePass']) assert(summary[key] === true, `summary flag ${key} must be true`);
  assert(summary.overallSmokePassMeaning === OVERALL_SMOKE_PASS_MEANING, 'overallSmokePassMeaning mismatch');
  assert(!/relation success|maintenance success|persistence proof|survival success/i.test(asText(summary)), 'summary pass flag overclaims scientific outcome');
  assert(gitClean(PROTECTED_FILES), 'protected historical artifacts changed');
  assert(gitClean(PACKAGE_FILES), 'package or lockfile changed');
  console.log('G8 structurally distinct interaction smoke validation passed.');
}

if (require.main === module) main();
module.exports = { independentlyClassify };
