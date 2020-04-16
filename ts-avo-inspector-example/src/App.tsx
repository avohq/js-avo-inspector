import React from 'react';
import './App.css';
import {AvoInspector, AvoInspectorEnv, AvoType} from 'avo-inspector';

function App() {
  let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Dev);
  inspector.trackSchemaFromEvent("Ts Event Name", { "prop0": true, "prop1": 1, "prop2": "str" });
  inspector.trackSchema("Ts Event Name", { "prop0": new AvoType(), "prop1": new AvoType(), "prop2": new AvoType() });
  inspector.enableLogging(true);
  inspector.extractSchema({ "prop0": true, "prop1": 1, "prop2": "str" });
  inspector.setBatchSize(10);
  inspector.setBatchFlushSeconds(5);

  return (
    <div className="App">

      <form>
        <label>
          Event name:
          <input type="text" name="name" />
        </label>
          <div>
          <label>
            Prop name:
            <input type="text" name="name" />
          </label>
          <label>
            Prop value:
            <input type="text" name="name" />
          </label>
          <input type="submit" value="Send event" />
        </div>
      </form>
    </div>
  );
}

export default App;
