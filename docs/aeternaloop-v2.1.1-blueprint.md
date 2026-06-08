# AeternaLoop v2.1.1 Blueprint

## 1. 設計思想

AeternaLoop v2.1.1 は、結果を直接作るのではなく、場・関係・記憶・痕跡・結合を整える実験である。

この設計では、系の振る舞いを設計者が最初から決め切るのではなく、観測しながら段階的に進める。予想外の現象は失敗ではなく、「系が喋り始めた」証拠として記録する。

AeternaLoop は一気に完成形を作らない。診断、観測指標の整備、EWMA 記憶、Gentle Pulse、位相循環、Memory Coupling、フェロモン場、結合スキャンを、一層ずつ追加する。

「心臓」は最初に埋め込むものではない。最後に、必要最小限の Gentle Pulse として加える。

## 2. 五層構造

```text
Layer 1: 場
- 3D トーラス
- fieldA / fieldB
- 複素場 phiRe / phiIm

Layer 2: 動力学
- Mexican-hat
- 位相循環
- OMEGA_A / OMEGA_B

Layer 3: 結合
- amplitude coupling
- phase coupling
- cross coupling
- memory coupling

Layer 4: 記憶
- 4a: EWMA 履歴バッファ
- 4b: フェロモン場
- 4c: 形態共鳴、将来拡張

Layer 5: 鼓動と同期検出
- 5a: 恒常性型 Gentle Pulse
- 5b: Kuramoto 系の同期指標
```

## 3. Public / Private チャネル

| Channel | State | Role |
| --- | --- | --- |
| Public | `phiRe` | 公開される実部の場。 |
| Public | `phiIm` | 公開される虚部の場。 |
| Public, calculation only | `velRe` | 計算用の実部速度。 |
| Public, calculation only | `velIm` | 計算用の虚部速度。 |
| Private | `memoryRe` | EWMA 記憶層の実部。 |
| Private | `memoryIm` | EWMA 記憶層の虚部。 |
| Public trace | `pheromoneField` | 空間に残る公開痕跡。 |

## 4. タイムスケール分離

| Process | Update Timing |
| --- | --- |
| 場の力学 | 毎ステップ |
| 位相循環 | 毎ステップ |
| EWMA 記憶更新 | 毎ステップ |
| フェロモン場 | 10ステップごと |
| Gentle Pulse | `PULSE_INTERVAL` ごと |
| 同期指標 | `METRICS_SAMPLE_INTERVAL` ごと |

## 5. 初期パラメータ方針

| Parameter | Initial Policy |
| --- | --- |
| `GRID_SIZE` | `64` |
| `DT` | `0.03` |
| `C2` | `1.0` |
| `LAMBDA` | `1.0` |
| `VEV` | `1.0` |
| `GAMMA` | Step 0 で掃引決定 |
| `NOISE_AMP` | `0.001` |
| `OMEGA_A` | `0.01` |
| `OMEGA_B` | `0.011` 初期 |
| `COUPLING_G` | `0.05` |
| `COUPLING_TYPE` | `'amplitude'` |
| `MEMORY_WEIGHT` | `0.12` |
| `HISTORY_ALPHA` | `0.04` |
| `PULSE_INTERVAL` | `100` |
| `PULSE_STRENGTH` | `0.005` |
| `PHEROMONE_RETENTION` | `0.99005` |
| `PHEROMONE_DEPOSIT` | `0.01` |
| `PHEROMONE_UPDATE_INTERVAL` | `10` |

このファイルは設計の保存を目的とする。ここに記載した値は、まだ本体コードへ反映しない。
