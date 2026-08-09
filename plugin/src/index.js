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
let initialized = false;
const $ = (id) => document.getElementById(id);

function setStatus(message, kind = "success", detail = "") {
  $("status").textContent = message;
  $("statusDetail").textContent = detail;
  $("activity").className = `status-card ${kind}`;
}

function populateLayerSelect(select, layers, selectedID) {
  select.innerHTML = "";
  for (const layer of layers) {
    const option = document.createElement("option");
    option.value = String(layer.id);
    option.textContent = layer.name;
    select.appendChild(option);
  }
  if (selectedID) select.value = String(selectedID);
}

function refreshLayers() {
  const choices = listLayerChoices(state.foregroundID);
  const foreground = choices.layers.find((layer) => layer.id === state.foregroundID) || choices.foreground;
  state.foregroundID = foreground ? foreground.id : null;
  $("foregroundName").textContent = foreground ? foreground.name : "未設定";
  populateLayerSelect($("foregroundLayer"), choices.layers, state.foregroundID);

  const backgrounds = choices.layers.filter((layer) => layer.id !== state.foregroundID);
  const selected = backgrounds.find((layer) => layer.id === state.backgroundID) || backgrounds[0] || null;
  state.backgroundID = selected ? selected.id : null;
  populateLayerSelect($("backgroundLayer"), backgrounds, state.backgroundID);
  $("backgroundName").textContent = selected ? selected.name : "未設定";
}

function assignActiveLayer(role) {
  const { active } = listLayerChoices(state.foregroundID);
  if (!active) throw new Error("Photoshopでレイヤーを1つ選択してください。");
  if (role === "foreground") {
    state.foregroundID = active.id;
    if (state.backgroundID === active.id) state.backgroundID = null;
    refreshLayers();
    return `前景を「${active.name}」に設定しました`;
  }
  if (active.id === state.foregroundID) throw new Error("前景とは別のレイヤーを背景に選択してください。");
  state.backgroundID = active.id;
  refreshLayers();
  return `背景を「${active.name}」に設定しました`;
}

function enabledOptions() {
  const result = {};
  document.querySelectorAll("#matchOptions input").forEach((input) => { result[input.dataset.key] = input.checked; });
  return result;
}

async function connectBackend() {
  if (!backendStartup) {
    backendStartup = ensureBackend();
  }
  const startup = backendStartup;
  try {
    const { info, launched } = await startup;
    return `バックエンド準備完了 — ${info.device}${launched ? "（自動起動）" : ""}`;
  } finally {
    if (backendStartup === startup) backendStartup = null;
  }
}

async function runBusy(label, operation, activeButton = null) {
  const startedAt = Date.now();
  const originalButtonText = activeButton ? activeButton.textContent : "";
  const updateElapsed = () => {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    $("statusDetail").textContent = `処理中 • ${seconds}秒`;
  };
  setStatus(label, "busy", "処理中 • 0.0秒");
  $("activity").setAttribute("aria-busy", "true");
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  if (activeButton) activeButton.textContent = "処理中…";
  const timer = setInterval(updateElapsed, 250);
  try {
    const completionMessage = await operation();
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    setStatus(completionMessage || "処理が完了しました", "success", `完了 • ${seconds}秒`);
  } catch (error) {
    console.error(error);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    setStatus(error.message || String(error), "error", `失敗 • ${seconds}秒`);
  } finally {
    clearInterval(timer);
    $("activity").setAttribute("aria-busy", "false");
    if (activeButton) activeButton.textContent = originalButtonText;
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
  return "解析が完了しました";
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
  $("setForeground").addEventListener("click", () => runBusy("前景を設定しています…", async () => assignActiveLayer("foreground"), $("setForeground")));
  $("setBackground").addEventListener("click", () => runBusy("背景を設定しています…", async () => assignActiveLayer("background"), $("setBackground")));
  $("foregroundLayer").addEventListener("change", () => {
    state.foregroundID = Number($("foregroundLayer").value) || null;
    if (state.backgroundID === state.foregroundID) state.backgroundID = null;
    refreshLayers();
    setStatus(`前景を「${$("foregroundName").textContent}」に設定しました`);
  });
  $("backgroundLayer").addEventListener("change", () => {
    state.backgroundID = Number($("backgroundLayer").value) || null;
    const selected = $("backgroundLayer").options[$("backgroundLayer").selectedIndex];
    $("backgroundName").textContent = selected ? selected.textContent : "未設定";
    setStatus(`背景を「${$("backgroundName").textContent}」に設定しました`);
  });
  $("strength").addEventListener("input", () => { $("strengthValue").textContent = `${$("strength").value}%`; });
  $("analyze").addEventListener("click", () => runBusy("画像を解析しています…", analyze, $("analyze")));
  $("preview").addEventListener("click", () => runBusy("プレビューを更新しています…", async () => {
    const created = await ensurePreview();
    if (!created) {
      state.previewVisible = !state.previewVisible;
      await setGroupVisibility(state.groupID, state.previewVisible);
    }
    return state.previewVisible ? "プレビューを表示しました" : "プレビューを非表示にしました";
  }, $("preview")));
  $("apply").addEventListener("click", () => runBusy("適用しています…", async () => {
    await ensurePreview();
    await setGroupVisibility(state.groupID, true);
    state.previewVisible = true;
    state.groupID = null;
    return "非破壊調整レイヤーとして適用しました";
  }, $("apply")));
  $("reset").addEventListener("click", () => runBusy("リセットしています…", async () => {
    if (state.groupID) await removeGroup(state.groupID);
    state.groupID = null;
    state.result = null;
    $("results").textContent = "前景と背景を設定して解析してください。";
    return "リセットしました";
  }, $("reset")));
  $("startBackend").addEventListener("click", () => runBusy("バックエンドへ接続しています…", connectBackend, $("startBackend")));
}

function initialize() {
  if (initialized) return;
  initialized = true;
  wireEvents();
  refreshLayers();
  runBusy("ローカルAIへ接続しています…", connectBackend);
}

entrypoints.setup({ panels: { autoHarmonizePanel: { show() { if (initialized) refreshLayers(); } } } });
// The script is placed after the panel markup, so the controls already exist.
// Direct initialization avoids missing DOMContentLoaded in some UXP host versions.
initialize();
