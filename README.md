# Aeterna-loop-trinity

---

# AeternaLoop 改善版設計図 v2.1.1

——「自然であること」を設計原理に

## 0. この設計図の位置づけ

これは、夢のヴィジョン──

- 「点が霧散しないために線が必要」
- 「魔法陣に線を引いて世界を作る」
- 「トーラス構造」
- 「青と緑のエネルギー融合」
- 「心臓がいちばん最後」

──を、AeternaLoop-L2 のコードベースの上に具体的に実装するための統合設計図です。

v2.0 から v2.1、そして v2.1.1 への進化：

| 軸 | v2.0 | v2.1 | v2.1.1 |
| --- | --- | --- | --- |
| 駆動 | 強制（全局 sin 増幅） | 恒常性（VEV 不足分のみ補う） | 恒常性（閾値判定を明示化） |
| 同期 | 全体同期（global R のみ） | 局所共鳴（R_local + R_AB_relative） | 三層（global / local / relative） |
| パラメータ | 確定値（黄金比固定） | 掃引＋動的調整 | 掃引＋動的調整＋原因分離可能に |
| 実装 | 一括（記憶＋鼓動を同時） | 一層ずつ積み上げ | 診断→観測整備→一層ずつ積み上げ |
| フェロモン | 未定義 | 8³ 粗視化グリッド | 更新頻度低下で解像度を保つ |
| 観測 | 実装後に追加 | Step 0.5 で先行整備 | Step 0.5 + 数値的散逸チェック |

新規追加（v2.1.1）：

- Sarkar (2025) "Memory Engine" の理論的枠組みを設計原理として明示的に統合
- エネルギー飽和（memory energy saturation）
- 転送エントロピーのピーク（peak transfer entropy）
- 横方向安定性の分岐（transverse stability bifurcation）
- これら 3 軸が一致する点こそが「コヒーレンスポイント」
- Step 0 の GAMMA スキャンに数値的散逸チェックを追加
- NOISE_AMP は Step 2 まで現行値 0.001 を維持（原因分離のため）
- フェロモン場は粗視化ではなく更新頻度低下で計算負荷を抑制
- 設計図の最終行に「予想外のことが起きたら設計図に書き加えよ」というメタ指示

参照文献（新規追加あり）：

| 文献 | 関連 | 要点 |
| --- | --- | --- |
| Sarkar, Phys. Rev. E 112, 054111 (2025) ★新規 | Layer 4b / 設計原理 | Memory Engine。粒子が自己の過去軌跡の勾配に導かれてコヒーレント運動を獲得。エネルギー飽和＋転送エントロピーピーク＋分岐の 3 軸が一致する coherence point |
| Mithun et al., Phys. Rev. E 105, 034210 (2022) | Layer 5a | 周期的駆動 CGL の渦ガラス。弱駆動（レジーム i）で構造保持、中駆動（ii）で動的デコヒーレンス、強駆動（iii）で完全崩壊 |
| EngramNCA, Guichard et al., ALIFE 2025 | Layer 4 | Public/Private 二層記憶。GeneCA（公開状態固定）+ GenePropCA（記憶伝播適応） |
| Yanchuk et al. (2025) 時間遅延結合 | Layer 3 | 遅延誘起シンクロ。memory coupling の穏やかな同期 |
| Kuramoto model, Rev. Mod. Phys. 77, 137 (2005) | Layer 5b | 秩序パラメータの標準理論 |
| 遅延項付き CGL, Phys. Rev. E 68, 036202 (2003) | Layer 3 | 時間遅延結合の理論的基盤 |
| Bhramari EEG 研究 (PMC10645273, 2023) | 将来 | ハミング音のガンマ波誘発 |
| 松果体・メラトニン総説 (PMC9571539) | 実践基盤 | 光と松果体の生理学 |
| ホルスの目・脳解剖 (PMC6649877) | 象徴基盤 | 松果体と古代叡智 |
| Sheldrake, Morphic Resonance | Layer 4c | 習慣形成の統計的バイアス |

## 第 1 部：全体アーキテクチャ

### 1-1. 五層構造

