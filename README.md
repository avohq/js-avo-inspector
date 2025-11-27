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

- Uses ECC (Elliptic Curve Cryptography) with secp256k1 for strong security
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
