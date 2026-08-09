const test = require("node:test");
const assert = require("node:assert/strict");
const { adjustmentDescriptors } = require("../src/photoshop/descriptors");

const corrections = {
  exposure: -0.32, gamma: 1.03, contrast: -8, saturation: -9, temperature: -11, tint: 4,
  shadows: { r: -6, g: 2, b: 13 }, midtones: { r: 3, g: -1, b: 5 }, highlights: { r: 7, g: 3, b: -4 },
  rgb_curve: [[0, 0], [64, 61], [128, 125], [192, 188], [255, 255]]
};

test("builds four editable Photoshop adjustment layers", () => {
  const enabled = { exposure: true, temperature: true, tint: true, contrast: true, saturation: true, shadows: true, midtones: true, highlights: true };
  const descriptors = adjustmentDescriptors(corrections, enabled);
  assert.deepEqual(descriptors.map((item) => item.using.type._obj), ["curves", "colorBalance", "hueSaturation", "exposure"]);
  assert.equal(descriptors[0].using.type.adjustment[0].curve.length, 5);
  assert.equal(descriptors[3].using.type.exposure, -0.32);
});

test("honors disabled match categories", () => {
  const descriptors = adjustmentDescriptors(corrections, { exposure: false, contrast: false, saturation: true, temperature: false, tint: false, shadows: false, midtones: false, highlights: false });
  assert.deepEqual(descriptors.map((item) => item.using.type._obj), ["hueSaturation"]);
});

