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

---

## Experiment 006: Step 4 Memory Coupling

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

A場とB場を現在値ではなく、相手の EWMA memory を介して結合し、穏やかな同期・遅延的相互作用・構造安定化が起きるか観察する。

### Implementation Summary

- Added params:
  - `COUPLING_TYPE: amplitude | phase | cross | memory`
  - `COUPLING_G: 0.05`
  - `MEMORY_COUPLING_ENABLED: false`
  - `MEMORY_COUPLING_WEIGHT: 1.0`
  - `MEMORY_COUPLING_USE_BIDIRECTIONAL: true`
  - `MEMORY_COUPLING_MIN_AMP: 0.01`
  - `MEMORY_COUPLING_MODE: toward-other-memory`
- Added `applyMemoryCoupling()` in `src/physics/memory-coupling.js`.
- Added coupling metrics to `collectAeternaMetrics()`.
- Added `fieldABDistance`.
- Added `memoryABDistance`.
- Coupling location in simulation loop: in the headless A/B diagnostic surrogate, field dynamics run first, Memory Coupling references the previous EWMA memory second, EWMA memory updates third, optional phase rotation remains disabled for primary Step 4 conditions, then vortex detection and metrics sampling run.

Note: この repository snapshot には本体 browser/UI simulation loop が存在しないため、Step 4 は既存の headless A/B diagnostic pattern に合わせて実装した。既存の amplitude coupling operation はこの snapshot に存在しないため、`COUPLING_TYPE='amplitude'` は baseline no-op として既存挙動を維持する。フェロモン場、形態共鳴、ブラーマリー変調、カタカムナ・フォルマント注入は実装していない。

### Conditions

| condition | coupling type | coupling G | memory weight | effective | phase rotation | notes |
|---|---|---:|---:|---:|---:|---|
| Baseline amplitude | amplitude | 0.05 | - | - | false | existing surrogate behavior / no extra coupling |
| Memory 0.5 | memory | 0.05 | 0.5 | 0.025 | false | gentle |
| Memory 1.0 | memory | 0.05 | 1.0 | 0.05 | false | primary |
| Memory 1.5 | memory | 0.05 | 1.5 | 0.075 | false | exploratory |
| Memory 2.0 | memory | 0.05 | 2.0 | 0.10 | false | strong / caution |

### Results Summary

Full JSON output: `experiments/memory-coupling-results.json`

| condition | final vortex | zero step | vortex lifetime avg | R_AB_relative end | fieldABDistance end | memoryABDistance end | amp std A end | amp std B end | total energy end | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Baseline amplitude | 8 | null | 0 | 0.000001971 | 0.577493255 | 0.577488195 | 0.115238128 | 0.115237789 | 24506.912016 | Baseline amplitude coupling selected; this repository snapshot has no pre-existing amplitude coupling operation, so no additional coupling was applied. |
| Memory 0.5 | 8 | null | 0 | 0.000000000346 | 0.000096814 | 0.000100433 | 0.115281097 | 0.115281037 | 24502.583870 | Completed without sampled non-finite values or memory coupling warning thresholds. |
| Memory 1.0 | 8 | null | 0 | 0.000000000002 | 0.000000028 | 0.000000030 | 0.115273827 | 0.115273827 | 24500.910577 | Completed without sampled non-finite values or memory coupling warning thresholds. |
| Memory 1.5 | 8 | null | 0 | 0.000000000000 | 0.000000000013 | 0.000000000015 | 0.115281774 | 0.115281774 | 24498.626399 | Completed without sampled non-finite values or memory coupling warning thresholds. |
| Memory 2.0 | 8 | null | 0 | 0.000000000000 | 0.000000000000 | 0.000000000000 | 0.115257222 | 0.115257222 | 24496.084440 | Completed without sampled non-finite values or memory coupling warning thresholds. |

### Observations

- Did memory coupling extend vortex lifetime? The A/B surrogate kept combined `vortexCount` at 8 for all conditions through 5000 steps, so lifetime extension is not distinguishable in this run.
- Did A/B become too similar too quickly? Yes, `MEMORY_COUPLING_WEIGHT >= 1.0` drove `fieldABDistance` and `memoryABDistance` effectively to zero by the final sample. This is a caution sign for real simulations even though no NaN or amplitude collapse was sampled.
- Did `R_AB_relative` decrease gradually or collapse? It collapsed toward zero under memory coupling. Weight `0.5` was gentler but still reduced A/B distance by several orders of magnitude.
- Did `fieldABDistance` and `memoryABDistance` behave differently? They tracked closely; memory distance stayed slightly above field distance at weight `0.5`, then both approached zero for stronger weights.
- Did local order increase? Local order remained high and stable in the surrogate; no decisive local-order improvement was isolated.
- Did memory coupling create more stable fusion-like behavior? It created very strong A/B convergence without sampled numerical instability. This may be useful for fusion-like behavior but risks over-synchronization.
- Did anything unexpected happen? The small average coupling delta did not trigger the `0.1` warning threshold, yet the cumulative effect still nearly merged A/B for weight `1.0+`.

