import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoSessionTracker } from "../AvoSessionTracker";

describe("Sessions", () => {
  test("Inits with session tracker", () => {
    // When
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Prod, "0");

    // Then
    expect(inspector.sessionTracker).not.toBeNull();
  });

  test("Inits with timestamp 0 and a session id", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);

    // When
    let sessionTracker = new AvoSessionTracker({ startSession: () => {} });

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
  });

  test("Starts new session when no session recorded", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };
    const callMoment = Date.now();

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);
    let prevSessionId = AvoSessionTracker.sessionId;
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });

  test("Starts new session when time between session calls is greater than time between sessions", () => {
    // Given
    const callMoment = Date.now();
    window.localStorage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      (callMoment - 5 * 60 * 1000 - 1).toString()
    );
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);
    let prevSessionId = AvoSessionTracker.sessionId;
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });

  test("Not starts new session when time between session calls is smaller than time between sessions", () => {
    // Given
    const callMoment = Date.now();
    window.localStorage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      (callMoment - 5 * 60 * 1000 + 1).toString()
    );
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);
    let prevSessionId = AvoSessionTracker.sessionId;
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
    expect(mockBatcher.startSession.mock.calls.length).toBe(0);
  });

  test("Not starts new session when time between individual session calls is smaller than time between sessions but combined is greater", () => {
    // Given
    const callMoment = Date.now();
    window.localStorage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      (callMoment - 5 * 60 * 1000 + 1).toString()
    );
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);
    let prevSessionId = AvoSessionTracker.sessionId;
    sessionTracker.startOrProlongSession(callMoment);
    sessionTracker.startOrProlongSession(callMoment + 5 * 60 * 1000);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(
      callMoment + 5 * 60 * 1000
    );
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
    expect(mockBatcher.startSession.mock.calls.length).toBe(0);
  });

  test("Parses saved timestamp properly", () => {
    // Given
    const callMoment = Date.now();
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);

    // When
    sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
  });

  test("Default session length is 5 mins", () => {
    // Given
    let mockBatcher = { startSession: jest.fn() };

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.sessionLengthMillis).toBe(5 * 60 * 1000);
  });

  test("Session started on trackSchemaFromEvent", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Prod, "0");
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.trackSchemaFromEvent("Test event", {});

    // Then
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });

  test("Session started on trackSchema", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Prod, "0");
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.trackSchema("Test event", {});

    // Then
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });

  test("Session started on extractSchema", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Prod, "0");
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.extractSchema({});

    // Then
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });

  test("Session started on window.onload", () => {
    // Given
    window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
    window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
    let mockBatcher = { startSession: jest.fn() };
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Prod, "0");
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    // XXX TODO why is this cast needed after enabling strict mode
    (window as any).onload(new Event("test"));

    // Then
    expect(mockBatcher.startSession.mock.calls.length).toBe(1);
  });
});
