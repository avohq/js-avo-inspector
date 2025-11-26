/**
 * EventValidator - Client-side validation of tracking events against the Avo Tracking Plan.
 *
 * This module handles:
 * 1. Matching: Identifying the most likely Event and Variant from specs
 * 2. Validation: Checking runtime properties against the matched spec rules
 */

import type {
  EventSpecResponse,
  EventSpec,
  EventSpecMetadata,
  VariantSpec,
  PropertySpec,
  PropertyTypeSpec
} from "./AvoEventSpecFetchTypes";

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Validation issue codes for client-side validation.
 */
export type ValidationIssueCode =
  | "RequiredMissing"
  | "ValueBelowMin"
  | "ValueAboveMax"
  | "RegexMismatch"
  | "NotInAllowedValues"
  | "UnexpectedProperty"
  | "UnexpectedEvent"
  | "TypeMismatch";

/**
 * Represents a validation issue found during event validation.
 * 
 * Note: We do NOT include the received value to avoid sending user data to the backend.
 * The backend can correlate issues with encrypted values via propertyName matching
 * against eventProperties.encryptedPropertyValue in the payload.
 */
export interface ValidationIssue {
  /** The type of validation issue */
  code: ValidationIssueCode;
  /** Property ID (preferred over name) */
  propertyId?: string;
  /** Property name - used to correlate with encryptedPropertyValue in eventProperties */
  propertyName?: string;
  /** Expected value for the validation rule (from spec, not user data) */
  expected?: string | number | boolean;
}

/**
 * Result of the validation process.
 */
export interface ValidationResult {
  /** ID of the matched event, null if no match found */
  eventId: string | null;
  /** ID of the matched variant, null if base event or no match */
  variantId: string | null;
  /** Event spec metadata from the response */
  eventSpecMetadata: EventSpecMetadata;
  /** List of all validation issues found */
  validationErrors: ValidationIssue[];
}

/**
 * Runtime property value - can be any JSON-compatible type
 */
export type RuntimePropertyValue = string | number | boolean | null | undefined | object | Array<any>;

/**
 * Runtime properties map
 */
export type RuntimeProperties = Record<string, RuntimePropertyValue>;

/**
 * Internal match result for scoring
 */
interface MatchCandidate {
  event: EventSpec;
  variant: VariantSpec | null;
  score: number;
}

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

/** Weights used for scoring event/variant matches */
const SCORING_WEIGHTS = {
  /** Points for each property that exists in both runtime and spec */
  PROPERTY_EXISTS: 1,
  /** Bonus for value matching an allowed enum value */
  ENUM_MATCH: 2,
  /** Bonus for correct type match */
  TYPE_MATCH: 1,
  /** High bonus for matching a pinned value (single allowed value) */
  PINNED_VALUE_MATCH: 5,
  /** Penalty for not matching a pinned value */
  PINNED_VALUE_MISMATCH: -3,
  /** Penalty for unexpected property not in spec */
  UNEXPECTED_PROPERTY: -0.5,
  /** Penalty for missing required property */
  MISSING_REQUIRED: -1,
  /** Small bonus for variant with mappedName */
  VARIANT_MAPPED_NAME: 0.5
} as const;

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validates a runtime event against the EventSpecResponse.
 *
 * @param eventName - The event name observed at runtime
 * @param properties - The properties observed at runtime
 * @param specResponse - The EventSpecResponse from the backend
 * @returns ValidationResult with match info and any validation errors
 */
export function validateEvent(
  eventName: string,
  properties: RuntimeProperties,
  specResponse: EventSpecResponse
): ValidationResult {
  const { metadata: eventSpecMetadata } = specResponse;

  // Step 1: Find the closest matching event and variant
  const match = findClosestMatch(eventName, properties, specResponse.events);

  // If no match found, return UnexpectedEvent error
  if (!match) {
    return {
      eventId: null,
      variantId: null,
      eventSpecMetadata,
      validationErrors: [
        {
          code: "UnexpectedEvent",
          propertyName: eventName
        }
      ]
    };
  }

  // Step 2: Validate properties against the matched spec
  const validationErrors = validateProperties(properties, match.event, match.variant);

  return {
    eventId: match.event.id,
    variantId: match.variant?.variantId ?? null,
    eventSpecMetadata,
    validationErrors
  };
}

// =============================================================================
// MATCHING LOGIC
// =============================================================================

/**
 * Finds the closest matching Event and Variant for the runtime data.
 *
 * @param eventName - Runtime event name
 * @param properties - Runtime properties
 * @param events - Array of EventSpecs to match against
 * @returns The best matching event and variant, or null if no match
 */