### Interpretation

Memory Coupling is numerically safe in this headless A/B surrogate and correctly exposes a delayed, memory-mediated coupling path. However, `COUPLING_G = 0.05` with `MEMORY_COUPLING_WEIGHT = 1.0` is already strong enough over 5000 steps to erase almost all measured A/B distance. For future visual or browser-loop experiments, `MEMORY_COUPLING_WEIGHT = 0.5` or a lower `COUPLING_G` should be treated as the cautious starting point if preserving separation matters.

### Recommended Next Step

Reduce `MEMORY_COUPLING_WEIGHT` or retune `COUPLING_G` before adding Step 5 pheromone field, unless the next experiment explicitly wants near-fusion behavior.

---

## Experiment 007: Step 5 Pheromone Field

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

渦や高振幅セルが通った場所にフェロモン場として痕跡を残し、空間的な記憶・道筋・局所秩序の変化を観察する。

### Implementation Summary

- Added params:
  - `PHEROMONE_ENABLED: false`
  - `PHEROMONE_UPDATE_INTERVAL: 10`
  - `PHEROMONE_RETENTION: 0.99005`
  - `PHEROMONE_DEPOSIT: 0.01`
  - `PHEROMONE_DEPOSIT_THRESHOLD_RATIO: 0.7`
  - `PHEROMONE_DIFFUSION: 0.001`
  - `PHEROMONE_FEEDBACK_ENABLED: false`
  - `PHEROMONE_FEEDBACK_STRENGTH: 0.002`
  - `PHEROMONE_MAX_VALUE: 10.0`
- Added pheromoneField: `createPheromoneField(size)` returns a `Float32Array` public trace field with the same cell count as the simulated field.
- Added `updatePheromoneField()`.
- Added `diffusePheromoneField()`.
- Added `computePheromoneStats()`.
- Added optional `applyPheromoneFeedback()`.
- Pheromone update location in simulation loop: in the headless A/B diagnostic surrogate, field dynamics run first, selected coupling remains a no-op baseline, EWMA memory updates next, phase rotation remains disabled, pheromone update runs every `PHEROMONE_UPDATE_INTERVAL`, optional feedback runs after the trace update, then vortex detection and metrics sampling run.

Note: この repository snapshot には本体 browser/UI simulation loop が存在しないため、Step 5 は既存の headless A/B diagnostic pattern に合わせて実装した。実装本体は粗視化せず `gridSize` と `pheromoneField.length` に従うため 64³ の場を扱える。一方、同梱の自動実験は CI / agent 実行時間を抑えるため、既存実験と同じ surrogate 系列として `24^3` / `MAX_STEPS = 1000` で実行した。蔵本転移スキャン、形態共鳴、ブラーマリー変調、カタカムナ・フォルマント注入は実装していない。

### Conditions

| condition | enabled | feedback | deposit | diffusion | update interval | notes |
|---|---:|---:|---:|---:|---:|---|
| Baseline | false | false | - | - | - | existing surrogate behavior |
| Trace 0.01 / diff 0.001 | true | false | 0.01 | 0.001 | 10 | primary |
| Trace 0.005 / diff 0.001 | true | false | 0.005 | 0.001 | 10 | gentle |
| Trace 0.01 / diff 0.0005 | true | false | 0.01 | 0.0005 | 10 | less diffusion |
| Feedback 0.002 | true | true | 0.01 | 0.001 | 10 | optional / caution |

### Results Summary

Full JSON output: `experiments/pheromone-field-results.json`

| condition | final vortex | zero step | vortex lifetime avg | R_A_local end | R_B_local end | pheromone total | pheromone max | active ratio | total energy end | notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Baseline | 8 | null | 0 | 0.963830 | 0.963830 | 0 | 0 | 0 | 24030.281744 | Completed without sampled non-finite values or pheromone warning thresholds. |
| Trace 0.01 / diff 0.001 | 8 | null | 0 | 0.963830 | 0.963830 | 1293.799265 | 0.104961 | 1 | 24030.281744 | Pheromone active ratio exceeded 0.9; field may be too diffuse or saturated. pheromoneActiveRatio approached global saturation. |
| Trace 0.005 / diff 0.001 | 8 | null | 0 | 0.963830 | 0.963830 | 646.899632 | 0.052480 | 1 | 24030.281744 | Pheromone active ratio exceeded 0.9; field may be too diffuse or saturated. pheromoneActiveRatio approached global saturation. |
| Trace 0.01 / diff 0.0005 | 8 | null | 0 | 0.963830 | 0.963830 | 1293.799264 | 0.104962 | 1 | 24030.281744 | Pheromone active ratio exceeded 0.9; field may be too diffuse or saturated. pheromoneActiveRatio approached global saturation. |
| Feedback 0.002 | 8 | null | 0 | 0.963830 | 0.963830 | 1298.096049 | 0.105282 | 1 | 24191.914679 | Pheromone active ratio exceeded 0.9; field may be too diffuse or saturated. pheromoneActiveRatio approached global saturation. |

