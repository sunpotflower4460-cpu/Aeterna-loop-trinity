# AeternaLoop Experiment Log

## 実験記録の方針

このログは、成功だけでなく、予想外の現象・失敗・崩壊・不安定化も記録する。
予想外の現象は「系が喋り始めた」サインとして扱う。

---

## Experiment 000: Baseline

Date:
Commit:
Branch:

### Purpose

現在の未改造状態を記録する。

### Parameters

- GRID_SIZE:
- DT:
- C2:
- LAMBDA:
- VEV:
- GAMMA:
- NOISE_AMP:
- OMEGA_A:
- OMEGA_B:
- COUPLING_G:
- COUPLING_TYPE:

### Metrics

- vortexCount initial:
- vortexCount final:
- step when vortexCount reached 0:
- average vortexLifetime:
- R_A_global:
- R_B_global:
- R_AB_relative:
- R_local:
- amplitude mean:
- amplitude std:
- totalEnergy start:
- totalEnergy end:

### Visual Observation

- What did the field look like?
- Did vortices persist?
- Did A/B meet, separate, or collapse?
- Did anything look like breathing?
- Did anything unexpected happen?

### Interpretation

- What might this mean?
- Which Case does it resemble?
- What should be tested next?

### Next Action

-

---

## Experiment 001: Step 0 GAMMA Scan

Date: 2026-06-08
Commit: c3c44b5 (pre-experiment baseline)
Branch: work

### Purpose

GAMMA を走査し、渦の消失・対消滅・数値的散逸の原因を切り分ける。

### Fixed Parameters

- NOISE_AMP: 0.001
- MAX_STEPS: 5000
- seed: 12345
- GRID_SIZE: 24
- DT: 0.03
- C2: 1.0
- LAMBDA: 1.0
- VEV: 1.0
- sampleInterval: 25

Note: このリポジトリ snapshot には実行可能な本体 simulation loop / field / physics / vortex 実装が存在しなかったため、`scripts/run-gamma-scan.js` は本体挙動を変更しない分離型の headless diagnostic surrogate として追加した。既存実装が追加された後は、同じ出力 schema を維持しつつ本体の field / metrics 関数を呼ぶ形に置き換える。

### GAMMA Values

- 0
- 0.001
- 0.002
- 0.003
- 0.004
- 0.005
- 0.006
- 0.007
- 0.008
- 0.009
- 0.010

### Results Summary

| GAMMA | initial vortex | final vortex | zero step | energy delta % | amp mean start | amp mean end | notes |
|------:|---------------:|-------------:|----------:|---------------:|---------------:|-------------:|------|
| 0 | 4 | 0 | 425 | 24.256411 | 0.907281 | 1.027873 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.001 | 4 | 0 | 425 | 22.213142 | 0.907281 | 1.019763 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.002 | 4 | 0 | 425 | 18.978376 | 0.907281 | 1.006397 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.003 | 4 | 0 | 425 | 15.998142 | 0.907281 | 0.993811 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.004 | 4 | 0 | 425 | 14.002549 | 0.907281 | 0.985301 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.005 | 4 | 0 | 425 | 13.166282 | 0.907281 | 0.981823 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.006 | 4 | 0 | 425 | 13.319787 | 0.907281 | 0.982703 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.007 | 4 | 0 | 425 | 14.130622 | 0.907281 | 0.986436 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.008 | 4 | 0 | 425 | 15.249605 | 0.907281 | 0.991431 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.009 | 4 | 0 | 425 | 16.394379 | 0.907281 | 0.996445 | Possible VEV-adjacent amplitude breathing in sampled means. |
| 0.010 | 4 | 0 | 425 | 17.376566 | 0.907281 | 1.000695 | Possible VEV-adjacent amplitude breathing in sampled means. |

Full JSON output: `experiments/gamma-scan-results.json`

### Case Judgment

Choose the closest case:

