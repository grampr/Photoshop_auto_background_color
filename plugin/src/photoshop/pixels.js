const { app, imaging, core } = require("photoshop");

function allLayers(layers, result = []) {
  for (const layer of layers) {
    result.push(layer);
    if (layer.layers && layer.layers.length) allLayers(layer.layers, result);
  }
  return result;
}

function listLayerChoices(foregroundID = null) {
  const document = app.activeDocument;
  if (!document) return { active: null, foreground: null, backgrounds: [], layers: [] };
  const layers = allLayers(document.layers);
  const active = document.activeLayers[0] || null;
  // Keep the explicitly chosen foreground when the user selects another layer
  // in Photoshop to assign it as the background.
  const foreground = layers.find((layer) => layer.id === foregroundID) || active;
  const backgrounds = layers.filter(
    (layer) => !foreground || layer.id !== foreground.id
  );
  return { active, foreground, backgrounds, layers };
}

function targetSize(bounds, maxSize) {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function rgbaForLayer(documentID, layerID, bounds, size) {
  const result = await imaging.getPixels({
    documentID,
    layerID,
    sourceBounds: bounds,
    targetSize: size,
    componentSize: 8,
    colorSpace: "RGB",
    colorProfile: "sRGB IEC61966-2.1",
    applyAlpha: false
  });
  try {
    const source = await result.imageData.getData({ chunky: true });
    const components = result.imageData.components;
    const rgba = new Uint8Array(size.width * size.height * 4);
    for (let src = 0, dst = 0; dst < rgba.length; src += components, dst += 4) {
      rgba[dst] = source[src];
      rgba[dst + 1] = source[src + Math.min(1, components - 1)];
      rgba[dst + 2] = source[src + Math.min(2, components - 1)];
      rgba[dst + 3] = components >= 4 ? source[src + 3] : 255;
    }
    return rgba;
  } finally {
    result.imageData.dispose();
  }
}

async function captureLayers(foregroundID, backgroundID, maxSize = 512) {
  const document = app.activeDocument;
  if (!document) throw new Error("先にPhotoshopでドキュメントを開いてください。");
  const foreground = allLayers(document.layers).find((layer) => layer.id === foregroundID);
  if (!foreground) throw new Error("設定した前景レイヤーが見つかりません。もう一度設定してください。");
  const background = allLayers(document.layers).find((layer) => layer.id === backgroundID);
  if (!background) throw new Error("設定した背景レイヤーが見つかりません。もう一度設定してください。");
  const bounds = foreground.boundsNoEffects;
  const normalizedBounds = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
  const size = targetSize(normalizedBounds, maxSize);
  // Photoshop 2026 requires Imaging API reads to run inside a modal scope.
  // Keep only the local pixel capture modal; API communication and AI inference
  // happen after this function returns so Photoshop remains responsive.
  const { foregroundPixels, backgroundPixels } = await core.executeAsModal(async () => ({
    foregroundPixels: await rgbaForLayer(document.id, foregroundID, normalizedBounds, size),
    backgroundPixels: await rgbaForLayer(document.id, backgroundID, normalizedBounds, size)
  }), { commandName: "解析用画像を取得" });
  const mask = new Uint8Array(size.width * size.height);
  for (let index = 0; index < mask.length; index++) mask[index] = foregroundPixels[index * 4 + 3];
  return { foreground: foregroundPixels, background: backgroundPixels, mask, ...size };
}

module.exports = { listLayerChoices, captureLayers, allLayers, targetSize };
