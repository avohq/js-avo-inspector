import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoSessionTracker } from "../AvoSessionTracker";
import * as mockito from 'ts-mockito';

import AvoBatcher from '../AvoBatcher';
import AvoNetworkCallsHandler from "../AvoNetworkCallsHandler";

describe('Sessions', () => {
    let mockHandleSessionStarted = jest.fn();
    const mockNetworkHandler = new AvoNetworkCallsHandler();
    mockNetworkHandler.callInspectorWithBatchBody = jest.fn();
    const mockBatcher: AvoBatcher = new AvoBatcher("", AvoInspectorEnv.Prod, "", "", "", mockNetworkHandler);
    mockBatcher.handleSessionStarted = mockHandleSessionStarted;

    beforeEach(() => {
      mockHandleSessionStarted.mockClear();
    });

    test('Inits with session tracker', () => {  
      // When
      let inspector = new AvoInspector("apiKey", "test app", AvoInspectorEnv.Prod, "0");
      
      // Then
      expect(inspector.sessionTracker).not.toBeNull()
    });
  
    test('Inits with timestamp 0 and a session id', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
      
      // Then
      expect(sessionTracker.lastSessionTimestamp).toBe(0);
      expect(AvoSessionTracker.sessionId).not.toBeNull();
    });
  
    test('Starts new session when no session recorded', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
      const callMoment = Date.now();
  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
      let prevSessionId = AvoSessionTracker.sessionId;
      sessionTracker.startOrProlongSession(callMoment);
  
      // Then
      expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
      expect(AvoSessionTracker.sessionId).not.toBeNull();
      expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
    test('Starts new session when time between session calls is greater than time between sessions', () => {  
      // Given
      const callMoment = Date.now();
      window.localStorage.setItem(AvoSessionTracker.lastSessionTimestampKey, (callMoment - 5 * 60 * 1000 - 1).toString());
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
      let prevSessionId = AvoSessionTracker.sessionId;
      sessionTracker.startOrProlongSession(callMoment);
  
      // Then
      expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
      expect(AvoSessionTracker.sessionId).not.toBeNull();
      expect(AvoSessionTracker.sessionId).not.toBe(prevSessionId);
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
    test('Not starts new session when time between session calls is smaller than time between sessions', () => {  
      // Given
      const callMoment = Date.now();
      window.localStorage.setItem(AvoSessionTracker.lastSessionTimestampKey, (callMoment - 5 * 60 * 1000 + 1).toString());
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
      let prevSessionId = AvoSessionTracker.sessionId;
      sessionTracker.startOrProlongSession(callMoment);
  
      // Then
      expect(sessionTracker.lastSessionTimestamp).toBe(callMoment);
      expect(AvoSessionTracker.sessionId).not.toBeNull();
      expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
      expect(mockHandleSessionStarted.mock.calls.length).toBe(0);
    });
  
    test('Not starts new session when time between individual session calls is smaller than time between sessions but combined is greater', () => {  
      // Given
      const callMoment = Date.now();
      window.localStorage.setItem(AvoSessionTracker.lastSessionTimestampKey, (callMoment - 5 * 60 * 1000 + 1).toString());
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
      let prevSessionId = AvoSessionTracker.sessionId;
      sessionTracker.startOrProlongSession(callMoment);
      sessionTracker.startOrProlongSession(callMoment + 5 * 60 * 1000);
  
      // Then
      expect(sessionTracker.lastSessionTimestamp).toBe(callMoment + 5 * 60 * 1000);
      expect(AvoSessionTracker.sessionId).not.toBeNull();
      expect(AvoSessionTracker.sessionId).toBe(prevSessionId);
      expect(mockHandleSessionStarted.mock.calls.length).toBe(0);
    });
  
    test('Parses saved timestamp properly', () => {   
      // Given
      const callMoment = Date.now();
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
  
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
  
    test('Default session length is 5 mins', () => {  
      // When
      let sessionTracker = new AvoSessionTracker(mockBatcher);
  
      // Then
      expect(sessionTracker.sessionLengthMillis).toBe(5 * 60 * 1000);
    });
  
    test('Session started on trackSchemaFromEvent', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
      let inspector = new AvoInspector("apiKey", "test app", AvoInspectorEnv.Prod, "0");
      inspector.sessionTracker = new AvoSessionTracker(mockBatcher);
  
      // When
      inspector.trackSchemaFromEvent("Test event", {});
  
      // Then
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
    test('Session started on trackSchema', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
      let inspector = new AvoInspector("apiKey", "test app", AvoInspectorEnv.Prod, "0");
      inspector.sessionTracker = new AvoSessionTracker(mockBatcher);

      // When
      inspector.trackSchema("Test event", {});

      // Then
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
    test('Session started on extractSchema', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
      let inspector = new AvoInspector("apiKey", "test app", AvoInspectorEnv.Prod, "0");
      inspector.sessionTracker = new AvoSessionTracker(mockBatcher);
  
      // When
      inspector.extractSchema({});
  
      // Then
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
    test('Session started on window.onload', () => {  
      // Given
      window.localStorage.removeItem(AvoSessionTracker.lastSessionTimestampKey);
      window.localStorage.removeItem(AvoSessionTracker.idCacheKey);
      let inspector = new AvoInspector("apiKey", "test app", AvoInspectorEnv.Prod, "0");
      inspector.sessionTracker = new AvoSessionTracker(mockBatcher);
  
      // When
      window.onload(new Event("test"))
  
      // Then
      expect(mockHandleSessionStarted.mock.calls.length).toBe(1);
    });
  
  });
  