- Case A: GAMMA=0でも消える。散逸以外の原因が疑われる。
- Case B: GAMMAを下げると渦寿命が伸びる。散逸が主原因。
- Case C: GAMMA≈0.003で最も自然に長持ち。散逸と構造維持のバランスがよい。
- Case D: GAMMA≈0.002付近で振幅がVEV周辺で自発振動。系が自律的に呼吸している可能性。

Selected Case: Inconclusive

### Observations

- Did vortexCount reach zero? Yes. All GAMMA values reached zero at sampled step 425.
- Did lower GAMMA extend vortex lifetime? No. The sampled zero step was unchanged across this isolated diagnostic surrogate.
- Did GAMMA=0 still lose energy? No. The simplified amplitude-energy proxy increased by 24.256411%, so this run does not support monotonic numerical energy loss under the current surrogate.
- Was there any sign of breathing? Yes. Sampled amplitude means crossed around VEV with enough swing to trigger `possibleBreathingDetected`, including near GAMMA=0.002; however, vortices still reached zero quickly, so this is not sufficient for Case D.
- Did anything unexpected happen? Yes. Higher GAMMA did not monotonically reduce the simple amplitude-energy proxy; energy delta was lowest near GAMMA=0.005 and then increased again.

### Interpretation

The separated diagnostic code is useful as a reproducible output harness, but the current repository snapshot lacks the real AeternaLoop simulation implementation. In this surrogate, vortex disappearance happened at the same sampled step for every GAMMA, while the amplitude-energy proxy increased rather than decreased. Therefore the scan does not cleanly match Case A, B, C, or D. The strongest signal is that this headless harness should be connected to the real field / vortex / metrics implementation once it exists, and Step 0.5 metrics should be prioritized before interpreting GAMMA physically.

### Recommended Next Step

Proceed to Step 0.5 metrics and investigate numerical dissipation first.

---

## Experiment 002: Step 0.5 Observability Metrics

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

AeternaLoop に新しい挙動を追加する前に、場の状態を観測するための基本メトリクスを整備する。

### Added Metrics

- R_A_global: A場の Kuramoto 風グローバル秩序パラメータ。
- R_B_global: B場の Kuramoto 風グローバル秩序パラメータ。B場が未接続の場合は `null`。
- R_AB_relative: A/B のグローバル秩序差。A/B 両方がある場合に計算。
- R_A_local_average: A場のサンプリング局所秩序平均。
- R_B_local_average: B場のサンプリング局所秩序平均。B場が未接続の場合は `null`。
- amplitudeMeanA: A場振幅平均。
- amplitudeMeanB: B場振幅平均。B場が未接続の場合は `null`。
- amplitudeStdA: A場振幅標準偏差。
- amplitudeStdB: B場振幅標準偏差。B場が未接続の場合は `null`。
- activeCellRatioA: A場の active cell 比率。
- activeCellRatioB: B場の active cell 比率。B場が未接続の場合は `null`。
- totalEnergyA: A場の簡易 amplitude energy。
- totalEnergyB: B場の簡易 amplitude energy。B場が未接続の場合は `null`。
- totalEnergyCombined: A/B 合算エネルギー。現行 GAMMA scan では A場のみ。
- vortexCount: 既存 detector による渦数。
- vortexLifetimeAverage: count-based tracker による直近完了区間の平均寿命。
- vortexLifetimeMax: count-based tracker による最大寿命。
- energyDeltaFromPreviousSample: 前回 metrics sample からの totalEnergyCombined 差分。
- amplitudeBreathingScore: 直近 amplitude mean window の最大値と最小値の差。
- localOrderMax: サンプリング局所秩序の最大値。
- localOrderMin: サンプリング局所秩序の最小値。

### Implementation Notes

