const { entrypoints } = require("uxp");
const { analyzeImages, health } = require("./api/client");
const { listLayerChoices, captureLayers } = require("./photoshop/pixels");
const { createAdjustmentGroup, setGroupVisibility, removeGroup } = require("./photoshop/layers");
const { formatResults } = require("./ui/format");

const state = { foregroundID: null, result: null, groupID: null, previewVisible: false };
const $ = (id) => document.getElementById(id);

function setStatus(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "error" : "";
}

function refreshLayers() {
  const { foreground, backgrounds } = listLayerChoices();
  state.foregroundID = foreground ? foreground.id : null;
  $("foregroundName").textContent = foreground ? foreground.name : "No layer selected";
  const select = $("backgroundLayer");
  select.innerHTML = "";
  for (const layer of backgrounds) {
    const option = document.createElement("option");
    option.value = String(layer.id);
    option.textContent = layer.name;
    select.appendChild(option);
  }
}

function enabledOptions() {
  const result = {};
  document.querySelectorAll("#matchOptions input").forEach((input) => { result[input.dataset.key] = input.checked; });
  return result;
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
  if (!state.foregroundID || !$("backgroundLayer").value) throw new Error("Choose foreground and background layers.");
  if (state.groupID) {
    await removeGroup(state.groupID);
    state.groupID = null;
  }
  const capture = await captureLayers(state.foregroundID, Number($("backgroundLayer").value), 512);
  state.result = await analyzeImages(capture, { mode: $("mode").value, strength: Number($("strength").value) });
  $("results").textContent = formatResults(state.result);
  setStatus("Analysis complete");
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
  $("strength").addEventListener("input", () => { $("strengthValue").textContent = `${$("strength").value}%`; });
  $("analyze").addEventListener("click", () => runBusy("Analyzing…", analyze));
  $("preview").addEventListener("click", () => runBusy("Updating preview…", async () => {
    const created = await ensurePreview();
    if (!created) {
      state.previewVisible = !state.previewVisible;
      await setGroupVisibility(state.groupID, state.previewVisible);
    }
    setStatus(state.previewVisible ? "Preview on" : "Preview off");
  }));
  $("apply").addEventListener("click", () => runBusy("Applying…", async () => {
    await ensurePreview();
    await setGroupVisibility(state.groupID, true);
    state.previewVisible = true;
    state.groupID = null;
    setStatus("Applied non-destructively");
  }));
  $("reset").addEventListener("click", () => runBusy("Resetting…", async () => {
    if (state.groupID) await removeGroup(state.groupID);
    state.groupID = null;
    state.result = null;
    $("results").textContent = "Analyze a foreground/background pair.";
    setStatus("Reset complete");
  }));
}

entrypoints.setup({ panels: { autoHarmonizePanel: { show() { refreshLayers(); } } } });
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  refreshLayers();
  health().then((info) => setStatus(`Backend ready — ${info.device}`)).catch(() => setStatus("Start the local Python backend", true));
});