### Observations

- Did the pheromone field form path-like traces? In this headless surrogate, all cells above the deposit threshold eventually became active, so path-like selectivity was not distinguishable from broad trace coverage.
- Did pheromoneTotal saturate or grow without bound? Over 1000 steps it stayed far below `PHEROMONE_MAX_VALUE` per-cell cap, but total grew enough that active ratio reached 1 in enabled conditions.
- Did local order increase in traced regions? No clear local-order change was isolated in the trace-only conditions; local order matched baseline at this resolution and duration.
- Did vortex lifetime extend? No; combined vortex count stayed at 8 for all conditions through the run.
- Did feedback destabilize the field? Weak feedback did not produce NaN or vortex collapse, but it raised `totalEnergyCombined` from `24030.281744` baseline to `24191.914679` and should remain optional / caution.
- Did the field become too uniform? The `pheromoneActiveRatio = 1` warning indicates broad activation in this surrogate. This may reflect the initialized high-amplitude field rather than diffusion alone.
- Did anything unexpected happen? Trace-only conditions left field energy identical to baseline, confirming no direct field feedback when `PHEROMONE_FEEDBACK_ENABLED=false`.

### Interpretation

The Step 5 pheromone machinery is numerically safe in the current headless surrogate and preserves baseline dynamics when disabled. Stage A trace-only correctly accumulates a public trace without feeding back into A/B fields, but the current amplitude threshold activates the whole surrogate volume quickly. Before relying on path-like behavior, run a more spatially sparse or real browser-loop scenario, or increase `PHEROMONE_DEPOSIT_THRESHOLD_RATIO` / reduce deposit. Stage B weak feedback is available but should remain off by default because it measurably increases total energy.

### Recommended Next Step

Keep pheromone trace only and disable feedback while tuning the deposit threshold / sparse source criteria before proceeding to Step 6 Kuramoto transition / coupling scan.

---

## Experiment 008: Step 6 Kuramoto Transition / Coupling Scan

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

COUPLING_G を掃引し、A/B場の同期・融合・局所秩序・渦寿命・崩壊/均一化の変化を観察する。

### Implementation Summary

- Added coupling scan params:
  - `COUPLING_SCAN_ENABLED: false`
  - `COUPLING_SCAN_VALUES: [0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]`
  - `COUPLING_SCAN_MAX_STEPS: 5000`
  - `COUPLING_SCAN_SAMPLE_INTERVAL: 30`
  - `COUPLING_SCAN_DETECT_TRANSITION: true`
- Added coupling scan script: `scripts/run-coupling-scan.js`
- Added transition detection: `detectCouplingTransition()` compares adjacent scan results and flags jumps in global order, relative order, vortex lifetime, or rapid A/B field-distance contraction.
- Added collapse / uniformization detection: `detectCollapseOrUniformization()` keeps high `R_global` from being treated as success when amplitude variance and vortices indicate dead uniformity.
- Added stable dynamic balance score: `computeStableDynamicBalanceScore()` combines order, fusion, vortex persistence, and non-uniformity as a comparison aid.
- Added JSON / CSV outputs: `experiments/coupling-scan-results.json` and `experiments/coupling-scan-results.csv`.

Note: この repository snapshot には本体 browser/UI simulation loop が存在しないため、Step 6 は既存の headless A/B diagnostic surrogate に合わせて実装した。通常実行の既定値は `COUPLING_SCAN_ENABLED=false` のままで、形態共鳴、ブラーマリー変調、カタカムナ・フォルマント注入、昼夜リズム、Step 7 拡張は実装していない。

### Scan Values

| index | COUPLING_G |
|---:|---:|
| 0 | 0.01 |
| 1 | 0.02 |
| 2 | 0.03 |
| 3 | 0.05 |
| 4 | 0.075 |
| 5 | 0.1 |
| 6 | 0.15 |
| 7 | 0.2 |
| 8 | 0.3 |
| 9 | 0.4 |
| 10 | 0.5 |

### Results Summary

