'use strict';

const PHASE_BEHAVIOR_CRITERION = Object.freeze({
  driftRateThresholdPerStep: 1e-4,
  thetaTravelThreshold: Math.PI,
  lockThetaEndWindowStdMax: 0.02,
  calibratedForDt: 0.03,
  calibratedForMaxSteps: 2000,
  criterionScope: 'v2.1.2 phase-detuning scan heuristic',
});

function classifyPhaseDynamics(input = {}) {
  const criterion = {
    ...PHASE_BEHAVIOR_CRITERION,
    ...(input.phaseBehaviorCriterion || {}),
  };
  const thetaTotalTravel = input.thetaTotalTravel;
  const driftRatePerStep = input.driftRatePerStep;
  const thetaEndWindowStd = input.thetaEndWindowStd;
  const driftRateAbs = Math.abs(driftRatePerStep ?? 0);
  const phaseDrift =
    (Number.isFinite(thetaTotalTravel) && thetaTotalTravel >= criterion.thetaTravelThreshold) ||
    (Number.isFinite(driftRatePerStep) && driftRateAbs > criterion.driftRateThresholdPerStep);

  let phaseDynamicsVerdict = 'phase-indeterminate';
  if (phaseDrift) {
    phaseDynamicsVerdict = 'phase-drift';
  } else if (
    Number.isFinite(thetaEndWindowStd) &&
    thetaEndWindowStd <= criterion.lockThetaEndWindowStdMax &&
    Number.isFinite(driftRatePerStep) &&
    driftRateAbs <= criterion.driftRateThresholdPerStep
  ) {
    phaseDynamicsVerdict = 'phase-locking';
  }

  let phaseBehavior = 'indeterminate';
  if (phaseDynamicsVerdict === 'phase-drift') phaseBehavior = 'drifting';
  if (phaseDynamicsVerdict === 'phase-locking') phaseBehavior = 'locked';
  if (input.boundaryCandidate) phaseBehavior = 'boundary-candidate';

  return {
    phaseDynamicsVerdict,
    phaseBehavior,
    phaseBehaviorCriterion: criterion,
  };
}

module.exports = {
  PHASE_BEHAVIOR_CRITERION,
  classifyPhaseDynamics,
};
