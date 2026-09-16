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

**Lite build size:** ~24 KB minified, ~6.0 KB gzipped (measured by `yarn check:lite-size`).

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

> **`outputReference` and `originHint` require a `client`.** They are only sent on the v2
> transport, which the SDK uses only when a [`client`](#client-and-the-v2-transport) is
> configured. Without one the SDK stays on the v1 endpoint, which has no such fields, so both
> are left out of the request (with one `console.warn` per page when logging is enabled).
> An `appVersion` option works on both transports.

```typescript
interface TrackOptions {
  outputReference?: string;
  originHint?: string;
  appVersion?: string;
}
```

```javascript
let inspector = new Inspector.AvoInspector({
  apiKey: "your api key",
  env: Inspector.AvoInspectorEnv.Prod,
  version: "1.0.0",
  client: "gtm-web" // selects v2, which is what sends outputReference and originHint
});

inspector.trackSchemaFromEvent(
  "Event name",
  { "String Prop": "Prop Value" },
  {
    outputReference: "meta-x7k2q", // which output checkpoint this observation was bound for
    originHint: "web",             // which upstream source produced the event
    appVersion: "5.1.0",           // that source's app version
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
| `outputReference` | Which gateway output (destination checkpoint) this observation was bound for. Leave it out for a gateway-level observation that isn't tied to one output. v2 only. |
| `originHint` | Identifies the event's upstream source (e.g. `"web"`, `"ios"`). See [Origin hint](#origin-hint) below. v2 only. |
| `appVersion` | Per-event app version of the source that produced the event. Both transports. See [App version](#app-version) below for how it interacts with `originHint`. |

- All three fields are optional and independent — you can set any combination of them.
- Values are trimmed. Empty strings, whitespace-only strings, and non-string values
  (numbers, booleans, `null`, objects, arrays) are treated as absent, and
  `outputReference`/`originHint` are then omitted from the request body entirely rather than
  sent as `null` or `""`.
- All three fields are sent as top-level siblings of `eventProperties`, never nested inside the
  schema. Calling either method without `options` (or with an empty `{}`) produces a request
  body with exactly the pre-3.3.0 key set — only `libVersion` differs.
- Events tracked automatically through Avo Codegen (Avo Functions) never carry these fields, on
  either transport — `TrackOptions` only applies to `trackSchemaFromEvent`/`trackSchema` calls
  you make directly.

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

With a client (v2), setting `originHint` marks the event as coming from a different source than
the app this Inspector instance was constructed with, so the instance's configured `version` no
longer applies to that event. Without a client (v1) `originHint` is not sent, so it does not
change the version either. `appVersion` resolves on the wire like this:

| `originHint` | `appVersion` | v2 (`client` set) | v1 (no `client`) |
|---|---|---|---|
| present | present | `appVersion`, trimmed | `appVersion`, trimmed |
| present | absent | literal `null`, recorded as `"unversioned"` | the SDK's configured version |
| absent | present | `appVersion`, trimmed | `appVersion`, trimmed |
| absent | absent | the SDK's configured version | the SDK's configured version |

`appVersion` is the one field in `TrackOptions` that can legitimately be sent as a literal
`null` rather than being omitted — only on v2, in the `originHint` present / `appVersion` absent
row. v1 never receives a `null` `appVersion`: it silently drops such an event (while still
answering `200`), so without a client the SDK keeps the configured version instead.

# Transports and request headers

Since version `3.3.0` the SDK has two transports, chosen once when the instance is constructed:

| | v1 (default) | v2 (`client` set) |
|---|---|---|
| Endpoint | `POST https://api.avo.app/inspector/v1/track` | `POST https://api.avo.app/inspector/v2/track` |
| `Content-Type` | `text/plain` | `application/json` |
| `api-key`, `env` headers | not sent — both travel in the body | your Inspector API key and `dev`/`staging`/`prod` |
| `X-Avo-Client` header | not sent | the `client` value |
| `Content-Encoding` | `gzip`, only when the batch was large enough to compress | same |
| `outputReference`, `originHint` | left out | sent |
| Codegen `eventId`/`eventHash` | used | ignored by the endpoint |
| Server-side sampling | as before | none: the response always carries `samplingRate: 1.0` |

**v1 is the default, and it is byte-for-byte the request 3.2.0 sent** — same URL, same single
`Content-Type: text/plain` header, same body. An existing npm or script-tag install that does
not set a `client` sees no change on the wire apart from the `libVersion` value.

On v2 the API key and environment travel in headers. They are still sent in the request body as
well — v2 ignores the body copies, and keeping them means one body shape across endpoint
versions. Because `api-key`, `env` and `X-Avo-Client` are not CORS-safelisted, every v2 request
is preflighted, where v1 preflights only gzipped batches; `text/plain` existed only to stay
inside the safelist, which is why v2 uses `application/json`. The API key is trimmed once at
construction on both transports.

> **Rollout status:** v2 from a browser depends on the ingestion endpoint's CORS preflight
> allowing `api-key`, `env` and `X-Avo-Client` alongside `Content-Type` and
> `Content-Encoding`. Only integrations that set a `client` (such as the Avo web GTM tag
> template) use v2; everything else stays on v1, which is unaffected.

## `client` and the v2 transport

`client` identifies the Avo integration this SDK is embedded in. Setting it selects v2 and
becomes the `X-Avo-Client` header, which tells Avo which kind of client produced the traffic
without inspecting the body. Leave it unset unless you are building such an integration or need
`outputReference`/`originHint`:

```javascript
let inspector = new Inspector.AvoInspector({
  apiKey: "your api key",
  env: Inspector.AvoInspectorEnv.Prod,
  version: "1.0.0",
  client: "gtm-web" // optional; omit to stay on v1
});
```

A `client` counts as set only when it is a string that is still non-empty after trimming; an
empty or whitespace-only value keeps v1. A set value is trimmed and must look like a platform
token — letters, digits, `.`, `_` or `-`, up to 64 characters. A non-blank value that does not
still selects v2 but is sent as `X-Avo-Client: web`, because a value a browser rejects as a
header would otherwise throw while the request is being set up and stop the SDK sending at all.

The script-tag build reads the same value from `window.inspector.__CLIENT__`, alongside
`__API_KEY__`, `__ENV__`, `__VERSION__` and `__APP_NAME__`. That is how the Avo web GTM tag
template declares itself as `gtm-web` and opts into v2. A page that does not set it stays on v1.

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
