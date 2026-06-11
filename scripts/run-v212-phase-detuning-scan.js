#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { createAeternaRuntimeV0, collectRuntimeMetrics, computeVortexCount, hasNonFiniteValues } = require('../src/runtime/aeterna-runtime-v0');
const { stepAeternaRuntimeV0 } = require('../src/runtime/step-aeterna-runtime-v0');
const { describePhysicsContext } = require('../src/runtime/physics-context');
const { classifyPhaseDynamics, PHASE_BEHAVIOR_CRITERION } = require('../src/runtime/phase-dynamics-classifier');
const {
  classifyPhaseStructureRegime,
  findPhaseLockOnsetStep,
  findRawDistanceCollapseOnsetStep,
  findStructuralCollapseOnsetStep,
  unwrapPhaseSeries,
} = require('../src/metrics/gauge-invariant-metrics');

const ROOT = path.join(__dirname, '..');
const RESULTS_PATH = path.join(ROOT, 'experiments', 'v2.1.2-phase-detuning-scan-results.json');
const SUMMARY_PATH = path.join(ROOT, 'experiments', 'v2.1.2-phase-detuning-scan-summary.json');
const DOC_PATH = path.join(ROOT, 'docs', 'v2.1.2-phase-detuning-scan.md');

const GRID_SIZE = 32;
const MAX_STEPS = 2000;
const CALIBRATION_STEPS = 1000;
const SAMPLE_INTERVAL = 50;
const DT = 0.03;
const SEED_A = 12345;
const SEED_B = 67890;
const OMEGA_A = 0.01;
const COUPLING_G_VALUES = Object.freeze([0.003, 0.005, 0.0075]);
const OMEGA_B_VALUES = Object.freeze([0.05, 0.11, 0.21, 0.41, 0.61]);
const CALIBRATION_OMEGA_B_VALUES = Object.freeze([0.05, 0.21, 0.61]);

const BASE_PARAMS = Object.freeze({
  GAMMA: 0.005,
  MEMORY_ENABLED: true,
  MEMORY_BLEND_VELOCITY: true,
  MEMORY_WEIGHT_MODE: 'fixed',
  MEMORY_VELOCITY_SCALE: 0.1,
  PHASE_ROTATION_ENABLED: true,
  PHASE_ROTATION_TARGET: 'field-and-memory',
  OMEGA_A,
  COUPLING_ENABLED: true,
  COUPLING_TYPE: 'memory',
  MEMORY_COUPLING_ENABLED: true,
  MEMORY_COUPLING_FORMULA: 'difference-attractor',
  MEMORY_COUPLING_ORDER: 'after-memory-update',
  MEMORY_COUPLING_WEIGHT: 1.0,
  MEMORY_WEIGHT: 0.0075,
  HISTORY_ALPHA: 0.002,
  PHEROMONE_ENABLED: false,
  PHEROMONE_FEEDBACK_ENABLED: false,
});

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0 ? null : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function std(values) {
  const m = mean(values);
  if (!Number.isFinite(m)) return null;
  const finite = values.filter(Number.isFinite);
  return Math.sqrt(finite.reduce((sum, value) => sum + (value - m) * (value - m), 0) / finite.length);
}

function totalTravel(values) {
  let travel = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) travel += Math.abs(values[i] - values[i - 1]);
  }
  return travel;
}

function slope(samples) {
  const finite = samples.filter((sample) => Number.isFinite(sample.step) && Number.isFinite(sample.unwrappedThetaStar));
  if (finite.length < 2) return null;
  const xMean = mean(finite.map((sample) => sample.step));
  const yMean = mean(finite.map((sample) => sample.unwrappedThetaStar));
  let numerator = 0;
  let denominator = 0;
  for (const sample of finite) {
    numerator += (sample.step - xMean) * (sample.unwrappedThetaStar - yMean);
    denominator += (sample.step - xMean) * (sample.step - xMean);
  }
  return denominator > 0 ? numerator / denominator : null;
}

