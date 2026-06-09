#!/usr/bin/env node
'use strict';

const { writeScanManifest } = require('./v2.1.2-scan-definitions');

const outputPath = writeScanManifest('pheromone-localization-scan');
console.log(`Wrote v2.1.2 Pheromone localization scan manifest: ${outputPath}`);
