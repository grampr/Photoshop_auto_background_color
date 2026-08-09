const { app, action, core, constants } = require("photoshop");
const { adjustmentDescriptors } = require("./descriptors");

const GROUP_NAME = "自動色合わせ";

function findLayerByID(layers, layerID) {
  for (const layer of layers) {
    if (layer.id === layerID) return layer;
    if (layer.layers && layer.layers.length) {
      const found = findLayerByID(layer.layers, layerID);
      if (found) return found;
    }
  }
  return null;
}

function findGroupByID(groupID) {
  return findLayerByID(app.activeDocument.layers, groupID);
}

async function createAdjustmentGroup(foregroundID, corrections, enabled) {
  let groupID;
  await core.executeAsModal(async () => {
    const document = app.activeDocument;
    const foreground = findLayerByID(document.layers, foregroundID) || document.activeLayers[0];
    const group = await document.createLayerGroup({ name: GROUP_NAME });
    group.move(foreground, constants.ElementPlacement.PLACEBEFORE);
    groupID = group.id;
    for (const descriptor of adjustmentDescriptors(corrections, enabled).reverse()) {
      await action.batchPlay([descriptor], {});
      const adjustment = document.activeLayers[0];
      adjustment.move(group, constants.ElementPlacement.PLACEINSIDE);
    }
    // The whole correction stack is clipped to the foreground below the group.
    group.isClippingMask = true;
  }, { commandName: "自動色合わせを作成" });
  return groupID;
}

async function setGroupVisibility(groupID, visible) {
  await core.executeAsModal(async () => {
    const group = findGroupByID(groupID);
    if (!group) throw new Error("プレビュー用の調整グループが削除されています。");
    group.visible = visible;
  }, { commandName: "自動色合わせのプレビュー切替" });
}

async function removeGroup(groupID) {
  await core.executeAsModal(async () => {
    const group = findGroupByID(groupID);
    if (group) await group.delete();
  }, { commandName: "自動色合わせをリセット" });
}

module.exports = { createAdjustmentGroup, setGroupVisibility, removeGroup, GROUP_NAME };
