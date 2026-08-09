const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadLayers(document) {
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "photoshop") {
      return {
        app: { activeDocument: document },
        action: {},
        core: { executeAsModal: async (callback) => callback() },
        constants: {}
      };
    }
    if (request === "./descriptors") return { adjustmentDescriptors: () => [] };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve("../src/photoshop/layers");
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test("removes every auto-harmonize group left in the document", async () => {
  const deleted = [];
  const correctionGroup = (id, name = "自動色合わせ") => ({
    id,
    name,
    layers: [],
    delete: async () => { deleted.push(id); }
  });
  const document = {
    layers: [
      correctionGroup(1),
      { id: 2, name: "通常グループ", layers: [correctionGroup(3)] },
      correctionGroup(4, "別の調整")
    ]
  };
  const layers = loadLayers(document);

  await layers.removeAdjustmentGroups();

  assert.deepEqual(deleted, [1, 3]);
});
