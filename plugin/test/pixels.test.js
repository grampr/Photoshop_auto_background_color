const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPixelsWithDocument(document, photoshopOverrides = {}) {
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "photoshop") {
      return {
        app: { activeDocument: document },
        imaging: {},
        core: { executeAsModal: async (callback) => callback() },
        ...photoshopOverrides
      };
    }
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
  assert.deepEqual(choices.layers.map((layer) => layer.id), [foreground.id, background.id]);
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

test("captures foreground and background pixels inside a modal scope", async () => {
  const boundsNoEffects = { left: 0, top: 0, right: 1, bottom: 1 };
  const foreground = { id: 1, name: "人物", boundsNoEffects };
  const background = { id: 2, name: "背景", boundsNoEffects };
  const document = { id: 10, layers: [foreground, background], activeLayers: [foreground] };
  let modalCalls = 0;
  let insideModal = false;
  let pixelCalls = 0;
  const pixels = loadPixelsWithDocument(document, {
    core: {
      executeAsModal: async (callback) => {
        modalCalls += 1;
        insideModal = true;
        try {
          return await callback();
        } finally {
          insideModal = false;
        }
      }
    },
    imaging: {
      getPixels: async ({ layerID }) => {
        assert.equal(insideModal, true);
        pixelCalls += 1;
        const rgba = layerID === foreground.id
          ? new Uint8Array([10, 20, 30, 128])
          : new Uint8Array([40, 50, 60, 255]);
        return {
          imageData: {
            components: 4,
            getData: async () => rgba,
            dispose: () => {}
          }
        };
      }
    }
  });

  const capture = await pixels.captureLayers(foreground.id, background.id, 512);

  assert.equal(modalCalls, 1);
  assert.equal(pixelCalls, 2);
  assert.deepEqual([...capture.foreground], [10, 20, 30, 128]);
  assert.deepEqual([...capture.background], [40, 50, 60, 255]);
  assert.deepEqual([...capture.mask], [128]);
});
