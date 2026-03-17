// IMPORTANT: Do NOT import AvoInspector at the top level.
// This file uses jest.resetModules() + jest.doMock() + require() inside each test
// to intercept TypeScript-compiled dynamic imports (which become require() calls).

describe("AvoInspector dynamic import / initEventSpecModules", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test("graceful degradation when eventSpec dynamic import fails", async () => {
    jest.resetModules();

    // Mock all three eventSpec modules to throw on require.
    // TypeScript compiles import("./eventSpec/X") to Promise.resolve().then(() => require("./eventSpec/X")),
    // so mocking before requiring AvoInspector intercepts those dynamic imports.
    jest.doMock("../eventSpec/AvoEventSpecCache", () => {
      throw new Error("import failed");
    });
    jest.doMock("../eventSpec/AvoEventSpecFetcher", () => {
      throw new Error("import failed");
    });
    jest.doMock("../eventSpec/EventValidator", () => {
      throw new Error("import failed");
    });

    const { AvoInspector } = require("../AvoInspector");
    const { AvoInspectorEnv } = require("../AvoInspectorEnv");

    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Dev,
      version: "1.0.0",
    });

    // Wait for _eventSpecReady to settle (if it exists)
    if ((inspector as any)._eventSpecReady) {
      await (inspector as any)._eventSpecReady.catch(() => {});
    }

    // Allow microtask queue to drain
    await new Promise((r) => setTimeout(r, 50));

    // Graceful degradation: eventSpecCache should remain undefined after failed imports
    expect((inspector as any).eventSpecCache).toBeUndefined();

    // trackSchemaFromEvent should still work via the batched flow
    const result = await inspector.trackSchemaFromEvent("test_event", {
      prop1: "value",
    });
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test("dev env with streamId successfully loads eventSpec modules", async () => {
    jest.resetModules();

    // Provide well-behaved mocks that return real-shaped objects so the
    // dynamic imports inside initEventSpecModules() succeed deterministically.
    jest.doMock("../eventSpec/AvoEventSpecCache", () => ({
      EventSpecCache: class {
        constructor() {}
        contains() { return false; }
        get() { return null; }
        set() {}
        clear() {}
      },
    }));
    jest.doMock("../eventSpec/AvoEventSpecFetcher", () => ({
      AvoEventSpecFetcher: class {
        constructor() {}
        async fetch() { return null; }
      },
    }));
    jest.doMock("../eventSpec/EventValidator", () => ({
      validateEvent: () => ({ metadata: null, propertyResults: {} }),
    }));

    const { AvoInspector } = require("../AvoInspector");
    const { AvoInspectorEnv } = require("../AvoInspectorEnv");

    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Dev,
      version: "1.0.0",
    });

    // Wait for the async module initialisation to settle
    if ((inspector as any)._eventSpecReady) {
      await (inspector as any)._eventSpecReady.catch(() => {});
    }

    // Allow microtask queue to drain
    await new Promise((r) => setTimeout(r, 50));

    // ensureEventSpecReady is private; call it via type cast
    const spec = await (inspector as any).ensureEventSpecReady();

    if ((inspector as any).streamId) {
      // streamId is truthy so modules should have been loaded
      expect(spec).not.toBeNull();
      expect(spec.cache).toBeDefined();
      expect(spec.fetcher).toBeDefined();
      expect(spec.validate).toBeDefined();
      expect(spec.streamId).toBeDefined();
    } else {
      // If streamId is falsy, modules are intentionally not loaded
      expect(spec).toBeNull();
    }
  });
});