function sampleFromMetrics(step, metrics, vortexCount) {
  return {
    step,
    vortexCount,
    thetaStar: metrics.thetaStar,
    unwrappedThetaStar: null,
    rawFieldABDistance: metrics.rawFieldABDistance ?? metrics.fieldABDistance,
    fieldABDistance: metrics.fieldABDistance,
    alignedFieldABDistance: metrics.alignedFieldABDistance,
    D_inv: metrics.D_inv,
    gaugeOverlap: metrics.gaugeOverlap,
    memoryABDistance: metrics.memoryABDistance,
    alignedMemoryABDistance: metrics.alignedMemoryABDistance,
  };
}

function runRuntime({ label, params, maxSteps }) {
  const runtime = createAeternaRuntimeV0({
    gridSize: GRID_SIZE,
    seedA: SEED_A,
    seedB: SEED_B,
    params,
    config: { dt: DT, sampleInterval: SAMPLE_INTERVAL, metricsSampleInterval: SAMPLE_INTERVAL },
  });
  const startedAt = Date.now();
  const samples = [];
  let vortexCount = computeVortexCount(runtime.fieldA, GRID_SIZE) + computeVortexCount(runtime.fieldB, GRID_SIZE);
  const initialVortexCount = vortexCount;
  let finalVortexCount = vortexCount;
  let stepWhenVortexCountReachedZero = vortexCount === 0 ? 0 : null;
  let nonFiniteDetected = hasNonFiniteValues(runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldB.phiRe, runtime.fieldB.phiIm);
  let metrics = collectRuntimeMetrics(runtime, vortexCount);
  samples.push(sampleFromMetrics(0, metrics, vortexCount));

  for (let step = 1; step <= maxSteps; step += 1) {
    stepAeternaRuntimeV0(runtime);
    if (step % SAMPLE_INTERVAL === 0 || step === maxSteps) {
      vortexCount = computeVortexCount(runtime.fieldA, GRID_SIZE) + computeVortexCount(runtime.fieldB, GRID_SIZE);
      finalVortexCount = vortexCount;
      if (stepWhenVortexCountReachedZero === null && vortexCount === 0) stepWhenVortexCountReachedZero = step;
      nonFiniteDetected = nonFiniteDetected || hasNonFiniteValues(
        runtime.fieldA.phiRe, runtime.fieldA.phiIm, runtime.fieldA.velRe, runtime.fieldA.velIm, runtime.fieldA.memoryRe, runtime.fieldA.memoryIm,
        runtime.fieldB.phiRe, runtime.fieldB.phiIm, runtime.fieldB.velRe, runtime.fieldB.velIm, runtime.fieldB.memoryRe, runtime.fieldB.memoryIm,
        runtime.pheromoneField,
      );
      metrics = collectRuntimeMetrics(runtime, vortexCount);
      samples.push(sampleFromMetrics(step, metrics, vortexCount));
    }
  }

  const unwrapped = unwrapPhaseSeries(samples.map((sample) => sample.thetaStar));
  samples.forEach((sample, index) => { sample.unwrappedThetaStar = unwrapped[index]; });
  const secondHalf = samples.filter((sample) => sample.step >= maxSteps / 2);
  const endWindow = samples.slice(-10).map((sample) => sample.unwrappedThetaStar);
  const driftRatePerStep = slope(secondHalf);
  const thetaTotalTravel = totalTravel(unwrapped);
  const structuralRegimeVerdict = classifyPhaseStructureRegime({
    alignedFieldABDistanceSeries: samples.map((sample) => sample.alignedFieldABDistance),
    unwrappedThetaStarSeries: samples.map((sample) => sample.unwrappedThetaStar),
  });
  const phaseDynamics = classifyPhaseDynamics({
    thetaTotalTravel,
    driftRatePerStep,
    thetaEndWindowStd: std(endWindow),
  });
  return {
    label,
    gridSize: GRID_SIZE,
    maxSteps,
    sampleInterval: SAMPLE_INTERVAL,
    seedA: SEED_A,
    seedB: SEED_B,
    dt: DT,
    initialVortexCount,
    finalVortexCount,
    stepWhenVortexCountReachedZero,
    nonFiniteDetected,
    phaseLockOnsetStep: findPhaseLockOnsetStep(samples),
    structuralCollapseOnsetStep: findStructuralCollapseOnsetStep(samples),
    rawDistanceCollapseOnsetStep: findRawDistanceCollapseOnsetStep(samples),
    rawFieldABDistance_start: samples[0].rawFieldABDistance,
    rawFieldABDistance_end: samples[samples.length - 1].rawFieldABDistance,
    alignedFieldABDistance_start: samples[0].alignedFieldABDistance,
    alignedFieldABDistance_end: samples[samples.length - 1].alignedFieldABDistance,
    D_inv_start: samples[0].D_inv,
    D_inv_end: samples[samples.length - 1].D_inv,
    thetaStar_start: samples[0].thetaStar,
    thetaStar_end: samples[samples.length - 1].thetaStar,
    gaugeOverlap_start: samples[0].gaugeOverlap,
    gaugeOverlap_end: samples[samples.length - 1].gaugeOverlap,
    memoryABDistance_start: samples[0].memoryABDistance,
    memoryABDistance_end: samples[samples.length - 1].memoryABDistance,
    alignedMemoryABDistance_start: samples[0].alignedMemoryABDistance,
    alignedMemoryABDistance_end: samples[samples.length - 1].alignedMemoryABDistance,
    driftRatePerStep,
    driftRatePerStep_abs: Math.abs(driftRatePerStep ?? 0),
    thetaTotalTravel,
    thetaEndWindowMean: mean(endWindow),
    thetaEndWindowStd: std(endWindow),
    finalThetaMean: mean(endWindow),
    physicsContext: describePhysicsContext(params, { dt: DT }),
    structuralRegimeVerdict,
    phaseDynamicsVerdict: phaseDynamics.phaseDynamicsVerdict,
    phaseBehavior: phaseDynamics.phaseBehavior,
    phaseBehaviorCriterion: phaseDynamics.phaseBehaviorCriterion,
    baseRegimeVerdict: structuralRegimeVerdict,
    finalRegimeVerdict: phaseDynamics.phaseDynamicsVerdict,
    elapsedMs: Date.now() - startedAt,
    samples,
  };
}

