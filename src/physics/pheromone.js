'use strict';

const EMPTY_PHEROMONE_UPDATE_METRICS = Object.freeze({
  pheromoneUpdated: false,
  pheromoneDepositedCells: 0,
  pheromoneTotalDeposit: 0,
  pheromoneTotal: 0,
});

const EMPTY_PHEROMONE_FEEDBACK_METRICS = Object.freeze({
  pheromoneFeedbackApplied: false,
  pheromoneFeedbackDelta: 0,
  pheromoneFeedbackAppliedCells: 0,
});

function defaultIndex3D(x, y, z, gridSize) {
  return x + gridSize * (y + gridSize * z);
}

function createPheromoneField(size) {
  return new Float32Array(size);
}

function computePheromoneEnergyL2(pheromoneField) {
  if (!pheromoneField) return 0;

  let sumSq = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const value = pheromoneField[i];
    const v = Number.isFinite(value) ? value : 0;
    sumSq += v * v;
  }

  return 0.5 * sumSq;
}

function computePheromoneTotal(pheromoneField) {
  if (!pheromoneField) return 0;

  let sum = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const value = pheromoneField[i];
    if (!Number.isFinite(value)) continue;
    sum += value;
  }

  return sum;
}


function computePheromoneSpatialEntropy(pheromoneField) {
  if (!pheromoneField || pheromoneField.length === 0) return 0;

  let sum = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const value = pheromoneField[i];
    if (Number.isFinite(value)) sum += Math.max(0, value);
  }

  if (sum <= 1e-12) return 0;

  let entropy = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const value = pheromoneField[i];
    const p = (Number.isFinite(value) ? Math.max(0, value) : 0) / sum;
    if (p > 1e-12) entropy -= p * Math.log(p);
  }

  return entropy / Math.log(pheromoneField.length);
}

function computePheromoneStats(pheromoneField) {
  if (!pheromoneField) {
    return {
      pheromoneTotal: 0,
      pheromoneMean: 0,
      pheromoneStd: 0,
      pheromoneMax: 0,
      pheromoneActiveRatio: 0,
      pheromoneMass: 0,
      pheromoneEnergyL2: 0,
      pheromoneSpatialEntropy: 0,
    };
  }

  let sum = 0;
  let sumSq = 0;
  let max = 0;
  let activeCount = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const value = pheromoneField[i];
    const v = Number.isFinite(value) ? value : 0;

    sum += v;
    sumSq += v * v;
    if (v > max) max = v;
    if (v > 1e-6) activeCount += 1;
  }

  const count = Math.max(pheromoneField.length, 1);
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  return {
    pheromoneTotal: sum,
    pheromoneMass: sum,
    pheromoneEnergyL2: 0.5 * sumSq,
    pheromoneMean: mean,
    pheromoneStd: Math.sqrt(Math.max(variance, 0)),
    pheromoneMax: max,
    pheromoneActiveRatio: activeCount / count,
    pheromoneSpatialEntropy: computePheromoneSpatialEntropy(pheromoneField),
  };
}

function diffusePheromoneField({
  pheromoneField,
  params = {},
  index3D = defaultIndex3D,
  gridSize,
} = {}) {
  if (!pheromoneField || !gridSize) return;

  const diffusion = params.PHEROMONE_DIFFUSION ?? 0.001;
  const maxValue = params.PHEROMONE_MAX_VALUE ?? 10.0;

  if (diffusion <= 0) return;

  const temp = new Float32Array(pheromoneField.length);

  for (let z = 0; z < gridSize; z += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const i = index3D(x, y, z, gridSize);
        const center = Number.isFinite(pheromoneField[i]) ? pheromoneField[i] : 0;
        const xp = pheromoneField[index3D((x + 1) % gridSize, y, z, gridSize)] || 0;
        const xm = pheromoneField[index3D((x - 1 + gridSize) % gridSize, y, z, gridSize)] || 0;
        const yp = pheromoneField[index3D(x, (y + 1) % gridSize, z, gridSize)] || 0;
        const ym = pheromoneField[index3D(x, (y - 1 + gridSize) % gridSize, z, gridSize)] || 0;
        const zp = pheromoneField[index3D(x, y, (z + 1) % gridSize, gridSize)] || 0;
        const zm = pheromoneField[index3D(x, y, (z - 1 + gridSize) % gridSize, gridSize)] || 0;
        const lap = xp + xm + yp + ym + zp + zm - 6 * center;
        const next = center + diffusion * lap;

        temp[i] = Number.isFinite(next) ? Math.min(maxValue, Math.max(0, next)) : 0;
      }
    }
  }

  pheromoneField.set(temp);
}