- Where metrics functions were added: `src/metrics/aeterna-metrics.js`。
- How often metrics are sampled: `CONFIG.metricsSampleInterval = 30` in `scripts/run-gamma-scan.js`。既存の GAMMA scan summary sampling (`sampleInterval = 25`) は維持。
- Whether local order is computed for all cells or sampled: sampled 3×3×3 neighborhoods。GAMMA scan では 512 cells/sample。
- Whether totalEnergy includes gradient energy: 現時点では簡易エネルギー指標（amplitude energy: `re² + im²`）。`computeGradientEnergy` が呼び出し側から渡された場合のみ gradient を加算できる。
- Whether vortexLifetime is true position-based tracking or simplified count-based tracking: simplified count-based tracking。既存 vortex detector は位置情報ではなく count のみを返すため。
- Debug / log connection: GAMMA scan result に `latestMetrics` と start/end metrics を出力し、Node run 中は `globalThis.__AETERNA_METRICS__` に最新 sample を保存する。
- A/B status: 現行 repository snapshot は本体 A/B simulation loop を含まないため、GAMMA scan は A場のみを接続し、B系 metrics は `null` のまま schema を保持する。

### Baseline Snapshot

From `npm run experiment:gamma-scan`, GAMMA=0.003 final sample:

| metric | value |
|---|---:|
| R_A_global | 0.943691 |
| R_B_global | null |
| R_AB_relative | null |
| R_A_local_average | 0.993986 |
| R_B_local_average | null |
| amplitudeMeanA | 0.993811 |
| amplitudeMeanB | null |
| amplitudeStdA | 0.054218 |
| amplitudeStdB | null |
| totalEnergyCombined | 13694.057631 |
| vortexCount | 0 |
| vortexLifetimeAverage | 420 |

### Observations

- Did the metrics update safely? Yes. The GAMMA scan completed and wrote `experiments/gamma-scan-results.json` with `latestMetrics` for each GAMMA value.
- Were any values NaN or unstable? No NaN values were observed in the JSON output; unavailable B metrics are explicit `null` values because the current harness has only one field.
- Was local order expensive to compute? It was acceptable for the 24³ headless surrogate with 512 sampled cells per metrics sample, but it should remain sampled for 64³ runtime use.
- Was vortexLifetime tracking accurate enough? It is sufficient as a coarse survival-duration observable, but it is not individual vortex tracking. Upgrade to position-based matching when vortex detection returns positions.
- Did the baseline reveal anything unexpected? The metrics confirm high final global/local order after vortices vanish in this surrogate, reinforcing that order alone is not a vortex persistence metric.

### Next Action

Proceed to Step 1 EWMA memory only after these metrics are stable in the real A/B simulation loop.

---

## Experiment 003: Step 1 EWMA Memory Only

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

Gentle Pulse・位相循環・Memory Coupling・フェロモン場を追加する前に、EWMA memory のみで「線」の効果を観察する。

### Implementation Summary

- Added `memoryRe` / `memoryIm` to the headless surrogate field object used by `scripts/run-memory-ewma.js`.
- Added params:
  - `MEMORY_ENABLED: false`
  - `HISTORY_ALPHA: 0.04`
  - `MEMORY_WEIGHT: 0.12`
  - `MEMORY_WEIGHT_MODE: fixed`
  - `MEMORY_BLEND_VELOCITY: true`
  - `MEMORY_VELOCITY_WEIGHT_RATIO: 0.3`
  - `MEMORY_INIT_MODE: zero`
- Added `applyEWMAMemory()` in `src/physics/ewma-memory.js`.
- Added memory metrics in `src/metrics/aeterna-metrics.js`:
  - `memoryEnergyA`
  - `memoryEnergyB`
  - `memoryFieldDifferenceA`
  - `memoryFieldDifferenceB`

Note: この repository snapshot には本体 A/B simulation loop が存在しないため、Step 1 は Step 0/0.5 と同じく分離型 headless diagnostic surrogate で実装した。現行 harness は A場のみを接続し、B場 metrics は `null` のまま schema を保持する。

### Conditions