function runCalibration(omegaB) {
  const deltaOmega = omegaB - OMEGA_A;
  const nominalDriftPerStep = deltaOmega * DT;
  const result = runRuntime({
    label: `coupling-off-omegaB-${omegaB}`,
    maxSteps: CALIBRATION_STEPS,
    params: {
      ...BASE_PARAMS,
      COUPLING_ENABLED: false,
      MEMORY_COUPLING_ENABLED: false,
      COUPLING_G: 0,
      OMEGA_B: omegaB,
    },
  });
  return {
    ...result,
    runType: 'coupling_off_calibration',
    couplingEnabled: false,
    memoryCouplingEnabled: false,
    omegaA: OMEGA_A,
    omegaB,
    deltaOmega,
    nominalDriftPerStep,
    measuredDriftRatePerStep: result.driftRatePerStep,
    measuredDriftRatePerStep_abs: Math.abs(result.driftRatePerStep ?? 0),
    driftRateRatio: nominalDriftPerStep !== 0 ? result.driftRatePerStep / nominalDriftPerStep : null,
    driftRateRatio_abs: nominalDriftPerStep !== 0 ? Math.abs(result.driftRatePerStep ?? 0) / Math.abs(nominalDriftPerStep) : null,
  };
}

function boundaryCandidate(result, rowResults) {
  const smallPersistentDrift = result.driftRatePerStep_abs > 1e-4 && result.driftRatePerStep_abs < 5e-4;
  const stdNearThreshold = Math.abs((result.thetaEndWindowStd ?? 999) - 0.02) <= 0.01;
  const sorted = rowResults.slice().sort((a, b) => a.omegaB - b.omegaB);
  const index = sorted.findIndex((item) => item.omegaB === result.omegaB);
  const adjacentFlip = [sorted[index - 1], sorted[index + 1]].some((neighbor) => neighbor && neighbor.phaseDynamicsVerdict !== result.phaseDynamicsVerdict);
  return smallPersistentDrift || stdNearThreshold || adjacentFlip;
}

