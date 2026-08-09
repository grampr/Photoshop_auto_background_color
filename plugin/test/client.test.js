const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeImages } = require("../src/api/client");

test("posts raw Photoshop pixels to the localhost contract", async () => {
  let request;
  const fetchMock = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ corrections: {} }) };
  };
  await analyzeImages({ foreground: new Uint8Array(16), background: new Uint8Array(16), mask: new Uint8Array(4), width: 2, height: 2 }, { mode: "fast", strength: 50 }, fetchMock);
  assert.match(request.url, /127\.0\.0\.1:8765\/v1\/analyze$/);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("mode"), "fast");
  assert.equal(request.options.body.get("strength"), "50");
});

