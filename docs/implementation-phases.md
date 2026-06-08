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

## Step 6: 蔵本転移観察 + 結合スキャン

### 目的

`COUPLING_G` を掃引し、同期の相転移を見る。

### やること

- `COUPLING_G = 0.01`〜`0.5` をスキャン
- `R_global` の跳ね上がりを見る
- `R_AB_relative` の低下を見る
- 連続的変化か不連続ジャンプか記録する

## Step 7: 将来拡張

今回は実装しない。
以下は future extensions として分離する。

- ブラーマリー二重周期変調
- カタカムナ・フォルマント注入
- 昼夜リズム
- 細胞分裂的メモリ伝播
- 形態共鳴
