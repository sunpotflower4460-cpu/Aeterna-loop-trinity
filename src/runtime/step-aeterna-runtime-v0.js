'use strict';

const { applyEWMAMemory } = require('../physics/ewma-memory');
const { applySelectedCoupling } = require('../physics/memory-coupling');
const { applyPhaseRotation, createPhaseRotationMetrics } = require('../physics/phase-rotation');
const { computePheromoneStats, diffusePheromoneField } = require('../physics/pheromone');
const { index3D, wrap } = require('./create-aeterna-fields');

function stepFieldDynamics(field, params, config, scratchRe, scratchIm) {
  const n = config.gridSize;
  const dt = config.dt ?? params.DT ?? params.dt ?? 0.03;
  const c2 = config.c2 ?? 1.0;
  const lambda = config.lambda ?? 1.0;
  const vev = config.vev ?? params.VEV ?? params.vev ?? 1.0;
  const gamma = params.GAMMA ?? config.gamma ?? 0.005;
  const vevSquared = vev * vev;
  const { phiRe, phiIm, velRe, velIm } = field;

  for (let z = 0; z < n; z += 1) {
    const zp = wrap(z + 1, n);
    const zm = wrap(z - 1, n);

    for (let y = 0; y < n; y += 1) {
      const yp = wrap(y + 1, n);
      const ym = wrap(y - 1, n);

      for (let x = 0; x < n; x += 1) {
        const xp = wrap(x + 1, n);
        const xm = wrap(x - 1, n);
        const i = index3D(x, y, z, n);
        const re = phiRe[i];
        const im = phiIm[i];
        const lapRe = phiRe[index3D(xp, y, z, n)] + phiRe[index3D(xm, y, z, n)] +
          phiRe[index3D(x, yp, z, n)] + phiRe[index3D(x, ym, z, n)] +
          phiRe[index3D(x, y, zp, n)] + phiRe[index3D(x, y, zm, n)] - 6 * re;
        const lapIm = phiIm[index3D(xp, y, z, n)] + phiIm[index3D(xm, y, z, n)] +
          phiIm[index3D(x, yp, z, n)] + phiIm[index3D(x, ym, z, n)] +
          phiIm[index3D(x, y, zp, n)] + phiIm[index3D(x, y, zm, n)] - 6 * im;
        const ampSquared = re * re + im * im;
        const potentialForce = -lambda * (ampSquared - vevSquared);
        const accRe = c2 * lapRe + potentialForce * re - gamma * velRe[i];
        const accIm = c2 * lapIm + potentialForce * im - gamma * velIm[i];
        const nextVelRe = velRe[i] + dt * accRe;
        const nextVelIm = velIm[i] + dt * accIm;

        velRe[i] = Number.isFinite(nextVelRe) ? nextVelRe : 0;
        velIm[i] = Number.isFinite(nextVelIm) ? nextVelIm : 0;
        scratchRe[i] = Number.isFinite(re) ? re + dt * velRe[i] : 0;
        scratchIm[i] = Number.isFinite(im) ? im + dt * velIm[i] : 0;
      }
    }
  }

  phiRe.set(scratchRe);
  phiIm.set(scratchIm);
}