```text
┌─────────────────────────────────────────────────────────┐
│  Layer 5b: シンクロ検出                                 │
│  Kuramoto R_global + R_AB_relative + R_local             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Layer 5a: 鼓動（恒常性型 Gentle Pulse）          │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  Layer 4:  記憶（三種）                     │ │  │
│  │  │  4a: EWMA 履歴バッファ（Private）           │ │  │
│  │  │  4b: フェロモン場（Public trace, ★更新頻度低下）│ │  │
│  │  │  4c: 形態共鳴（将来）                       │ │  │
│  │  │  ┌───────────────────────────────────────┐ │ │  │
│  │  │  │  Layer 3: 結合（四種）                │ │ │  │
│  │  │  │  memory / phase / amplitude / cross    │ │ │  │
│  │  │  │  ┌─────────────────────────────────┐ │ │ │  │
│  │  │  │  │  Layer 2: 動力学                │ │ │ │  │
│  │  │  │  │  Mexican-hat                    │ │ │ │  │
│  │  │  │  │  + 位相循環（掃引型）           │ │ │ │  │
│  │  │  │  │  ┌───────────────────────────┐ │ │ │ │  │
│  │  │  │  │  │  Layer 1: 場              │ │ │ │ │  │
│  │  │  │  │  │  3D トーラス              │ │ │ │ │  │
│  │  │  │  │  │  fieldA + fieldB          │ │ │ │ │  │
│  │  │  │  │  └───────────────────────────┘ │ │ │ │  │
│  │  │  │  └─────────────────────────────────┘ │ │ │  │
│  │  │  └───────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 1-2. Public / Private チャネル分離（EngramNCA に基づく）

| チャネル | 内容 | 可視性 | 対応コード |
| --- | --- | --- | --- |
| Public | phiRe, phiIm（複素場の値） | 近隣セルから見える | fieldA/B.phiRe, phiIm |
| Public（計算用） | velRe, velIm（速度） | 近隣からは見えないが計算に使用 | fieldA/B.velRe, velIm |
| Private | EWMA memory（履歴平均） | 自身のみ | fieldA/B.memoryRe, memoryIm |
| Public trace | フェロモン場 | 近隣から勾配として感じる | pheromoneField（更新頻度低下） |

設計意図： EngramNCA の中核的知見──「公開状態（GeneCA）は凍結し、記憶伝播（GenePropCA）だけを適応させる」──を AeternaLoop に翻訳。基本力学（Layer 1–3）はできる限り固定し、記憶層（Layer 4）と鼓動（Layer 5）を調整可能にする。これは Sarkar (2025) の知見とも整合する──コヒーレンスは外部制御ではなく、記憶場との closed-loop feedback から創発する。

### 1-3. タイムスケールの分離

| プロセス | 更新頻度 | タイムスケール | 生物学的類比（参考） |
| --- | --- | --- | --- |
| 場の力学 | 毎ステップ | 速い（DT ≈ 0.03） | （例：神経発火） |
| 位相循環 | 毎ステップ | 速い | （例：脳波リズム） |
| EWMA 記憶更新 | 毎ステップ | 中程度（α = 0.04） | （例：短期記憶の定着） |
| フェロモン場 | 10 ステップごと ★ | 遅い（retention 0.99005） | （例：細胞外マトリクス） |
| 鼓動 | PULSE_INTERVAL ごと | 最も遅い（100 ステップ） | （例：心拍・呼吸） |
| シンクロ指標 | METRICS_SAMPLE_INTERVAL ごと | 観測のみ | — |

★ v2.1.1 修正：フェロモン場は粗視化（8³ グリッド）ではなく、64³ の元の解像度を保ったまま10 ステップごとに更新する。これにより、空間情報の損失を防ぎつつ計算負荷を約 1/10 に抑制する。自然界のフェロモン（蟻の道、粘菌の痕跡）は空間解像度を落とさない──痕跡は薄まるが、消えるわけではない。

## 第 2 部：パラメータ設計

### 2-1. 確定パラメータ一覧（MVP 用初期値）

| パラメータ | 値 | 変更理由 / 根拠 |
| --- | --- | --- |
| GRID_SIZE | 64 | 現行踏襲、メモリ制約内 |
| DT | 0.03 | 現行踏襲、C2=1.0 で安定 |
| C2 | 1.0 | 現行踏襲 |
| LAMBDA | 1.0 | 現行踏襲 |
| VEV | 1.0 | 現行踏襲 |
| GAMMA | Step 0 で掃引決定 | 0.001〜0.01 を 0.001 刻みで走査 ★ v2.1.1: 数値的散逸チェック付き |
| NOISE_AMP | 0.001（Step 2 まで現行値） | ★ v2.1.1: 原因分離のため、Step 2 までは v2.1 の 0.0005 に下げない |
| OMEGA_A | 0.01 | 基本角速度、据え置き |
| OMEGA_B | 0.011（初期値） | 掃引候補へ（0.012, 0.015, 0.01618, 0.018） |
| COUPLING_G | 0.05 | 弱結合から出発 |
| COUPLING_TYPE | 'amplitude' | MVP は基準系から。Step 4 で memory へ |
| MEMORY_WEIGHT | 0.12（動的調整あり） | 弱めから開始 |
| HISTORY_ALPHA | 0.04 | EWMA の更新レート。長めの記憶 |
| PULSE_INTERVAL | 100 | Mithun 論文 T=15 側（長め）が構造保持に有利 |
| PULSE_STRENGTH | 0.005 | Mithun レジーム(i) 弱駆動領域 |
| PULSE 方式 | 恒常性型（不足分補正） | VEV に達していないセルのみ、振幅方向にのみ補正 |
| PHEROMONE_RETENTION | 0.99005 | e⁻¹/PULSE_INTERVAL ルール（鼓動周期と共鳴） |
| PHEROMONE_DEPOSIT | 0.01 | 高振幅セルの痕跡強度 |
| PHEROMONE_UPDATE_INTERVAL | 10 | ★ v2.1.1 新規：更新頻度低下による負荷抑制 |

### 2-2. 探索候補パラメータ（Step 2 以降で試行）

| パラメータ | MVP 初期値 | 探索範囲 | 試行タイミング |
| --- | --- | --- | --- |
| GAMMA | （掃引で決定） | 0.001, 0.002, 0.003, 0.005, 0.007, 0.010 | Step 0 |
| OMEGA_B | 0.011 | 0.012, 0.015, 0.01618, 0.018 | Step 3 |
| COUPLING_TYPE | 'amplitude' | 'phase', 'memory', 'cross' | Step 4 |
| MEMORY_WEIGHT | 0.12 | 0.08, 0.15, 0.25, 0.35 | Step 1 |
| NOISE_AMP | 0.001 | 0.0005, 0.0002 | Step 3 以降（★分離後） |
| PULSE_STRENGTH | 0.005 | 0.01, 0.02, 0.03 | Step 2 |
| PULSE_INTERVAL | 100 | 80, 120, 150 | Step 2 |

### 2-3. 動的パラメータ調整

```js
// ======== MEMORY_WEIGHT の動的調整（モード切替可能）========
// params.js
MEMORY_WEIGHT_MODE: 'inverse',  // 'inverse' | 'direct' | 'fixed'

