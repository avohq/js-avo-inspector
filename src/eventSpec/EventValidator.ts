/**
 * EventValidator - Client-side validation of tracking events against the Avo Tracking Plan.
 *
 * This module validates property values against constraints:
 * - Pinned values (exact match required)
 * - Allowed values (must be in list)
 * - Regex patterns (must match pattern, with safe-regex2 check and 1s timeout)
 * - Min/max ranges (numeric values must be in range)
 *
 * No schema validation (types/required) is performed - only value constraints.
 * Validation runs against ALL events/variants in the response.
 *
 * Adapted for React Native: uses safe-regex2 for regex safety and
 * Promise.race + clearTimeout for per-match 1-second timeout.
 */

import type {
  EventSpecResponse,
  EventSpecEntry,
  PropertyConstraints,
  PropertyValidationResult,
  ValidationResult
} from "./AvoEventSpecFetchTypes";

const safe = require("safe-regex2");

// =============================================================================
// HELPER FUNCTIONS FOR NESTED PROPERTIES
// =============================================================================

/**
 * Deep copies a constraint mapping (pinnedValues, allowedValues, etc.),
 * including the arrays inside to avoid shared references.
 */
function deepCopyConstraintMapping(
  mapping: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, arr] of Object.entries(mapping)) {
    result[key] = [...arr];
  }
  return result;
}

/**
 * Deep copies children constraints recursively.
 */
function deepCopyChildren(
  children: Record<string, PropertyConstraints>
): Record<string, PropertyConstraints> {
  const result: Record<string, PropertyConstraints> = {};
  for (const [propName, constraints] of Object.entries(children)) {
    result[propName] = {
      type: constraints.type,
      required: constraints.required,
      pinnedValues: constraints.pinnedValues
        ? deepCopyConstraintMapping(constraints.pinnedValues)
        : undefined,
      allowedValues: constraints.allowedValues
        ? deepCopyConstraintMapping(constraints.allowedValues)
        : undefined,
      regexPatterns: constraints.regexPatterns
        ? deepCopyConstraintMapping(constraints.regexPatterns)
        : undefined,
      minMaxRanges: constraints.minMaxRanges
        ? deepCopyConstraintMapping(constraints.minMaxRanges)
        : undefined,
      children: constraints.children
        ? deepCopyChildren(constraints.children)
        : undefined
    };
  }
  return result;
}

/**
 * Merges children constraints from source into target recursively.
 */
function mergeChildren(
  target: Record<string, PropertyConstraints>,
  source: Record<string, PropertyConstraints>
): void {
  for (const [propName, sourceConstraints] of Object.entries(source)) {
    if (!target[propName]) {
      // New child property - deep copy it
      target[propName] = {
        type: sourceConstraints.type,
        required: sourceConstraints.required,
        pinnedValues: sourceConstraints.pinnedValues
          ? deepCopyConstraintMapping(sourceConstraints.pinnedValues)
          : undefined,
        allowedValues: sourceConstraints.allowedValues
          ? deepCopyConstraintMapping(sourceConstraints.allowedValues)
          : undefined,
        regexPatterns: sourceConstraints.regexPatterns
          ? deepCopyConstraintMapping(sourceConstraints.regexPatterns)
          : undefined,
        minMaxRanges: sourceConstraints.minMaxRanges
          ? deepCopyConstraintMapping(sourceConstraints.minMaxRanges)
          : undefined,
        children: sourceConstraints.children
          ? deepCopyChildren(sourceConstraints.children)
          : undefined
      };
    } else {
      // Merge into existing child property
      const targetConstraints = target[propName];
      mergeConstraintMappings(targetConstraints, sourceConstraints);
      // Recursively merge nested children
      if (sourceConstraints.children) {
        if (!targetConstraints.children) {
          targetConstraints.children = deepCopyChildren(sourceConstraints.children);
        } else {
          mergeChildren(targetConstraints.children, sourceConstraints.children);
        }
      }
    }
  }
}

/**
 * Merges constraint mappings (pinnedValues, allowedValues, etc.) from source into target.
 */
