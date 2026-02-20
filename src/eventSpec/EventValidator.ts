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

import safe from 'safe-regex2';

import type {
  EventSpecResponse,
  EventSpecEntry,
  PropertyConstraints,
  PropertyValidationResult,
  ValidationResult
} from "./AvoEventSpecFetchTypes";

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
 * null values indicate patterns that were rejected (unsafe or invalid).
 */
const regexCache = new Map<string, RegExp | null>();

/**
 * Gets a compiled regex from cache or compiles and caches it.
 * Validates patterns with safe-regex2 before compilation to prevent ReDoS.
 * Returns null if the pattern is unsafe or invalid.
 * Null results are cached to avoid retrying bad patterns.
 */
function getOrCompileRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) {
    return regexCache.get(pattern)!;
  }
  if (!safe(pattern)) {
    console.warn(`[Avo Inspector] Potentially unsafe regex pattern rejected, skipping constraint: ${pattern}`);
    regexCache.set(pattern, null);
    return null;
  }
  try {
    const regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
    return regex;
  } catch (e) {
    console.warn(`[Avo Inspector] Invalid regex pattern, skipping constraint: ${pattern}`);
    regexCache.set(pattern, null);
    return null;
  }
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
 * We validate prop (depth 0), prop.child1 (depth 1), but NOT prop.child1.child2 (depth 2+).
 * At depth 2+, we know there's an object but don't dive into its children for value validation.
 * This matches the behavior of schema validation.
 */
const MAX_CHILD_DEPTH = 2;

/**
 * Validates a property value against its constraints.
 * Returns the validation result with either failedEventIds or passedEventIds
 * (whichever is smaller for bandwidth optimization).
 *
 * For object properties with children:
 * - Skip value-level validation (pinned/allowed/regex/minmax)
 * - Recursively validate child properties (up to MAX_CHILD_DEPTH)
 *
 * For list properties (isList=true):
 * - If list of objects with children: validate each array item's children
 * - If list of primitives: validate each array item against constraints
 *
 * Depth limiting: We validate prop (depth 0), prop.child1 (depth 1), but stop
 * at prop.child1.child2 (depth 2+). This matches schema validation behavior.
 *
 * @param depth - Current recursion depth (internal use)
 */
function validatePropertyConstraints(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number = 0
): PropertyValidationResult {
  const result: PropertyValidationResult = {};

  // Stop recursion at depth 2+ - we don't validate child2 and deeper
  // This matches schema validation which shows prop.child1.child2: object without diving in
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
  // For optional properties, null/undefined means "not sent" which is valid.
  // Only required properties should fail validation when value is null/undefined.
  // Note: We check this AFTER checking for children, because object/list properties
  // need to validate their children even when the parent value is null/undefined.
  if ((value === null || value === undefined) && !constraints.required) {
    return result;
  }

  // Validate value constraints for primitive properties
  return validatePrimitiveProperty(value, constraints, allEventIds);
}

/**
 * Validates a list property (array of items).
 * For list of objects: validates each item's children.
 * For list of primitives: validates each item against constraints.
 * Any item failing causes the eventId to fail for that constraint.
 */
