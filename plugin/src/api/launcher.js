const { health } = require("./client");

const LAUNCH_URL = "localautoharmonize://start";
const CONSENT_TEXT = "ローカル自動色合わせのAIバックエンドを起動します。画像はPC外へ送信されません。";
const STARTUP_POLL_INTERVAL_MS = 500;
const STARTUP_TIMEOUT_MS = 120_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function launchBackend() {
  const { shell } = require("uxp");
  return shell.openExternal(LAUNCH_URL, CONSENT_TEXT);
}

async function ensureBackend(options = {}) {
  const healthImpl = options.healthImpl || health;
  const launchImpl = options.launchImpl || launchBackend;
  const delayImpl = options.delayImpl || delay;
  const onStatus = options.onStatus || (() => {});
  const pollIntervalMs = options.pollIntervalMs || STARTUP_POLL_INTERVAL_MS;
  const attempts = options.attempts || Math.ceil(STARTUP_TIMEOUT_MS / pollIntervalMs);

  try {
    return { info: await healthImpl(), launched: false };
  } catch (_) {
    onStatus("Starting local backend…");
  }

  const launchError = await launchImpl();
  if (launchError) throw new Error(`ローカルAIを起動できませんでした: ${launchError}`);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await delayImpl(pollIntervalMs);
    try {
      return { info: await healthImpl(), launched: true };
    } catch (_) {
      // The Python runtime and AI model can take several seconds to initialize.
    }
  }
  throw new Error("ローカルAIの準備が120秒以内に完了しませんでした。バックエンドログを確認してください。");
}

module.exports = { ensureBackend, launchBackend, LAUNCH_URL, STARTUP_TIMEOUT_MS };