function mergeConstraintMappings(
  target: PropertyConstraints,
  source: PropertyConstraints
): void {
  if (source.pinnedValues) {
    if (!target.pinnedValues) {
      target.pinnedValues = {};
    }
    for (const key of Object.keys(source.pinnedValues)) {
      if (target.pinnedValues[key]) {
        const merged = new Set(target.pinnedValues[key]);
        for (const id of source.pinnedValues[key]) {
          merged.add(id);
        }
        target.pinnedValues[key] = Array.from(merged);
      } else {
        target.pinnedValues[key] = [...source.pinnedValues[key]];
      }
    }
  }
  if (source.allowedValues) {
    if (!target.allowedValues) {
      target.allowedValues = {};
    }
    for (const key of Object.keys(source.allowedValues)) {
      if (target.allowedValues[key]) {
        const merged = new Set(target.allowedValues[key]);
        for (const id of source.allowedValues[key]) {
          merged.add(id);
        }
        target.allowedValues[key] = Array.from(merged);
      } else {
        target.allowedValues[key] = [...source.allowedValues[key]];
      }
    }
  }
  if (source.regexPatterns) {
    if (!target.regexPatterns) {
      target.regexPatterns = {};
    }
    for (const key of Object.keys(source.regexPatterns)) {
      if (target.regexPatterns[key]) {
        const merged = new Set(target.regexPatterns[key]);
        for (const id of source.regexPatterns[key]) {
          merged.add(id);
        }
        target.regexPatterns[key] = Array.from(merged);
      } else {
        target.regexPatterns[key] = [...source.regexPatterns[key]];
      }
    }
  }
  if (source.minMaxRanges) {
    if (!target.minMaxRanges) {
      target.minMaxRanges = {};
    }
    for (const key of Object.keys(source.minMaxRanges)) {
      if (target.minMaxRanges[key]) {
        const merged = new Set(target.minMaxRanges[key]);
        for (const id of source.minMaxRanges[key]) {
          merged.add(id);
        }
        target.minMaxRanges[key] = Array.from(merged);
      } else {
        target.minMaxRanges[key] = [...source.minMaxRanges[key]];
      }
    }
  }
}

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
// CACHES
// =============================================================================

/**
 * Cache for compiled regex objects to avoid recompilation on every event.
 * Patterns are expected to be stable per session.
 * Only safe patterns (per safe-regex2) are cached.
 */
const regexCache = new Map<string, RegExp>();

/**
 * Gets a compiled regex from cache or compiles and caches it.
 * Uses safe-regex2 to validate patterns before compilation.
 * Returns null if the pattern is unsafe or invalid.
 */
function getOrCompileRegex(pattern: string): RegExp | null {
  let regex = regexCache.get(pattern);
  if (regex) {
    return regex;
  }

  // Check pattern safety with safe-regex2
  if (!safe(pattern)) {
    console.warn(
      `[Avo Inspector] Warning: unsafe regex pattern skipped: ${pattern}`
    );
    return null;
  }

  try {
    regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
    return regex;
  } catch (e) {
    console.warn(
      `[Avo Inspector] Warning: invalid regex pattern skipped: ${pattern}`
    );
    return null;
  }
}

/**
 * Tests a regex match with a 1-second timeout using Promise.race + clearTimeout.
 * The timer is cleared on regex completion to prevent timer accumulation.
 * Returns true if pattern matches, false if not or on timeout.
 *
 * Note: safe-regex2 is the primary ReDoS protection — it screens out catastrophic
 * patterns before they are compiled. This timeout is a safety net for future async
 * regex engines or edge cases where safe-regex2 does not catch the pattern.
 */
async function testRegexWithTimeout(
  regex: RegExp,
  value: string,
  timeoutMs: number = 1000
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn(
          `[Avo Inspector] Warning: regex match timed out after ${timeoutMs}ms`
        );
        resolve(false);
      }
    }, timeoutMs);

    try {
      const result = regex.test(value);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

/**
 * Cache for parsed allowed values JSON.
 * Key: JSON string, Value: Set of allowed values for O(1) lookup.
 */
const allowedValuesCache = new Map<string, Set<string>>();

/**
 * Parses allowed values JSON string and returns a Set for O(1) lookup.
 * Results are cached to avoid repeated JSON.parse calls.
 * @returns Set of allowed values, or null if JSON is invalid
 */
function getOrParseAllowedValues(jsonString: string): Set<string> | null {
  let allowedSet = allowedValuesCache.get(jsonString);
  if (!allowedSet) {
    try {
      const allowedArray: string[] = JSON.parse(jsonString);
      allowedSet = new Set(allowedArray);
      allowedValuesCache.set(jsonString, allowedSet);
    } catch (e) {
      // Invalid JSON - return null
      return null;
    }
  }
  return allowedSet;
}

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
 * This is an async function because regex validation uses Promise.race for timeout.
 *
 * @param properties - The properties observed at runtime
 * @param specResponse - The EventSpecResponse from the backend
 * @returns ValidationResult with metadata and per-property results
 */
export async function validateEvent(
  properties: RuntimeProperties,
  specResponse: EventSpecResponse
): Promise<ValidationResult> {
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
      const result = await validatePropertyConstraints(value, constraints, allEventIds);
      propertyResults[propName] = result;
    }
  }

  return {
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
    for (let j = 0; j < event.variantIds.length; j++) {
      ids.push(event.variantIds[j]);
    }
  }
  return ids;
}

