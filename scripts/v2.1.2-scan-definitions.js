'use strict';

const fs = require('fs');
const path = require('path');

const SCAN_DEFINITIONS = Object.freeze({
  'history-alpha-scan': Object.freeze({
    experimentName: 'experiment:history-alpha-scan',
    runType: 'surrogate-headless',
    values: Object.freeze({
      HISTORY_ALPHA: Object.freeze([0.04, 0.02, 0.01, 0.004, 0.002]),
      MEMORY_WEIGHT: Object.freeze([0.04, 0.08, 0.12, 0.16]),
    }),
    metrics: Object.freeze([
      'HISTORY_ALPHA',
      'MEMORY_WEIGHT',
      'vortexLifetimeAverage',
      'finalVortexCount',
      'memoryFieldDifferenceA',
      'memoryFieldDifferenceB',
      'amplitudeMeanA',
      'amplitudeMeanB',
      'fieldEnergyProxy',
      'R_A_local_average',
      'R_B_local_average',
      'runType',
      'dynamicsType',
    ]),
  }),
  'memory-coupling-micro-scan': Object.freeze({
    experimentName: 'experiment:memory-coupling-micro-scan',
    runType: 'surrogate-headless',
    values: Object.freeze({
      MEMORY_COUPLING_WEIGHT: Object.freeze([0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5]),
      COUPLING_G: Object.freeze([0.01, 0.02, 0.03, 0.05]),
    }),
    metrics: Object.freeze([
      'MEMORY_COUPLING_WEIGHT',
      'COUPLING_G',
      'fieldABDistance',
      'memoryABDistance',
      'R_AB_orderDifferenceRatio',
      'vortexLifetimeAverage',
      'amplitudeStdA',
      'amplitudeStdB',
      'fieldEnergyProxy',
      'runType',
      'dynamicsType',
    ]),
    successCandidate: 'fieldABDistance remains around 0.01-0.1, A/B do not become identical, vortices remain, and fieldEnergyProxy stays bounded.',
  }),
  'pheromone-localization-scan': Object.freeze({
    experimentName: 'experiment:pheromone-localization-scan',
    runType: 'surrogate-headless',
    values: Object.freeze({
      PHEROMONE_DIFFUSION: Object.freeze([0, 0.00005, 0.0001, 0.0002, 0.0005]),
      PHEROMONE_DEPOSIT_THRESHOLD_RATIO: Object.freeze([0.85, 0.9, 0.95]),
      PHEROMONE_DEPOSIT: Object.freeze([0.005, 0.01, 0.02]),
    }),
    metrics: Object.freeze([
      'pheromoneActiveRatio',
      'pheromoneMax',
      'pheromoneMass',
      'pheromoneEnergyL2',
      'pheromoneSpatialEntropy',
      'R_local_near_pheromone',
      'vortexPathRevisitRate',
      'runType',
      'dynamicsType',
    ]),
    successCandidate: 'pheromoneActiveRatio does not reach 1, local high-density regions remain, pheromoneEnergyL2 saturates, and the field does not become a uniform background.',
  }),
});

function writeScanManifest(scanKey) {
  const definition = SCAN_DEFINITIONS[scanKey];
  if (!definition) {
    throw new Error(`Unknown v2.1.2 scan: ${scanKey}`);
  }

  const outputPath = path.join(__dirname, '..', 'experiments', `${scanKey}-plan.json`);
  const manifest = {
    ...definition,
    status: 'planned',
    note: 'v2.1.2 skeleton only; connect to the real 64^3 loop before treating results as physical validation.',
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputPath;
}

module.exports = {
  SCAN_DEFINITIONS,
  writeScanManifest,
};
