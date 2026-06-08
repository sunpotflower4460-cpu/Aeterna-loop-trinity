# AeternaLoop v2.1.1 Implementation Phases

## Step 0: GAMMA スキャン診断

### 目的

対消滅や消失の原因を推測ではなく実測で見る。

### やること

- `NOISE_AMP = 0.001` のまま固定
- `GAMMA = 0` を含めてテスト
- `GAMMA = 0.001`〜`0.01` を `0.001` 刻みで走査
- `vortexCount` が 0 になるまでの step を記録
- 全エネルギーの減少を見る
- 数値的散逸の有無を判断する

### 分岐

- Case A: `GAMMA=0` でも消える
- Case B: `GAMMA` を下げると寿命が伸びる
- Case C: `GAMMA≈0.003` で自然に長持ち
- Case D: `GAMMA≈0.002` 付近で自発的な呼吸が出る

## Step 0.5: 観測指標の先行整備

### 目的

実装前に「目」を作る。

### Step 0.5: Observability Metrics

Status: Implemented / Partial

Implemented:
- [x] `R_A_global`
- [x] `R_B_global`（B場が渡された場合に計算。現行 headless GAMMA scan は単一場のため `null`）
- [x] `R_AB_relative`（A/B 両方が渡された場合に計算）
- [x] `R_A_local_average`
- [x] `R_B_local_average`（B場が渡された場合に計算）
- [x] amplitude stats
- [x] totalEnergy
- [x] vortexLifetime tracking
- [x] metrics sampling interval
- [x] debug display or global metrics object

Notes:
- Metrics functions were added in `src/metrics/aeterna-metrics.js` and are pure observational helpers.
- Local order uses sampled 3×3×3 neighborhoods rather than all cells. The GAMMA scan currently samples 512 cells per metrics sample.
- `totalEnergy` is currently the simple amplitude-energy proxy (`re² + im²`) unless a caller supplies `computeGradientEnergy`.
- The current repository snapshot has no main A/B simulation loop, so `scripts/run-gamma-scan.js` connects the metrics to the existing single-field headless diagnostic and leaves B metrics as `null`.
- Vortex lifetime is count-based because the existing detector returns only `vortexCount`, not vortex positions.
- The latest sampled metrics are available as `latestMetrics` in `experiments/gamma-scan-results.json`; during the Node run they are also assigned to `globalThis.__AETERNA_METRICS__`.

## Step 1: EWMA 記憶層

### 目的

純粋な「線」＝記憶の効果を見る。

### やること

- `fieldA` / `fieldB` に `memoryRe` / `memoryIm` を追加
- EWMA 更新を追加
- memory blend を追加
- velocity blend を弱く追加
- Gentle Pulse はまだ入れない

### Step 1: EWMA Memory Layer

Status: Partial / Implemented in headless surrogate

Implemented:
- [x] `fieldA.memoryRe` / `memoryIm` equivalent in the headless surrogate field object
- [ ] `fieldB.memoryRe` / `memoryIm` in a real A/B simulation loop（現行 repository snapshot には本体 B 場がない）
- [x] `MEMORY_ENABLED` flag
- [x] `HISTORY_ALPHA`
- [x] `MEMORY_WEIGHT`
- [x] `MEMORY_WEIGHT_MODE`
- [x] `MEMORY_INIT_MODE`
- [x] `applyEWMAMemory()`
- [x] velocity blend option
- [x] memory metrics
- [x] ON/OFF comparison via `npm run experiment:memory-ewma`
- [x] experiment log entry

Notes:
- Step 1 is intentionally limited to EWMA memory. Gentle Pulse, phase circulation, Memory Coupling, pheromone fields, and visual life-like effects remain unimplemented.
- `src/physics/ewma-memory.js` contains `applyEWMAMemory()`, `computeMemoryWeight()`, and memory initialization helpers.
- `src/params/aeterna-params.js` contains the default EWMA parameter set with `MEMORY_ENABLED: false` to preserve baseline behavior.
- `scripts/run-memory-ewma.js` applies EWMA after field dynamics and before vortex / metrics sampling.
- The current repository snapshot has no real A/B simulation loop, so the comparison script uses the existing single-field headless diagnostic pattern and leaves B metrics as `null`.
- Latest results are stored in `experiments/memory-ewma-results.json`.

## Step 2: 恒常性型 Gentle Pulse

### 目的

散逸に抗う穏やかなエネルギー補給を見る。

### やること

- `amp < VEV * 0.95` のセルのみ補正
- 位相には干渉しない
- `PULSE_STRENGTH = 0.005` から開始
- 強すぎる場合は弱める
- Case D が出た場合は省略も検討する

### Step 2: Homeostatic Gentle Pulse

Status: Partial / Implemented in headless surrogate