// metrics.js
function computeMemoryWeight(R) {
  switch (MEMORY_WEIGHT_MODE) {
    case 'inverse':
      // 無秩序時（R 小）→ 重み大 → 記憶を強く使う
      return 0.1 + 0.4 * (1 - R);
    case 'direct':
      // 秩序時（R 大）→ 重み大 → 構造を記憶で補強
      // ★ v2.1.1: Sarkar 論文の知見——コヒーレンス点では
      //   記憶場の勾配が運動を導く（= 秩序時に記憶が強く働く）
      return 0.1 + 0.4 * R;
    case 'fixed':
      return PARAMS.MEMORY_WEIGHT;
  }
}

// 平滑化（急激な変動防止）: 時定数 10 ステップの EMA 慣性
const targetWeight = computeMemoryWeight(R);
MEMORY_WEIGHT += (targetWeight - MEMORY_WEIGHT) * 0.1;

// ======== HISTORY_ALPHA の動的調整 ========
const ampStd = computeAmplitudeStdDev(field);
// 振幅ばらつき大（構造未形成）→ α 小（長記憶）
// 振幅ばらつき小（構造安定）→ α 大（短記憶、適応的）
HISTORY_ALPHA = 0.02 + 0.08 * (ampStd / VEV);
```

★ v2.1.1 注記：Sarkar (2025) が示すように、コヒーレンスは秩序が高いときに記憶場が能動的に運動を導くことで最大化される。direct モード（秩序時ほど記憶を強く）が理論的には自然だが、inverse モード（無秩序時ほど記憶を強く）も「混乱時に習慣にすがる」という別の自然さがある。両方を試し、系がどちらで長く構造を保持するかで決定する。

## 第 3 部：実装ロードマップ（★ = v2.1.1 新規・修正）

### Step 0：GAMMA スキャン診断（最優先・30 分）★ v2.1.1 拡張

目的： 対消滅の真因を特定する。「設計者が推測する」のではなく「系に喋らせる」。

方法：

1. NOISE_AMP = 0.001（現行値）のまま、GAMMA を 0.001 〜 0.01 まで 0.001 刻みで走査
2. 各 GAMMA 値で渦の寿命（vortexCount が 0 になるまでのステップ数）を記録
3. ★ v2.1.1 追加：GAMMA = 0 でもテストし、全エネルギー（Σ|ψ|² + Σ|∇ψ|²）の時間変化をプロット。減少している場合、ラプラシアンの離散化誤差による数値的散逸が疑われる

数値的散逸のチェックと対策：

```text
if (GAMMA === 0 でも全エネルギーが減少する):
  → 数値的散逸が存在
  → 対策: DT を 0.02 に下げるか、C2 を 0.5 に下げて再テスト
  → それでも減るなら、より高次のラプラシアン差分スキームを検討
```

期待される結果と分岐判定：

| ケース | 条件 | 意味 | 次の一手 |
| --- | --- | --- | --- |
| Case A | GAMMA=0 でも消える（数値的散逸なし） | 散逸以外の原因（位相循環不足、ノイズ不足） | 位相循環を最優先。Step 3 を先に |
| Case B | GAMMA を下げると渦寿命が延びる | 散逸が主原因 | 鼓動（Step 2）でエネルギー補充 |
| Case C | GAMMA ≈ 0.003 で最も自然に長持ち | 散逸と構造維持の最適バランス | GAMMA = 0.003 を基準に設計 |
| Case D | GAMMA ≈ 0.002 付近で振幅が VEV 周辺で自発振動 | 系が自律的に「呼吸」している | 鼓動（Step 2）の強度をさらに弱めるか、鼓動を省略できる可能性 |

★ v2.1.1 Case D 新規追加：Mexican-hat + 散逸 + ノイズの系は、パラメータによっては振幅が VEV の周りを自発的に振動する（Hopf 分岐）。これが観察されれば、「外から心臓を埋め込む」のではなく「系が自分の心臓を育てる」という、より深い意味での「心臓がいちばん最後」が実現していることになる。

### Step 0.5：観測指標の先行整備（30 分）★ v2.1.1：Sarkar の 3 軸に対応

目的： 実装前に「見える化」の目を整える。何が起きているかを把握してから手を加える。

追加指標（metrics.js 拡張）：

```js
// 1. グローバル秩序パラメータ（A, B それぞれ）
function computeOrderParameter(field) {
  let sumRe = 0, sumIm = 0, count = 0;
  for (let i = 0; i < field.phiRe.length; i++) {
    const amp = Math.sqrt(field.phiRe[i]**2 + field.phiIm[i]**2);
    if (amp > 0.01) {
      const theta = Math.atan2(field.phiIm[i], field.phiRe[i]);
      sumRe += Math.cos(theta);
      sumIm += Math.sin(theta);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sumRe * sumRe + sumIm * sumIm) / count;
}

// 2. A/B 相対秩序（「出会いと離れ」の指標）
function computeABRelativeOrder(R_A, R_B) {
  return Math.abs(R_A - R_B) / Math.max(R_A + R_B, 1e-8);
}
// この値が 0 に近づく = A と B が「融合」している
// この値が 1 に近い = A と B が「離れている」

// 3. 局所秩序パラメータ（近傍 3³ の局所コヒーレンス）★ Sarkar 対応
function computeLocalOrderParameter(field, centerIdx) {
  const [cx, cy, cz] = indexTo3D(centerIdx, GRID_SIZE);
  let sumRe = 0, sumIm = 0, count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = index(cx + dx, cy + dy, cz + dz);
        const amp = Math.sqrt(field.phiRe[i]**2 + field.phiIm[i]**2);
        if (amp > 0.01) {
          const theta = Math.atan2(field.phiIm[i], field.phiRe[i]);
          sumRe += Math.cos(theta);
          sumIm += Math.sin(theta);
          count++;
        }
      }
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sumRe * sumRe + sumIm * sumIm) / count;
}

