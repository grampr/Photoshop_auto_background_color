const { entrypoints } = require("uxp");
const { analyzeImages } = require("./api/client");
const { ensureBackend } = require("./api/launcher");
const { listLayerChoices, captureLayers } = require("./photoshop/pixels");
const { createAdjustmentGroup, setGroupVisibility, removeGroup } = require("./photoshop/layers");
const { formatResults } = require("./ui/format");

const state = {
  foregroundID: null,
  backgroundID: null,
  result: null,
  groupID: null,
  previewVisible: false,
};
let backendStartup = null;
const $ = (id) => document.getElementById(id);

function setStatus(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "error" : "";
}

function refreshLayers() {
  const { foreground, backgrounds } = listLayerChoices(state.foregroundID);
  state.foregroundID = foreground ? foreground.id : null;
  $("foregroundName").textContent = foreground ? foreground.name : "未設定";
  const select = $("backgroundLayer");
  select.innerHTML = "";
  for (const layer of backgrounds) {
    const option = document.createElement("option");
    option.value = String(layer.id);
    option.textContent = layer.name;
    select.appendChild(option);
  }
  const selected = backgrounds.find((layer) => layer.id === state.backgroundID) || backgrounds[0] || null;
  state.backgroundID = selected ? selected.id : null;
  if (selected) select.value = String(selected.id);
  $("backgroundName").textContent = selected ? selected.name : "未設定";
}

function assignActiveLayer(role) {
  const { active } = listLayerChoices(state.foregroundID);
  if (!active) throw new Error("Photoshopでレイヤーを1つ選択してください。");
  if (role === "foreground") {
    state.foregroundID = active.id;
    if (state.backgroundID === active.id) state.backgroundID = null;
    refreshLayers();
    setStatus(`前景を「${active.name}」に設定しました`);
    return;
  }
  if (active.id === state.foregroundID) throw new Error("前景とは別のレイヤーを背景に選択してください。");
  state.backgroundID = active.id;
  refreshLayers();
  setStatus(`背景を「${active.name}」に設定しました`);
}

function enabledOptions() {
  const result = {};
  document.querySelectorAll("#matchOptions input").forEach((input) => { result[input.dataset.key] = input.checked; });
  return result;
}

async function connectBackend() {
  if (!backendStartup) {
    backendStartup = ensureBackend({ onStatus: () => setStatus("ローカルAIを起動しています…") });
  }
  const startup = backendStartup;
  try {
    const { info, launched } = await startup;
    setStatus(`バックエンド準備完了 — ${info.device}${launched ? "（自動起動）" : ""}`);
  } finally {
    if (backendStartup === startup) backendStartup = null;
  }
}

async function runBusy(label, operation) {
  setStatus(label);
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try {
    await operation();
  } catch (error) {
    console.error(error);
    setStatus(error.message || String(error), true);
  } finally {
    document.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

async function analyze() {
  if (!state.foregroundID || !state.backgroundID) throw new Error("前景レイヤーと背景レイヤーを設定してください。");
  if (state.groupID) {
    await removeGroup(state.groupID);
    state.groupID = null;
  }
  const capture = await captureLayers(state.foregroundID, state.backgroundID, 512);
  state.result = await analyzeImages(capture, { mode: $("mode").value, strength: Number($("strength").value) });
  $("results").textContent = formatResults(state.result);
  setStatus("解析が完了しました");
}

async function ensurePreview() {
  if (!state.result) await analyze();
  if (!state.groupID) {
    state.groupID = await createAdjustmentGroup(state.foregroundID, state.result.corrections, enabledOptions());
    state.previewVisible = true;
    return true;
  }
  return false;
}

function wireEvents() {
  $("refreshLayers").addEventListener("click", refreshLayers);
  $("setForeground").addEventListener("click", () => runBusy("前景を設定しています…", async () => assignActiveLayer("foreground")));
  $("setBackground").addEventListener("click", () => runBusy("背景を設定しています…", async () => assignActiveLayer("background")));
  $("backgroundLayer").addEventListener("change", () => {
    state.backgroundID = Number($("backgroundLayer").value) || null;
    const selected = $("backgroundLayer").options[$("backgroundLayer").selectedIndex];
    $("backgroundName").textContent = selected ? selected.textContent : "未設定";
  });
  $("strength").addEventListener("input", () => { $("strengthValue").textContent = `${$("strength").value}%`; });
  $("analyze").addEventListener("click", () => runBusy("解析しています…", analyze));
  $("preview").addEventListener("click", () => runBusy("プレビューを更新しています…", async () => {
    const created = await ensurePreview();
    if (!created) {
      state.previewVisible = !state.previewVisible;
      await setGroupVisibility(state.groupID, state.previewVisible);
    }
    setStatus(state.previewVisible ? "プレビュー：オン" : "プレビュー：オフ");
  }));
  $("apply").addEventListener("click", () => runBusy("適用しています…", async () => {
    await ensurePreview();
    await setGroupVisibility(state.groupID, true);
    state.previewVisible = true;
    state.groupID = null;
    setStatus("非破壊調整レイヤーとして適用しました");
  }));
  $("reset").addEventListener("click", () => runBusy("リセットしています…", async () => {
    if (state.groupID) await removeGroup(state.groupID);
    state.groupID = null;
    state.result = null;
    $("results").textContent = "前景と背景を設定して解析してください。";
    setStatus("リセットしました");
  }));
  $("startBackend").addEventListener("click", () => runBusy("バックエンドへ接続しています…", connectBackend));
}

entrypoints.setup({ panels: { autoHarmonizePanel: { show() { refreshLayers(); } } } });
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  refreshLayers();
  connectBackend().catch((error) => {
    console.error(error);
    setStatus(`${error.message} 「ローカルAIを起動」で再試行してください。`, true);
  });
});
