import { AvoSchemaParser } from "./AvoSchemaParser";
import { deepEquals } from "./utils";

export class AvoDeduplicator {
  private _nextId = 0;

  avoFunctionsEvents: Record<string, string> = {};
  manualEvents: Record<string, string> = {};

  avoFunctionsEventsParams: Record<string, { eventName: string; params: Record<string, any> }> = {};
  manualEventsParams: Record<string, { eventName: string; params: Record<string, any> }> = {};

  shouldRegisterEvent (
    eventName: string,
    params: Record<string, any>,
    fromAvoFunction: boolean
  ): boolean {
    this.clearOldEvents();

    const ts = String(Date.now());
    const id = ts + '-' + String(this._nextId++);
    if (fromAvoFunction) {
      this.avoFunctionsEvents[ts] = eventName;
      this.avoFunctionsEventsParams[id] = { eventName, params };
    } else {
      this.manualEvents[ts] = eventName;
      this.manualEventsParams[id] = { eventName, params };
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
      // Clean matching entries from both storages to prevent stale matches
      this.removeEntriesByName(eventName, this.avoFunctionsEventsParams);
      this.removeEntriesByName(eventName, this.manualEventsParams);
    }

    return result;
  }

  private removeEntriesByName(
    eventName: string,
    storage: Record<string, { eventName: string; params: Record<string, any> }>
  ): void {
    for (const key in storage) {
      if (Object.prototype.hasOwnProperty.call(storage, key) && storage[key].eventName === eventName) {
        delete storage[key];
      }
    }
  }

  private lookForEventIn (
    eventName: string,
    params: Record<string, any>,
    eventsStorage: Record<string, { eventName: string; params: Record<string, any> }>): boolean {
    for (const ts in eventsStorage) {
      if (Object.prototype.hasOwnProperty.call(eventsStorage, ts)) {
        const entry = eventsStorage[ts];
        if (entry.eventName === eventName && deepEquals(params, entry.params)) {
          delete eventsStorage[ts];
          return true;
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
    eventsStorage: Record<string, { eventName: string; params: Record<string, any> }>): boolean {
    for (const ts in eventsStorage) {
      if (Object.prototype.hasOwnProperty.call(eventsStorage, ts)) {
        const entry = eventsStorage[ts];
        if (deepEquals(params, entry.params)) {
          return true;
        }
      }
    }
    return false;
  }

  async shouldRegisterSchemaFromManually (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>
  ): Promise<boolean> {
    this.clearOldEvents();

    return !(await this.hasSameShapeInAvoFunctionsAs(eventName, eventSchema));
  }

  private async hasSameShapeInAvoFunctionsAs (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>
  ): Promise<boolean> {
    let result = false;

    if (await this.lookForEventSchemaIn(eventName, eventSchema, this.avoFunctionsEventsParams)) {
      result = true;
    }

    return result;
  }

  private async lookForEventSchemaIn (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>,
    eventsStorage: Record<string, { eventName: string; params: Record<string, any> }>): Promise<boolean> {
    for (const ts in eventsStorage) {
      if (Object.prototype.hasOwnProperty.call(eventsStorage, ts)) {
        const entry = eventsStorage[ts];
        if (entry.eventName === eventName) {
          const otherSchema = await AvoSchemaParser.extractSchema(entry.params);
          if (otherSchema && deepEquals(eventSchema, otherSchema)) {
            delete eventsStorage[ts];
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
      if (Object.prototype.hasOwnProperty.call(this.avoFunctionsEvents, time)) {
        const timestamp = Number(time) || 0;
        if (now - timestamp > msToConsiderOld) {
          delete this.avoFunctionsEvents[time];
          // Clear params entries with this timestamp prefix
          for (const id in this.avoFunctionsEventsParams) {
            if (id.startsWith(time + '-')) {
              delete this.avoFunctionsEventsParams[id];
            }
          }
        }
      }
    }

    for (const time in this.manualEvents) {
      if (Object.prototype.hasOwnProperty.call(this.manualEvents, time)) {
        const timestamp = Number(time) || 0;
        if (now - timestamp > msToConsiderOld) {
          delete this.manualEvents[time];
          for (const id in this.manualEventsParams) {
            if (id.startsWith(time + '-')) {
              delete this.manualEventsParams[id];
            }
          }
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