function runScan(g, omegaB) {
  const deltaOmega = omegaB - OMEGA_A;
  const result = runRuntime({
    label: `g-${g}-omegaB-${omegaB}`,
    maxSteps: MAX_STEPS,
    params: {
      ...BASE_PARAMS,
      COUPLING_G: g,
      OMEGA_B: omegaB,
    },
  });
  return {
    ...result,
    runType: 'g_deltaomega_scan',
    couplingEnabled: true,
    memoryCouplingEnabled: true,
    couplingG: g,
    omegaA: OMEGA_A,
    omegaB,
    deltaOmega,
    nominalDriftPerStep: deltaOmega * DT,
    measuredDriftRatePerStep: result.driftRatePerStep,
    driftRateRatio: deltaOmega !== 0 ? result.driftRatePerStep / (deltaOmega * DT) : null,
    thetaLockApprox: result.phaseDynamicsVerdict === 'phase-locking' ? result.finalThetaMean : null,
    boundaryCandidate: false,
    phenomenonTags: [],
  };
}

function atlasCandidates(scanResults) {
  const candidates = scanResults.filter((result) => result.boundaryCandidate);
  return [
    {
      templateId: 'v212-phase-locking-boundary-candidate',
      sourceExperiment: 'v2.1.2-phase-detuning-scan',
      claimLevel: 'interpretive',
      initialConditionType: 'legacy_same_layout_phase_offset_with_phase_rotation',
      parameters: { ...BASE_PARAMS, couplingGValues: COUPLING_G_VALUES, omegaBValues: OMEGA_B_VALUES },
      physicsContext: describePhysicsContext(BASE_PARAMS, { dt: DT }),
      runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, sampleInterval: SAMPLE_INTERVAL, dt: DT },
      measuredEvidence: candidates.map((result) => ({ couplingG: result.couplingG, deltaOmega: result.deltaOmega, driftRatePerStep: result.driftRatePerStep, thetaEndWindowStd: result.thetaEndWindowStd, structuralRegimeVerdict: result.structuralRegimeVerdict, phaseDynamicsVerdict: result.phaseDynamicsVerdict, phaseBehavior: result.phaseBehavior })),
      observedPhenomena: ['phase-locking', 'phase-drift', 'arnold_tongue_region_candidate'],
      regimeVerdict: 'phase_locking_boundary candidate',
      manualReviewNotes: 'Boundary criteria are scan-local and heuristic; do not call this a confirmed Arnold tongue.',
      limitations: ['legacy same-layout phase dynamics only', '32^3 lightweight scan', 'K_eff not fit exactly'],
      notScriptedNotes: 'Outcomes are measured from thetaStar; lock/drift labels are not hard-coded.',
    },
    {
      templateId: 'v212-arnold-tongue-region-candidate',
      sourceExperiment: 'v2.1.2-phase-detuning-scan',
      claimLevel: 'speculative',
      initialConditionType: 'legacy_same_layout_phase_offset_with_phase_rotation',
      parameters: { qualitativeModel: 'dtheta/dt ~= deltaOmega - K_eff sin(theta)' },
      physicsContext: describePhysicsContext(BASE_PARAMS, { dt: DT }),
      runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, sampleInterval: SAMPLE_INTERVAL, dt: DT },
      measuredEvidence: candidates.map((result) => ({ couplingG: result.couplingG, omegaB: result.omegaB, deltaOmega: result.deltaOmega, nominalDriftPerStep: result.nominalDriftPerStep, measuredDriftRatePerStep: result.measuredDriftRatePerStep })),
      observedPhenomena: ['arnold_tongue_region_candidate'],
      regimeVerdict: 'candidate only',
      manualReviewNotes: 'Compare against Adler-like dynamics qualitatively only.',
      limitations: ['no exact K_eff estimate', 'requires denser scan for confirmation'],
      notScriptedNotes: 'Boundary candidates were derived after measuring adjacent row flips and drift statistics.',
    },
  ];
}

