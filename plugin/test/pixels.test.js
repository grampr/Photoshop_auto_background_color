const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPixelsWithDocument(document) {
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "photoshop") return { app: { activeDocument: document }, imaging: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve("../src/photoshop/pixels");
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test("keeps an explicitly assigned foreground while another layer is active", () => {
  const foreground = { id: 1, name: "人物" };
  const background = { id: 2, name: "背景" };
  const pixels = loadPixelsWithDocument({ layers: [foreground, background], activeLayers: [background] });

  const choices = pixels.listLayerChoices(foreground.id);

  assert.equal(choices.active.id, background.id);
  assert.equal(choices.foreground.id, foreground.id);
  assert.deepEqual(choices.backgrounds.map((layer) => layer.id), [background.id]);
});

test("uses the active layer as foreground only before explicit assignment", () => {
  const foreground = { id: 1, name: "人物" };
  const background = { id: 2, name: "背景" };
  const pixels = loadPixelsWithDocument({ layers: [foreground, background], activeLayers: [foreground] });

  const choices = pixels.listLayerChoices();

  assert.equal(choices.foreground.id, foreground.id);
  assert.deepEqual(choices.backgrounds.map((layer) => layer.id), [background.id]);
});
