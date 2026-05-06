const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dockerfileApi = fs.readFileSync(path.join(__dirname, "..", "..", "Dockerfile.api"), "utf8");

test("api container applies Prisma deploy migrations before starting the production server", () => {
  assert.match(dockerfileApi, /migrate deploy --config \/app\/server\/prisma\.config\.ts/);
  const migrateIndex = dockerfileApi.indexOf("migrate deploy");
  const serverStartIndex = dockerfileApi.indexOf("node ./server/dist/app.js");
  assert.notEqual(migrateIndex, -1);
  assert.notEqual(serverStartIndex, -1);
  assert.ok(migrateIndex < serverStartIndex);
});
