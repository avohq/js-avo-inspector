/**
 * The internal web GTM tag template path, for tests.
 *
 * None of this is public API. In production only the script-tag bootstrap
 * (src/browser.js) uses it: it passes `window.inspector.__CLIENT__` as the
 * untyped `_client` constructor option, and routes a third `trackSchemaFromEvent`
 * / `trackSchema` argument to the private `_…WithOptions` methods. These helpers
 * do the same from TypeScript, so tests reach it without widening public types.
 */

export interface GatewayOptions {
  outputReference?: unknown;
  originHint?: unknown;
  appVersion?: unknown;
}

/** Constructor options with the internal client set, as browser.js builds them. */
export const withClient = <T extends object>(
  options: T,
  client: string | undefined
): T => ({ ...options, _client: client }) as T;

/** Calls the internal `_trackSchemaFromEventWithOptions` on either build. */
export const trackSchemaFromEventWithOptions = (
  inspector: object,
  eventName: string,
  eventProperties: Record<string, any>,
  options: GatewayOptions | undefined
): Promise<any[]> =>
  (inspector as any)._trackSchemaFromEventWithOptions(
    eventName,
    eventProperties,
    options
  );

/** Calls the internal `_trackSchemaWithOptions` on either build. */
export const trackSchemaWithOptions = (
  inspector: object,
  eventName: string,
  eventSchema: Array<{ propertyName: string; propertyType: string }>,
  options: GatewayOptions | undefined
): Promise<void> =>
  (inspector as any)._trackSchemaWithOptions(eventName, eventSchema, options);
