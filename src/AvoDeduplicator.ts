import { AvoSchemaParser } from "./AvoSchemaParser";
import { deepEquals } from "./utils";

export class AvoDeduplicator {
  avoFunctionsEvents: Record<number, string> = {};
  manualEvents: Record<number, string> = {};

  avoFunctionsEventsParams: Record<string, Record<string, any>> = {};
  manualEventsParams: Record<string, Record<string, any>> = {};

  shouldRegisterEvent (
    eventName: string,
    params: Record<string, any>,
    fromAvoFunction: boolean
  ): boolean {
    this.clearOldEvents();

    if (fromAvoFunction) {
      this.avoFunctionsEvents[Date.now()] = eventName;
      this.avoFunctionsEventsParams[eventName] = params;
    } else {
      this.manualEvents[Date.now()] = eventName;
      this.manualEventsParams[eventName] = params;
    }

    const checkInAvoFunctions = !fromAvoFunction;

    return !this.hasSameEventAs(eventName, params, checkInAvoFunctions);
  }

  private hasSameEventAs (
    eventName: string,
    params: Record<string, any>,
    checkInAvoFunctions: boolean
  ): boolean {
    let result = false;

    if (checkInAvoFunctions) {
      if (this.lookForEventIn(eventName, params, this.avoFunctionsEventsParams)) {
        result = true;
      }
    } else {
      if (this.lookForEventIn(eventName, params, this.manualEventsParams)) {
        result = true;
      }
    }

    if (result) {
      delete this.avoFunctionsEventsParams[eventName];
      delete this.manualEventsParams[eventName];
    }

    return result;
  }

  private lookForEventIn (
    eventName: string,
    params: Record<string, any>,
    eventsStorage: Record<string, Record<string, any>>): boolean {
    for (const otherEventName in eventsStorage) {
      if (eventsStorage.hasOwnProperty(otherEventName)) {
        if (otherEventName === eventName) {
          const otherParams = eventsStorage[eventName];
          if (otherParams && deepEquals(params, otherParams)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  hasSeenEventParams (
    params: Record<string, any>,
    checkInAvoFunctions: boolean
  ) {
    let result = false;

    if (checkInAvoFunctions) {
      if (this.lookForEventParamsIn(params, this.avoFunctionsEventsParams)) {
        result = true;
      }
    } else {
      if (this.lookForEventParamsIn(params, this.manualEventsParams)) {
        result = true;
      }
    }

    return result;
  }

  private lookForEventParamsIn (
    params: Record<string, any>,
    eventsStorage: Record<string, Record<string, any>>): boolean {
    for (const otherEventName in eventsStorage) {
      if (eventsStorage.hasOwnProperty(otherEventName)) {
        const otherParams = eventsStorage[otherEventName];
        if (otherParams && deepEquals(params, otherParams)) {
          return true;
        }
      }
    }
    return false;
  }

  shouldRegisterSchemaFromManually (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>
  ): boolean {
    this.clearOldEvents();

    return !this.hasSameShapeInAvoFunctionsAs(eventName, eventSchema);
  }

  private hasSameShapeInAvoFunctionsAs (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>
  ): boolean {
    let result = false;

    if (this.lookForEventSchemaIn(eventName, eventSchema, this.avoFunctionsEventsParams)) {
      result = true;
    }

    if (result) {
      delete this.avoFunctionsEventsParams[eventName];
    }

    return result;
  }

  private lookForEventSchemaIn (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>,
    eventsStorage: Record<string, Record<string, any>>): boolean {
    for (const otherEventName in eventsStorage) {
      if (eventsStorage.hasOwnProperty(otherEventName)) {
        if (otherEventName === eventName) {
          const otherSchema = AvoSchemaParser.extractSchema(
            eventsStorage[eventName]
          );
          if (otherSchema && deepEquals(eventSchema, otherSchema)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private clearOldEvents () {
    const now = Date.now();
    const msToConsiderOld = 300;

    for (const time in this.avoFunctionsEvents) {
      if (this.avoFunctionsEvents.hasOwnProperty(time)) {
        const timestamp = Number(time) || 0;
        if (now - timestamp > msToConsiderOld) {
          const eventName = this.avoFunctionsEvents[time];
          delete this.avoFunctionsEvents[time];
          delete this.avoFunctionsEventsParams[eventName];
        }
      }
    }

    for (const time in this.manualEvents) {
      if (this.manualEvents.hasOwnProperty(time)) {
        const timestamp = Number(time) || 0;
        if (now - timestamp > msToConsiderOld) {
          const eventName = this.manualEvents[time];
          delete this.manualEvents[time];
          delete this.manualEventsParams[eventName];
        }
      }
    }
  }

  // used in tests
  private _clearEvents () {
    this.avoFunctionsEvents = {};
    this.manualEvents = {};

    this.avoFunctionsEventsParams = {};
    this.manualEventsParams = {};
  }
}