Full JSON output: `experiments/coupling-scan-results.json`
CSV output: `experiments/coupling-scan-results.csv`

| COUPLING_G | final vortex | vortex lifetime avg | R_A mean | R_B mean | R_AB mean | R_A local | R_B local | amp std A end | amp std B end | transition? | collapse? | balance score |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| 0.01 | 8 | 0 | 0.404153 | 0.404156 | 0.000005 | 0.965262 | 0.965277 | 0.115283 | 0.115279 | false | false | 0.601038 |
| 0.02 | 8 | 0 | 0.404170 | 0.404170 | 0.000002 | 0.965267 | 0.965275 | 0.115259 | 0.115259 | true | false | 0.601042 |
| 0.03 | 8 | 0 | 0.404175 | 0.404175 | 0.000001 | 0.965268 | 0.965274 | 0.115254 | 0.115254 | true | false | 0.601043 |
| 0.05 | 8 | 0 | 0.404179 | 0.404179 | 0.000001 | 0.965270 | 0.965273 | 0.115252 | 0.115252 | true | false | 0.601045 |
| 0.075 | 8 | 0 | 0.404181 | 0.404181 | 0.000001 | 0.965270 | 0.965273 | 0.115250 | 0.115250 | true | false | 0.601045 |
| 0.1 | 8 | 0 | 0.404182 | 0.404182 | 0.000001 | 0.965271 | 0.965273 | 0.115250 | 0.115250 | false | false | 0.601045 |
| 0.15 | 8 | 0 | 0.404183 | 0.404183 | 0.000001 | 0.965271 | 0.965272 | 0.115249 | 0.115249 | false | false | 0.601046 |
| 0.2 | 8 | 0 | 0.404184 | 0.404183 | 0.000000 | 0.965271 | 0.965272 | 0.115249 | 0.115249 | false | false | 0.601046 |
| 0.3 | 8 | 0 | 0.404185 | 0.404184 | 0.000000 | 0.965271 | 0.965272 | 0.115249 | 0.115249 | false | false | 0.601046 |
| 0.4 | 8 | 0 | 0.404185 | 0.404184 | 0.000000 | 0.965272 | 0.965272 | 0.115249 | 0.115249 | false | false | 0.601046 |
| 0.5 | 8 | 0 | 0.404185 | 0.404185 | 0.000000 | 0.965272 | 0.965272 | 0.115249 | 0.115249 | false | false | 0.601046 |

### Transition Candidates

- Candidate 1: `0.01 → 0.02`, transitionScore `0.153254`, fieldDistanceDrop `0.076609`, deltaR `0.000015`, deltaRelative `0.000003`.
- Candidate 2: `0.02 → 0.03`, transitionScore `0.053372`, fieldDistanceDrop `0.026680`, deltaR `0.000005`, deltaRelative `0.000000`.
- Candidate 3: `0.03 → 0.05`, transitionScore `0.042283`, fieldDistanceDrop `0.021137`, deltaR `0.000004`, deltaRelative `0.000000`.
- Candidate 4: `0.05 → 0.075`, transitionScore `0.020809`, fieldDistanceDrop `0.010403`, deltaR `0.000002`, deltaRelative `0.000000`.
- Best candidate: `0.01 → 0.02`.
- Recommended fine scan range: `0.005 → 0.025` with values `0.005`, `0.008333`, `0.011667`, `0.015`, `0.018333`, `0.021667`, `0.025`.

### Observations

- Did R_global jump at any COUPLING_G? No obvious jump appeared in `R_A_global_mean` / `R_B_global_mean`; both remained near `0.404` across the scan.
- Did R_AB_relative decrease gradually or suddenly? `R_AB_relative_mean` was already near zero at the lowest coupling in this surrogate, so it was not a useful transition marker here.
- Did local order appear before global order? Local order stayed near `0.9653` while global order stayed near `0.404`; no staged local-to-global ordering transition was isolated.
- Did vortex lifetime improve? No. Combined vortex count stayed at `8`, and the count-based lifetime average stayed `0` because vortices did not reach a completed disappearance/reappearance interval.
- Did high coupling cause uniformization? The strict uniformization detector stayed false because amplitude standard deviation remained about `0.115`, but `fieldABDistance` approached zero by high `COUPLING_G`, with `COUPLING_G=0.5` explicitly warning about possible over-coupling fusion/uniformization.
- Was the best-looking state fully synchronized or dynamically balanced? The balance score was almost flat (`~0.601`), so this scan does not yet identify a clearly superior dynamic-balance point.
- Did anything unexpected happen? The strongest observable change was not a Kuramoto-style `R_global` jump, but a rapid A/B field-distance contraction between `0.01` and `0.02`.

### Interpretation