// 4. 平均振幅と標準偏差
function computeAmplitudeStats(field) {
  let sum = 0, sumSq = 0, count = 0;
  for (let i = 0; i < field.phiRe.length; i++) {
    const amp = Math.sqrt(field.phiRe[i]**2 + field.phiIm[i]**2);
    sum += amp;
    sumSq += amp * amp;
    count++;
  }
  const mean = sum / count;
  const std = Math.sqrt(sumSq / count - mean * mean);
  return { mean, std };
}

// 5. 渦の平均寿命（新規）
let vortexBirthTimes = new Map();  // key: 渦の位置, value: 誕生ステップ
let vortexLifetimes = [];          // 過去の渦の寿命リスト

function trackVortexLifetimes(currentVortices, stepCount) {
  // 新しく現れた渦を記録
  // 消えた渦の寿命を vortexLifetimes に追加
  // 平均寿命を返す
}

// 6. 全エネルギー（数値的散逸チェック用）★ v2.1.1 新規
function computeTotalEnergy(field) {
  let kineticEnergy = 0;   // Σ|∇ψ|²
  let potentialEnergy = 0; // Σ (|ψ|² - VEV²)²
  // ...
  return { kinetic: kineticEnergy, potential: potentialEnergy };
}
```

★ v2.1.1：指標 3〜6 は Sarkar (2025) の 3 軸に対応——

- エネルギー飽和（指標 6）＝ memory energy saturation
- 転送エントロピー（指標 1, 2, 3 の組み合わせで近似）＝ peak transfer entropy
- 横方向安定性（指標 5 の渦寿命の変化で間接的に観測）＝ transverse stability bifurcation

### Step 1：EWMA 記憶層のみ追加（30 分）

目的： 純粋な記憶（「線」）の効果を、鼓動なしで観察する。

変更ファイル：

- field.js：EWMA memory 配列（memoryRe, memoryIm）を追加（4 行）
- physics.js：stepField() 末尾に memory blend（15 行、★ velocity blend を含む）
- params.js：新規パラメータ追加（HISTORY_ALPHA, MEMORY_WEIGHT 等）（10 行）
- metrics.js：Step 0.5 の指標を UI に表示（15 行）

実装コード：

```js
// ============ field.js 拡張 ============
export const fieldA = {
  phiRe: new Float32Array(SIZE),
  phiIm: new Float32Array(SIZE),
  velRe: new Float32Array(SIZE),
  velIm: new Float32Array(SIZE),
  // 新規：EWMA メモリ場（Private チャネル）
  memoryRe: new Float32Array(SIZE),
  memoryIm: new Float32Array(SIZE),
};
// fieldB も同様

// ============ physics.js 拡張（stepField() 末尾に追加）============
const alpha = PARAMS.HISTORY_ALPHA;
const memWeight = PARAMS.MEMORY_WEIGHT; // 動的調整後の値