function updatePheromoneTrace({ pheromoneField, fieldA, fieldB, params, stepCount, gridSize }) {
  if (!pheromoneField) return { pheromoneUpdated: false, pheromoneDepositedCells: 0, pheromoneTotalDeposit: 0, pheromoneTotal: 0 };
  if (!params.PHEROMONE_ENABLED) return { pheromoneUpdated: false, pheromoneDepositedCells: 0, pheromoneTotalDeposit: 0, pheromoneTotal: computePheromoneStats(pheromoneField).pheromoneTotal };

  const updateInterval = params.PHEROMONE_UPDATE_INTERVAL ?? 10;
  if (stepCount % updateInterval !== 0) return { pheromoneUpdated: false, pheromoneDepositedCells: 0, pheromoneTotalDeposit: 0, pheromoneTotal: computePheromoneStats(pheromoneField).pheromoneTotal };

  const retention = Math.pow(params.PHEROMONE_RETENTION ?? 0.99005, updateInterval);
  const deposit = params.PHEROMONE_DEPOSIT ?? 0.01;
  const vev = params.VEV ?? params.vev ?? 1.0;
  const maxValue = params.PHEROMONE_MAX_VALUE ?? 10.0;
  const mode = params.PHEROMONE_DEPOSIT_MODE ?? 'all-above-threshold';
  const count = Math.min(pheromoneField.length, fieldA.phiRe.length, fieldB.phiRe.length);
  let depositedCells = 0;
  let totalDeposit = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const retained = pheromoneField[i] * retention;
    pheromoneField[i] = Number.isFinite(retained) ? Math.max(0, retained) : 0;
  }

  if (mode === 'top-10-percent-amplitude' || mode === 'top-5-percent-amplitude') {
    const topRatio = mode === 'top-5-percent-amplitude' ? 0.05 : 0.10;
    const amplitudes = [];

    for (let i = 0; i < count; i += 1) {
      const ampA = Math.hypot(fieldA.phiRe[i], fieldA.phiIm[i]);
      const ampB = Math.hypot(fieldB.phiRe[i], fieldB.phiIm[i]);
      const avgAmp = (ampA + ampB) / 2;
      if (Number.isFinite(avgAmp)) amplitudes.push([avgAmp, i]);
    }

    amplitudes.sort((a, b) => b[0] - a[0]);
    const keep = Math.max(1, Math.floor(amplitudes.length * topRatio));
    for (let rank = 0; rank < keep; rank += 1) {
      const [avgAmp, i] = amplitudes[rank];
      const amount = deposit * (avgAmp / Math.max(vev, 1e-8));
      pheromoneField[i] = Math.min(maxValue, pheromoneField[i] + amount);
      depositedCells += 1;
      totalDeposit += amount;
    }
  } else {
    const thresholdRatio = params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO ?? 0.7;
    for (let i = 0; i < count; i += 1) {
      const ampA = Math.hypot(fieldA.phiRe[i], fieldA.phiIm[i]);
      const ampB = Math.hypot(fieldB.phiRe[i], fieldB.phiIm[i]);
      const avgAmp = (ampA + ampB) / 2;
      if (Number.isFinite(avgAmp) && avgAmp > vev * thresholdRatio) {
        const amount = deposit * (avgAmp / Math.max(vev, 1e-8));
        pheromoneField[i] = Math.min(maxValue, pheromoneField[i] + amount);
        depositedCells += 1;
        totalDeposit += amount;
      }
    }
  }

  diffusePheromoneField({ pheromoneField, params, index3D, gridSize });
  return { pheromoneUpdated: true, pheromoneDepositedCells: depositedCells, pheromoneTotalDeposit: totalDeposit, pheromoneTotal: computePheromoneStats(pheromoneField).pheromoneTotal };
}

function stepAeternaRuntimeV0(runtime) {
  const { fieldA, fieldB, params, config, scratchARe, scratchAIm, scratchBRe, scratchBIm, pheromoneField } = runtime;
  runtime.stepCount += 1;

  stepFieldDynamics(fieldA, params, config, scratchARe, scratchAIm);
  stepFieldDynamics(fieldB, params, config, scratchBRe, scratchBIm);

  const phaseRotationInfo = applyPhaseRotation(fieldA, fieldB, params);
  const phaseRotationMetrics = createPhaseRotationMetrics(params, phaseRotationInfo, 0, 0);
  let couplingMetrics = null;

  if (params.MEMORY_COUPLING_ORDER === 'before-memory-update') {
    couplingMetrics = applySelectedCoupling(fieldA, fieldB, params);
  }

  if (params.MEMORY_ENABLED) {
    applyEWMAMemory(fieldA, params);
    applyEWMAMemory(fieldB, params);
  }

  if (params.MEMORY_COUPLING_ORDER !== 'before-memory-update') {
    couplingMetrics = applySelectedCoupling(fieldA, fieldB, params);
  }

  const pheromoneMetrics = updatePheromoneTrace({
    pheromoneField,
    fieldA,
    fieldB,
    params,
    stepCount: runtime.stepCount,
    gridSize: config.gridSize,
  });

  runtime.lastCouplingMetrics = couplingMetrics;
  runtime.lastPheromoneMetrics = pheromoneMetrics;
  runtime.lastPhaseRotationMetrics = phaseRotationMetrics;

  return {
    couplingMetrics,
    pheromoneMetrics,
    phaseRotationMetrics,
  };
}

module.exports = {
  stepAeternaRuntimeV0,
  stepFieldDynamics,
  updatePheromoneTrace,
};
