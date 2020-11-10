import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoSessionTracker } from "../AvoSessionTracker";
import { AvoStorage } from "../AvoStorage";

import { defaultOptions, sessionTimeMs } from "../__tests__/constants";
const inspectorVersion = process.env.npm_package_version || "";

jest.mock("../AvoBatcher");
jest.mock("../AvoNetworkCallsHandler");

describe("Sessions", () => {
  const { apiKey, env, version, shouldLog } = defaultOptions;

  const storage = new AvoStorage(shouldLog);
  const networkHandler = new AvoNetworkCallsHandler(
    apiKey,
    env,
    "",
    version,
    inspectorVersion
  );
  const mockBatcher = new AvoBatcher(networkHandler);

  afterEach(() => {
    jest.clearAllMocks();

    storage.removeItem(AvoSessionTracker.idCacheKey);
  });

  test("Session started on window.onload", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    let loadEvent = document.createEvent("Event");
    loadEvent.initEvent("load", false, false);
    window.dispatchEvent(loadEvent);

    // Then
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
  });

  test("Session started on trackSchemaFromEvent", () => {
    // Given
    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    let inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
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
    inspector.enableLogging(false);
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
    inspector.enableLogging(false);
    inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

    // When
    inspector.extractSchema({});

    // Then
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
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
    let sessionTracker = new AvoSessionTracker(new AvoBatcher(networkHandler));

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
    expect(mockBatcher.handleSessionStarted).toHaveBeenCalledTimes(1);
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

  test("Delays session init if items from last sessions are not loaded on android", () => {
    // Given
    const callMoment = Date.now();

    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    AvoInspector.avoStorage.itemsFromLastSessionLoaded = false;

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    AvoInspector.avoStorage.itemsLoadedAndroid();

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
  });

  test("Delays session init if items from last sessions are not loaded on ios", () => {
    // Given
    const callMoment = Date.now();

    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    AvoInspector.avoStorage.itemsFromLastSessionLoaded = false;

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    AvoInspector.avoStorage.initializeStorageAndItemsLoadedIos();

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
  });

  test("Delays session init if items from last sessions are not loaded on web", () => {
    // Given
    const callMoment = Date.now();

    storage.removeItem(AvoSessionTracker.lastSessionTimestampKey);

    AvoInspector.avoStorage.itemsFromLastSessionLoaded = false;

    // When
    let sessionTracker = new AvoSessionTracker(mockBatcher);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    sessionTracker.startOrProlongSession(callMoment);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(0);

    // When
    AvoInspector.avoStorage.initializeStorageAndItemsLoadedWeb(true);

    // Then
    expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
  });
});