| condition | MEMORY_ENABLED | MEMORY_WEIGHT | HISTORY_ALPHA | MEMORY_WEIGHT_MODE | velocity blend |
|---|---:|---:|---:|---|---|
| Baseline | false | - | - | - | - |
| EWMA 0.12 | true | 0.12 | 0.04 | fixed | true |
| EWMA 0.08 | true | 0.08 | 0.04 | fixed | true |
| EWMA 0.15 | true | 0.15 | 0.04 | fixed | true |
| EWMA 0.25 | true | 0.25 | 0.04 | fixed | true |

### Results Summary

Full JSON output: `experiments/memory-ewma-results.json`

| condition | final vortex | zero step | vortex lifetime avg | R_AB_relative end | amp mean A end | amp mean B end | total energy end | memory diff A | memory diff B | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Baseline | 0 | 425 | 420 | null | 0.993811 | null | 13694.057631 | 0.993811 | null | Baseline memory disabled; memory arrays remain initialized but are not blended. |
| EWMA 0.12 | 4 | null | 0 | null | 0.845922 | null | 10170.654708 | 0.002433 | null | Completed without sampled non-finite values. |
| EWMA 0.08 | 4 | null | 0 | null | 0.933407 | null | 12227.908248 | 0.000304 | null | Completed without sampled non-finite values. |
| EWMA 0.15 | 4 | null | 0 | null | 0.625205 | null | 5688.645790 | 0.004333 | null | Completed without sampled non-finite values. |
| EWMA 0.25 | 4 | null | 0 | null | 0.177585 | null | 462.952235 | 0.001105 | null | Completed without sampled non-finite values. |

### Memory Energy Snapshot

| condition | memoryEnergyA end | non-finite detected |
|---|---:|---:|
| Baseline | 0 | false |
| EWMA 0.12 | 10115.614212 | false |
| EWMA 0.08 | 12225.009149 | false |
| EWMA 0.15 | 5612.392227 | false |
| EWMA 0.25 | 457.172919 | false |

### Observations

- Did EWMA extend vortex lifetime? In this headless surrogate, all EWMA conditions retained `finalVortexCount = 4` through 5000 steps, while baseline reached zero at sampled step 425.
- Did memory make the field too rigid? `MEMORY_WEIGHT = 0.25` strongly suppressed amplitude and total energy (`amplitudeMeanA_end = 0.177585`), so it looks too strong for this surrogate despite preserving vortex count.
- Did memory reduce sudden amplitude collapse? EWMA 0.08 and 0.12 preserved nonzero vortex count while ending with less severe amplitude reduction than 0.15/0.25.
- Did velocity blend help or destabilize? With velocity blend enabled for all EWMA conditions, sampled checks did not detect non-finite `phi`, `vel`, or `memory` values.
- Did memoryFieldDifference converge or stay large? EWMA conditions ended with small memory-field differences (`0.000304` to `0.004333`), indicating the memory field closely tracked the current field in this surrogate.
- Did anything unexpected happen? Baseline reports `memoryFieldDifferenceA = 0.993811` because memory arrays are present but disabled and remain zero; interpret this only as a disabled-memory diagnostic, not an active memory lag.

### Interpretation

EWMA alone is enough to prevent the surrogate's sampled vortex count from reaching zero by 5000 steps, but stronger memory weights noticeably damp the field. The least aggressive condition (`MEMORY_WEIGHT = 0.08`) appears to preserve vortex count while keeping final amplitude closest to the baseline VEV-adjacent range. Because this is still a single-field surrogate and not the real A/B loop, the result should be treated as a tuning clue rather than proof of the final system behavior.

### Recommended Next Step

Tune `MEMORY_WEIGHT` / `HISTORY_ALPHA` further, especially around `MEMORY_WEIGHT = 0.08` to `0.12`, before proceeding to Step 2 Gentle Pulse in the real A/B simulation loop.

---

## Experiment 004: Step 2 Homeostatic Gentle Pulse

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

散逸に抗うため、振幅が弱ったセルだけにごく弱い恒常性型 Gentle Pulse を追加し、その効果を観察する。

### Implementation Summary

