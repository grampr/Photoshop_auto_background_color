# Local Auto Harmonize — Photoshop MVP

人物などの前景レイヤーを背景へ馴染ませる、完全ローカル動作のPhotoshop UXPプラグインです。OpenCVによる白箱解析と、任意で[ZHKKKe/Harmonizer](https://github.com/ZHKKKe/Harmonizer)の出力を教師画像として使う逆推定を行い、結果をPhotoshopの再編集可能な調整レイヤーへ変換します。画像をクラウドへ送信しません。

> MVPです。色解析・API・調整レイヤー記述は自動テスト済みですが、Photoshopのバージョン差があるため、実機でのUXP読み込みと `batchPlay` は対象バージョンごとの確認が必要です。

## アーキテクチャ

```text
Photoshop UXP panel
  ├─ Imaging API: 前景・背景を最大512pxのRGBAとして取得
  ├─ 前景alphaをForeground Maskとして抽出
  ├─ 起動時health確認 → OSランチャー → backend自動起動
  └─ localhost:8765/v1/analyze
          ↓
FastAPI (Adobe非依存)
  ├─ analysis/: Lab統計、ヒストグラム、階調別解析
  ├─ models/: HarmonizationBackend抽象クラス
  │    └─ HarmonizerBackend（外部checkoutへのアダプター）
  └─ AI出力との差をExposure/Curve/Color Balance等へ逆推定
          ↓ JSON
Photoshop
  └─ Auto Harmonizeグループ（前景へクリッピング）
       ├─ Curves
       ├─ Color Balance
       ├─ Hue/Saturation
       └─ Exposure
```

Adobe連携は `plugin/`、画像解析・推論は `backend/harmonize_server/` に分離しています。DCCFやPHNetは `HarmonizationBackend` を実装してServiceへ注入すれば追加できます。After Effects対応時もPython側は再利用できます。

背景は画像全体の単純平均へ合わせません。前景マスクを膨張した周辺領域から背景の文脈色を取り、Lab、5/95パーセンタイル、絶対輝度帯別の色を比較します。肌・髪・毛・衣装など前景固有の色を保つため、色差は62%だけを候補値に使い、Temperature/Tint・階調別RGB・彩度・コントラストへ個別上限を設けます。最後に `correction = protected_estimate × strength` を適用します。

## リポジトリ構成

```text
backend/harmonize_server/
  api/            FastAPIルート
  analysis/       OpenCV統計・補正値推定
  color/          Lab変換・重み付き統計
  models/         AIバックエンド抽象化とHarmonizerアダプター
  utils/          画像I/O、デバイス選択
plugin/
  src/api/        localhostクライアント
  src/photoshop/  ピクセル取得、調整レイヤー生成
  src/ui/         表示
backend/tests/    API・画像・解析・推論契約テスト
plugin/test/      UXP通信・batchPlay記述テスト
scripts/          ローカル比較画像の再現スクリプト
```

## インストール

### 1. Python backend

Python 3.9〜3.12を使用してください。PyTorchがPython 3.13以降へ対応していない構成があるため、現時点では上限を設けています。

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
```

macOS:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements-dev.txt
```

手動起動（自動ランチャーを使わない場合）:

```bash
uvicorn --app-dir backend harmonize_server.main:app --host 127.0.0.1 --port 8765
```

`http://127.0.0.1:8765/v1/health` が `{"status":"ok",...}` を返せば準備完了です。外部公開を避けるため `127.0.0.1` のまま起動してください。

### 2. Harmonizer（Balanced / AIモード）

Harmonizer本体と学習済み重みは **CC BY-NC-SA 4.0** であり、商用利用が禁止されています。そのため本リポジトリには同梱せず、自動ダウンロードもしません。利用者自身がライセンスへ同意したうえで手動配置してください。

```bash
git clone https://github.com/ZHKKKe/Harmonizer.git vendor/Harmonizer
```

公式READMEから `harmonizer.pth` を取得し、`models/harmonizer.pth` へ置きます。次に使用環境に合うPyTorchを[公式インストール手順](https://pytorch.org/get-started/locally/)で導入します。例:

```bash
pip install -r requirements-ai.txt
```

別の場所へ置く場合:

```powershell
$env:HARMONIZER_REPO = "D:\models\Harmonizer"
$env:HARMONIZER_WEIGHTS = "D:\models\harmonizer.pth"
```

```bash
export HARMONIZER_REPO=/Users/me/models/Harmonizer
export HARMONIZER_WEIGHTS=/Users/me/models/harmonizer.pth
```

推論デバイスは `CUDA → MPS → CPU` の順で自動選択されます。BalancedはモデルがなければOpenCVへフォールバックし、AIは503と明確な案内を返します。

### 3. 自動起動ランチャー

プラグインはパネルを開くとlocalhost APIを確認し、停止中の場合だけ `localautoharmonize://start` を呼び出します。ランチャーは二重起動を防ぎ、CUDA/MPS/CPU設定を引き継いでバックエンドを非表示で開始します。標準UXPのセキュリティ仕様により、初回起動時はPhotoshopが外部プロセス起動の確認を表示します。

Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\launcher\windows\install-launcher.ps1
```

macOS:

```bash
chmod +x launcher/macos/*.sh
./launcher/macos/install-launcher.sh
```

Windowsのログは `%LOCALAPPDATA%\LocalAutoHarmonize\logs`、macOSは `~/Library/Logs/LocalAutoHarmonize` に保存されます。プロジェクトを移動した場合はインストールスクリプトを再実行してください。

### 4. Photoshop Developer Mode / UXP Developer Tool

1. Creative Cloud DesktopからPhotoshopと **UXP Developer Tool** をインストールします。
2. Photoshopの「プラグイン」設定でDeveloper Modeを有効にして再起動します。
3. UXP Developer Toolで **Add Plugin** を選び、`plugin/manifest.json` を指定します。
4. **Load** を押します。
5. Photoshopの `Plugins > Local Auto Harmonize` からパネルを開きます。

Manifest v5のnetwork権限は `127.0.0.1:8765` と `localhost:8765` のみに制限しています。対応の根拠はAdobe公式の[Manifest v5 network permissions](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp-guide/uxp-misc/manifest-v5/)および[Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/imaging/)です。

## 使い方

1. パネルを開くとバックエンドが自動起動します。失敗時は **ローカルAIを起動** で再試行できます。
2. 前景欄の候補リストから人物レイヤーを選びます。Photoshopのレイヤーパネルで対象を選択してから **選択中を設定** を押す方法も使えます。レイヤーの透明度がマスクになります。
3. 背景欄の候補リストから背景レイヤーを選びます。こちらもPhotoshopで選択してから **選択中を設定** を押せます。
4. 補正の強さ、合わせる項目、処理モードを選びます。
5. **解析** で補正値を確認します。
6. **プレビュー** で調整グループを作成／表示切替します。
7. **適用** で表示中の非破壊グループを確定します。元レイヤーの画素は変更しません。
8. 適用前なら **リセット** でプレビューグループを削除できます。適用後はPhotoshopの履歴またはレイヤーパネルで取り消せます。

解析やAI推論の実行中は、パネル下部に青いスピナーと経過時間が表示されます。完了時は緑、失敗時は赤に変わり、処理時間またはエラー内容が残ります。

Mode:

- **Fast**: OpenCVのみ。
- **Balanced**: OpenCV推定55% + Harmonizer教師推定45%相当。モデルなしならFastへフォールバック。
- **AI**: Harmonizer教師推定を主体にし、OpenCVを安定化用に混合。

`POST /v1/harmonize` はモデル統合・診断用にPNGを返しますが、Photoshopプラグインの通常フローはこの画像を焼き付けず、`/analyze` のJSON補正値だけを使います。

## 実例: 猫を空の背景へ合成

前景の猫をローカルのU²-Net軽量モデルで切り抜き、空の背景へ配置して、同じ画像をFastとAIで解析しました。解析解像度は最大768px、Strengthは通常利用を想定した55%です。実行環境はWindows 11、GeForce RTX 4080、PyTorch 2.5.1 + CUDA 12.4です。

![猫と空の合成に対するOriginal、Fast、AIの比較](docs/images/cat-sky-comparison.jpg)

| 補正値 | Fast / OpenCV | AI / Harmonizer |
|---|---:|---:|
| Exposure | +0.100 | -0.008 |
| Temperature | -9.90 | -2.93 |
| Tint | -4.28 | -1.32 |
| Contrast | -8.56 | -2.03 |
| Saturation | -4.67 | -1.48 |
| Midtone RGB | -9.90 / +4.57 / +9.90 | -2.96 / +0.53 / +2.52 |

Fastは前景色保護を通したうえで背景周辺の寒色傾向を反映します。AIは元の茶色い毛並みをさらに維持しながら、中間調とハイライトへごく弱い青を足し、コントラストを少し下げました。右端はHarmonizerの生成画像そのものではありません。Harmonizer出力との差から逆算したExposure、Curves、Color Balance、Hue/Saturation相当のJSONを、プレビュー用レンダラーで適用した結果です。実際のプラグインは同じ値をPhotoshopの非破壊調整レイヤーへ変換します。全補正値は [`cat-sky-corrections.json`](docs/images/cat-sky-corrections.json) で確認できます。

比較画像は次のコマンドで再生成できます。背景除去はデモ作成だけに使い、Photoshop内では前景レイヤーの透明度をマスクとして使用します。

```powershell
pip install rembg==2.0.61 onnxruntime==1.19.2
python scripts/create_demo_comparison.py `
  "D:\path\to\cat.jpg" "D:\path\to\sky.jpg" `
  --rembg-model u2netp --strength 55
```

## テスト

```bash
pytest
cd plugin
npm test
```

実モデル推論テストはライセンス済みのモデル配置後に環境変数を設定して実行すると有効になります。それ以外ではskipされ、モデルアダプターとAI教師画像の契約はFake backendで検証されます。

検証対象は、API生成・health、PNG/RGBA画像読み込み、alphaマスク、OpenCV全統計、Strength、Fast/Balanced/AI JSON、Harmonizer呼び出し契約、PNG推論レスポンス、UXP multipart通信、調整レイヤーdescriptor生成です。

## 対応環境

- Photoshop 24.0以降（Manifest上の最小値）。Imaging APIとUXP実装差を考慮し、最新のPhotoshopでの利用を推奨。
- Windows 10/11: NVIDIA CUDAまたはCPU。
- macOS 12.3以降: Apple Silicon MPSまたはCPU。Intel MacはCPU。
- Python 3.9〜3.12。

## 既知の問題

- Photoshop実機をCIから操作できないため、UXP起動と調整レイヤー生成はdescriptor契約テストまでです。PhotoshopのマイナーバージョンによりColor Balanceやクリッピングの `batchPlay` descriptor調整が必要な場合があります。
- 調整グループを前景レイヤーへクリップする方式は、複雑なPass Throughグループ、特殊ブレンド、スマートオブジェクト階層で見え方が変わることがあります。
- Backgroundは前景boundsに対応する領域を取得します。変形済みレイヤーや異なる座標系のスマートオブジェクトはずれる場合があります。
- Temperature/TintはCamera Rawの内部モデルではなく、Lab差をColor Balanceへ近似変換します。
- Selective ColorとCamera Raw FilterはMVPでは生成しません。推定値が安定して再編集できるCurves、Color Balance、Hue/Saturation、Exposureを優先しています。
- 8/16/32bit文書から解析用8bit sRGBへ変換するため、HDRの完全な階調一致は対象外です。
- HarmonizerのMPS動作はモデル内演算とPyTorchバージョンに依存し、未対応演算ではCPUが必要です。
- 標準UXPの外部起動にはユーザー同意が必須です。完全に無確認で起動するには、Adobe Hybrid Plugin SDKによる署名済みネイティブアドオンが必要です。

## ライセンス

本リポジトリ独自コードは[Apache License 2.0](LICENSE)です。主要依存OSSのライセンスは次の通りです（配布・商用利用前に各原文を再確認してください）。

| OSS | 用途 | ライセンス |
|---|---|---|
| ZHKKKe/Harmonizer | AI harmonization | [CC BY-NC-SA 4.0](https://github.com/ZHKKKe/Harmonizer#license) — 非商用、表示、同一条件 |
| FastAPI | localhost API | MIT |
| Uvicorn | ASGI server | BSD-3-Clause |
| NumPy | 数値計算 | BSD-3-Clause |
| OpenCV | 画像解析 | Apache-2.0 |
| Pillow | 画像互換性 | HPND |
| PyTorch / TorchVision | AI推論 | BSD-3-Clause |
| rembg | READMEデモ用の背景除去 | [MIT](https://github.com/danielgatis/rembg/blob/main/LICENSE.txt) |
| U²-Net / u2netp | READMEデモ用の前景マスク | [Apache-2.0](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE) |
| pytest | テスト | MIT |

Harmonizer由来コードや重みを本ソフトと一緒に再配布する場合、CC BY-NC-SA 4.0の表示・非商用・ShareAlike条件が適用され得ます。本READMEは法的助言ではありません。商用製品化にはHarmonizer作者から別ライセンスを取得するか、商用利用可能な別バックエンドへ差し替えてください。

`docs/images/cat-sky-comparison.jpg` の素材写真はリポジトリ所有者の提供物で、本リポジトリのApache-2.0ライセンス対象には含まれません。