function writeDoc(calibrations, scanResults, summary) {
  const calRows = calibrations.map((r) => `| ${r.omegaB} | ${r.deltaOmega.toFixed(3)} | ${r.nominalDriftPerStep.toFixed(6)} | ${r.measuredDriftRatePerStep.toFixed(6)} | ${r.driftRateRatio.toFixed(3)} | ${r.thetaTotalTravel.toFixed(6)} |`);
  const scanRows = scanResults.map((r) => `| ${r.couplingG} | ${r.omegaB} | ${r.deltaOmega.toFixed(3)} | ${r.nominalDriftPerStep.toFixed(6)} | ${r.driftRatePerStep.toFixed(6)} | ${r.thetaEndWindowStd.toFixed(6)} | ${r.thetaTotalTravel.toFixed(6)} | ${r.structuralRegimeVerdict} | ${r.phaseDynamicsVerdict} | ${r.phaseBehavior} | ${r.boundaryCandidate} |`);
  const doc = `# v2.1.2 Phase Detuning Scan

## Purpose

PR #27 corrected the observer. This scan maps a first lightweight g × Δω phase-locking / phase-drift boundary using legacy same-layout phase-offset initial conditions for clean phase dynamics.

## Corrected scan axis

Phase rotation advances by \`omega * dt\` per step. With \`dt=${DT}\`, earlier tiny Δω values are expected to remain locked over 1000–2000 steps and are not suitable for boundary discovery. This scan therefore uses \`OMEGA_B = ${OMEGA_B_VALUES.join(', ')}\` with \`OMEGA_A=${OMEGA_A}\`.

## Parameters

- Grid: ${GRID_SIZE}^3
- Main scan steps: ${MAX_STEPS}
- Coupling-off calibration steps: ${CALIBRATION_STEPS}
- Sample interval: ${SAMPLE_INTERVAL}
- COUPLING_G: ${COUPLING_G_VALUES.join(', ')}
- PHEROMONE_ENABLED=false for clean phase dynamics
- Drift classification for this scan is expanded: phase_drift if thetaTotalTravel >= pi OR abs(driftRatePerStep) > 1e-4 rad/step in the second half.
- The drift-rate threshold is a v2.1.2 scan heuristic calibrated for dt=0.03 and 2000-step runs; it is not a universal physical constant.

## Coupling-OFF drift calibration

| OMEGA_B | Δω | nominal drift/step | measured drift/step | ratio | theta travel |
| ---: | ---: | ---: | ---: | ---: | ---: |
${calRows.join('\n')}

## g × Δω scan results

| g | OMEGA_B | Δω | nominal drift/step | driftRatePerStep | end std | theta travel | structural verdict | phase dynamics verdict | phase behavior | boundary candidate |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
${scanRows.join('\n')}

## Adler / Arnold tongue interpretation

The qualitative comparison is \`dθ/dt ≈ Δω - K_eff sin(θ)\`: coupling-dominated rows are interpreted as phase-locking, detuning-dominated rows as phase-drift, and row transitions as \`arnold_tongue_region_candidate\` only. This is not a confirmed Arnold tongue and no exact \`K_eff\` is claimed.

## Limitations and next steps

- Legacy same-layout setup isolates phase dynamics but does not test structurally distinct fields.
- Boundary candidates need denser Δω rows and longer runs before confirmation.
- No v2.2 mechanisms or new physical terms were enabled.

Machine-readable outputs were written to \`experiments/v2.1.2-phase-detuning-scan-results.json\` and \`experiments/v2.1.2-phase-detuning-scan-summary.json\`.
`;
  fs.writeFileSync(DOC_PATH, doc);
}

