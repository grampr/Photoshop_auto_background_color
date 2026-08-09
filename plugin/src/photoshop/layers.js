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

function findAdjustmentGroups(layers, result = []) {
  for (const layer of layers) {
    if (layer.name === GROUP_NAME && layer.layers) result.push(layer);
    if (layer.layers && layer.layers.length) findAdjustmentGroups(layer.layers, result);
  }
  return result;
}

async function removeAdjustmentGroupsInModal(document) {
  const groups = findAdjustmentGroups(document.layers);
  for (const group of groups) await group.delete();
}

async function createAdjustmentGroup(foregroundID, corrections, enabled) {
  let groupID;
  await core.executeAsModal(async () => {
    const document = app.activeDocument;
    // A document must have at most one correction stack. This also recovers
    // previews left behind by queued clicks or a previous panel session.
    await removeAdjustmentGroupsInModal(document);
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

async function removeAdjustmentGroups() {
  await core.executeAsModal(async () => {
    const document = app.activeDocument;
    if (document) await removeAdjustmentGroupsInModal(document);
  }, { commandName: "自動色合わせをすべてリセット" });
}

module.exports = {
  createAdjustmentGroup,
  setGroupVisibility,
  removeGroup,
  removeAdjustmentGroups,
  findAdjustmentGroups,
  GROUP_NAME
};