export function findClosestMatch(
  eventName: string,
  properties: RuntimeProperties,
  events: EventSpec[]
): MatchCandidate | null {
  // Step 1: Filter events by name match
  const nameMatchedEvents = filterByName(eventName, events);

  if (nameMatchedEvents.length === 0) {
    return null;
  }

  // Step 2: Score all candidates (base events and variants)
  const candidates: MatchCandidate[] = [];

  for (const event of nameMatchedEvents) {
    // Score the base event
    const baseScore = scorePropertyMatch(properties, event.props);
    candidates.push({
      event,
      variant: null,
      score: baseScore
    });

    // Score each variant
    for (const variant of event.variants) {
      // Variant properties are merged with base event properties
      const mergedProps = mergeProperties(event.props, variant.props);
      const variantScore = scoreVariantMatch(properties, variant, mergedProps);

      candidates.push({
        event,
        variant,
        score: variantScore
      });
    }
  }

  // Step 3: Select the best fit (highest score)
  if (candidates.length === 0) {
    return null;
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return the best match
  // If the best match is a variant with a significantly higher score, use it
  // Otherwise, prefer the base event for simplicity
  const best = candidates[0];

  // If the best is a variant, check if it's significantly better than base
  if (best.variant) {
    const baseCandidate = candidates.find(c => c.event === best.event && c.variant === null);
    if (baseCandidate && best.score <= baseCandidate.score) {
      // Variant doesn't provide better match, use base
      return baseCandidate;
    }
  }

  return best;
}

/**
 * Filters events by matching name or mappedName.
 */
function filterByName(eventName: string, events: EventSpec[]): EventSpec[] {
  const normalizedName = eventName.toLowerCase();

  return events.filter(event => {
    const nameMatch = event.name.toLowerCase() === normalizedName;
    const mappedNameMatch = event.mappedName?.toLowerCase() === normalizedName;
    return nameMatch || mappedNameMatch;
  });
}

/**
 * Scores how well runtime properties match a property spec.
 */
function scorePropertyMatch(
  properties: RuntimeProperties,
  specs: Record<string, PropertySpec>
): number {
  let score = 0;
  const specKeys = Object.keys(specs);
  const propKeys = Object.keys(properties);

  // Points for each matching property that exists
  for (const key of specKeys) {
    if (key in properties) {
      score += SCORING_WEIGHTS.PROPERTY_EXISTS;

      const spec = specs[key];
      const value = properties[key];

      // Bonus for matching allowed values
      if (spec.v && spec.v.length > 0 && typeof value === "string") {
        if (spec.v.includes(value)) {
          score += SCORING_WEIGHTS.ENUM_MATCH;
        }
      }

      // Bonus for type match
      if (isTypeMatch(value, spec.t)) {
        score += SCORING_WEIGHTS.TYPE_MATCH;
      }
    }
  }

  // Penalty for unexpected properties
  for (const key of propKeys) {
    if (!(key in specs)) {
      score += SCORING_WEIGHTS.UNEXPECTED_PROPERTY;
    }
  }

  // Penalty for missing required properties
  for (const key of specKeys) {
    if (specs[key].r && !(key in properties)) {
      score += SCORING_WEIGHTS.MISSING_REQUIRED;
    }
  }

  return score;
}

/**
 * Scores variant match with additional variant-specific traits.
 */
function scoreVariantMatch(
  properties: RuntimeProperties,
  variant: VariantSpec,
  mergedProps: Record<string, PropertySpec>
): number {
  let score = scorePropertyMatch(properties, mergedProps);

  // Additional scoring for variant-specific properties (pinned values)
  for (const [key, spec] of Object.entries(variant.props)) {
    const value = properties[key];

    // High weight for pinned value match (single allowed value)
    if (spec.v && spec.v.length === 1 && typeof value === "string") {
      if (spec.v[0] === value) {
        score += SCORING_WEIGHTS.PINNED_VALUE_MATCH;
      } else {
        score += SCORING_WEIGHTS.PINNED_VALUE_MISMATCH;
      }
    }
  }

  // Check variant mappedName match
  if (variant.mappedName) {
    score += SCORING_WEIGHTS.VARIANT_MAPPED_NAME;
  }

  return score;
}

/**
 * Merges base event properties with variant properties.
 * Variant properties override base properties.
 */
function mergeProperties(
  baseProps: Record<string, PropertySpec>,
  variantProps: Record<string, PropertySpec>
): Record<string, PropertySpec> {
  return {
    ...baseProps,
    ...variantProps
  };
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

/**
 * Validates runtime properties against the matched event and variant specs.
 *
 * @param properties - Runtime properties
 * @param event - Matched EventSpec
 * @param variant - Matched VariantSpec (or null for base event)
 * @returns Array of validation issues found
 */
export function validateProperties(
  properties: RuntimeProperties,
  event: EventSpec,
  variant: VariantSpec | null
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];

  // Get the effective property specs (merged if variant)
  const specs = variant
    ? mergeProperties(event.props, variant.props)
    : event.props;

  // Validate each spec rule against runtime data
  for (const [propName, spec] of Object.entries(specs)) {
    const value = properties[propName];
    const propErrors = validateProperty(propName, value, spec);
    errors.push(...propErrors);
  }

  // Check for unexpected properties
  for (const propName of Object.keys(properties)) {
    if (!(propName in specs)) {
      errors.push(createIssue("UnexpectedProperty", propName));
    }
  }

  return errors;
}

/**
 * Validates a single property against its spec.
 */
function validateProperty(
  propName: string,
  value: RuntimePropertyValue,
  spec: PropertySpec
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const isPresent = value !== undefined && value !== null;

  // Check: RequiredMissing
  if (spec.r && !isPresent) {
    errors.push(createIssue("RequiredMissing", propName, spec));
    return errors; // No point checking other rules if missing
  }

  // If value is not present and not required, skip other validations
  if (!isPresent) {
    return errors;
  }

  // Check: TypeMismatch
  if (!isTypeMatch(value, spec.t)) {
    errors.push(createIssue("TypeMismatch", propName, spec,
      spec.t.type === "primitive" ? String(spec.t.value) : "object"
    ));
    // Continue checking other rules even if type doesn't match
  }

  // Handle list type
  const valuesToCheck = spec.l && Array.isArray(value) ? value : [value];

  for (const val of valuesToCheck) {
    // Check: ValueBelowMin
    if (spec.min !== undefined && typeof val === "number") {
      if (val < spec.min) {
        errors.push(createIssue("ValueBelowMin", propName, spec, spec.min));
      }
    }

    // Check: ValueAboveMax
    if (spec.max !== undefined && typeof val === "number") {
      if (val > spec.max) {
        errors.push(createIssue("ValueAboveMax", propName, spec, spec.max));
      }
    }

    // Check: NotInAllowedValues
    if (spec.v && spec.v.length > 0) {
      const stringVal = String(val);
      if (!spec.v.includes(stringVal)) {
        errors.push(createIssue("NotInAllowedValues", propName, spec, spec.v.join(", ")));
      }
    }

    // Check: RegexMismatch
    if (spec.rx && typeof val === "string") {
      try {
        const regex = new RegExp(spec.rx);
        if (!regex.test(val)) {
          errors.push(createIssue("RegexMismatch", propName, spec, spec.rx));
        }
      } catch {
        // Invalid regex in spec - skip this check
      }
    }

    // Check nested object properties
    if (spec.t.type === "object" && typeof spec.t.value === "object" && typeof val === "object" && val !== null) {
      const nestedSpecs = spec.t.value as Record<string, PropertySpec>;
      const nestedProps = val as RuntimeProperties;

      for (const [nestedName, nestedSpec] of Object.entries(nestedSpecs)) {
        const nestedValue = nestedProps[nestedName];
        const nestedErrors = validateProperty(`${propName}.${nestedName}`, nestedValue, nestedSpec);
        errors.push(...nestedErrors);
      }

      // Check for unexpected nested properties
      for (const nestedName of Object.keys(nestedProps)) {
        if (!(nestedName in nestedSpecs)) {
          errors.push(createIssue("UnexpectedProperty", `${propName}.${nestedName}`));
        }
      }
    }
  }

  return errors;
}

// =============================================================================
// TYPE CHECKING UTILITIES
// =============================================================================

/**
 * Checks if a runtime value matches the expected type spec.
 */
function isTypeMatch(value: RuntimePropertyValue, typeSpec: PropertyTypeSpec): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeSpec.type === "primitive") {
    const expectedType = String(typeSpec.value).toLowerCase();
    return matchesPrimitiveType(value, expectedType);
  }

  if (typeSpec.type === "object") {
    return typeof value === "object" && !Array.isArray(value);
  }

  return false;
}

