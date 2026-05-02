const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("task routes pass includeFinished filters and expose batch archive", async () => {
  const originals = {
    listTasks: taskCenterService.listTasks,
    archiveTasks: taskCenterService.archiveTasks,
  };
  const calls = [];

  taskCenterService.listTasks = async (filters) => {
    calls.push(["list", filters]);
    return {
      items: [],
      nextCursor: null,
    };
  };
  taskCenterService.archiveTasks = async (items) => {
    calls.push(["archive-batch", items]);
    return {
      archivedCount: items.length,
      failedCount: 0,
      items: items.map((item) => ({
        ...item,
        success: true,
        message: "Task archived.",
      })),
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const listResponse = await fetch(
      `http://127.0.0.1:${port}/api/tasks?status=succeeded&includeFinished=true&limit=20`,
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.success, true);

    const archiveResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/archive-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { kind: "novel_workflow", id: "workflow-1" },
          { kind: "image_generation", id: "image-1" },
        ],
      }),
    });
    assert.equal(archiveResponse.status, 200);
    const archivePayload = await archiveResponse.json();
    assert.equal(archivePayload.success, true);
    assert.equal(archivePayload.data.archivedCount, 2);

    assert.deepEqual(calls, [
      ["list", {
        status: "succeeded",
        includeFinished: true,
        limit: 20,
        kind: undefined,
        keyword: undefined,
        cursor: undefined,
      }],
      ["archive-batch", [
        { kind: "novel_workflow", id: "workflow-1" },
        { kind: "image_generation", id: "image-1" },
      ]],
    ]);
  } finally {
    taskCenterService.listTasks = originals.listTasks;
    taskCenterService.archiveTasks = originals.archiveTasks;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
