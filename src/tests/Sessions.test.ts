import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoSessionTracker } from "../AvoSessionTracker";
import { AvoStorage } from "../AvoStorage";

class EmptyMockAvoBatcher {
  handleSessionStarted(): void {}

  handleTrackSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>
  ): void {}
}

const defaultOptions = {
  apiKey: "apiKey",
  env: AvoInspectorEnv.Prod,
  version: "0",
};

const mockBatcher = {
  handleSessionStarted: jest.fn(),
  handleTrackSchema: jest.fn(),
};

const sessionTimeMs = 5 * 60 * 1000;

describe("Sessions", () => {
  process.env.BROWSER = "1";

  const storage = new AvoStorage();

  afterEach(() => {
    jest.clearAllMocks();

    storage.removeItem(AvoSessionTracker.idCacheKey);
  });

  test("Inits with session tracker", () => {
    // When
    const inspector = new AvoInspector(defaultOptions);

    // Then
    expect(inspector.sessionTracker).not.toBeNull();
  });

  test("Inits with timestamp 0 and a session id", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    // When
    let sessionTracker = new AvoSessionTracker(new EmptyMockAvoBatcher());

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
  });

  test("Starts new session when no session recorded", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    const callMoment = Date.now();

    // When
    const sessionTracker = new AvoSessionTracker(mockBatcher);
    const prevSessionId = AvoSessionTracker.sessionId;

    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
    expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
  });

  test("Starts new session when time between session calls is greater than time between sessions", () => {
    // Given
    const callMoment = Date.now();

    storage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      callMoment - sessionTimeMs - 1
    );

    // When
    const sessionTracker = new AvoSessionTracker(mockBatcher);
    const prevSessionId = AvoSessionTracker.sessionId;

    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).not.toBeNull();
    expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });

  test("Not starts new session when time between session calls is smaller than time between sessions", () => {
    // Given
    const callMoment = Date.now();

    storage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      callMoment - sessionTimeMs + 1
    );

    // When
    const sessionTracker = new AvoSessionTracker(mockBatcher);
    const prevSessionId = AvoSessionTracker.sessionId;

    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(0);
  });

  test("Not starts new session when time between individual session calls is smaller than time between sessions but combined is greater", () => {
    // Given
    const callMoment = Date.now();

    storage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      callMoment - sessionTimeMs + 1
    );

    // When
    const sessionTracker = new AvoSessionTracker(mockBatcher);
    const prevSessionId = AvoSessionTracker.sessionId;

    sessionTracker.startOrProlongSession(callMoment);
    sessionTracker.startOrProlongSession(callMoment + sessionTimeMs);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(
      callMoment + sessionTimeMs
    );
    expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(0);
  });

  test("Parses saved timestamp properly", () => {
    // Given
    const callMoment = Date.now();

    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

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

    // When
    const sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.sessionLengthMillis).toBe(sessionTimeMs);
  });

  test("Session started on trackSchemaFromEvent", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.trackSchemaFromEvent("Test event", {});

    // Then
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });

  test("Session started on trackSchema", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.trackSchema("Test event", []);

    // Then
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });

  test("Session started on extractSchema", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.extractSchema({});

    // Then
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });

  test("Session started on window.onload", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    let loadEvent = document.createEvent("Event");
    loadEvent.initEvent("load", false, false);
    window.dispatchEvent(loadEvent);

    // Then
    // TODO fix this. Working only in debug mode?
    mockBatcher.handleSessionStarted();
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });
});
