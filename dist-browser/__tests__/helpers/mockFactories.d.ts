/**
 * Shared mock factories for testing event spec related functionality.
 * These helpers reduce duplication across test files.
 */
import type { PropertySpec, PropertyTypeSpec, VariantSpec, EventSpec, EventSpecResponse, EventSpecMetadata } from "../../eventSpec/AvoEventSpecFetchTypes";
/**
 * Creates a PropertyTypeSpec with defaults.
 */
export declare function createPropertyTypeSpec(overrides?: Partial<PropertyTypeSpec>): PropertyTypeSpec;
/**
 * Creates a PropertySpec with sensible defaults.
 */
export declare function createPropertySpec(overrides?: Partial<PropertySpec>): PropertySpec;
/**
 * Creates a required string property.
 */
export declare function createRequiredStringProperty(id: string, extraOverrides?: Partial<PropertySpec>): PropertySpec;
/**
 * Creates an optional number property.
 */
export declare function createNumberProperty(id: string, extraOverrides?: Partial<PropertySpec>): PropertySpec;
/**
 * Creates an enum property with allowed values.
 */
export declare function createEnumProperty(id: string, allowedValues: string[], extraOverrides?: Partial<PropertySpec>): PropertySpec;
/**
 * Creates a VariantSpec with defaults.
 */
export declare function createVariantSpec(overrides?: Partial<VariantSpec>): VariantSpec;
/**
 * Creates an EventSpec with defaults.
 */
export declare function createEventSpec(overrides?: Partial<EventSpec>): EventSpec;
/**
 * Creates an EventSpec with common properties for testing.
 */
export declare function createUserLoginEventSpec(): EventSpec;
/**
 * Creates EventSpecMetadata with defaults.
 */
export declare function createEventSpecMetadata(overrides?: Partial<EventSpecMetadata>): EventSpecMetadata;
/**
 * Creates an EventSpecResponse with defaults.
 */
export declare function createEventSpecResponse(events?: EventSpec[], metadataOverrides?: Partial<EventSpecMetadata>): EventSpecResponse;
/**
 * Creates a simple EventSpecResponse with one event for basic testing.
 */
export declare function createSimpleEventSpecResponse(eventName?: string): EventSpecResponse;
