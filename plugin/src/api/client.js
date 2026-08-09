const BASE_URL = "http://localhost:8765/v1";

function rawBlob(bytes) {
  return new Blob([bytes], { type: "application/octet-stream" });
}

async function readError(response) {
  try {
    const body = await response.json();
    return body.detail || JSON.stringify(body);
  } catch (_) {
    return `${response.status} ${response.statusText}`;
  }
}

async function analyzeImages(capture, options, fetchImpl = fetch) {
  const form = new FormData();
  form.append("foreground", rawBlob(capture.foreground), "foreground.rgba");
  form.append("background", rawBlob(capture.background), "background.rgba");
  form.append("mask", rawBlob(capture.mask), "mask.gray");
  form.append("width", String(capture.width));
  form.append("height", String(capture.height));
  form.append("mode", options.mode);
  form.append("strength", String(options.strength));
  form.append("max_size", String(options.maxSize || 512));
  const response = await fetchImpl(`${BASE_URL}/analyze`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function health(fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/health`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

module.exports = { analyzeImages, health, BASE_URL };