- Added params:
  - `PULSE_ENABLED: false`
  - `PULSE_INTERVAL: 100`
  - `PULSE_STRENGTH: 0.005`
  - `PULSE_THRESHOLD_RATIO: 0.95`
  - `PULSE_MIN_AMP: 0.01`
  - `PULSE_MODE: homeostatic`
- Added `applyGentlePulse()` in `src/physics/gentle-pulse.js`.
- Added pulse metrics:
  - `pulseAppliedCellsA`
  - `pulseAppliedCellsB`
  - `pulseTotalDeltaA`
  - `pulseTotalDeltaB`
  - `pulseAverageDeltaA`
  - `pulseAverageDeltaB`
  - `lastPulseStep`
- Pulse location in simulation loop: after field dynamics and before vortex / metrics sampling in the headless diagnostic surrogate.

Note: この repository snapshot には本体 A/B simulation loop が存在しないため、Step 2 は Step 0/0.5/1 と同じく分離型 headless diagnostic surrogate で実装した。現行 harness は A場のみを接続し、B場 metrics は `null` または未介入値の `0` のまま schema を保持する。EWMA memory には依存していない。

### Conditions

| condition | PULSE_ENABLED | PULSE_STRENGTH | PULSE_INTERVAL | threshold | notes |
|---|---:|---:|---:|---:|---|
| Baseline | false | - | - | - | |
| Pulse 0.005 / 100 | true | 0.005 | 100 | 0.95 | primary |
| Pulse 0.01 / 100 | true | 0.01 | 100 | 0.95 | exploratory |
| Pulse 0.02 / 100 | true | 0.02 | 100 | 0.95 | strong / caution |
| Pulse 0.005 / 80 | true | 0.005 | 80 | 0.95 | interval scan |
| Pulse 0.005 / 120 | true | 0.005 | 120 | 0.95 | interval scan |

### Results Summary

Full JSON output: `experiments/gentle-pulse-results.json`

| condition | final vortex | zero step | vortex lifetime avg | amp mean A end | amp mean B end | amp std A end | amp std B end | total energy end | pulse cells total | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Baseline | 0 | 425 | 420 | 0.993811 | null | 0.054218 | null | 13694.057631 | 0 | Baseline pulse disabled; existing headless dynamics run without pulse intervention. |
| Pulse 0.005 / 100 | 0 | 425 | 420 | 0.992439 | null | 0.053535 | null | 13655.359509 | 164981 | Completed without sampled non-finite values or pulse warning thresholds. |
| Pulse 0.01 / 100 | 0 | 425 | 420 | 0.991262 | null | 0.052919 | null | 13622.171673 | 163217 | Completed without sampled non-finite values or pulse warning thresholds. |
| Pulse 0.02 / 100 | 0 | 425 | 420 | 0.989430 | null | 0.051816 | null | 13570.430724 | 159674 | Completed without sampled non-finite values or pulse warning thresholds. |
| Pulse 0.005 / 80 | 0 | 425 | 420 | 0.992186 | null | 0.053448 | null | 13648.299769 | 203196 | Completed without sampled non-finite values or pulse warning thresholds. |
| Pulse 0.005 / 120 | 0 | 425 | 420 | 0.992446 | null | 0.053763 | null | 13655.881468 | 133501 | Completed without sampled non-finite values or pulse warning thresholds. |

### Pulse Delta Snapshot

| condition | pulseTotalDeltaA total | pulseTotalDeltaB total | last pulse step | non-finite detected |
|---|---:|---:|---:|---|
| Baseline | 0 | 0 | null | false |
| Pulse 0.005 / 100 | 83.534844 | 0 | 5000 | false |
| Pulse 0.01 / 100 | 164.617102 | 0 | 5000 | false |
| Pulse 0.02 / 100 | 319.774473 | 0 | 5000 | false |
| Pulse 0.005 / 80 | 102.207246 | 0 | 4960 | false |
| Pulse 0.005 / 120 | 67.088146 | 0 | 4920 | false |

### Observations

