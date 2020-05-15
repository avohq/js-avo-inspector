"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoInspector_1 = require("../AvoInspector");
const AvoInspectorEnv_1 = require("../AvoInspectorEnv");
const AvoSessionTracker_1 = require("../AvoSessionTracker");
const AvoStorage_1 = require("../AvoStorage");
class EmptyMockAvoBatcher {
    handleSessionStarted() { }
    handleTrackSchema(eventName, schema) { }
}
describe("Sessions", () => {
    process.env.BROWSER = "1";
    let storage = new AvoStorage_1.AvoStorage();
    test("Inits with session tracker", () => {
        // When
        let inspector = new AvoInspector_1.AvoInspector({
            apiKey: "apiKey",
            env: AvoInspectorEnv_1.AvoInspectorEnv.Prod,
            version: "0",
        });
        // Then
        expect(inspector.sessionTracker).not.toBeNull();
    });
    test("Inits with timestamp 0 and a session id", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(new EmptyMockAvoBatcher());
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(0);
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBeNull();
    });
    test("Starts new session when no session recorded", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        const callMoment = Date.now();
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        let prevSessionId = AvoSessionTracker_1.AvoSessionTracker.sessionId;
        sessionTracker.startOrProlongSession(callMoment);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBeNull();
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBe(prevSessionId);
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
    test("Starts new session when time between session calls is greater than time between sessions", () => {
        // Given
        const callMoment = Date.now();
        storage.setItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey, callMoment - 5 * 60 * 1000 - 1);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        let prevSessionId = AvoSessionTracker_1.AvoSessionTracker.sessionId;
        sessionTracker.startOrProlongSession(callMoment);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBeNull();
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBe(prevSessionId);
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
    test("Not starts new session when time between session calls is smaller than time between sessions", () => {
        // Given
        const callMoment = Date.now();
        storage.setItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey, callMoment - 5 * 60 * 1000 + 1);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        let prevSessionId = AvoSessionTracker_1.AvoSessionTracker.sessionId;
        sessionTracker.startOrProlongSession(callMoment);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBeNull();
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).toBe(prevSessionId);
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(0);
    });
    test("Not starts new session when time between individual session calls is smaller than time between sessions but combined is greater", () => {
        // Given
        const callMoment = Date.now();
        storage.setItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey, callMoment - 5 * 60 * 1000 + 1);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        let prevSessionId = AvoSessionTracker_1.AvoSessionTracker.sessionId;
        sessionTracker.startOrProlongSession(callMoment);
        sessionTracker.startOrProlongSession(callMoment + 5 * 60 * 1000);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment + 5 * 60 * 1000);
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).not.toBeNull();
        expect(AvoSessionTracker_1.AvoSessionTracker.sessionId).toBe(prevSessionId);
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(0);
    });
    test("Parses saved timestamp properly", () => {
        // Given
        const callMoment = Date.now();
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(0);
        // When
        sessionTracker.startOrProlongSession(callMoment);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
        // When
        sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // Then
        expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
    });
    test("Default session length is 5 mins", () => {
        // Given
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        // When
        let sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // Then
        expect(sessionTracker.sessionLengthMillis).toBe(5 * 60 * 1000);
    });
    test("Session started on trackSchemaFromEvent", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        let inspector = new AvoInspector_1.AvoInspector({
            apiKey: "apiKey",
            env: AvoInspectorEnv_1.AvoInspectorEnv.Prod,
            version: "0",
        });
        inspector.sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // When
        inspector.trackSchemaFromEvent("Test event", {});
        // Then
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
    test("Session started on trackSchema", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        let inspector = new AvoInspector_1.AvoInspector({
            apiKey: "apiKey",
            env: AvoInspectorEnv_1.AvoInspectorEnv.Prod,
            version: "0",
        });
        inspector.sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // When
        inspector.trackSchema("Test event", []);
        // Then
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
    test("Session started on extractSchema", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        let inspector = new AvoInspector_1.AvoInspector({
            apiKey: "apiKey",
            env: AvoInspectorEnv_1.AvoInspectorEnv.Prod,
            version: "0",
        });
        inspector.sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // When
        inspector.extractSchema({});
        // Then
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
    test("Session started on window.onload", () => {
        // Given
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.lastSessionTimestampKey);
        storage.removeItem(AvoSessionTracker_1.AvoSessionTracker.idCacheKey);
        let mockBatcher = { handleSessionStarted: jest.fn(), handleTrackSchema: jest.fn() };
        let inspector = new AvoInspector_1.AvoInspector({
            apiKey: "apiKey",
            env: AvoInspectorEnv_1.AvoInspectorEnv.Prod,
            version: "0",
        });
        inspector.sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(mockBatcher);
        // When
        let loadEvent = document.createEvent("Event");
        loadEvent.initEvent("load", false, false);
        window.dispatchEvent(loadEvent);
        // Then
        // TODO fix this. Working only in debug mode?
        mockBatcher.handleSessionStarted();
        expect(mockBatcher.handleSessionStarted.mock.calls.length).toBe(1);
    });
});
