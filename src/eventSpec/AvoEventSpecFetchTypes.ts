/**
 * Wire format - Property constraints from the API.
 *
 * The API returns constraints in a compact format:
 * - `t`: Type - either a string ("string", "int", "float", "boolean") or an object (for nested object types)
 * - `r`: Required flag
 * - `l`: List flag - true if this is an array/list of the type
 * - `v`: Allowed values - array of allowed string values
 * - `min`/`max`: Numeric range constraints
 *
 * For list of objects, `t` is an object containing child property schemas and `l` is true.
 */
export interface PropertyConstraintsWire {
  /**
   * Type - either a string type name ("string", "int", "float", "boolean")
   * or an object containing nested property schemas (for object/list of objects)
   */
  t: string | Record<string, PropertyConstraintsWire>;
  /** Required flag */
  r: boolean;
  /** List flag - true if this is an array/list of the type */
  l?: boolean;
  /** Allowed values - array of allowed string values */
  v?: Array<string>;
  /** Minimum value for numeric types */
  min?: number;
  /** Maximum value for numeric types */
  max?: number;
}

/**
 * Wire format - Base event from the API.
 */
export interface BaseEventWire {
  /** Event name */
  name: string;
  /** Event ID */
  id: string;
  /** Property constraints keyed by property name */
  props: Record<string, PropertyConstraintsWire>;
}

/**
 * Wire format - Event variant from the API.
 */
export interface EventVariantWire {
  /** Variant ID */
  variantId: string;
  /** Name suffix for this variant */
  nameSuffix: string;
  /** Full event ID (baseEventId.variantId) */
  eventId: string;
  /** Property constraints for this variant */
  props: Record<string, PropertyConstraintsWire>;
}

/**
 * Wire format - Response from getEventSpec endpoint.
 * Contains the base event and its variants.
 */
export interface EventSpecResponseWire {
  /** Branch identifier */
  branchId: string;
  /** Base event definition */
  baseEvent: BaseEventWire;
  /** Event variants */
  variants: Array<EventVariantWire>;
}

/**
 * Internal - Property constraints with meaningful field names.
 * At most one constraint type will be present per property.
 */
export interface PropertyConstraints {
  /** Type name (for reference only, not validated) */
  type: string;
  /** Required flag (for reference only, not validated) */
  required: boolean;
  /** Pinned values: pinnedValue -> eventIds that require this exact value */
  pinnedValues?: Record<string, Array<string>>;
  /** Allowed values: JSON array string -> eventIds that accept these values */
  allowedValues?: Record<string, Array<string>>;
  /** Regex patterns: pattern -> eventIds that require matching this regex */
  regexPatterns?: Record<string, Array<string>>;
  /** Min/max ranges: "min,max" -> eventIds that require value in this range */
  minMaxRanges?: Record<string, Array<string>>;
  /** Nested property constraints for object properties */
  children?: Record<string, PropertyConstraints>;
}

/**
 * Internal - Event spec entry with meaningful field names.
 * A single event entry (base event + its variants).
 */
export interface EventSpecEntry {
  /** Branch identifier */
  branchId: string;
  /** Base event ID */
  baseEventId: string;
  /** Variant IDs (baseEventId + variantIds = complete set) */
  variantIds: Array<string>;
  /** Property constraints keyed by property name */
  props: Record<string, PropertyConstraints>;
}

/**
 * Internal - Parsed response from getEventSpec endpoint.
 * Contains array of events that match the requested name (due to name mapping).
 */
export interface EventSpecResponse {
  /** Array of events matching the requested name */
  events: Array<EventSpecEntry>;
  /** Schema metadata */
  metadata: EventSpecMetadata;
}

/** Metadata returned with the event spec response. */
export interface EventSpecMetadata {
  /** Schema identifier */
  schemaId: string;
  /** Branch identifier */
  branchId: string;
  /** Latest action identifier */
  latestActionId: string;
  /** Optional source identifier */
  sourceId?: string;
}

/** Cache entry for storing event specs with metadata. */
export interface EventSpecCacheEntry {
  /** The cached event specification response (internal format) */
  spec: EventSpecResponse;
  /** Timestamp when this entry was cached (used for TTL expiration) */
  timestamp: number;
  /** Timestamp when this entry was last accessed (used for LRU eviction) */
  lastAccessed: number;
  /** Number of cache hits since this entry was cached */
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

/**
 * Result of validating a single property.
 * Contains either failedEventIds or passedEventIds (whichever is smaller for bandwidth).
 */
export interface PropertyValidationResult {
  /** Event/variant IDs that FAILED validation (present if smaller or equal to passed) */
  failedEventIds?: Array<string>;
  /** Event/variant IDs that PASSED validation (present if smaller than failed) */
  passedEventIds?: Array<string>;
  /** Nested validation results for child properties of object properties */
  children?: Record<string, PropertyValidationResult>;
}

/**
 * Result of validating all properties in an event.
 * Maps property name to its validation result.
 */
export interface ValidationResult {
  /** Event spec metadata */
  metadata: EventSpecMetadata | null;
  /** Validation results per property */
  propertyResults: Record<string, PropertyValidationResult>;
}