function updatePheromoneField({
  pheromoneField,
  fieldA,
  fieldB,
  params = {},
  stepCount = 0,
  index3D = defaultIndex3D,
  gridSize,
} = {}) {
  if (!pheromoneField) return { ...EMPTY_PHEROMONE_UPDATE_METRICS };

  if (!params.PHEROMONE_ENABLED) {
    return {
      ...EMPTY_PHEROMONE_UPDATE_METRICS,
      pheromoneTotal: computePheromoneTotal(pheromoneField),
    };
  }

  const updateInterval = params.PHEROMONE_UPDATE_INTERVAL ?? 10;

  if (stepCount % updateInterval !== 0) {
    return {
      ...EMPTY_PHEROMONE_UPDATE_METRICS,
      pheromoneTotal: computePheromoneTotal(pheromoneField),
    };
  }

  if (!fieldA || !fieldA.phiRe || !fieldA.phiIm) {
    return {
      ...EMPTY_PHEROMONE_UPDATE_METRICS,
      pheromoneTotal: computePheromoneTotal(pheromoneField),
    };
  }

  const retentionBase = params.PHEROMONE_RETENTION ?? 0.99005;
  const retention = Math.pow(retentionBase, updateInterval);
  const deposit = params.PHEROMONE_DEPOSIT ?? 0.01;
  const thresholdRatio = params.PHEROMONE_DEPOSIT_THRESHOLD_RATIO ?? 0.7;
  const VEV = params.VEV ?? params.vev ?? 1.0;
  const maxValue = params.PHEROMONE_MAX_VALUE ?? 10.0;
  const fieldBAvailable = Boolean(fieldB && fieldB.phiRe && fieldB.phiIm);
  const count = Math.min(pheromoneField.length, fieldA.phiRe.length, fieldBAvailable ? fieldB.phiRe.length : fieldA.phiRe.length);
  let depositedCells = 0;
  let totalDeposit = 0;

  for (let i = 0; i < pheromoneField.length; i += 1) {
    const retained = pheromoneField[i] * retention;
    pheromoneField[i] = Number.isFinite(retained) ? Math.max(0, retained) : 0;
  }

  for (let i = 0; i < count; i += 1) {
    const aRe = fieldA.phiRe[i];
    const aIm = fieldA.phiIm[i];
    const bRe = fieldBAvailable ? fieldB.phiRe[i] : aRe;
    const bIm = fieldBAvailable ? fieldB.phiIm[i] : aIm;

    if (!Number.isFinite(aRe) || !Number.isFinite(aIm) || !Number.isFinite(bRe) || !Number.isFinite(bIm)) continue;

    const ampA = Math.hypot(aRe, aIm);
    const ampB = Math.hypot(bRe, bIm);
    const avgAmp = (ampA + ampB) / 2;

    if (avgAmp > VEV * thresholdRatio) {
      const amount = deposit * (avgAmp / Math.max(VEV, 1e-8));
      pheromoneField[i] = Math.min(maxValue, pheromoneField[i] + amount);
      depositedCells += 1;
      totalDeposit += amount;
    }
  }

  diffusePheromoneField({
    pheromoneField,
    params,
    index3D,
    gridSize,
  });

  return {
    pheromoneUpdated: true,
    pheromoneDepositedCells: depositedCells,
    pheromoneTotalDeposit: totalDeposit,
    pheromoneTotal: computePheromoneTotal(pheromoneField),
  };
}

function applyPheromoneFeedback({
  pheromoneField,
  field,
  params = {},
  index3D = defaultIndex3D,
  gridSize,
} = {}) {
  if (!params.PHEROMONE_FEEDBACK_ENABLED) return { ...EMPTY_PHEROMONE_FEEDBACK_METRICS };

  if (!pheromoneField || !field || !field.phiRe || !field.phiIm || !gridSize) {
    return { ...EMPTY_PHEROMONE_FEEDBACK_METRICS };
  }

  const strength = params.PHEROMONE_FEEDBACK_STRENGTH ?? 0.002;
  const minAmp = params.PULSE_MIN_AMP ?? 0.01;
  let appliedCells = 0;
  let totalDelta = 0;

  for (let z = 0; z < gridSize; z += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const i = index3D(x, y, z, gridSize);
        const re = field.phiRe[i];
        const im = field.phiIm[i];

        if (!Number.isFinite(re) || !Number.isFinite(im)) {
          field.phiRe[i] = 0;
          field.phiIm[i] = 0;
          continue;
        }

        const amp = Math.hypot(re, im);
        if (amp <= minAmp) continue;

        const center = Number.isFinite(pheromoneField[i]) ? pheromoneField[i] : 0;
        const xp = pheromoneField[index3D((x + 1) % gridSize, y, z, gridSize)] || 0;
        const xm = pheromoneField[index3D((x - 1 + gridSize) % gridSize, y, z, gridSize)] || 0;
        const yp = pheromoneField[index3D(x, (y + 1) % gridSize, z, gridSize)] || 0;
        const ym = pheromoneField[index3D(x, (y - 1 + gridSize) % gridSize, z, gridSize)] || 0;
        const zp = pheromoneField[index3D(x, y, (z + 1) % gridSize, gridSize)] || 0;
        const zm = pheromoneField[index3D(x, y, (z - 1 + gridSize) % gridSize, gridSize)] || 0;
        const gradMag = Math.abs(xp - xm) + Math.abs(yp - ym) + Math.abs(zp - zm);

        if (gradMag <= 1e-8) continue;

        const boost = strength * Math.min(center, 1.0);
        const nextRe = re * (1 + boost);
        const nextIm = im * (1 + boost);

        field.phiRe[i] = nextRe;
        field.phiIm[i] = nextIm;
        totalDelta += Math.abs(Math.hypot(nextRe, nextIm) - amp);
        appliedCells += 1;
      }
    }
  }

  return {
    pheromoneFeedbackApplied: true,
    pheromoneFeedbackDelta: totalDelta,
    pheromoneFeedbackAppliedCells: appliedCells,
  };
}

module.exports = {
  EMPTY_PHEROMONE_FEEDBACK_METRICS,
  EMPTY_PHEROMONE_UPDATE_METRICS,
  applyPheromoneFeedback,
  computePheromoneEnergyL2,
  computePheromoneSpatialEntropy,
  computePheromoneStats,
  computePheromoneTotal,
  createPheromoneField,
  diffusePheromoneField,
  updatePheromoneField,
};