function validateListProperty(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number
): PropertyValidationResult {
  const result: PropertyValidationResult = {};

  // If value is not an array, we can't validate list items
  if (!Array.isArray(value)) {
    // Non-array value for a list property - return empty result (type mismatch not validated here)
    return result;
  }

  // List of objects with children
  if (constraints.children) {
    const childrenResults: Record<string, PropertyValidationResult> = {};

    // For each child property, collect failures across ALL array items
    for (const [childName, childConstraints] of Object.entries(constraints.children)) {
      const aggregatedFailedIds = new Set<string>();

      // Validate this child property in each array item
      for (const item of value) {
        const itemObj = (typeof item === "object" && item !== null && !Array.isArray(item))
          ? (item as Record<string, RuntimePropertyValue>)
          : {};
        const childValue = itemObj[childName];
        const childResult = validatePropertyConstraints(childValue, childConstraints, allEventIds, depth + 1);

        // Collect failed IDs from this item
        if (childResult.failedEventIds) {
          for (const id of childResult.failedEventIds) {
            aggregatedFailedIds.add(id);
          }
        }
        // If passedEventIds is returned, failed = allEventIds - passedEventIds
        // Use Set for O(1) lookup instead of O(n) .includes()
        if (childResult.passedEventIds) {
          const passedSet = new Set(childResult.passedEventIds);
          for (const id of allEventIds) {
            if (!passedSet.has(id)) {
              aggregatedFailedIds.add(id);
            }
          }
        }
      }

      // Build result for this child property
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
    // Check pinned values for this item
    if (constraints.pinnedValues) {
      checkPinnedValues(item, constraints.pinnedValues, failedIds);
    }

    // Check allowed values for this item
    if (constraints.allowedValues) {
      checkAllowedValues(item, constraints.allowedValues, failedIds);
    }

    // Check regex patterns for this item
    if (constraints.regexPatterns) {
      checkRegexPatterns(item, constraints.regexPatterns, failedIds);
    }

    // Check min/max ranges for this item
    if (constraints.minMaxRanges) {
      checkMinMaxRanges(item, constraints.minMaxRanges, failedIds);
    }
  }

  return buildValidationResult(failedIds, allEventIds);
}

/**
 * Validates an object property (single object with children).
 */
function validateObjectProperty(
  value: RuntimePropertyValue,
  constraints: PropertyConstraints,
  allEventIds: string[],
  depth: number
): PropertyValidationResult {
  const result: PropertyValidationResult = {};
  const childrenResults: Record<string, PropertyValidationResult> = {};

  const valueObj = (typeof value === "object" && value !== null && !Array.isArray(value))
    ? (value as Record<string, RuntimePropertyValue>)
    : {};

  for (const [childName, childConstraints] of Object.entries(constraints.children!)) {
    const childValue = valueObj[childName];
    const childResult = validatePropertyConstraints(childValue, childConstraints, allEventIds, depth + 1);
    // Only include non-empty results
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
function validatePrimitiveProperty(
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
 * Converts runtime value to string for comparison.
 * - Primitives (null, undefined, boolean, number, string) -> String(value)
 * - Objects/Arrays -> JSON.stringify(value)
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
      // Circular reference or other serialization error
      console.warn(`[Avo Inspector] Failed to stringify value: ${e}`);
      return String(value);
    }
  }
  return String(value);
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
  const stringValue = convertValueToString(value);

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
 * Uses cached Set for O(1) lookup instead of O(n) .includes().
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
      // Invalid JSON - skip this constraint
      console.warn(
        `[Avo Inspector] Invalid allowed values JSON: ${allowedArrayJson}`
      );
      continue;
    }
    if (!allowedSet.has(stringValue)) {
      // Value not in allowed list, so these eventIds fail
      addIdsToSet(eventIds, failedIds);
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
    const regex = getOrCompileRegex(pattern);
    if (regex === null) {
      // Unsafe or invalid pattern - skip constraint (fail-open)
      continue;
    }
    if (!regex.test(value)) {
      // Value doesn't match pattern, so these eventIds fail
      addIdsToSet(eventIds, failedIds);
    }
  }
}

/**
 * Checks min/max range constraint.
 * For each "min,max" -> eventIds entry, if runtime value < min OR > max, those eventIds FAIL.
 * Empty bounds are supported: "0," means min=0 with no max, ",100" means no min with max=100.
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

  // NaN values fail all min/max constraints (comparisons with NaN are always false)
  if (Number.isNaN(value)) {
    console.warn(`[Avo Inspector] NaN value fails min/max constraint`);
    for (const eventIds of Object.values(minMaxRanges)) {
      addIdsToSet(eventIds, failedIds);
    }
    return;
  }

  for (const [rangeStr, eventIds] of Object.entries(minMaxRanges)) {
    const [minStr, maxStr] = rangeStr.split(",");

    // Handle empty bounds: empty string means no constraint on that side
    const hasMin = minStr !== "" && minStr !== undefined;
    const hasMax = maxStr !== "" && maxStr !== undefined;

    const min = hasMin ? parseFloat(minStr) : -Infinity;
    const max = hasMax ? parseFloat(maxStr) : Infinity;

    // Only check for invalid format if a bound was specified but couldn't be parsed
    if ((hasMin && isNaN(min)) || (hasMax && isNaN(max))) {
      console.warn(`[Avo Inspector] Invalid min/max range: ${rangeStr}`);
      continue;
    }

    if (value < min || value > max) {
      // Value out of range, so these eventIds fail
      addIdsToSet(eventIds, failedIds);
    }
  }
}
