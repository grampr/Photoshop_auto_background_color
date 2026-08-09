function signed(value, digits = 0) {
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function tone(name, values) {
  return `${name}:\nR ${signed(values.r)}\nG ${signed(values.g)}\nB ${signed(values.b)}`;
}

function formatResults(response) {
  const c = response.corrections;
  const warning = response.warnings.length ? `\n\n${response.warnings.join("\n")}` : "";
  return [
    `Engine: ${response.engine} (${response.device})`,
    `Exposure: ${signed(c.exposure, 2)}`,
    `Temperature: ${signed(c.temperature)}`,
    `Tint: ${signed(c.tint)}`,
    `Contrast: ${signed(c.contrast)}`,
    `Saturation: ${signed(c.saturation)}`,
    "",
    tone("Shadow", c.shadows), "", tone("Midtone", c.midtones), "", tone("Highlight", c.highlights)
  ].join("\n") + warning;
}

module.exports = { formatResults, signed };

