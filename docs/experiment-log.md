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