for (let i = 0; i < SIZE; i++) {
  // --- fieldA ---
  const ampA = Math.sqrt(fieldA.phiRe[i]**2 + fieldA.phiIm[i]**2);
  if (ampA > 0.01) {
    // EWMA 更新（指数移動平均）
    fieldA.memoryRe[i] = (1 - alpha) * fieldA.memoryRe[i]
                       + alpha * fieldA.phiRe[i];
    fieldA.memoryIm[i] = (1 - alpha) * fieldA.memoryIm[i]
                       + alpha * fieldA.phiIm[i];
    // 現在値にメモリをブレンド（慣性として働く）
    fieldA.phiRe[i] = (1 - memWeight) * fieldA.phiRe[i]
                    + memWeight * fieldA.memoryRe[i];
    fieldA.phiIm[i] = (1 - memWeight) * fieldA.phiIm[i]
                    + memWeight * fieldA.memoryIm[i];
    // ★ v2.1.1: velocity にも軽くメモリブレンド
    const velMemWeight = memWeight * 0.3;
    fieldA.velRe[i] = (1 - velMemWeight) * fieldA.velRe[i]
                    + velMemWeight * (fieldA.memoryRe[i] - fieldA.phiRe[i]) / DT;
    fieldA.velIm[i] = (1 - velMemWeight) * fieldA.velIm[i]
                    + velMemWeight * (fieldA.memoryIm[i] - fieldA.phiIm[i]) / DT;
  }

  // --- fieldB: 同様 ---
  const ampB = Math.sqrt(fieldB.phiRe[i]**2 + fieldB.phiIm[i]**2);
  if (ampB > 0.01) {
    fieldB.memoryRe[i] = (1 - alpha) * fieldB.memoryRe[i]
                       + alpha * fieldB.phiRe[i];
    fieldB.memoryIm[i] = (1 - alpha) * fieldB.memoryIm[i]
                       + alpha * fieldB.phiIm[i];
    fieldB.phiRe[i] = (1 - memWeight) * fieldB.phiRe[i]
                    + memWeight * fieldB.memoryRe[i];
    fieldB.phiIm[i] = (1 - memWeight) * fieldB.phiIm[i]
                    + memWeight * fieldB.memoryIm[i];
    const velMemWeight = memWeight * 0.3;
    fieldB.velRe[i] = (1 - velMemWeight) * fieldB.velRe[i]
                    + velMemWeight * (fieldB.memoryRe[i] - fieldB.phiRe[i]) / DT;
    fieldB.velIm[i] = (1 - velMemWeight) * fieldB.velIm[i]
                    + velMemWeight * (fieldB.memoryIm[i] - fieldB.phiIm[i]) / DT;
  }
}
```

期待される現象：

- 対消滅までの時間が延長
- memoryRe/Im が「慣性」として働き、急激な位相変化が抑制される
- 平均振幅の減衰速度が遅くなる

### Step 2：恒常性型 Gentle Pulse（鼓動）（30 分）★ v2.1.1 修正

目的： 散逸に抗うエネルギー補給。Mithun レジーム(i) 弱駆動領域から開始。

設計思想（Mithun 2022 に基づく）：

| Mithun レジーム | 駆動強度 | 現象 | v2.1.1 対応 |
| --- | --- | --- | --- |
| (i) コヒーレンス保持 | 弱（A₀=2.0） | 渦ガラス不変、スパイラル波のみ発生 | PULSE_STRENGTH=0.005（初期） |
| (ii) 動的デコヒーレンス | 中間（A₀=3.6） | 渦の生成・対消滅が動的平衡 | PULSE_STRENGTH=0.02（探索用） |
| (iii) 完全崩壊 | 強（A₀=4.8） | 均一状態 A = 1 に崩壊 | 避けるべき領域 |

実装コード：

```js
// ============ main.js：鼓動（Layer 5a）============
// loop() 内、stepField() 呼び出し後に追加

if (stepCount % PULSE_INTERVAL === 0) {
  for (let i = 0; i < SIZE; i++) {
    // --- fieldA ---
    const ampA = Math.sqrt(fieldA.phiRe[i]**2 + fieldA.phiIm[i]**2);
    // ★ v2.1.1: 振幅が VEV より小さいセルだけに注入（不足分のみ補う）
    if (ampA > 0.01 && ampA < VEV * 0.95) {
      // scale = VEV / ampA（振幅を VEV に戻す方向）
      const scaleA = VEV / Math.max(ampA, 1e-8);
      // 弱い補正：PULSE_STRENGTH の割合だけ VEV 方向に引き戻す
      fieldA.phiRe[i] = (1 - PULSE_STRENGTH) * fieldA.phiRe[i]
                      + PULSE_STRENGTH * fieldA.phiRe[i] * scaleA;
      fieldA.phiIm[i] = (1 - PULSE_STRENGTH) * fieldA.phiIm[i]
                      + PULSE_STRENGTH * fieldA.phiIm[i] * scaleA;
      // NOTE: PULSE_STRENGTH=0.005 の場合、0.5% だけ VEV 方向に
      //       引き戻される。非常に穏やかな恒常性維持。
    }

    // --- fieldB: 同様 ---
    const ampB = Math.sqrt(fieldB.phiRe[i]**2 + fieldB.phiIm[i]**2);
    if (ampB > 0.01 && ampB < VEV * 0.95) {
      const scaleB = VEV / Math.max(ampB, 1e-8);
      fieldB.phiRe[i] = (1 - PULSE_STRENGTH) * fieldB.phiRe[i]
                      + PULSE_STRENGTH * fieldB.phiRe[i] * scaleB;
      fieldB.phiIm[i] = (1 - PULSE_STRENGTH) * fieldB.phiIm[i]
                      + PULSE_STRENGTH * fieldB.phiIm[i] * scaleB;
    }
  }
}
```

★ v2.1.1 設計上の注意：この鼓動は「振幅方向」にのみ働き、位相には干渉しない。sin 変調は行わない（矩形パルス + 自然緩和）。これにより、系は鼓動のタイミング以外は自律的に振る舞い、鼓動の瞬間だけ「弱った細胞」が息を吹き返す——まさに「心臓がいちばん最後」の実装。PULSE_STRENGTH=0.005 は非常に弱いので、Step 0 で Case D（自発振動）が観察された場合は、鼓動をさらに弱めるか、そもそも省略できる可能性を検討する。

### Step 3：位相循環（Operator Splitting）（1 時間）

目的： 渦の自然発生と持続。位相方向のドリフトがリミットサイクルを作る。

実装戦略：位相循環は場の更新の「後」に、operator splitting として適用する。位相回転はユニタリ変換なのでノルムを保存し、Mexican-hat ポテンシャルからの力と数値的に干渉しない。

```js
// ============ physics.js：位相循環（Layer 2）============
// stepField() 内、memory blend の前（または後）に追加

