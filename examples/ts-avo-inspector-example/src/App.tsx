import React, { useState } from "react";
import "./App.css";
import * as Inspector from "avo-inspector";

function App() {
  let inspector = new Inspector.AvoInspector({
    apiKey: "9dSNFguPbR9kc3tsb6S8",
    env: Inspector.AvoInspectorEnv.Dev,
    version: "0",
  });

  inspector.enableLogging(true);
  inspector.extractSchema({ prop0: true, prop1: 1, prop2: "str" });
  inspector.setBatchSize(10);
  inspector.setBatchFlushSeconds(5);

  var eventName = ""
  var propName = ""
  var propValue = ""

  const handleEventNameChange = (event: { target: { value: React.SetStateAction<string>; }; }) => eventName = event.target.value.toString();
  const handlePropNameChange = (event: { target: { value: React.SetStateAction<string>; }; }) => propName = event.target.value.toString();
  const handlePropValueChange = (event: { target: { value: React.SetStateAction<string>; }; }) => propValue = event.target.value.toString();

  return (
    <div className="App">
      <form onSubmit={(e) => {
        inspector.trackSchemaFromEvent(eventName, {
          [propName]: propValue,
        }); 
        e.preventDefault();}}>
        <label>
          Event name:
          <input type="text" name="name" onChange={handleEventNameChange} />
        </label>
        <div>
          <label>
            Prop name:
            <input type="text" name="name" onChange={handlePropNameChange} />
          </label>
          <label>
            Prop value:
            <input type="text" name="name"  onChange={handlePropValueChange}/>
          </label>
          <input type="submit" value="Send event" />
        </div>
      </form>
    </div>
  );
}

export default App;
