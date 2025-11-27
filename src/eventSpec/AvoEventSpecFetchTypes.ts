/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */

// =============================================================================
// WIRE FORMAT TYPES (short names - from API for bandwidth efficiency)
// =============================================================================

/**
 * Wire format - Property constraints with short field names.
 * At most one constraint type will be present per property.
 */
export interface PropertyConstraintsWire {
  /** Type name (for reference only, not validated) */
  t: string;
  /** Required flag (for reference only, not validated) */
  r: boolean;
  /** Pinned values: pinnedValue -> eventIds that require this exact value */
  p?: Record<string, string[]>;
  /** Allowed values: JSON array string -> eventIds that accept these values */
  v?: Record<string, string[]>;
  /** Regex patterns: pattern -> eventIds that require matching this regex */
  rx?: Record<string, string[]>;
  /** Min/max ranges: "min,max" -> eventIds that require value in this range */
  minmax?: Record<string, string[]>;
}

/**
 * Wire format - Event spec entry with short field names.
 * A single event entry (base event + its variants).
 * Multiple events can match the same name request due to name mapping.
 */
export interface EventSpecEntryWire {
  /** Branch identifier */
  b: string;
  /** Base event ID */
  id: string;
  /** Variant IDs (baseEventId + variantIds = complete set) */
  vids: string[];
  /** Property constraints keyed by property name */
  p: Record<string, PropertyConstraintsWire>;
}

/**
 * Wire format - Response from getEventSpec endpoint.
 * Contains array of events that match the requested name (due to name mapping).
 */
export interface EventSpecResponseWire {
  /** Array of events matching the requested name */
  events: EventSpecEntryWire[];
  /** Schema metadata (keeps long names - small, one per response) */
  metadata: EventSpecMetadata;
}

// =============================================================================
// INTERNAL TYPES (long names - for code readability)
// =============================================================================

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
  pinnedValues?: Record<string, string[]>;
  /** Allowed values: JSON array string -> eventIds that accept these values */
  allowedValues?: Record<string, string[]>;
  /** Regex patterns: pattern -> eventIds that require matching this regex */
  regexPatterns?: Record<string, string[]>;
  /** Min/max ranges: "min,max" -> eventIds that require value in this range */
  minMaxRanges?: Record<string, string[]>;
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
  variantIds: string[];
  /** Property constraints keyed by property name */
  props: Record<string, PropertyConstraints>;
}

/**
 * Internal - Parsed response from getEventSpec endpoint.
 * Contains array of events that match the requested name (due to name mapping).
 */
export interface EventSpecResponse {
  /** Array of events matching the requested name */
  events: EventSpecEntry[];
  /** Schema metadata */
  metadata: EventSpecMetadata;
}

// =============================================================================
// SHARED TYPES (used by both wire and internal formats)
// =============================================================================

/**
 * Metadata returned with the event spec response.
 */
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
  /** Timestamp when this entry was cached */
  timestamp: number;
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

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

/**
 * Result of validating a single property.
 * Contains either failedEventIds or passedEventIds (whichever is smaller for bandwidth).
 */
export interface PropertyValidationResult {
  /** Event/variant IDs that FAILED validation (present if smaller or equal to passed) */
  failedEventIds?: string[];
  /** Event/variant IDs that PASSED validation (present if smaller than failed) */
  passedEventIds?: string[];
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
