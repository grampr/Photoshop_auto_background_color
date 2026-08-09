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
    `エンジン: ${response.engine} (${response.device})`,
    `露出: ${signed(c.exposure, 2)}`,
    `色温度: ${signed(c.temperature)}`,
    `色かぶり: ${signed(c.tint)}`,
    `コントラスト: ${signed(c.contrast)}`,
    `彩度: ${signed(c.saturation)}`,
    "",
    tone("シャドウ", c.shadows), "", tone("中間調", c.midtones), "", tone("ハイライト", c.highlights)
  ].join("\n") + warning;
}

module.exports = { formatResults, signed };