- Did Gentle Pulse extend vortex lifetime? No. In this single-field headless surrogate, all pulse conditions still reached `vortexCount = 0` at sampled step 425, the same as baseline.
- Did average amplitude stay closer to VEV? No clear improvement. The primary pulse condition ended slightly below the baseline amplitude mean (`0.992439` vs `0.993811`).
- Did the field become too uniform? No warning thresholds were triggered, and `amplitudeStdA` decreased only modestly across stronger pulse conditions.
- Did R_global unnaturally stick near 1? No additional warning was triggered in the experiment run; the surrogate already trends toward high order after vortex disappearance.
- Did pulseAppliedCells become too large? The cumulative pulse-applied cell count is large because it accumulates over repeated interval pulses, but per-pulse warning checks did not exceed the conservative 90% cell coverage threshold.
- Did pulse create breathing-like rhythm or destroy natural rhythm? No breathing-like improvement was established in this surrogate.
- Did anything unexpected happen? Gentle Pulse did not rescue vortex lifetime even at stronger exploratory settings; it mainly produced small amplitude-direction corrections.

### Interpretation

In this headless surrogate, Gentle Pulse behaves as the intended weak amplitude-only homeostatic correction and does not introduce sampled NaN or obvious overdrive. However, it does not address the vortex-loss mechanism observed here: `zeroStep` and count-based vortex lifetime remain unchanged across all pulse conditions. This is consistent with Step 0/1 notes that the surrogate's vortex loss is not solved by a small amplitude top-up alone. Keep the default disabled for baseline preservation and use `PULSE_STRENGTH = 0.005`, `PULSE_INTERVAL = 100` only as the primary comparison condition.

### Recommended Next Step

Proceed to Step 3 Phase Circulation, while keeping Gentle Pulse disabled by default and treating `PULSE_STRENGTH = 0.005` / `PULSE_INTERVAL = 100` as a cautious opt-in diagnostic.

---

## Experiment 005: Step 3 Phase Rotation / Operator Splitting

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

場の更新後に位相循環を独立に適用し、渦の持続、A/B の相互作用、局所秩序の変化を観察する。

### Implementation Summary

- Added params:
  - `PHASE_ROTATION_ENABLED: false`
  - `OMEGA_A: 0.01`
  - `OMEGA_B: 0.011`
  - `PHASE_ROTATION_TARGET: field-and-memory`
  - `PHASE_ROTATION_RENORMALIZE: false`
  - `PHASE_ROTATION_RENORMALIZE_INTERVAL: 100`
  - `PHASE_ROTATION_RENORMALIZE_MAX_AMP_RATIO: 1.5`
- Added `rotateComplexField()` in `src/physics/phase-rotation.js`.
- Added `applyPhaseRotation()` in `src/physics/phase-rotation.js`.
- Added optional `softRenormalizeField()` in `src/physics/phase-rotation.js`.
- Added phase rotation metrics to `collectAeternaMetrics()`.
- Phase rotation location in simulation loop: after field dynamics and EWMA memory blend, before vortex detection and metrics sampling in the headless A/B diagnostic surrogate.

Note: この repository snapshot には本体 browser/UI simulation loop が存在しないため、Step 3 は既存の headless diagnostic pattern に合わせて実装した。今回の script は A/B 2場を生成し、EWMA memory arrays を有効化したうえで、`field-and-memory` operator splitting を検証する。Memory Coupling、フェロモン場、形態共鳴は実装していない。

### Conditions

| condition | enabled | OMEGA_A | OMEGA_B | ratio | target | renorm | notes |
|---|---:|---:|---:|---:|---|---|---|
| Baseline | false | - | - | - | - | false | EWMA memory enabled in surrogate; phase rotation disabled |
| 1.1 ratio | true | 0.01 | 0.011 | 1.1 | field-and-memory | false | primary |
| 1.2 ratio | true | 0.01 | 0.012 | 1.2 | field-and-memory | false | |
| 1.5 ratio | true | 0.01 | 0.015 | 1.5 | field-and-memory | false | |
| 1.618 ratio | true | 0.01 | 0.01618 | 1.618 | field-and-memory | false | |
| 1.8 ratio | true | 0.01 | 0.018 | 1.8 | field-and-memory | false | |

