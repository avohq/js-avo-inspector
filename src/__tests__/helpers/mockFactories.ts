/**
 * Shared mock factories for testing event spec related functionality.
 * These helpers reduce duplication across test files.
 */

import type {
  PropertyConstraints,
  EventSpecEntry,
  EventSpecResponse,
  EventSpecMetadata
} from "../../eventSpec/AvoEventSpecFetchTypes";

// =============================================================================
// PROPERTY CONSTRAINTS FACTORIES
// =============================================================================

/**
 * Creates a PropertyConstraints with defaults.
 */
export function createPropertyConstraints(
  overrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return {
    type: "string",
    required: false,
    ...overrides
  };
}

/**
 * Creates a property with pinned values constraint.
 * pinnedValues maps each exact value to the eventIds that require it.
 */
export function createPinnedValueProperty(
  pinnedValues: Record<string, string[]>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    pinnedValues,
    ...extraOverrides
  });
}

/**
 * Creates a property with allowed values constraint.
 * allowedValues maps each JSON array string to the eventIds that accept those values.
 */
export function createAllowedValuesProperty(
  allowedValues: Record<string, string[]>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    allowedValues,
    ...extraOverrides
  });
}

/**
 * Creates a property with regex pattern constraint.
 * regexPatterns maps each pattern to the eventIds that require matching.
 */
export function createRegexProperty(
  regexPatterns: Record<string, string[]>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    regexPatterns,
    ...extraOverrides
  });
}

/**
 * Creates a property with min/max range constraint.
 * minMaxRanges maps each "min,max" string to the eventIds that require that range.
 */
export function createMinMaxProperty(
  minMaxRanges: Record<string, string[]>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    type: "number",
    minMaxRanges,
    ...extraOverrides
  });
}

// =============================================================================
// EVENT SPEC ENTRY FACTORIES
// =============================================================================

/**
 * Creates an EventSpecEntry with defaults.
 */
export function createEventSpecEntry(
  overrides: Partial<EventSpecEntry> = {}
): EventSpecEntry {
  return {
    branchId: "main",
    baseEventId: "evt_default",
    variantIds: [],
    props: {},
    ...overrides
  };
}

/**
 * Creates an event with variants.
 */
export function createEventWithVariants(
  baseEventId: string,
  variantIds: string[],
  props: Record<string, PropertyConstraints> = {}
): EventSpecEntry {
  return createEventSpecEntry({
    baseEventId,
    variantIds,
    props
  });
}

// =============================================================================
// METADATA FACTORIES
// =============================================================================

/**
 * Creates EventSpecMetadata with defaults.
 */
export function createEventSpecMetadata(
  overrides: Partial<EventSpecMetadata> = {}
): EventSpecMetadata {
  return {
    schemaId: "schema_123",
    branchId: "main",
    latestActionId: "action_456",
    sourceId: "source_789",
    ...overrides
  };
}

// =============================================================================
// EVENT SPEC RESPONSE FACTORIES
// =============================================================================

/**
 * Creates an EventSpecResponse with defaults.
 */
export function createEventSpecResponse(
  events: EventSpecEntry[] = [],
  metadataOverrides: Partial<EventSpecMetadata> = {}
): EventSpecResponse {
  return {
    events,
    metadata: createEventSpecMetadata(metadataOverrides)
  };
}

/**
 * Creates a simple EventSpecResponse with one event for basic testing.
 */
export function createSimpleEventSpecResponse(
  baseEventId: string = "evt_test",
  variantIds: string[] = []
): EventSpecResponse {
  return createEventSpecResponse([
    createEventSpecEntry({
      baseEventId,
      variantIds,
      props: {
        test_prop: createPropertyConstraints({ required: true })
      }
    })
  ]);
}

/**
 * Creates an EventSpecResponse with multiple events (simulating name-mapped events).
 */
export function createMultiEventSpecResponse(): EventSpecResponse {
  return createEventSpecResponse([
    createEventSpecEntry({
      baseEventId: "evt_signup",
      variantIds: ["evt_signup.v1", "evt_signup.v2"],
      props: {
        method: createPinnedValueProperty({
          email: ["evt_signup", "evt_signup.v1"],
          google: ["evt_signup.v2"]
        })
      }
    }),
    createEventSpecEntry({
      baseEventId: "evt_any_action",
      variantIds: ["evt_any_action.v1"],
      props: {
        method: createPinnedValueProperty({
          any: ["evt_any_action", "evt_any_action.v1"]
        })
      }
    })
  ]);
}

/**
 * Creates a property with nested children constraints (single object).
 * children maps each child property name to its PropertyConstraints.
 */
export function createNestedProperty(
  children: Record<string, PropertyConstraints>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    type: "object",
    children,
    ...extraOverrides
  });
}

/**
 * Creates a list property (array of items).
 * For list of primitives: pass constraints like allowedValues, minMaxRanges, etc.
 * For list of objects: pass children constraints.
 */
export function createListProperty(
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    type: "list",
    isList: true,
    ...extraOverrides
  });
}

/**
 * Creates a list of objects property with children constraints.
 */
export function createListOfObjectsProperty(
  children: Record<string, PropertyConstraints>,
  extraOverrides: Partial<PropertyConstraints> = {}
): PropertyConstraints {
  return createPropertyConstraints({
    type: "object",
    isList: true,
    children,
    ...extraOverrides
  });
}