Implemented:
- [x] `PULSE_ENABLED` flag
- [x] `PULSE_INTERVAL`
- [x] `PULSE_STRENGTH`
- [x] `PULSE_THRESHOLD_RATIO`
- [x] `PULSE_MIN_AMP`
- [x] `applyGentlePulse()`
- [x] pulse metrics
- [x] ON/OFF comparison via `npm run experiment:gentle-pulse`
- [x] experiment log entry

Notes:
- `src/physics/gentle-pulse.js` contains the amplitude-only homeostatic correction and returns pulse intervention metrics.
- The pulse corrects only cells with `amp > PULSE_MIN_AMP` and `amp < VEV * PULSE_THRESHOLD_RATIO`; it does not rotate phase, add sinusoidal modulation, add random noise, or inject velocity.
- `src/params/aeterna-params.js` keeps `PULSE_ENABLED: false` by default to preserve baseline behavior and allow ON/OFF comparison.
- `scripts/run-gentle-pulse.js` applies Gentle Pulse after field dynamics and before vortex / metrics sampling.
- The current repository snapshot has no real A/B simulation loop, so the comparison script uses the existing single-field headless diagnostic pattern and leaves B metrics as `null` or zero pulse totals.
- Latest results are stored in `experiments/gentle-pulse-results.json`.

## Step 3: 位相循環

### 目的

渦の自然発生と持続を見る。

### やること

- `OMEGA_A` / `OMEGA_B` による位相回転
- field と memory を同時に回転
- `OMEGA_B` を掃引する
  - `0.011`
  - `0.012`
  - `0.015`
  - `0.01618`
  - `0.018`


### Step 3: Phase Rotation / Operator Splitting

Status: Partial / Implemented in headless A/B surrogate

Implemented:
- [x] `PHASE_ROTATION_ENABLED` flag
- [x] `OMEGA_A`
- [x] `OMEGA_B`
- [x] `rotateComplexField()`
- [x] `applyPhaseRotation()`
- [x] `field-and-memory` rotation
- [x] optional renormalization
- [x] `OMEGA_B` scan via `npm run experiment:phase-rotation`
- [x] experiment log entry

Notes:
- `src/physics/phase-rotation.js` applies a unitary complex rotation to `phiRe` / `phiIm`, and rotates `memoryRe` / `memoryIm` when `PHASE_ROTATION_TARGET` is `field-and-memory`.
- `src/params/aeterna-params.js` keeps `PHASE_ROTATION_ENABLED: false` and `PHASE_ROTATION_RENORMALIZE: false` by default to preserve baseline behavior.
- `scripts/run-phase-rotation.js` applies the operator split after field dynamics and EWMA memory blend, then samples vortices and metrics.
- The current repository snapshot has no browser/UI simulation loop, so the implementation is connected to a headless A/B diagnostic surrogate and exposes `globalThis.__AETERNA_PHASE_METRICS__` during the Node run.
- Latest results are stored in `experiments/phase-rotation-results.json`.
- Memory Coupling, pheromone fields, morphology resonance, and large UI changes remain unimplemented.

## Step 4: Memory Coupling

### 目的

A場とB場が、現在ではなく過去の平均状態を介して結合するようにする。

### やること

- `COUPLING_TYPE = 'memory'` を追加
- 既存の amplitude / phase / cross と切替可能にする
- `R_AB_relative` の変化を見る

### Step 4: Memory Coupling

Status: Partial / Implemented in headless A/B surrogate

Implemented:
- [x] `COUPLING_TYPE` includes `'memory'`
- [x] `MEMORY_COUPLING_ENABLED` flag
- [x] `MEMORY_COUPLING_WEIGHT`
- [x] `MEMORY_COUPLING_USE_BIDIRECTIONAL`
- [x] `applyMemoryCoupling()`
- [x] coupling metrics
- [x] `fieldABDistance`
- [x] `memoryABDistance`
- [x] ON/OFF comparison via `npm run experiment:memory-coupling`
- [x] experiment log entry

Notes:
- `src/params/aeterna-params.js` keeps `COUPLING_TYPE: 'amplitude'` and `MEMORY_COUPLING_ENABLED: false` by default to preserve baseline behavior.
- `src/physics/memory-coupling.js` applies bidirectional memory coupling only when `COUPLING_TYPE` is `'memory'` and `MEMORY_COUPLING_ENABLED` is true.
- `scripts/run-memory-coupling.js` applies field dynamics, then Memory Coupling against the previous EWMA memory, then EWMA memory updates, then metrics sampling.
- The current repository snapshot has no browser/UI simulation loop and no pre-existing amplitude coupling implementation, so the amplitude baseline remains a no-op in the diagnostic surrogate.
- Latest results are stored in `experiments/memory-coupling-results.json`.
- Memory weights `1.0+` nearly erase A/B field and memory distance over 5000 steps in this surrogate; lower coupling should be considered before Step 5.
- Pheromone fields, morphology resonance, Bhramari modulation, Katakamuna formant injection, and large UI changes remain unimplemented.

## Step 5: フェロモン場

### 目的

