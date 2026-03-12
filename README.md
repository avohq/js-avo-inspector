# Avo Inspector For React Native

[![npm version](https://badge.fury.io/js/react-native-avo-inspector.svg)](https://badge.fury.io/js/react-native-avo-inspector)

# Avo documentation

This is a quick start guide.
For more information about the Inspector project please read [Avo documentation](https://www.avo.app/docs/implementation/inspector/sdk/react-native).

# Installation

The library is distributed with npm

```
npm i react-native-avo-inspector
```

or

```
yarn add react-native-avo-inspector
```

## Required peer dependencies

The SDK requires the following peer dependencies, depending on your platform and features:

### Storage (required for Android)

```
npm i @react-native-async-storage/async-storage
```

Used to persist the anonymous stream ID on Android. iOS uses native `Settings` instead.

### Encryption support (required if using `publicEncryptionKey`)

```
npm i react-native-get-random-values
```

React Native's Hermes engine does not include `crypto.getRandomValues`, which the encryption module needs. You **must** import this polyfill at the very top of your entry file (`index.js`), before any other imports:

```javascript
// index.js
import 'react-native-get-random-values'; // Must be first!
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

### iOS

After installing dependencies, run:

```
cd ios && pod install
```

# Initialization

Obtain the API key at [Avo.app](https://www.avo.app/welcome)

```javascript
import { AvoInspector, AvoInspectorEnv } from "react-native-avo-inspector";

let inspector = new AvoInspector({
  apiKey: "your api key",
  env: AvoInspectorEnv.Dev,
  version: "1.0.0",
  appName: "My app",
});
```

### With encryption

```javascript
let inspector = new AvoInspector({
  apiKey: "your api key",
  env: AvoInspectorEnv.Dev,
  version: "1.0.0",
  appName: "My app",
  publicEncryptionKey: "your public encryption key",
});
```

# Enabling logs

Logs are enabled by default in the dev mode and disabled in prod mode.

```javascript
inspector.enableLogging(true);
```

# Integrating with Avo Functions (Avo generated code)

The setup is lightweight and is covered [in this guide](https://www.avo.app/docs/implementation/start-using-inspector-with-avo-functions).

Every event sent with Avo Function after this integration will automatically be sent to the Avo Inspector.

# Sending event schemas for events reported outside of Avo Functions

Whenever you send tracking event call one of the following methods:

Read more in the [Avo documentation](https://www.avo.app/docs/implementation/devs-101#inspecting-events)

### 1.

This method gets actual tracking event parameters, extracts schema automatically and sends it to the Avo Inspector backend.
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

# Batching control

In order to ensure our SDK doesn't have a large impact on performance or battery life it supports event schemas batching.

Default batch size is 30 and default batch flush timeout is 30 seconds.
In development mode batching is disabled by default.

```javascript
inspector.setBatchSize(15);
inspector.setBatchFlushSeconds(10);
```

## Author

Avo (https://www.avo.app), friends@avo.app

## License

AvoInspector is available under the MIT license.