/**
 * Checks if a value matches a primitive type name.
 */
function matchesPrimitiveType(value: RuntimePropertyValue, expectedType: string): boolean {
  const actualType = typeof value;

  switch (expectedType) {
    case "string":
      return actualType === "string";
    case "int":
    case "integer":
    case "long":
      return actualType === "number" && Number.isInteger(value as number);
    case "float":
    case "double":
    case "number":
      return actualType === "number";
    case "bool":
    case "boolean":
      return actualType === "boolean";
    case "any":
      return true;
    default:
      // Try to be lenient with unknown types
      return actualType === expectedType;
  }
}

/**
 * Gets a string representation of the runtime type.
 */
function getRuntimeType(value: RuntimePropertyValue): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick check if an event exists in the spec (without full validation).
 */
export function eventExistsInSpec(eventName: string, specResponse: EventSpecResponse): boolean {
  return filterByName(eventName, specResponse.events).length > 0;
}

// =============================================================================
// VALIDATION ISSUE FACTORY
// =============================================================================

/**
 * Creates a ValidationIssue with common fields populated.
 * Note: We don't include 'received' to avoid sending user data to the backend.
 */
function createIssue(
  code: ValidationIssue["code"],
  propName: string,
  spec?: PropertySpec,
  expected?: string | number | boolean
): ValidationIssue {
  const issue: ValidationIssue = {
    code,
    propertyName: propName
  };

  if (spec) {
    issue.propertyId = spec.id;
  }

  if (expected !== undefined) {
    issue.expected = expected;
  }

  return issue;
}