/**
 * Collects all property constraints from all events into a single lookup table.
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
            : undefined,
          children: constraints.children
            ? deepCopyChildren(constraints.children)
            : undefined
        };
      } else {
        // Aggregate constraint mappings from additional events
        const existing = result[propName];
        mergeConstraintMappings(existing, constraints);
        // Recursively merge nested children
        if (constraints.children) {
          if (!existing.children) {
            existing.children = deepCopyChildren(constraints.children);
          } else {
            mergeChildren(existing.children, constraints.children);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Maximum nesting depth for recursive value validation.
 */
const MAX_CHILD_DEPTH = 2;

/**
 * Validates a property value against its constraints.
 */
async function validatePropertyConstraints(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number = 0
): Promise<PropertyValidationResult> {
  const result: PropertyValidationResult = {};

  if (depth >= MAX_CHILD_DEPTH) {
    return result;
  }

  // Handle list types (isList=true)
  if (constraints.isList) {
    return validateListProperty(value, constraints, allEventIds, depth);
  }

  // Handle nested object properties with children (single object, not list)
  if (constraints.children) {
    return validateObjectProperty(value, constraints, allEventIds, depth);
  }

  // For primitive properties only: skip validation for null/undefined on non-required properties.
  if ((value === null || value === undefined) && !constraints.required) {
    return result;
  }

  // Validate value constraints for primitive properties
  return validatePrimitiveProperty(value, constraints, allEventIds);
}

/**
 * Validates a list property (array of items).
 */
async function validateListProperty(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number
): Promise<PropertyValidationResult> {
  const result: PropertyValidationResult = {};

  if (!Array.isArray(value)) {
    return result;
  }

  // List of objects with children
  if (constraints.children) {
    const childrenResults: Record<string, PropertyValidationResult> = {};

    for (const [childName, childConstraints] of Object.entries(constraints.children)) {
      const aggregatedFailedIds = new Set<string>();

      for (const item of value) {
        const itemObj = (typeof item === "object" && item !== null && !Array.isArray(item))
          ? (item as Record<string, RuntimePropertyValue>)
          : {};
        const childValue = itemObj[childName];
        const childResult = await validatePropertyConstraints(childValue, childConstraints, allEventIds, depth + 1);

        if (childResult.failedEventIds) {
          for (const id of childResult.failedEventIds) {
            aggregatedFailedIds.add(id);
          }
        }
        if (childResult.passedEventIds) {
          const passedSet = new Set(childResult.passedEventIds);
          for (const id of allEventIds) {
            if (!passedSet.has(id)) {
              aggregatedFailedIds.add(id);
            }
          }
        }
      }

      if (aggregatedFailedIds.size > 0) {
        const failedArray = Array.from(aggregatedFailedIds);
        const passedIds = allEventIds.filter((id) => !aggregatedFailedIds.has(id));

        if (passedIds.length < failedArray.length && passedIds.length > 0) {
          childrenResults[childName] = { passedEventIds: passedIds };
        } else {
          childrenResults[childName] = { failedEventIds: failedArray };
        }
      }
    }

    if (Object.keys(childrenResults).length > 0) {
      result.children = childrenResults;
    }

    return result;
  }

  // List of primitives - validate each item against constraints
  const failedIds = new Set<string>();

  for (const item of value) {
    if (constraints.pinnedValues) {
      checkPinnedValues(item, constraints.pinnedValues, failedIds);
    }
    if (constraints.allowedValues) {
      checkAllowedValues(item, constraints.allowedValues, failedIds);
    }
    if (constraints.regexPatterns) {
      await checkRegexPatterns(item, constraints.regexPatterns, failedIds);
    }
    if (constraints.minMaxRanges) {
      checkMinMaxRanges(item, constraints.minMaxRanges, failedIds);
    }
  }

  return buildValidationResult(failedIds, allEventIds);
}

/**
 * Validates an object property (single object with children).
 */
async function validateObjectProperty(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number
): Promise<PropertyValidationResult> {
  const result: PropertyValidationResult = {};
  const childrenResults: Record<string, PropertyValidationResult> = {};

  const valueObj = (typeof value === "object" && value !== null && !Array.isArray(value))
    ? (value as Record<string, RuntimePropertyValue>)
    : {};

  for (const [childName, childConstraints] of Object.entries(constraints.children!)) {
    const childValue = valueObj[childName];
    const childResult = await validatePropertyConstraints(childValue, childConstraints, allEventIds, depth + 1);
    if (childResult.failedEventIds || childResult.passedEventIds || childResult.children) {
      childrenResults[childName] = childResult;
    }
  }

  if (Object.keys(childrenResults).length > 0) {
    result.children = childrenResults;
  }

  return result;
}

/**
 * Validates a primitive property (not list, not object with children).
 */