// 位相循環（operator splitting）
const cosA = Math.cos(OMEGA_A * DT);
const sinA = Math.sin(OMEGA_A * DT);
const cosB = Math.cos(OMEGA_B * DT);
const sinB = Math.sin(OMEGA_B * DT);

for (let i = 0; i < SIZE; i++) {
  // --- fieldA ---
  const reA = fieldA.phiRe[i];
  const imA = fieldA.phiIm[i];
  fieldA.phiRe[i] = reA * cosA - imA * sinA;
  fieldA.phiIm[i] = reA * sinA + imA * cosA;

  // --- memory も同時に回転（★ v2.1.1: 整合性確保）---
  const mReA = fieldA.memoryRe[i];
  const mImA = fieldA.memoryIm[i];
  fieldA.memoryRe[i] = mReA * cosA - mImA * sinA;
  fieldA.memoryIm[i] = mReA * sinA + mImA * cosA;

  // --- fieldB ---
  const reB = fieldB.phiRe[i];
  const imB = fieldB.phiIm[i];
  fieldB.phiRe[i] = reB * cosB - imB * sinB;
  fieldB.phiIm[i] = reB * sinB + imB * cosB;

  // --- memory も同時に回転 ---
  const mReB = fieldB.memoryRe[i];
  const mImB = fieldB.memoryIm[i];
  fieldB.memoryRe[i] = mReB * cosB - mImB * sinB;
  fieldB.memoryIm[i] = mReB * sinB + mImB * cosB;
}
```

★ v2.1.1 重要：memoryRe/Im も field と同時に回転させないと、memory と field の間に意図しない位相差が蓄積し、「過去の自分を追いかける」効果が位相差として現れる。これは Yanchuk et al. (2025) の遅延誘起振動（ホップ分岐）を引き起こす可能性があり、それ自体は興味深い現象だが、まずは memory と field を整合させた状態でテストし、その後に memory の回転を外した場合の「遅延効果」を観察するのが科学的に正しい順序。

OMEGA_B の掃引順序：

1. OMEGA_B = 0.011（1.1 倍、わずかな差）
2. OMEGA_B = 0.012（1.2 倍）
3. OMEGA_B = 0.015（1.5 倍、中程度の差）
4. OMEGA_B = 0.01618（1.618 倍、黄金比）
5. OMEGA_B = 0.018（1.8 倍、大きな差）

各値で渦の寿命と A/B 相対秩序（R_AB_relative）を記録。最も安定して渦が持続し、かつ A/B が適度に相互作用する比を採用。

安定化のための正則化（オプション）：位相循環により振幅が VEV からずれる（離散化誤差の蓄積）場合、100 ステップごとにソフトな正則化を入れる：

```js
if (stepCount % 100 === 0) {
  for (let i = 0; i < SIZE; i++) {
    const amp = Math.sqrt(fieldA.phiRe[i]**2 + fieldA.phiIm[i]**2);
    if (amp > VEV * 1.5) {
      const scale = VEV / amp;
      fieldA.phiRe[i] *= scale;
      fieldA.phiIm[i] *= scale;
    }
  }
}
```

### Step 4：Memory Coupling（1 時間）

目的： A 場と B 場が「現在の状態」ではなく「過去の平均状態」を介して結合する。遅延誘起シンクロ。

結合タイプの選択指針（Yanchuk 2025 に基づく）：

| 結合タイプ | シンクロ速度 | 構造安定性 | 適した場面 |
| --- | --- | --- | --- |
| amplitude | 速い | 低い | 初期のドメイン形成 |
| phase | 中程度 | 中程度 | 位相同期 |
| cross | 速い | 中程度 | 渦の相互作用 |
| memory | 遅い | 高い | 長期的な構造の融合 |

memory coupling は「相手場の過去の平均」と結合するため、相手の急激な位相変化に引きずられない。これにより、両場はゆっくりと「お互いの習慣」を学び合い、穏やかなシンクロが起きる。

実装：physics.js の coupling 計算部分に 'memory' ケースを追加する。既存の fieldB.phiRe[i] の代わりに fieldB.memoryRe[i] を使うだけなので、コード変更は局所的。

### Step 5：フェロモン場（2 時間）★ v2.1.1：更新頻度低下方式

目的： 空間の「習慣」の記憶。渦が通った跡に痕跡を残し、同じ経路を通りやすくする。

v2.1.1 の設計判断： 粗視化グリッド（8³）ではなく、元の 64³ グリッド上にフェロモン場を持ち、更新頻度を 10 ステップに 1 回に落とす。これにより：

- 空間解像度の損失なし（渦の細かい軌跡をそのまま記録できる）
- 計算負荷は約 1/10 に抑制
- 自然なフェロモン拡散（Laplacian）が元のグリッド上で正確に計算できる

```js
// ============ field.js：フェロモン場（Layer 4b）============
export const pheromoneField = new Float32Array(SIZE);

