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
import type { EventSpecResponse, ValidationResult } from "./AvoEventSpecFetchTypes";
/**
 * Runtime property value - can be any JSON-compatible type
 */
export type RuntimePropertyValue = string | number | boolean | null | undefined | object | Array<any>;
/**
 * Runtime properties map
 */
export type RuntimeProperties = Record<string, RuntimePropertyValue>;
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
export declare function validateEvent(properties: RuntimeProperties, specResponse: EventSpecResponse): Promise<ValidationResult>;
