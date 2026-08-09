const { app, imaging } = require("photoshop");

function allLayers(layers, result = []) {
  for (const layer of layers) {
    result.push(layer);
    if (layer.layers && layer.layers.length) allLayers(layer.layers, result);
  }
  return result;
}

function listLayerChoices() {
  const document = app.activeDocument;
  if (!document) return { foreground: null, backgrounds: [] };
  const foreground = document.activeLayers[0] || null;
  const backgrounds = allLayers(document.layers).filter(
    (layer) => !foreground || layer.id !== foreground.id
  );
  return { foreground, backgrounds };
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
  if (!document) throw new Error("Open a Photoshop document first.");
  const foreground = allLayers(document.layers).find((layer) => layer.id === foregroundID);
  if (!foreground) throw new Error("Foreground layer no longer exists.");
  const bounds = foreground.boundsNoEffects;
  const normalizedBounds = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
  const size = targetSize(normalizedBounds, maxSize);
  const [foregroundPixels, backgroundPixels] = await Promise.all([
    rgbaForLayer(document.id, foregroundID, normalizedBounds, size),
    rgbaForLayer(document.id, backgroundID, normalizedBounds, size)
  ]);
  const mask = new Uint8Array(size.width * size.height);
  for (let index = 0; index < mask.length; index++) mask[index] = foregroundPixels[index * 4 + 3];
  return { foreground: foregroundPixels, background: backgroundPixels, mask, ...size };
}

module.exports = { listLayerChoices, captureLayers, allLayers, targetSize };