function main() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  const calibrations = CALIBRATION_OMEGA_B_VALUES.map(runCalibration);
  const scanResults = [];
  for (const g of COUPLING_G_VALUES) {
    for (const omegaB of OMEGA_B_VALUES) scanResults.push(runScan(g, omegaB));
    const row = scanResults.filter((result) => result.couplingG === g);
    row.forEach((result) => {
      result.boundaryCandidate = boundaryCandidate(result, row);
      if (result.boundaryCandidate) result.phaseBehavior = 'boundary-candidate';
      result.phenomenonTags = result.boundaryCandidate ? ['arnold_tongue_region_candidate', 'phase_boundary_candidate'] : [];
    });
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    purpose: 'Corrected g x deltaOmega phase-locking / phase-drift smoke scan.',
    physicsContext: describePhysicsContext(BASE_PARAMS, { dt: DT }),
    runConfig: { gridSize: GRID_SIZE, maxSteps: MAX_STEPS, calibrationSteps: CALIBRATION_STEPS, sampleInterval: SAMPLE_INTERVAL, dt: DT, seedA: SEED_A, seedB: SEED_B },
    correctedAxes: { couplingGValues: COUPLING_G_VALUES, omegaA: OMEGA_A, omegaBValues: OMEGA_B_VALUES, deltaOmegaValues: OMEGA_B_VALUES.map((omegaB) => omegaB - OMEGA_A) },
    expandedDriftCriterion: 'phase_drift if thetaTotalTravel >= pi OR abs(driftRatePerStep) > 1e-4 rad/step in the second half; scan-local only.',
    phaseBehaviorCriterion: PHASE_BEHAVIOR_CRITERION,
    calibrationSummary: calibrations.map((r) => ({ omegaB: r.omegaB, deltaOmega: r.deltaOmega, nominalDriftPerStep: r.nominalDriftPerStep, measuredDriftRatePerStep: r.measuredDriftRatePerStep, measuredDriftRatePerStep_abs: r.measuredDriftRatePerStep_abs, driftRateRatio: r.driftRateRatio, driftRateRatio_abs: r.driftRateRatio_abs, thetaTotalTravel: r.thetaTotalTravel })),
    scanSummary: scanResults.map((r) => ({ couplingG: r.couplingG, omegaB: r.omegaB, deltaOmega: r.deltaOmega, driftRatePerStep: r.driftRatePerStep, driftRatePerStep_abs: r.driftRatePerStep_abs, thetaEndWindowStd: r.thetaEndWindowStd, thetaTotalTravel: r.thetaTotalTravel, structuralRegimeVerdict: r.structuralRegimeVerdict, phaseDynamicsVerdict: r.phaseDynamicsVerdict, phaseBehavior: r.phaseBehavior, finalRegimeVerdict: r.finalRegimeVerdict, boundaryCandidate: r.boundaryCandidate })),
    boundaryCandidates: scanResults.filter((r) => r.boundaryCandidate).map((r) => ({ couplingG: r.couplingG, omegaB: r.omegaB, deltaOmega: r.deltaOmega, driftRatePerStep: r.driftRatePerStep, thetaEndWindowStd: r.thetaEndWindowStd, structuralRegimeVerdict: r.structuralRegimeVerdict, phaseDynamicsVerdict: r.phaseDynamicsVerdict, phaseBehavior: r.phaseBehavior })),
    atlasCandidates: atlasCandidates(scanResults),
    defaultLegacyBehaviorUnchanged: true,
  };
  fs.writeFileSync(RESULTS_PATH, `${JSON.stringify({ generatedAt: summary.generatedAt, calibrations, scanResults }, null, 2)}\n`);
  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  writeDoc(calibrations, scanResults, summary);
  console.log(`Wrote ${path.relative(ROOT, RESULTS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SUMMARY_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, DOC_PATH)}`);
}

if (require.main === module) main();

module.exports = { runCalibration, runScan };
