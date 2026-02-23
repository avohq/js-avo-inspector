/**
 * EventValidator - Client-side validation of tracking events against the Avo Tracking Plan.
 *
 * This module handles:
 * 1. Matching: Identifying the most likely Event and Variant from specs
 * 2. Validation: Checking runtime properties against the matched spec rules
 */
import type { EventSpecResponse, EventSpec, EventSpecMetadata, VariantSpec } from "./AvoEventSpecFetchTypes";
/**
 * Validation issue codes for client-side validation.
 */
export type ValidationIssueCode = "RequiredMissing" | "ValueBelowMin" | "ValueAboveMax" | "RegexMismatch" | "NotInAllowedValues" | "UnexpectedProperty" | "UnexpectedEvent" | "TypeMismatch";
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
/**
 * Validates a runtime event against the EventSpecResponse.
 *
 * @param eventName - The event name observed at runtime
 * @param properties - The properties observed at runtime
 * @param specResponse - The EventSpecResponse from the backend
 * @returns ValidationResult with match info and any validation errors
 */
export declare function validateEvent(eventName: string, properties: RuntimeProperties, specResponse: EventSpecResponse): ValidationResult;
/**
 * Finds the closest matching Event and Variant for the runtime data.
 *
 * @param eventName - Runtime event name
 * @param properties - Runtime properties
 * @param events - Array of EventSpecs to match against
 * @returns The best matching event and variant, or null if no match
 */
export declare function findClosestMatch(eventName: string, properties: RuntimeProperties, events: EventSpec[]): MatchCandidate | null;
/**
 * Validates runtime properties against the matched event and variant specs.
 *
 * @param properties - Runtime properties
 * @param event - Matched EventSpec
 * @param variant - Matched VariantSpec (or null for base event)
 * @returns Array of validation issues found
 */
export declare function validateProperties(properties: RuntimeProperties, event: EventSpec, variant: VariantSpec | null): ValidationIssue[];
/**
 * Quick check if an event exists in the spec (without full validation).
 */
export declare function eventExistsInSpec(eventName: string, specResponse: EventSpecResponse): boolean;
export {};
