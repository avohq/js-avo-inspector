import React from 'react';
import './App.css';
import {AvoInspector} from 'avo-inspector';

function App() {
  new AvoInspector().trackSchemaFromEvent("Js Event Name", {"prop0": "str", "prop1": true, "prop2": 10});
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
