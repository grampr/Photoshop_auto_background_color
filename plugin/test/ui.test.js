const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("uses UXP-compatible flex layouts for interactive controls", () => {
  const pluginRoot = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(pluginRoot, "src/ui/panel.css"), "utf8");

  assert.match(html, /<button id="analyze">解析<\/button>/);
  assert.doesNotMatch(css, /display:\s*grid/);
  assert.match(css, /\.actions\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.checks\s*\{[^}]*display:\s*flex/);
});
