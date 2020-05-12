import React from 'react';
import './App.css';
import * as Inspector from 'avo-inspector';

function App() {
  let inspector = new Inspector.AvoInspector("apiKey", Inspector.AvoInspectorEnv.Dev);
  inspector.trackSchemaFromEvent("Js Event Name", {"prop0": "str", "prop1": true, "prop2": 10});
  inspector.trackSchema("Js Event Name", { "prop0": new Inspector.AvoType.Int(), "prop1": new Inspector.AvoType.List(), 
    "prop2": new Inspector.AvoType.Null() });
  inspector.enableLogging(true);
  inspector.extractSchema({ "prop0": true, "prop1": 1, "prop2": "str" });
//  inspector.setBatchSize(10);
//  inspector.setBatchFlushSeconds(5);

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
