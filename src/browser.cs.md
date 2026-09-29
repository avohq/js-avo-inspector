# browser

## Short description

Script-tag bootstrap for the CDN build. Replaces the `window.inspector` loader stub (an array-backed call queue with configuration globals) with a real `AvoInspector` instance and replays the calls queued before the script loaded. For the web GTM tag template (`__CLIENT__`), it also passes the client to the SDK and routes a third track argument to the internal gateway-options methods.

## Tech stack

- Plain JavaScript, bundled by webpack (`webpack.browserConfig.js`) with `AvoInspector` into `dist/browser.js`, served from the CDN.

## Data

Globals read from the loader stub `window.inspector` before replacement:

| Global | Constructor option |
|---|---|
| `__API_KEY__` | `apiKey` |
| `__ENV__` | `env` |
| `__VERSION__` | `version` |
| `__APP_NAME__` | `appName` |
| `__PUBLIC_ENCRYPTION_KEY__` (only when truthy) | `publicEncryptionKey` |
| `__CLIENT__` (only when truthy; **internal**) | untyped `_client` |

Queued calls are arrays `[methodName, ...args]` pushed by the stub's method factories.

`routeGatewayOptions(inspector)` — captures the instance's `trackSchemaFromEvent` and `trackSchema` and replaces them with wrappers:

```js
inspector.trackSchemaFromEvent = (eventName, eventProperties, options) =>
  options === undefined
    ? original.call(inspector, eventName, eventProperties)
    : inspector._trackSchemaFromEventWithOptions(eventName, eventProperties, options);
// trackSchema → _trackSchemaWithOptions, same shape
```

## Users and permissions

Runs on any page that installs the Inspector loader snippet. Only the web GTM tag template sets `__CLIENT__` (to `"gtm-web"`).

## Functional requirements

1. When `window` is undefined, log "Window not available. Aborting." and stop.
2. When `__ENV__ === "dev"`, log that the SDK loaded; when `__API_KEY__ === "MY-API-KEY"`, log an error that the key was not provided.
3. Keep the stub as `callQueue`; build the options from the globals, adding `_client = __CLIENT__` when `__CLIENT__` is truthy.
4. Construct `new AvoInspector(options)`. When `__CLIENT__` is truthy, apply `routeGatewayOptions` to the instance. Assign it to `window.inspector`.
5. Replay each queued call in order: `window.inspector[method](...args)` — queued track calls with a third argument go through the wrappers.

## Non-functional requirements

- IMPORTANT: without a truthy `__CLIENT__`, the bootstrap behaves exactly as before: no `_client`, no wrappers, and a third track argument is ignored by the two-argument public methods.
- The wrappers are installed for **any** truthy `__CLIENT__` (e.g. `"web"`, `1`); the transport and the options' effect are still decided by the handler, which honours only `"gtm-web"`.
- Wrappers close over the instance, so they work when invoked without a receiver.
- The wrappers route on `options === undefined`: an explicit third argument of `null`, `{}` or any other value reaches the internal method, where non-object/blank values normalize to absent.
- Constructor errors (missing api key or version) propagate and leave the stub in place. Replayed calls are fired without awaiting.