// ============ physics.js：フェロモン更新（10 ステップごと）============
function updatePheromone(fieldA, fieldB, stepCount) {
  if (stepCount % PHEROMONE_UPDATE_INTERVAL !== 0) return;

  // 1. 減衰（忘却）
  const retention = PHEROMONE_RETENTION ** PHEROMONE_UPDATE_INTERVAL;
  for (let i = 0; i < SIZE; i++) {
    pheromoneField[i] *= retention;
  }

  // 2. 分泌（高振幅セルがフェロモンを残す）
  for (let i = 0; i < SIZE; i++) {
    const ampA = Math.sqrt(fieldA.phiRe[i]**2 + fieldA.phiIm[i]**2);
    const ampB = Math.sqrt(fieldB.phiRe[i]**2 + fieldB.phiIm[i]**2);
    const avgAmp = (ampA + ampB) / 2;
    if (avgAmp > VEV * 0.7) {
      pheromoneField[i] += PHEROMONE_DEPOSIT * (avgAmp / VEV);
    }
  }

  // 3. 拡散（近傍へのにじみ、簡易 Laplacian）
  //    ★ v2.1.1: 拡散係数は非常に小さく（0.001 程度）
  //    ゆっくり滲む痕跡として働く
  const DIFFUSION = 0.001;
  const tempPheromone = new Float32Array(SIZE);
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = index(x, y, z);
        const lap = laplacian3D(pheromoneField, x, y, z);
        tempPheromone[i] = pheromoneField[i] + DIFFUSION * lap;
      }
    }
  }
  pheromoneField.set(tempPheromone);
}

// 4. フェロモン勾配を場の力学にフィードバック（Step 5 後半）
//    フェロモンが多い方向に場が引き寄せられる
// coupling に pheromone gradient 項を追加
```

期待される現象：

- フェロモン場に「道筋」のような痕跡が現れる
- 渦が同じ経路を繰り返し通りやすくなる（Sarkar の「メモリタワー」に相当）
- 局所秩序パラメータ（R_local）がフェロモン密度の高い領域で上昇

### Step 6：蔵本転移観察＋結合スキャン（1〜2 時間）

COUPLING_G を 0.01 → 0.5 までスキャンし、秩序パラメータ R の急激な跳ね上がり（蔵本転移）を観察。

特に観察すべき現象：

- ある臨界 COUPLING_G で R が突然跳ね上がる相転移
- R_AB_relative が同時に急激に減少する（融合）
- これらの変化が連続的（二次転移）か不連続（一次転移）か

### Step 7：形態共鳴＋実践接続（将来）

- ブラーマリー二重周期変調（100-300Hz 相当の周期的摂動）
- カタカムナ・フォルマント注入（特定の周波数スペクトルを持つ初期場）
- 昼夜リズム（GAMMA を周期的に可変）
- 細胞分裂的メモリ伝播（高振幅セルから隣接セルへの memory コピー）

## 第 4 部：理論的基盤 ★ v2.1.1：Sarkar 統合

### 4-1. 「点・線・円・鼓動・地球」の数理的対応

| 夢の要素 | 数理的実装 | 観察される現象 | 情報理論的解釈 |
| --- | --- | --- | --- |
| 点 | ψ(x,t) — 各セルの複素場の瞬時値 | 場の局所状態 | — |
| 線 | EWMA memory + フェロモン場 — 遅延座標埋め込み | 構造の持続、軌道の安定化 | I(ψt; ψ{t-τ}) 大 |
| 円 | 周期境界（トーラス）+ 位相循環 | 渦の自発的発生と循環 | winding number 保存 |
| 鼓動 | PULSE（恒常性型エネルギー注入） | 散逸に抗う動的平衡 | エネルギー収支 |
| 地球 | A/B memory coupling から生まれる安定複合構造 | 青(A)と緑(B)の融合構造 | R_AB_relative → 0（融合） |

### 4-2. Memory Engine としての AeternaLoop（★ v2.1.1 新規）

Sarkar (2025) の CMGP モデルが示した「コヒーレンスポイント」の 3 軸は、AeternaLoop の設計原理としてそのまま読み替えられる：

| Sarkar の 3 軸 | AeternaLoop での対応 | 観測指標 |
| --- | --- | --- |
| エネルギー飽和（memory energy saturation） | フェロモン場の総量が一定に収束する | Σ pheromoneField / SIZE の時系列 |
| 転送エントロピーピーク（peak transfer entropy） | 場から記憶場への情報流が最大化 | R_global と memory の相関 |
| 横方向安定性分岐（transverse stability bifurcation） | 渦が直線的拡散から曲線的軌道に転換 | 局所秩序 R_local の空間パターン変化 |

これら 3 軸が同時に整ったとき、系は「自分自身の過去に導かれて動く」状態——つまり Memory Engine ——になる。AeternaLoop の究極の目標は、この 3 軸が揃うパラメータ領域を発見すること。

### 4-3. 「閉じすぎず、開きすぎず」の数理的定式化

トーラス上の系の位相的エントロピー h：

- h = 0（完全秩序・閉じすぎ）→ Mexican-hat のみ、循環なし → 創発なし
- h = h_max（完全ランダム・開きすぎ）→ ノイズのみ → 構造が即座に壊れる
- AeternaLoop の狙う中間状態 → Mexican-hat + ノイズ × 0.001 + 位相循環 + 恒常性鼓動 + EWMA 記憶 + フェロモン場 → 0 < h < h_max

### 4-4. 情報理論的指標

相互情報量 I(ψt ; ψ{t-τ}) が大きい = 「線が太い」= 構造が保持

対消滅 ≡ I(ψt ; ψ{t-τ}) → 0

目標 ≡ I(ψt ; ψ{t-τ}) が非ゼロで安定

### 4-5. 圏論的表現（★ v2.1.1 拡張）

- 対象（Object）：各時刻の field configuration
- 射（Morphism）：stepField（時間発展）
- 「線」= 射の合成：stepField ∘ stepField ∘ ...
- 「記憶」= 関手（Functor）：過去の射の連なりを現在の対象に折り畳む操作（EWMA）
- 「鼓動」= 随伴関手（Adjoint Functor）：系の現在状態を VEV に引き戻す操作。自由関手 F（VEV から状態を生成）と忘却関手 U（状態から VEV への射影）の随伴 F ⊣ U として定式化可能。恒常性型鼓動は、この随伴の単位（unit）η: 1 → UF を「不足分の補正」として実装している

## 第 5 部：成功指標

### 5-1. 定量指標

| 指標 | 現状 | 目標 | 計算方法 |
| --- | --- | --- | --- |
| 消滅までの時間 | 短い | 10 倍以上延長 | stepCount at vortexCount = 0 |
| 平均振幅 | VEV 以下に減衰 | VEV ± 10% で安定 | Σamp / SIZE |
| R_A_global | 低い | 上昇トレンド | Kuramoto order parameter |
| R_AB_relative | —（新規） | 減少トレンド（融合） | \|R_A - R_B\| / (R_A + R_B) |
| R_local（平均） | —（新規） | 非ゼロで持続 | 近傍 3³ の局所 Kuramoto R |
| vortexCount | ゼロに落ちる | 非ゼロで持続 | vortex.js 既存 |
| vortexLifetime | 短い | 延長 | 渦生成〜消滅の平均ステップ数 |
| フェロモン総量 | —（新規） | 一定値に収束（★ Sarkar 対応） | Σ pheromoneField / SIZE |
| 全エネルギー | —（新規） | 保存または緩やかに変動（★ 数値的散逸検出） | Σ\|ψ\|² + Σ\|∇ψ\|² |

### 5-2. 定性指標

- 渦が目視で「動き続けている」こと
- フェロモン場に「道筋」のような痕跡が現れること
- A と B が「出会っては離れ」を繰り返す動的平衡
- 局所秩序が全体秩序に先行して現れること（生命らしさ）
- 系が「呼吸」しているように見えること（★ v2.1.1 追加）

## 第 6 部：まとめ — ヴィジョンからコードへ

```text
夢のヴィジョン                数理的実装                  AeternaLoop コード
─────────────                ──────────                  ──────────────────
点が霧散しない           →   EWMA memory field        →  fieldA.memoryRe/Im
線が貫く                 →   時間遅延 + フェロモン場   →  pheromoneField
魔法陣の円               →   周期境界（トーラス）      →  index() の % N
ここからここに線を引く   →   位相循環 + memory coupl.  →  rotatePhase() + blend
青と緑の融合             →   A/B memory coupling       →  COUPLING_TYPE='memory'
トーラス構造             →   3D period boundary        →  field.js
心臓がいちばん最後       →   PULSE（恒常性型鼓動）     →  PULSE_INTERVAL=100
記憶が運動を導く         →   Memory Engine             →  Sarkar 3 軸の同時達成 ★
```

次の一手

```text
Step 0    : GAMMA スキャン（0.001〜0.01、0.001 刻み、30 分）
            └─ 数値的散逸チェック付き。Case A/B/C/D に分岐