空間に痕跡を残す。

### やること

- `pheromoneField` を追加
- 64³ の解像度を保つ
- 10ステップに1回だけ更新する
- 高振幅セルが痕跡を残す
- ゆっくり拡散する
- 後半で pheromone gradient を場へフィードバックする

### Step 5: Pheromone Field

Status: Partial / Implemented in headless A/B surrogate

Implemented:
- [x] `PHEROMONE_ENABLED` flag
- [x] `PHEROMONE_UPDATE_INTERVAL`
- [x] `PHEROMONE_RETENTION`
- [x] `PHEROMONE_DEPOSIT`
- [x] `PHEROMONE_DIFFUSION`
- [x] `pheromoneField`
- [x] `updatePheromoneField()`
- [x] `diffusePheromoneField()`
- [x] pheromone metrics
- [x] optional feedback
- [x] ON/OFF comparison via `npm run experiment:pheromone-field`
- [x] experiment log entry

Notes:
- `src/params/aeterna-params.js` keeps `PHEROMONE_ENABLED: false` and `PHEROMONE_FEEDBACK_ENABLED: false` by default to preserve baseline behavior.
- `src/physics/pheromone.js` defines `createPheromoneField(size)`, `updatePheromoneField()`, `diffusePheromoneField()`, `computePheromoneStats()`, and optional `applyPheromoneFeedback()`.
- The pheromone field is a separate public trace and is not attached to `fieldA` or `fieldB`.
- The update path applies retention, high-amplitude deposition, and light diffusion only every `PHEROMONE_UPDATE_INTERVAL` steps.
- The implementation accepts the caller's full `gridSize` and `pheromoneField.length`, so it does not create a coarse-grained pheromone grid. The included headless experiment remains `24^3` / 1000 steps for runtime, while the module supports 64³ grids.
- `collectAeternaMetrics()` includes pheromone params, total / mean / std / max / active ratio, update metrics, and optional feedback metrics.
- Latest results are stored in `experiments/pheromone-field-results.json`.
- The first surrogate run shows `pheromoneActiveRatio = 1` for enabled conditions, so trace-only should remain enabled cautiously and feedback should remain disabled by default.
- Kuramoto transition scans, morphology resonance, Bhramari modulation, Katakamuna formant injection, and large UI changes remain unimplemented.

## Step 6: 蔵本転移観察 + 結合スキャン

### 目的

`COUPLING_G` を掃引し、同期の相転移を見る。

### やること

- `COUPLING_G = 0.01`〜`0.5` をスキャン
- `R_global` の跳ね上がりを見る
- `R_AB_relative` の低下を見る
- 連続的変化か不連続ジャンプか記録する

### Step 6: Kuramoto Transition / Coupling Scan

Status: Partial / Implemented in headless A/B surrogate

Implemented:
- [x] `COUPLING_SCAN_ENABLED`
- [x] `COUPLING_SCAN_VALUES`
- [x] coupling scan script
- [x] transition detection
- [x] collapse / uniformization detection
- [x] stable dynamic balance score
- [x] JSON/CSV output
- [x] experiment log entry
- [x] recommended fine scan range

Notes:
- `src/params/aeterna-params.js` keeps `COUPLING_SCAN_ENABLED: false` by default so normal execution does not enter scan mode.
- `scripts/run-coupling-scan.js` runs Condition A (`COUPLING_TYPE='amplitude'`) over `COUPLING_G = 0.01` through `0.5` in the existing headless A/B diagnostic surrogate.
- The script writes `experiments/coupling-scan-results.json` and `experiments/coupling-scan-results.csv`.
- Transition detection considers adjacent jumps in global order, relative order, vortex lifetime, and rapid A/B field-distance contraction. The first run found the strongest candidate at `0.01 → 0.02` and recommends a fine scan across `0.005 → 0.025`.
- Strict collapse / uniformization stayed false in the first run, but high coupling drove `fieldABDistance` toward zero, so high `COUPLING_G` remains a caution zone rather than an automatic success.
- Morphology resonance, Bhramari modulation, Katakamuna formant injection, day/night rhythm, cell-division memory propagation, and other Step 7 extensions remain unimplemented.

## Step 7: Future Extensions / Morphic + Practice Layer

Status: Documented / Partial / Pending

Implemented:
- [x] docs/future-extensions.md
- [x] docs/research-questions.md
- [x] docs/v2.1.2-candidate-notes.md
- [x] Bhramari modulation documented
- [x] Katakamuna seed injection documented
- [x] Day-night rhythm documented
- [x] Cell-division-like memory propagation documented
- [x] Morphic resonance bias documented
- [x] Sound input documented
- [x] Practice mode documented
- [x] Pattern archive / replay documented

Notes:
- No runtime implementation should be added in this step.
- These symbolic, biological, acoustic, morphic, and practice-layer ideas remain future extensions until Step 0–6 behavior is observable, comparable, stable, and replayable.
