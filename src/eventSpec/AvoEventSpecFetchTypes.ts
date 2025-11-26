/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */

/**
 * Represents the type specification for a property.
 * Can be a primitive type or a nested object structure.
 */
export interface PropertyTypeSpec {
  /** The type category: "primitive" for simple types, "object" for nested structures */
  type: "primitive" | "object";
  /** For primitive: the type name (e.g., "string", "int"). For object: nested property specs */
  value: string | Record<string, PropertySpec>;
}

/**
 * Represents the specification for a single property in an event.
 * Supports recursive nesting for object types.
 */
export interface PropertySpec {
  /** Unique identifier for this property */
  id: string;
  /** Type specification - contains type category and value */
  t: PropertyTypeSpec;
  /** Required flag */
  r: boolean;
  /** Is list (array) flag */
  l?: boolean;
  /** Minimum value (for numeric types) */
  min?: number;
  /** Maximum value (for numeric types) */
  max?: number;
  /** Enum values (allowed values for the property) */
  v?: string[];
  /** Regex pattern for string validation */
  rx?: string;
}

/**
 * Represents a variant of an event with additional or modified properties.
 */
export interface VariantSpec {
  /** Unique identifier for this variant */
  variantId: string;
  /** Event ID for this variant (base event id) */
  eventId: string;
  /** Suffix to append to the base event name */
  nameSuffix: string;
  /** Name of the variant in this source (if different from canonical name) */
  mappedName?: string;
  /** Properties specific to this variant */
  props: Record<string, PropertySpec>;
}

/**
 * Represents the complete specification for an event, including base event
 * and optional variants.
 */
export interface EventSpec {
  /** Unique identifier for this event */
  id: string;
  /** Canonical Avo name for this event */
  name: string;
  /** Name of the event in this source (if different from canonical name) */
  mappedName?: string;
  /** Properties for this event */
  props: Record<string, PropertySpec>;
  /** Variants of this event with additional/modified properties */
  variants: VariantSpec[];
}

/**
 * Metadata returned with the event spec response.
 */
export interface EventSpecMetadata {
  /** Schema identifier */
  schemaId: string;
  /** Branch identifier */
  branchId: string;
  /** Latest action identifier (replaces versionId/createdAt) */
  latestActionId: string;
  /** Optional source identifier */
  sourceId?: string;
}

/**
 * Response structure from the getEventSpec endpoint.
 * Contains an array of potential event matches (due to name mapping).
 */
export interface EventSpecResponse {
  /** Array of potential event matches */
  events: EventSpec[];
  /** Metadata about the schema and source */
  metadata: EventSpecMetadata;
}

/** Cache entry for storing event specs with metadata. */
export interface EventSpecCacheEntry {
  /** The cached event specification response */
  spec: EventSpecResponse;
  /** Timestamp when this entry was cached */
  timestamp: number;
  /** Number of events processed since this entry was cached */
  eventCount: number;
}

/** Parameters for fetching event specifications from the API. */
export interface FetchEventSpecParams {
  /** The API key */
  apiKey: string;
  /** The stream ID */
  streamId: string;
  /** The name of the event */
  eventName: string;
}
