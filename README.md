# Avo Inspector

[![npm version](https://badge.fury.io/js/avo-inspector.svg)](https://badge.fury.io/js/avo-inspector)

# Avo documentation

This is a quick start guide.
For more information about Inspector project please read [Avo documentation](https://www.avo.app/docs/implementation/inspector/sdk/web).

# Installation

> If you are using SSR or web workers switch to [this library build](https://github.com/avohq/ssr-web-avo-inspector)

> If you are looking for React Native library please switch to [this branch](https://github.com/avohq/js-avo-inspector/tree/react-native-node-package) and use `react-native-avo-inspector` npm package.

The library is distributed with npm

```
    npm i avo-inspector
```

or

```
    yarn add avo-inspector
```

# Lite Build (Production Only)

Available since version `3.1.0`. For production environments where bundle size matters (GTM, script tags, etc.), use the lite entry point which excludes encryption and event spec validation. Use the full build in dev/staging environments for the complete development experience:

```javascript
import { AvoInspector, AvoInspectorEnv } from "avo-inspector/lite";

let inspector = new AvoInspector({
  apiKey: "your api key",
  env: AvoInspectorEnv.Prod,
  version: "1.0.0",
});
```

The lite build has the same tracking API as the full version — `trackSchemaFromEvent`, `trackSchema`, and `extractSchema` all work identically. The differences:

- Does not support [property value validation](https://www.avo.app/docs/inspector/inspector-debugger#enabling-advanced-debugger-features) in the [Inspector Debugger](https://www.avo.app/docs/inspector/inspector-debugger) (no `publicEncryptionKey` constructor option — TypeScript will error if passed)
- Does not support [session filtering](https://www.avo.app/docs/inspector/inspector-debugger) in the Inspector Debugger (no stream ID generation/persistence)
- Does not support event deduplication — **if you use both Avo Codegen and manual `trackSchemaFromEvent` calls for the same events, use the full build instead** to avoid sending duplicate schemas
- Works universally with any bundler or minifier — no flags or configuration needed

**Lite build size:** ~23 KB minified, ~5.7 KB gzipped (measured by `yarn check:lite-size`).

See `examples/lite-size-demos/` for working examples with terser, webpack, and rollup.

# Initialization

Obtain the API key at [Avo.app](https://www.avo.app/welcome)

```javascript
import * as Inspector from "avo-inspector";

let inspector = new Inspector.AvoInspector({
  apiKey: "your api key",
  env: Inspector.AvoInspectorEnv.Dev,
  version: "1.0.0",
  appName: "My app",
  suffix: "unique-string" // optional, if you have more than 1 instance of Avo Inspector in same project
});
```

# Enabling logs

Logs are enabled by default in the dev mode and disabled in prod mode.

```javascript
inspector.enableLogging(true);
```

# Integrating with Avo Codegen

The setup is lightweight and is covered [in this guide](https://www.avo.app/docs/implementation/start-using-inspector-with-avo-functions).

Every event sent with Avo Function after this integration will automatically be sent to Inspector.

# Sending event schemas for events reported outside of Codegen

Whenever you send tracking event call one of the following methods:

Read more in the [Avo documentation](https://www.avo.app/docs/implementation/devs-101#inspecting-events)

### 1.

This method gets actual tracking event parameters, extracts schema automatically and sends it to the Inspector backend.
It is the easiest way to use the library, just call this method at the same place you call your analytics tools' track methods with the same parameters.

```javascript
inspector.trackSchemaFromEvent("Event name", {
  "String Prop": "Prop Value",
  "Float Prop": 1.0,
  "Boolean Prop": true,
});
```

### 2.

If you prefer to extract data schema manually you would use this method.

```javascript
inspector.trackSchema("Event name", [
  { propertyName: "String prop", propertyType: "string" },
  { propertyName: "Float prop", propertyType: "float" },
  { propertyName: "Boolean prop", propertyType: "boolean" },
]);
```

# Gateways

Available since version `3.3.0`. Avo Inspector is moving to a multi-gate model: one Inspector
API key per *gateway* (a server-side proxy or event bus checkpoint) rather than one Inspector
source per individual destination. Both `trackSchemaFromEvent` and `trackSchema` accept an
optional trailing argument, `options: TrackOptions`, that lets a gateway-scoped key tell
observations taken at different checkpoints, and from different upstream sources, apart:

```typescript
interface TrackOptions {
  outputReference?: string;
  originHint?: string;
  appVersion?: string;
}
```

```javascript
inspector.trackSchemaFromEvent(
  "Event name",
  { "String Prop": "Prop Value" },
  {
    outputReference: "meta-x7k2q", // which output checkpoint this observation was bound for
    originHint: "web",             // which upstream source produced the event
    appVersion: "5.1.0",           // that source's app version — keep this set whenever
                                   // originHint is set (see "Backend note" below)
  }
);
```

```javascript
inspector.trackSchema(
  "Event name",
  [{ propertyName: "String prop", propertyType: "string" }],
  { outputReference: "meta-x7k2q", originHint: "web", appVersion: "5.1.0" }
);
```

| Field | Purpose |
|---|---|
| `outputReference` | Which gateway output (destination checkpoint) this observation was bound for. Leave it out for a gateway-level observation that isn't tied to one output. |
| `originHint` | Identifies the event's upstream source (e.g. `"web"`, `"ios"`). See [Origin hint](#origin-hint) below. |
| `appVersion` | Per-event app version of the source that produced the event. See [App version](#app-version) below for how it interacts with `originHint`. |

- All three fields are optional and independent — you can set any combination of them.
- Values are trimmed. Empty strings, whitespace-only strings, and non-string values
  (numbers, booleans, `null`, objects, arrays) are treated as absent, and
  `outputReference`/`originHint` are then omitted from the request body entirely rather than
  sent as `null` or `""`.
- All three fields are sent as top-level siblings of `eventProperties`, never nested inside the
  schema. Calling either method without `options` (or with an empty `{}`) produces a request
  body with exactly the pre-3.3.0 key set — only `libVersion` differs.
- Events tracked automatically through Avo Codegen (Avo Functions) never carry these fields —
  `TrackOptions` only applies to `trackSchemaFromEvent`/`trackSchema` calls you make directly.

> An event property of your own literally named `outputReference`, `originHint` or
> `appVersion` (with unrelated business meaning) is unaffected. It still appears inside
> `eventProperties` exactly as before — the top-level fields described here come only from
> `TrackOptions`, never from event data, and neither direction leaks into the other.

## Origin hint

`originHint` must be a **low-cardinality** value (e.g. `"web"`, `"ios"`, `"android"`) — it
**MUST NOT** be a user identifier or any other high-cardinality value. This is a
documentation-only rule; the SDK does not validate it at runtime.

```javascript
inspector.trackSchemaFromEvent(
  "Event name",
  { "String Prop": "Prop Value" },
  { originHint: "ios", appVersion: "5.1.0" }
);
```

## App version

Setting `originHint` marks the event as coming from a different source than the app this
Inspector instance was constructed with, so the instance's configured `version` no longer
applies to that event. That changes how `appVersion` resolves on the wire:

| `originHint` | `appVersion` | Event body's `appVersion` |
|---|---|---|
| present | present | `appVersion`, trimmed |
| present | absent | literal `null` (the SDK's configured version is not applied) |
| absent | present | `appVersion`, trimmed |
| absent | absent | the SDK's configured version (unchanged behaviour) |

`appVersion` is the one field in `TrackOptions` that can legitimately be sent as a literal
`null` rather than being omitted — the `originHint` present / `appVersion` absent row above.

> **Backend note (as of 3.3.0):** the Inspector backend does not yet honor `outputReference`
> or `originHint` on this SDK's endpoint (`POST /inspector/v1/track`), and does not yet
> accept a literal `appVersion: null`. Until the backend is updated, setting `originHint`
> without an `appVersion` causes the event to be **silently dropped** — the HTTP response is
> still `200`, but the event never reaches the Inspector dashboard. So always pair
> `originHint` with an `appVersion` for now. When logging is enabled
> (`inspector.enableLogging(true)`), the SDK emits one `console.warn` per page the first time
> it builds such a body. The SDK already sends the correct wire shape, so these calls start
> working unchanged the moment the backend catches up.

# Extracting event schema manually

```javascript
let schema = inspector.extractSchema({
  "String Prop": "Prop Value",
  "Float Prop": 1.0,
  "Boolean Prop": true,
});
```

You can experiment with this method to see how more complex schemas look, for example with nested lists and objects.

# Property Value Encryption (Dev/Staging Only)

Inspector supports encrypting property values in development and staging environments. This allows you to see actual property values in Avo's debugging tools without exposing sensitive data, since only you hold the private decryption key.

## Key Features

- Uses ECC (Elliptic Curve Cryptography) with prime256v1 (NIST P-256) for strong security, standard for Web Crypto API
- Zero-knowledge architecture: Avo never has access to your private key
- No message size limitations
- Only active in dev/staging environments (production is unaffected)

## Generating Keys

Use the built-in CLI tool to generate a key pair:

```bash
npx avo-inspector generate-keys
```

This will output:
- **Public key**: Pass this to the SDK to enable encryption
- **Private key**: Save this externally (you'll use it to decrypt values in Avo's dashboard)

## Using Encryption

Pass the `publicEncryptionKey` parameter when initializing Inspector:

```javascript
import * as Inspector from "avo-inspector";

let inspector = new Inspector.AvoInspector({
  apiKey: "your api key",
  env: Inspector.AvoInspectorEnv.Dev,
  version: "1.0.0",
  publicEncryptionKey: "your-public-key-hex-string" // Enable encryption
});
```

**Note:** The public key is not a secret - you can hardcode it, store it in `.env`, or configure it however you prefer. The SDK only uses the public key to encrypt values before sending them to Avo.

**Private key:** Save it securely (password manager, secure notes). Never expose it to the SDK. You only need it when viewing encrypted values in Avo's dashboard.

When encryption is enabled:
- Property values are encrypted before being sent to Avo
- You can decrypt them in Avo's dashboard using your private key
- Works with all data types: strings, numbers, booleans, objects, arrays, null
- Handles large payloads (1KB+) without issues

# Client-Side Validation (Dev/Staging Only)

When initialized with a `publicEncryptionKey` in dev or staging environments, Inspector performs client-side validation of your events against your Avo Tracking Plan.

## How It Works

1. **Event Spec Fetching**: When you track an event, Inspector fetches the event specification from Avo's backend (results are cached for performance).

2. **Event Matching**: Inspector matches your event to the closest event in your tracking plan, considering event names, mapped names, and variant-specific properties.

3. **Property Validation**: Your event properties are validated against the spec rules:
   - Required properties are present
   - Property types match (string, int, float, boolean, object, list)
   - Numeric values are within min/max bounds
   - String values match regex patterns
   - Enum values are in the allowed list
   - Pinned values match exactly (variant-specific fixed values)
   - No unexpected properties are sent

4. **Immediate Reporting**: Validated events bypass batching and are sent immediately to Inspector, ensuring you get real-time feedback.

## Validation Errors

If logging is enabled, validation errors are logged to the console:

```javascript
inspector.enableLogging(true);

// If "User Signed Up" requires an "email" property:
inspector.trackSchemaFromEvent("User Signed Up", { name: "John" });
// Console: [Avo Inspector] Validation errors for event "User Signed Up": [{ code: "RequiredMissing", propertyName: "email" }]
```

## Important: trackSchema Does Not Validate

**Note:** Client-side validation only works with `trackSchemaFromEvent`, which has access to actual property values needed for validation.

The `trackSchema` method only sends pre-extracted schemas and **does not perform client-side validation** - it goes through the normal batching flow.

```javascript
// ✅ Validates against tracking plan (when publicEncryptionKey is provided)
inspector.trackSchemaFromEvent("Event Name", { prop: "value" });

// ❌ Does NOT validate - only sends schema, uses batching
inspector.trackSchema("Event Name", [{ propertyName: "prop", propertyType: "string" }]);
```

## Accessing Validation Results

`trackSchemaFromEvent` returns a `Promise<EventProperty[]>` that resolves with the validated properties. You can use this in two ways:

### Fire-and-Forget (Default)

Call without `await` for non-blocking behavior. The event is tracked asynchronously and validation happens in the background:

```javascript
// Non-blocking - validation runs in background
inspector.trackSchemaFromEvent("Event Name", { prop: "value" });
```

### Await for Validation Results

If you need to access validation results (e.g., for testing or debugging), you can `await` the call:

```javascript
// Blocking - wait for validation to complete
const validatedProperties = await inspector.trackSchemaFromEvent("Event Name", { 
  email: "user@example.com",
  age: 25 
});

// Each property includes validation results:
// {
//   propertyName: "email",
//   propertyType: "string",
//   failedEventIds: [],    // Event IDs where this property failed validation
//   passedEventIds: ["abc123"]  // Event IDs where this property passed validation
// }
```

**Note:** Awaiting will block until the event spec is fetched (if not cached) and validation completes. For production use, fire-and-forget is recommended to avoid impacting your application's performance.

# Batching control

In order to ensure our SDK doesn't have a large impact on performance or battery life it supports event schemas batching.

Default batch size is 30 and default batch flush timeout is 30 seconds.
In development mode batching is disabled.

```javascript
inspector.setBatchSize(15);
inspector.setBatchFlushSeconds(10);
```

# Network timeout

You can control the network timeout for the SDK. Default is 2 seconds.

```javascript
Inspector.AvoInspector.networkTimeout = 5000;
```

## Author

Avo (https://www.avo.app), friends@avo.app

## License

AvoInspector is available under the MIT license.
