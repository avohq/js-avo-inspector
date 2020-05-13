# Avo Inspector

[![npm version](https://badge.fury.io/js/avo-inspector.svg)](https://badge.fury.io/js/avo-inspector)

# Avo documentation

This is a quick start guide.
For more information about the Inspector project please read [Avo documentation](https://www.avo.app/docs/inspector/sdk/web).

# Installation

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
    appName: "My app"
  });
```

# Enabling logs

Logs are enabled by default in the dev mode and disabled in prod mode.

Java
```javascript
inspector.enableLogging(true);
```

# Sending event schemas

Whenever you send tracking event call one of the following methods:
Read more in the [Avo documentation](https://www.avo.app/docs/inspector/sdk/web#event-tracking)

### 1.

This method gets actual tracking event parameters, extracts schema automatically and sends it to the Avo Inspector backend.
It is the easiest way to use the library, just call this method at the same place you call your analytics tools' track methods with the same parameters.

```java
inspector.trackSchemaFromEvent("Event name", {
          "String Prop": "Prop Value",
          "Float Prop": 1.0,
          "Boolean Prop": true
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
          "Boolean Prop": true
        });
```
You can experiment with this method to see how more complex schemas look, for example with nested lists and objects.

# Batching control

In order to ensure our SDK doesn't have a large impact on performance or battery life it supports event schemas batching.

Default batch size is 30 and default batch flush timeout is 30 seconds.
In development mode default batch flush timeout is 1 second, i.e. the SDK batches schemas of events sent withing one second.

```javascript
inspector.setBatchSize(15);
inspector.setBatchFlushSeconds(10);
```

## Author

Avo (https://www.avo.app), friends@avo.app

## License

AvoInspector is available under the MIT license.
