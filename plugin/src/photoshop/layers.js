const { app, action, core, constants } = require("photoshop");
const { adjustmentDescriptors } = require("./descriptors");

const GROUP_NAME = "Auto Harmonize";

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
  }, { commandName: "Local Auto Harmonize" });
  return groupID;
}

async function setGroupVisibility(groupID, visible) {
  await core.executeAsModal(async () => {
    const group = findGroupByID(groupID);
    if (!group) throw new Error("Preview group was removed.");
    group.visible = visible;
  }, { commandName: "Toggle Auto Harmonize Preview" });
}

async function removeGroup(groupID) {
  await core.executeAsModal(async () => {
    const group = findGroupByID(groupID);
    if (group) await group.delete();
  }, { commandName: "Reset Auto Harmonize" });
}

module.exports = { createAdjustmentGroup, setGroupVisibility, removeGroup, GROUP_NAME };