### Results Summary

Full JSON output: `experiments/phase-rotation-results.json`

| condition | final vortex | zero step | vortex lifetime avg | vortex lifetime max | R_AB_relative end | R_A_local end | R_B_local end | amp mean A end | amp mean B end | total energy end | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Baseline | 8 | null | 0 | 5000 | 0.000002 | 0.967685 | 0.967687 | 0.934404 | 0.934404 | 24506.912016 | Baseline phase rotation disabled; EWMA memory remained enabled for the diagnostic surrogate. |
| 1.1 ratio | 8 | null | 0 | 5000 | 0.000003 | 0.967699 | 0.967702 | 0.934404 | 0.934404 | 24506.910907 | Completed without sampled non-finite values or amplitude warning thresholds. |
| 1.2 ratio | 8 | null | 0 | 5000 | 0.000004 | 0.967699 | 0.967703 | 0.934404 | 0.934404 | 24506.910851 | Completed without sampled non-finite values or amplitude warning thresholds. |
| 1.5 ratio | 8 | null | 0 | 5000 | 0.000007 | 0.967699 | 0.967707 | 0.934404 | 0.934404 | 24506.910682 | Completed without sampled non-finite values or amplitude warning thresholds. |
| 1.618 ratio | 8 | null | 0 | 5000 | 0.000008 | 0.967699 | 0.967708 | 0.934404 | 0.934404 | 24506.910607 | Completed without sampled non-finite values or amplitude warning thresholds. |
| 1.8 ratio | 8 | null | 0 | 5000 | 0.000010 | 0.967699 | 0.967710 | 0.934404 | 0.934404 | 24506.910505 | Completed without sampled non-finite values or amplitude warning thresholds. |

### Observations

- Did phase rotation extend vortex lifetime? The A/B diagnostic surrogate kept the combined `vortexCount` at 8 through all 5000 steps even without phase rotation, so extension cannot be distinguished in this run. `vortexLifetimeMax` remains 5000 for all conditions.
- Did some omega ratios create more stable circulation? No ratio produced sampled non-finite values or amplitude warning thresholds. Higher ratios slightly increased the final `R_AB_relative`, but the absolute values stayed very small.
- Did `R_AB_relative` decrease or oscillate? The final value increased monotonically with `OMEGA_B` in this small sweep, from approximately `0.000003` at ratio 1.1 to `0.000010` at ratio 1.8.
- Did local order appear before global order? Local order stayed high and similar across A/B at the final sample; this surrogate does not yet expose a decisive local-before-global transition.
- Did any ratio destabilize amplitude? No. `amplitudeMeanA` and `amplitudeMeanB` stayed at approximately `0.934404`, and no non-finite values were sampled.
- Did rotating memory together help stability? The standard `field-and-memory` mode completed without sampled memory NaN / Infinity in all enabled conditions.
- Did anything unexpected happen? Unlike the older single-field diagnostics, this A/B surrogate retained vortices for the full run even in the baseline condition; this makes Step 3 safe numerically but less conclusive for lifetime extension.

### Interpretation

The operator-split phase rotation is numerically safe in the current headless A/B surrogate: it preserves amplitude statistics, does not trigger sampled non-finite values, and exposes tunable A/B phase drift through `OMEGA_B`. Because the surrogate baseline already preserves vortices for the full 5000-step window, this run should be interpreted primarily as an implementation and stability check rather than proof that phase circulation extends vortex lifetime. The smallest ratio (`OMEGA_B = 0.011`) is the least disruptive among the enabled conditions by final `R_AB_relative`.

### Recommended Next Step

Compare `field-only` vs `field-and-memory`, or proceed cautiously to Step 4 Memory Coupling after confirming the same operator-splitting order in the real browser/UI simulation loop when that loop is present.
