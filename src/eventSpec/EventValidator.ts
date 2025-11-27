/**
 * EventValidator - Client-side validation of tracking events against the Avo Tracking Plan.
 *
 * This module validates property values against constraints:
 * - Pinned values (exact match required)
 * - Allowed values (must be in list)
 * - Regex patterns (must match pattern)
 * - Min/max ranges (numeric values must be in range)
 *
 * No schema validation (types/required) is performed - only value constraints.
 * Validation runs against ALL events/variants in the response.
 */

import type {
  EventSpecResponse,
  EventSpecEntry,
  PropertyConstraints,
  PropertyValidationResult,
  ValidationResult
} from "./AvoEventSpecFetchTypes";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Runtime property value - can be any JSON-compatible type
 */
export type RuntimePropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | object
  | Array<any>;

/**
 * Runtime properties map
 */
export type RuntimeProperties = Record<string, RuntimePropertyValue>;

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validates runtime properties against all events in the EventSpecResponse.
 *
 * For each property:
 * - If property not in spec: no validation needed (empty result)
 * - If property in spec: check constraints and collect failed/passed eventIds
 * - Return whichever list is smaller for bandwidth optimization
 *
 * @param properties - The properties observed at runtime
 * @param specResponse - The EventSpecResponse from the backend
 * @returns ValidationResult with baseEventId, metadata, and per-property results
 */