async function validatePrimitiveProperty(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[]
): Promise<PropertyValidationResult> {
  const failedIds = new Set<string>();

  if (constraints.pinnedValues) {
    checkPinnedValues(value, constraints.pinnedValues, failedIds);
  }
  if (constraints.allowedValues) {
    checkAllowedValues(value, constraints.allowedValues, failedIds);
  }
  if (constraints.regexPatterns) {
    await checkRegexPatterns(value, constraints.regexPatterns, failedIds);
  }
  if (constraints.minMaxRanges) {
    checkMinMaxRanges(value, constraints.minMaxRanges, failedIds);
  }

  return buildValidationResult(failedIds, allEventIds);
}

/**
 * Builds the validation result from failed IDs, returning whichever list is smaller.
 */
function buildValidationResult(
  failedIds: Set<string>,
  allEventIds: string[]
): PropertyValidationResult {
  const passedIds = allEventIds.filter((id) => !failedIds.has(id));
  const failedArray = Array.from(failedIds);

  if (failedArray.length === 0 && passedIds.length === 0) {
    return {};
  }

  // Prefer passedEventIds only when strictly smaller than failedEventIds
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
 */
function addIdsToSet(ids: string[], set: Set<string>): void {
  for (const id of ids) {
    set.add(id);
  }
}

/**
 * Converts runtime value to string for comparison.
 */
function convertValueToString(value: RuntimePropertyValue): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      console.warn(`[Avo Inspector] Failed to stringify value: ${e}`);
      return String(value);
    }
  }
  return String(value);
}

/**
 * Checks pinned values constraint.
 */
function checkPinnedValues(
  value: RuntimePropertyValue,
  pinnedValues: Record<string, string[]>,
  failedIds: Set<string>
): void {
  const stringValue = convertValueToString(value);

  for (const [pinnedValue, eventIds] of Object.entries(pinnedValues)) {
    if (stringValue !== pinnedValue) {
      addIdsToSet(eventIds, failedIds);
    }
  }
}

/**
 * Checks allowed values constraint.
 */
function checkAllowedValues(
  value: RuntimePropertyValue,
  allowedValues: Record<string, string[]>,
  failedIds: Set<string>
): void {
  const stringValue = convertValueToString(value);

  for (const [allowedArrayJson, eventIds] of Object.entries(allowedValues)) {
    const allowedSet = getOrParseAllowedValues(allowedArrayJson);
    if (allowedSet === null) {
      console.warn(
        `[Avo Inspector] Invalid allowed values JSON: ${allowedArrayJson}`
      );
      continue;
    }
    if (!allowedSet.has(stringValue)) {
      addIdsToSet(eventIds, failedIds);
    }
  }
}

/**
 * Checks regex pattern constraint with safe-regex2 validation and 1-second timeout.
 * Unsafe patterns are skipped with a console.warn.
 */
async function checkRegexPatterns(
  value: RuntimePropertyValue,
  regexPatterns: Record<string, string[]>,
  failedIds: Set<string>
): Promise<void> {
  // Only check regex for string values
  if (typeof value !== "string") {
    for (const eventIds of Object.values(regexPatterns)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  for (const [pattern, eventIds] of Object.entries(regexPatterns)) {
    const regex = getOrCompileRegex(pattern);
    if (regex === null) {
      // Pattern was unsafe or invalid - skip (warning already logged)
      continue;
    }

    const matched = await testRegexWithTimeout(regex, value, 1000);
    if (!matched) {
      addIdsToSet(eventIds, failedIds);
    }
  }
}

/**
 * Checks min/max range constraint.
 */
function checkMinMaxRanges(
  value: RuntimePropertyValue,
  minMaxRanges: Record<string, string[]>,
  failedIds: Set<string>
): void {
  if (typeof value !== "number") {
    for (const eventIds of Object.values(minMaxRanges)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  if (Number.isNaN(value)) {
    console.warn(`[Avo Inspector] NaN value fails min/max constraint`);
    for (const eventIds of Object.values(minMaxRanges)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  for (const [rangeStr, eventIds] of Object.entries(minMaxRanges)) {
    const [minStr, maxStr] = rangeStr.split(",");

    const hasMin = minStr !== "" && minStr !== undefined;
    const hasMax = maxStr !== "" && maxStr !== undefined;

    const min = hasMin ? parseFloat(minStr) : -Infinity;
    const max = hasMax ? parseFloat(maxStr) : Infinity;

    if ((hasMin && isNaN(min)) || (hasMax && isNaN(max))) {
      console.warn(`[Avo Inspector] Invalid min/max range: ${rangeStr}`);
      continue;
    }

    if (value < min || value > max) {
      addIdsToSet(eventIds, failedIds);
    }
  }
}
