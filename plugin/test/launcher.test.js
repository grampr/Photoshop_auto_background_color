const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureBackend, LAUNCH_URL } = require("../src/api/launcher");

test("does not launch a second backend when health is already ready", async () => {
  let launches = 0;
  const result = await ensureBackend({
    healthImpl: async () => ({ status: "ok", device: "cuda" }),
    launchImpl: async () => { launches += 1; return ""; },
  });
  assert.equal(launches, 0);
  assert.equal(result.launched, false);
});

test("launches once and polls until the backend is ready", async () => {
  let healthCalls = 0;
  let launches = 0;
  const result = await ensureBackend({
    healthImpl: async () => {
      healthCalls += 1;
      if (healthCalls < 3) throw new Error("offline");
      return { status: "ok", device: "cuda" };
    },
    launchImpl: async () => { launches += 1; return ""; },
    delayImpl: async () => {},
    attempts: 3,
  });
  assert.equal(launches, 1);
  assert.equal(result.launched, true);
  assert.equal(LAUNCH_URL, "localautoharmonize://start");
});

test("reports a launcher registration error", async () => {
  await assert.rejects(
    ensureBackend({
      healthImpl: async () => { throw new Error("offline"); },
      launchImpl: async () => "No application is registered",
    }),
    /No application is registered/,
  );
});