In the current headless A/B surrogate, amplitude coupling primarily fuses A/B field states rather than increasing global Kuramoto order. The most important transition candidate is therefore the low-coupling boundary around `COUPLING_G=0.01 → 0.02`, where A/B distance drops fastest while vortices and amplitude non-uniformity persist. This should be treated as a candidate fusion threshold, not proof of life-like synchronization. High `COUPLING_G` should be handled cautiously because A/B distance can pin to zero even when amplitude variance prevents strict collapse detection.

### Recommended Next Step

Run fine scan around candidate range `0.005 → 0.025`, then compare amplitude coupling vs memory coupling at the best low-coupling candidates before proceeding to Step 7 future extensions documentation.

---

## Experiment 009: Step 7 Future Extensions Documentation

Date: 2026-06-08
Commit: this PR commit
Branch: work

### Purpose

AeternaLoop v2.1.1 の将来拡張案を、現行MVP実装から分離し、原因分離を守るために docs へ整理する。

### Added Documents

- docs/future-extensions.md: separates Step 7 future extensions from the current MVP and records implementation boundaries.
- docs/research-questions.md: lists core and future-extension research questions for later experiment design.
- docs/v2.1.2-candidate-notes.md: ranks candidate v2.1.2 directions without authorizing implementation.

### Future Extensions Documented

- Bhramari dual-period modulation
- Katakamuna formant / seed injection
- Day-night rhythm
- Cell-division-like memory propagation
- Morphic resonance bias
- External sound / microphone input
- Ritual / practice mode
- Pattern archive and replay

### Implementation Boundary

No runtime behavior was added.

### Notes

- Future symbolic / acoustic / morphic extensions should not be added until Step 0–6 behavior is stable and replayable.
- Pattern archive and replay may be the safest next structural extension.
- Seed format should come before Katakamuna or symbolic input experiments.

---

## v2.1.2 Interpretation: Reading the v2.1.1 Experiments

### Summary

v2.1.1 has moved from design implementation to experimental interpretation.
The next step is not to add more life-like features, but to tune memory, fusion, and trace strength based on the data.

### Key Findings

1. GAMMA=0.005 appears to be the current baseline candidate.
   It should be treated as the condition with relatively lower energy growth and amplitude near VEV, not as proof of ideal dissipation.

2. Gentle Pulse did not extend vortex lifetime.
   This suggests vortex disappearance is probably not caused mainly by amplitude loss.

3. EWMA memory preserved vortices, but memory-field difference was too small.
   This may indicate current-copying or freezing rather than long-range memory.

4. Memory Coupling strongly fused fieldA and fieldB.
   This is an important result, but weights >= 0.5 may be too strong if the goal is dynamic meeting rather than total identity.

5. Pheromone Field saturated broadly.
   pheromoneActiveRatio reaching 1 suggests that the trace became a background field rather than a path-like memory.

6. Surrogate/headless experiments must be distinguished from real 64³ simulation runs.

### Metrics Clarification

`R_AB_relative` / `R_AB_orderDifferenceRatio` does not directly represent A/B phase agreement or complete fusion. It is the relative difference between the A/B global order parameters. A/B fusion should be evaluated with `fieldABDistance`, `memoryABDistance`, phase alignment, and related distance metrics.

`fieldEnergyProxy` is not a strict Hamiltonian. It is a simple diagnostic for numerical amplification or damping trends. `pheromoneEnergyL2` is treated as a closer Sarkar-style memory energy saturation proxy than pheromone mean alone.

### v2.1.2 Direction

- Retune HISTORY_ALPHA
- Micro-scan Memory Coupling
- Localize Pheromone Field
- Clarify energy and A/B relation metrics
- Prepare real 64³ validation

---

## Experiment 010: v2.1.2 HISTORY_ALPHA Scan

Purpose:
Find EWMA settings where memory remains a real temporal trace instead of becoming a near-copy of the current field.

Output:
- experiments/history-alpha-scan-results.json

Run metadata:
- `runType`: `surrogate-headless`
- `dynamicsType`: `diagnostic-surrogate`
- `gridSize`: recorded in `runMeta.gridSize`
- `seed`: fixed at `12345` unless overridden by `AETERNA_SCAN_SEED`

Scan values:
- `HISTORY_ALPHA`: `0.04`, `0.02`, `0.01`, `0.004`, `0.002`
- `MEMORY_WEIGHT`: `0.04`, `0.08`, `0.12`, `0.16`

Interpretation:
Pending.

---

## Experiment 011: v2.1.2 Memory Coupling Micro Scan

Purpose:
Find a coupling range where fieldA and fieldB meet without collapsing into complete identity.

Output:
- experiments/memory-coupling-micro-scan-results.json

