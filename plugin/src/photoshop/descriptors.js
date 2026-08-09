function point(horizontal, vertical) {
  return { _obj: "paint", horizontal, vertical };
}

function curvesDescriptor(corrections) {
  return {
    _obj: "make",
    _target: [{ _ref: "adjustmentLayer" }],
    using: {
      _obj: "adjustmentLayer",
      name: "Curves — Auto Harmonize",
      type: {
        _obj: "curves",
        adjustment: [{ _obj: "curvesAdjustment", channel: { _ref: "channel", _enum: "channel", _value: "composite" }, curve: corrections.rgb_curve.map(([x, y]) => point(x, y)) }]
      }
    },
    _options: { dialogOptions: "dontDisplay" }
  };
}

function balanceValues(tone, temperature = 0, tint = 0) {
  const r = tone.r + temperature * 0.18;
  const g = tone.g + tint * 0.18;
  const b = tone.b - temperature * 0.18;
  return {
    cyanRed: Math.round(r - (g + b) / 2),
    magentaGreen: Math.round(g - (r + b) / 2),
    yellowBlue: Math.round(b - (r + g) / 2)
  };
}

function colorBalanceDescriptor(corrections) {
  const values = [corrections.shadows, corrections.midtones, corrections.highlights].map((tone) => balanceValues(tone, corrections.temperature, corrections.tint));
  return {
    _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name: "Color Balance — Auto Harmonize", type: {
      _obj: "colorBalance", preserveLuminosity: true,
      shadowLevels: [values[0].cyanRed, values[0].magentaGreen, values[0].yellowBlue],
      midtoneLevels: [values[1].cyanRed, values[1].magentaGreen, values[1].yellowBlue],
      highlightLevels: [values[2].cyanRed, values[2].magentaGreen, values[2].yellowBlue]
    }}, _options: { dialogOptions: "dontDisplay" }
  };
}

function hueSaturationDescriptor(corrections) {
  return {
    _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name: "Hue Saturation — Auto Harmonize", type: {
      _obj: "hueSaturation", adjustment: [{ _obj: "hueSatAdjustmentV2", hue: 0, saturation: Math.round(corrections.saturation), lightness: 0 }]
    }}, _options: { dialogOptions: "dontDisplay" }
  };
}

function exposureDescriptor(corrections) {
  return {
    _obj: "make", _target: [{ _ref: "adjustmentLayer" }],
    using: { _obj: "adjustmentLayer", name: "Exposure — Auto Harmonize", type: {
      _obj: "exposure", exposure: corrections.exposure, offset: 0, gammaCorrection: corrections.gamma
    }}, _options: { dialogOptions: "dontDisplay" }
  };
}

function adjustmentDescriptors(corrections, enabled) {
  const descriptors = [];
  if (enabled.contrast) descriptors.push(curvesDescriptor(corrections));
  if (enabled.temperature || enabled.tint || enabled.shadows || enabled.midtones || enabled.highlights) descriptors.push(colorBalanceDescriptor(corrections));
  if (enabled.saturation) descriptors.push(hueSaturationDescriptor(corrections));
  if (enabled.exposure) descriptors.push(exposureDescriptor(corrections));
  return descriptors;
}

module.exports = { adjustmentDescriptors, curvesDescriptor, colorBalanceDescriptor, hueSaturationDescriptor, exposureDescriptor };