export function validateEvent(
  properties: RuntimeProperties,
  specResponse: EventSpecResponse
): ValidationResult {
  // Collect all eventIds from all events
  const allEventIds = collectAllEventIds(specResponse.events);

  // Build lookup table: propertyName -> constraints (with embedded eventId mappings)
  const constraintsByProperty = collectConstraintsByPropertyName(specResponse.events);

  // Validate each runtime property against its constraints
  const propertyResults: Record<string, PropertyValidationResult> = {};

  for (const propName of Object.keys(properties)) {
    const value = properties[propName];
    const constraints = constraintsByProperty[propName];

    if (!constraints) {
      // Property not in spec - no constraints to fail
      propertyResults[propName] = {};
    } else {
      const result = validatePropertyConstraints(value, constraints, allEventIds);
      propertyResults[propName] = result;
    }
  }

  // Get first baseEventId for backwards compatibility
  const baseEventId =
    specResponse.events.length > 0 ? specResponse.events[0].baseEventId : null;

  return {
    baseEventId,
    metadata: specResponse.metadata,
    propertyResults
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Collects all eventIds (baseEventId + variantIds) from all events.
 */
function collectAllEventIds(events: EventSpecEntry[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    ids.push(event.baseEventId);
    ids.push(...event.variantIds);
  }
  return ids;
}

/**
 * Collects all property constraints from all events into a single lookup table.
 *
 * This is purely for lookup efficiency - each constraint already contains
 * its applicable eventIds, so no conflict resolution is needed.
 *
 * Example:
 *   Event1.props.method = { pinnedValues: { "email": ["evt_1"] } }
 *   Event2.props.method = { pinnedValues: { "phone": ["evt_2"] } }
 *
 *   Result: { method: { pinnedValues: { "email": ["evt_1"], "phone": ["evt_2"] } } }
 */
function collectConstraintsByPropertyName(
  events: EventSpecEntry[]
): Record<string, PropertyConstraints> {
  // Fast path: no events
  if (events.length === 0) {
    return {};
  }

  // Fast path: single event, return props directly (no aggregation needed)
  if (events.length === 1) {
    return events[0].props;
  }

  // Multiple events: aggregate constraints from all events
  const result: Record<string, PropertyConstraints> = {};

  for (const event of events) {
    for (const [propName, constraints] of Object.entries(event.props)) {
      if (!result[propName]) {
        // First time seeing this property - initialize with copies
        result[propName] = {
          type: constraints.type,
          required: constraints.required,
          pinnedValues: constraints.pinnedValues
            ? { ...constraints.pinnedValues }
            : undefined,
          allowedValues: constraints.allowedValues
            ? { ...constraints.allowedValues }
            : undefined,
          regexPatterns: constraints.regexPatterns
            ? { ...constraints.regexPatterns }
            : undefined,
          minMaxRanges: constraints.minMaxRanges
            ? { ...constraints.minMaxRanges }
            : undefined
        };
      } else {
        // Aggregate constraint mappings from additional events
        const existing = result[propName];
        if (constraints.pinnedValues) {
          if (!existing.pinnedValues) {
            existing.pinnedValues = {};
          }
          for (const key of Object.keys(constraints.pinnedValues)) {
            existing.pinnedValues[key] = constraints.pinnedValues[key];
          }
        }
        if (constraints.allowedValues) {
          if (!existing.allowedValues) {
            existing.allowedValues = {};
          }
          for (const key of Object.keys(constraints.allowedValues)) {
            existing.allowedValues[key] = constraints.allowedValues[key];
          }
        }
        if (constraints.regexPatterns) {
          if (!existing.regexPatterns) {
            existing.regexPatterns = {};
          }
          for (const key of Object.keys(constraints.regexPatterns)) {
            existing.regexPatterns[key] = constraints.regexPatterns[key];
          }
        }
        if (constraints.minMaxRanges) {
          if (!existing.minMaxRanges) {
            existing.minMaxRanges = {};
          }
          for (const key of Object.keys(constraints.minMaxRanges)) {
            existing.minMaxRanges[key] = constraints.minMaxRanges[key];
          }
        }
      }
    }
  }

  return result;
}

/**
 * Validates a property value against its constraints.
 * Returns the validation result with either failedEventIds or passedEventIds
 * (whichever is smaller for bandwidth optimization).
 */
function validatePropertyConstraints(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[]
): PropertyValidationResult {
  const failedIds = new Set<string>();

  // Check pinned values
  if (constraints.pinnedValues) {
    checkPinnedValues(value, constraints.pinnedValues, failedIds);
  }

  // Check allowed values
  if (constraints.allowedValues) {
    checkAllowedValues(value, constraints.allowedValues, failedIds);
  }

  // Check regex patterns
  if (constraints.regexPatterns) {
    checkRegexPatterns(value, constraints.regexPatterns, failedIds);
  }

  // Check min/max ranges
  if (constraints.minMaxRanges) {
    checkMinMaxRanges(value, constraints.minMaxRanges, failedIds);
  }

  // Calculate passed IDs
  const passedIds = allEventIds.filter((id) => !failedIds.has(id));
  const failedArray = Array.from(failedIds);

  // Return whichever list is smaller for bandwidth optimization
  // If both are empty, return empty object (no constraints)
  if (failedArray.length === 0 && passedIds.length === 0) {
    return {};
  }

  // Prefer passedEventIds only when strictly smaller than failedEventIds
  // When equal, prefer failedEventIds (more intuitive to see what failed)
  if (passedIds.length < failedArray.length && passedIds.length > 0) {
    return { passedEventIds: passedIds };
  } else if (failedArray.length > 0) {
    return { failedEventIds: failedArray };
  } else {
    return {};
  }
}

// =============================================================================
// CONSTRAINT VALIDATION FUNCTIONS
// =============================================================================

/**
 * Adds all IDs from the array to the set.
 * Helper to reduce code duplication in constraint check functions.
 */
function addIdsToSet(ids: string[], set: Set<string>): void {
  for (const id of ids) {
    set.add(id);
  }
}

/**
 * Checks pinned values constraint.
 * For each pinnedValue -> eventIds entry, if runtime value !== pinnedValue, those eventIds FAIL.
 */
function checkPinnedValues(
  value: RuntimePropertyValue,
  pinnedValues: Record<string, string[]>,
  failedIds: Set<string>
): void {
  const stringValue = String(value);

  for (const [pinnedValue, eventIds] of Object.entries(pinnedValues)) {
    if (stringValue !== pinnedValue) {
      // Value doesn't match this pinned value, so these eventIds fail
      addIdsToSet(eventIds, failedIds);
    }
  }
}

/**
 * Checks allowed values constraint.
 * For each "[...array]" -> eventIds entry, if runtime value NOT in array, those eventIds FAIL.
 */
function checkAllowedValues(
  value: RuntimePropertyValue,
  allowedValues: Record<string, string[]>,
  failedIds: Set<string>
): void {
  const stringValue = String(value);

  for (const [allowedArrayJson, eventIds] of Object.entries(allowedValues)) {
    try {
      const allowedArray: string[] = JSON.parse(allowedArrayJson);
      if (!allowedArray.includes(stringValue)) {
        // Value not in allowed list, so these eventIds fail
        addIdsToSet(eventIds, failedIds);
      }
    } catch (e) {
      // Invalid JSON - skip this constraint
      console.warn(
        `[Avo Inspector] Invalid allowed values JSON: ${allowedArrayJson}`
      );
    }
  }
}

/**
 * Checks regex pattern constraint.
 * For each pattern -> eventIds entry, if runtime value doesn't match pattern, those eventIds FAIL.
 */
function checkRegexPatterns(
  value: RuntimePropertyValue,
  regexPatterns: Record<string, string[]>,
  failedIds: Set<string>
): void {
  // Only check regex for string values
  if (typeof value !== "string") {
    // Non-string values fail all regex constraints
    for (const eventIds of Object.values(regexPatterns)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  for (const [pattern, eventIds] of Object.entries(regexPatterns)) {
    try {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        // Value doesn't match pattern, so these eventIds fail
        addIdsToSet(eventIds, failedIds);
      }
    } catch (e) {
      // Invalid regex - skip this constraint
      console.warn(`[Avo Inspector] Invalid regex pattern: ${pattern}`);
    }
  }
}

/**
 * Checks min/max range constraint.
 * For each "min,max" -> eventIds entry, if runtime value < min OR > max, those eventIds FAIL.
 */
function checkMinMaxRanges(
  value: RuntimePropertyValue,
  minMaxRanges: Record<string, string[]>,
  failedIds: Set<string>
): void {
  // Only check min/max for numeric values
  if (typeof value !== "number") {
    // Non-numeric values fail all min/max constraints
    for (const eventIds of Object.values(minMaxRanges)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  for (const [rangeStr, eventIds] of Object.entries(minMaxRanges)) {
    const [minStr, maxStr] = rangeStr.split(",");
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);

    if (isNaN(min) || isNaN(max)) {
      // Invalid range format - skip this constraint
      console.warn(`[Avo Inspector] Invalid min/max range: ${rangeStr}`);
      continue;
    }

    if (value < min || value > max) {
      // Value out of range, so these eventIds fail
      addIdsToSet(eventIds, failedIds);
    }
  }
}