Run metadata:
- `runType`: `surrogate-headless`
- `dynamicsType`: `diagnostic-surrogate`
- `gridSize`: recorded in `runMeta.gridSize`
- `seed`: fixed at `12345` for the run family, with A/B initialized from fixed seeds `12345` and `67890`

Scan values:
- `MEMORY_COUPLING_WEIGHT`: `0.05`, `0.1`, `0.15`, `0.2`, `0.25`, `0.35`, `0.5`
- `COUPLING_G`: `0.01`, `0.02`, `0.03`, `0.05`

Interpretation:
Pending.

---

## Experiment 012: v2.1.2 Pheromone Localization Scan

Purpose:
Retune pheromone parameters so the pheromone field remains a local trace rather than becoming a uniform background.

Output:
- experiments/pheromone-localization-scan-results.json

Run metadata:
- `runType`: `surrogate-headless`
- `dynamicsType`: `diagnostic-surrogate`
- `gridSize`: recorded in `runMeta.gridSize`
- `seed`: fixed at `12345` for the run family, with A/B initialized from fixed seeds `12345` and `67890`

Scan values:
- `PHEROMONE_DIFFUSION`: `0`, `0.00005`, `0.0001`, `0.0002`, `0.0005`
- `PHEROMONE_DEPOSIT_THRESHOLD_RATIO`: `0.85`, `0.9`, `0.95`
- `PHEROMONE_DEPOSIT`: `0.005`, `0.01`, `0.02`
- `pheromoneDepositMode`: `all-above-threshold`, `top-10-percent-amplitude`, `top-5-percent-amplitude`

Interpretation:
Pending.

## Experiment 013: v2.1.2 Result Interpretation and Candidate Selection

Purpose:
Read v2.1.2 scan results and select final candidate params for the tuning phase.

Inputs:
- experiments/history-alpha-scan-results.json
- experiments/memory-coupling-micro-scan-results.json
- experiments/pheromone-localization-scan-results.json

Outputs:
- experiments/v2.1.2-candidate-summary.json
- docs/v2.1.2-results-interpretation.md
- docs/v2.1.2-final-candidate-params.md

Summary:
Completed. Pheromone localization produced usable local-trace candidates, but HISTORY_ALPHA and Memory Coupling did not reach their requested acceptance bands. The resulting params are therefore provisional candidates for one more v2.1.2 rescan, not new defaults.

Decision:
- Proceed to v2.2: No
- Additional v2.1.2 scan needed: Yes
- Blocking issues:
  - HISTORY_ALPHA scan preserved vortices and energy, but `memoryFieldDifferenceA_end` stayed below the provisional `0.05–0.3` trace band.
  - Memory Coupling micro scan preserved A/B distinction, but `fieldABDistance_end` stayed above the requested `0.01–0.1` meeting band.

---

## Experiment 014: v2.1.2 HISTORY_ALPHA Narrow Scan

Purpose:
Search lower HISTORY_ALPHA and lower MEMORY_WEIGHT values to find a memory setting where the EWMA field remains a real temporal trace instead of a near-copy of the current field.

Output:
- experiments/history-alpha-narrow-scan-results.json

Interpretation:
Completed. See `docs/v2.1.2-follow-up-results.md` after the follow-up scripts are run.

---

## Experiment 015: v2.1.2 Memory Coupling Narrow Scan

Purpose:
Search effectiveMemoryCoupling values above 0.025 to find a range where fieldA and fieldB meet without collapsing into complete identity.

Output:
- experiments/memory-coupling-narrow-scan-results.json

Interpretation:
Completed. See `docs/v2.1.2-follow-up-results.md` after the follow-up scripts are run.

---

## Experiment 016: v2.1.2 Combined Candidate Validation

Purpose:
Combine the best HISTORY_ALPHA, Memory Coupling, and Pheromone localization candidates to test whether they remain stable together before v2.2 or real 64³ validation.

Output:
- experiments/v2.1.2-combined-validation-results.json
- experiments/v2.1.2-follow-up-summary.json
- docs/v2.1.2-follow-up-results.md

Interpretation:
Completed. Combined validation remains gated by the narrow-scan candidate criteria and must not be treated as v2.2 approval unless the follow-up summary explicitly permits it.

---

## Experiment 017: v2.1.2 Combined Coupling Retune

Purpose:
Retune Memory Coupling under the combined v2.1.2 candidate state, with HISTORY_ALPHA, MEMORY_WEIGHT, and Pheromone localization fixed.

Reason:
The previous combined validation preserved vortices and memory trace, but fieldABDistance remained above the target band, so A/B were still too separate.