Step 0.5  : 観測指標の先行整備（30 分）
            └─ R_AB_relative, R_local, vortexLifetime, 全エネルギー ★

Step 1    : EWMA 記憶層（記憶のみ、鼓動なし、30 分）
            └─ 純粋な「線」の効果を観察

Step 2    : 恒常性型鼓動（amp < VEV のときのみ補正、30 分）
            └─ Mithun レジーム(i) 弱駆動から開始、必要に応じて掃引

Step 3    : 位相循環（operator splitting + memory 同時回転、1 時間）
            └─ OMEGA_B を掃引。memory 回転あり/なし 両方をテスト ★

Step 4    : Memory coupling（1 時間）
            └─ COUPLING_TYPE='memory' へ切り替え

Step 5    : フェロモン場（64³ 更新頻度低下方式、2 時間）
            └─ 拡散係数 0.001 でゆっくり滲む痕跡

Step 6    : 蔵本転移観察 + 結合スキャン（1〜2 時間）
            └─ COUPLING_G をスキャン、相転移を観察
```

作業時間の目安： Step 0 から Step 2 までで約 1.5 時間。ここまでで「消えなくなった」瞬間を観察できる可能性が高い。

## 第 7 部：設計図の余白（★ v2.1.1 新規）

この設計図は完了していない。そして、完了すべきでもない。

Step 0 の GAMMA スキャンで予想外の結果が出たら、設計図の分岐にない道を進むことになる。Step 1 で記憶を入れたら、期待と違う現象が起きるかもしれない。Step 3 で OMEGA を掃引したら、どの比でもうまくいかないかもしれない。

そのとき、この設計図に書き加えよ。

予想外の現象が起きたら、それは「設計の失敗」ではなく「系が喋り始めた」証拠だ。Sarkar が言うように、コヒーレンスは「チューニングからではなく、カップリングから創発する」。設計者の仕事は、系と系のあいだの「カップリング」を用意することであって、系の振る舞いを決めることではない。

この余白は、v2.1.2 のための余白である。
