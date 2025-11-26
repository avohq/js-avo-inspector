/**
 * Shared mock factories for testing event spec related functionality.
 * These helpers reduce duplication across test files.
 */

import type {
  PropertySpec,
  PropertyTypeSpec,
  VariantSpec,
  EventSpec,
  EventSpecResponse,
  EventSpecMetadata
} from "../../eventSpec/AvoEventSpecFetchTypes";

// =============================================================================
// PROPERTY SPEC FACTORIES
// =============================================================================

/**
 * Creates a PropertyTypeSpec with defaults.
 */
export function createPropertyTypeSpec(
  overrides: Partial<PropertyTypeSpec> = {}
): PropertyTypeSpec {
  return {
    type: "primitive",
    value: "string",
    ...overrides
  };
}

/**
 * Creates a PropertySpec with sensible defaults.
 */
export function createPropertySpec(
  overrides: Partial<PropertySpec> = {}
): PropertySpec {
  return {
    id: "prop_default",
    t: createPropertyTypeSpec(),
    r: false,
    ...overrides
  };
}

/**
 * Creates a required string property.
 */
export function createRequiredStringProperty(
  id: string,
  extraOverrides: Partial<PropertySpec> = {}
): PropertySpec {
  return createPropertySpec({
    id,
    t: { type: "primitive", value: "string" },
    r: true,
    ...extraOverrides
  });
}

/**
 * Creates an optional number property.
 */
export function createNumberProperty(
  id: string,
  extraOverrides: Partial<PropertySpec> = {}
): PropertySpec {
  return createPropertySpec({
    id,
    t: { type: "primitive", value: "number" },
    r: false,
    ...extraOverrides
  });
}

/**
 * Creates an enum property with allowed values.
 */
export function createEnumProperty(
  id: string,
  allowedValues: string[],
  extraOverrides: Partial<PropertySpec> = {}
): PropertySpec {
  return createPropertySpec({
    id,
    t: { type: "primitive", value: "string" },
    v: allowedValues,
    ...extraOverrides
  });
}

// =============================================================================
// VARIANT SPEC FACTORIES
// =============================================================================

/**
 * Creates a VariantSpec with defaults.
 */
export function createVariantSpec(
  overrides: Partial<VariantSpec> = {}
): VariantSpec {
  return {
    variantId: "var_default",
    eventId: "evt_default",
    nameSuffix: "Default",
    props: {},
    ...overrides
  };
}

// =============================================================================
// EVENT SPEC FACTORIES
// =============================================================================

/**
 * Creates an EventSpec with defaults.
 */
export function createEventSpec(
  overrides: Partial<EventSpec> = {}
): EventSpec {
  return {
    id: "evt_default",
    name: "default_event",
    props: {},
    variants: [],
    ...overrides
  };
}

/**
 * Creates an EventSpec with common properties for testing.
 */
export function createUserLoginEventSpec(): EventSpec {
  return createEventSpec({
    id: "evt_login",
    name: "user_login",
    props: {
      login_method: createEnumProperty("prop_login_method", ["email", "google", "facebook"]),
      user_email: createPropertySpec({
        id: "prop_user_email",
        t: { type: "primitive", value: "string" },
        r: true,
        rx: "^[\\w-\\.]+@[\\w-]+\\.[a-z]{2,}$"
      })
    },
    variants: [
      createVariantSpec({
        variantId: "var_enterprise",
        eventId: "evt_login",
        nameSuffix: "Enterprise",
        props: {
          login_method: createEnumProperty("prop_login_method_ent", ["saml", "ldap"]),
          company_domain: createPropertySpec({
            id: "prop_company_domain",
            t: { type: "primitive", value: "string" },
            r: true,
            rx: "^[a-z0-9-]+\\.com$"
          })
        }
      })
    ]
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
  events: EventSpec[] = [],
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
  eventName: string = "test_event"
): EventSpecResponse {
  return createEventSpecResponse([
    createEventSpec({
      id: `evt_${eventName}`,
      name: eventName,
      props: {
        test_prop: createPropertySpec({
          id: "prop_test",
          r: true
        })
      }
    })
  ]);
}