Fixed Params:
- HISTORY_ALPHA = 0.00025
- MEMORY_WEIGHT = 0.04
- MEMORY_WEIGHT_MODE = fixed
- MEMORY_VELOCITY_SCALE = 0.1
- PHEROMONE_DIFFUSION = 0
- PHEROMONE_DEPOSIT_THRESHOLD_RATIO = 0.95
- PHEROMONE_DEPOSIT = 0.02
- PHEROMONE_DEPOSIT_MODE = top-10-percent-amplitude
- PHEROMONE_FEEDBACK_ENABLED = false

Scan:
- effectiveMemoryCoupling = 0.12, 0.15, 0.18, 0.20, 0.25, 0.30, 0.40

Output:
- experiments/v2.1.2-combined-coupling-retune-results.json
- experiments/v2.1.2-combined-coupling-retune-summary.json
- docs/v2.1.2-combined-coupling-retune-results.md

Interpretation:
Completed. No effectiveMemoryCoupling value passed all combined surrogate guardrails across all three seeds; A/B remained too separate as coupling increased above 0.1.

## Experiment 018: v2.1.2 Coupling Mechanism Audit

Purpose:
Audit why increasing Memory Coupling in the combined v2.1.2 surrogate moved fieldA and fieldB farther apart instead of closer together.

Reason:
Experiment 017 showed that effectiveMemoryCoupling 0.12–0.40 increased fieldABDistance, so the issue may be coupling formula or step order rather than coupling strength.

Tested changes:
- Add experimental `difference-attractor` coupling formula.
- Use bidirectional snapshot updates to avoid update-order bias.
- Test coupling before memory update / memory blend.
- Compare against the existing absolute-memory formula when possible.

Output:
- experiments/v2.1.2-coupling-mechanism-audit-results.json
- experiments/v2.1.2-coupling-mechanism-audit-summary.json
- docs/v2.1.2-coupling-mechanism-audit.md

Interpretation:
Completed: difference-attractor rows reduced fieldABDistance and produced surrogate candidates; real 64^3 validation is the next gate, not v2.2 planning.

---

## Experiment 019: v2.1.2 Real 64³ Validation Gate

Purpose:
Validate the v2.1.2 candidate params from Experiment 018 against real 64³ runtime if available, or clearly mark real 64³ validation as blocked if no real runtime exists.

Reason:
Experiment 018 found a stable surrogate candidate using difference-attractor coupling, but v2.2 should not start until the candidate is checked beyond the 16³ diagnostic surrogate.

Candidate Params:
- GAMMA = 0.005
- HISTORY_ALPHA = 0.00025
- MEMORY_WEIGHT = 0.04
- MEMORY_COUPLING_FORMULA = difference-attractor
- MEMORY_COUPLING_ORDER = after-memory-update
- MEMORY_COUPLING_WEIGHT = 1.0
- COUPLING_G = 0.05
- PHEROMONE_DIFFUSION = 0
- PHEROMONE_DEPOSIT_THRESHOLD_RATIO = 0.95
- PHEROMONE_DEPOSIT = 0.02
- PHEROMONE_DEPOSIT_MODE = top-10-percent-amplitude
- PHEROMONE_FEEDBACK_ENABLED = false

Output:
- experiments/v2.1.2-real64-validation-results.json
- experiments/v2.1.2-real64-validation-summary.json
- docs/v2.1.2-real64-validation.md

Interpretation:
Completed. Real 64³ validation is blocked because no production-equivalent real A/B runtime exists in this repository snapshot. A clearly labeled surrogate-64 fallback was run, and it must not be treated as real-64 validation or v2.2 approval.

## Experiment 020: v2.1.2 Real Runtime Validation

Purpose:
Create or connect a real-runtime-v0 A/B field loop and validate the v2.1.2 candidate params beyond diagnostic-surrogate.

Reason:
Experiment 019 showed that surrogate-64 produced a candidate, but real 64³ validation remained blocked because no production-equivalent real runtime was available.

Candidate Params:
- GAMMA = 0.005
- HISTORY_ALPHA = 0.00025
- MEMORY_WEIGHT = 0.04
- MEMORY_COUPLING_FORMULA = difference-attractor
- MEMORY_COUPLING_ORDER = after-memory-update
- MEMORY_COUPLING_WEIGHT = 1.0
- COUPLING_G = 0.05
- PHEROMONE_DIFFUSION = 0
- PHEROMONE_DEPOSIT_THRESHOLD_RATIO = 0.95
- PHEROMONE_DEPOSIT = 0.02
- PHEROMONE_DEPOSIT_MODE = top-10-percent-amplitude
- PHEROMONE_FEEDBACK_ENABLED = false

Stages:
- 32³ smoke: completed, rejected because Condition D collapsed A/B identity and destabilized energy.
- 64³ smoke: completed, rejected because Condition D collapsed A/B identity and destabilized energy.
- 64³ three-seed validation: skipped in this run because the prerequisite 64³ smoke did not produce a candidate and the full run is significantly more expensive.

Output:
- experiments/v2.1.2-real-runtime-validation-results.json
- experiments/v2.1.2-real-runtime-validation-summary.json
- docs/v2.1.2-real-runtime-validation.md

Interpretation:
Completed. real-runtime-v0 now exists and is separate from diagnostic-surrogate, but the v2.1.2 candidate did not pass the real-runtime-v0 smoke stages. Do not proceed to v2.2 planning yet.

## Experiment 021: v2.1.2 Runtime Results Audit + v2.2 Planning Gate

Purpose:
Audit the real-runtime-v0 validation results and decide whether v2.2 planning is allowed.

Reason:
v2.2 should not start from surrogate results alone. It requires evidence from real-runtime-v0, preferably 64³ three-seed validation.

Output:
- experiments/v2.1.2-runtime-results-audit.json
- docs/v2.1.2-runtime-results-audit.md

Optional output if gate passes:
- docs/v2.2-planning-gate.md
- experiments/v2.2-planning-gate-summary.json

Interpretation:
Completed. v2.2 planning is not allowed because the real-runtime-v0 audit found no 32³ or 64³ smoke candidate and no executed 64³ three-seed full validation. v2.2 implementation remains blocked.

## Experiment 022: v2.1.2 Real Runtime Stability Retune

Purpose:
Retune real-runtime-v0 to avoid identity collapse, energy instability, and memory instability observed in previous 32³ / 64³ smoke validation.

Reason:
The surrogate-64 candidate transferred into real-runtime-v0 as an overly strong interaction, producing collapse or instability. v2.2 planning remains blocked until real-runtime-v0 has a stable 64³ candidate.

Scan:
- COUPLING_G = 0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03
- MEMORY_WEIGHT = 0.005, 0.01, 0.02, 0.03, 0.04
- HISTORY_ALPHA = 0.00025, 0.0005, 0.001

Executed Scan:
- Priority 32³ subset because full real-runtime-v0 grid is heavy: COUPLING_G = 0.005, 0.01, 0.02, 0.03; MEMORY_WEIGHT = 0.01, 0.02, 0.04; HISTORY_ALPHA = 0.00025, 0.0005, 0.001.

Stages:
- 32³ broad stability scan: completed with 36 Condition D rows.
- 32³ three-seed confirmation: completed for five direction-candidate rows.
- 64³ smoke if 32³ candidate is found: skipped because no 32³ stability candidate was found.
- 64³ three-seed validation if 64³ smoke passes: skipped because no 64³ smoke candidate exists.

Output:
- experiments/v2.1.2-real-runtime-stability-retune-results.json
- experiments/v2.1.2-real-runtime-stability-retune-summary.json
- docs/v2.1.2-real-runtime-stability-retune.md

Interpretation:
Completed. Lower coupling avoided identity collapse in the executed 32³ rows and produced direction candidates, but no full stability candidate was found because A/B remained too separate and memory traces were often too detached. v2.2 planning remains blocked.

## Experiment 023: v2.1.2 Real Runtime Stability Narrow Retune

Purpose:
Narrow-retune the best direction candidate from Experiment 022 to search for a full real-runtime-v0 stability candidate.

Reason:
Experiment 022 found a direction candidate around COUPLING_G=0.005, MEMORY_WEIGHT=0.01, HISTORY_ALPHA=0.001, but no full stability candidate. A narrower scan is needed before 64³ smoke.

Center:
- COUPLING_G = 0.005
- MEMORY_WEIGHT = 0.01
- HISTORY_ALPHA = 0.001

Scan:
- COUPLING_G = 0.003, 0.004, 0.005, 0.006, 0.0075
- MEMORY_WEIGHT = 0.0075, 0.01, 0.0125, 0.015
- HISTORY_ALPHA = 0.00075, 0.001, 0.0015, 0.002

Stages:
- 32³ narrow single-seed scan
- 32³ three-seed confirmation if candidate-like rows appear
- 64³ smoke only if 32³ full candidate is confirmed
- 64³ full validation only if 64³ smoke passes

Output:
- experiments/v2.1.2-real-runtime-stability-narrow-retune-results.json
- experiments/v2.1.2-real-runtime-stability-narrow-retune-summary.json
- docs/v2.1.2-real-runtime-stability-narrow-retune.md

Interpretation:
Completed. A 32³ three-seed candidate and 64³ smoke candidate were found at COUPLING_G=0.0075, MEMORY_WEIGHT=0.0075, HISTORY_ALPHA=0.002, but 64³ full validation collapsed below the field identity guardrail. v2.2 planning remains blocked.
