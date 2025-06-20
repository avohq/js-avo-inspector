import React, { useState } from "react";
import * as Inspector from "avo-inspector";

import "./App.css";

const inspector = new Inspector.AvoInspector({
  apiKey: "XXX",
  env: Inspector.AvoInspectorEnv.Dev,
  version: "1.0.0",
  appName: "Demo App",
  suffix: "2", // This parameter is optional
});

const App = () => {
  const [schema, setSchema] = useState({
    eventName: "",
    propName: "",
    propValue: "",
  });

  const { eventName, propName, propValue } = schema;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = event.target;

    if (value === " ") return;

    setSchema({
      ...schema,
      [name]: value,
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (eventName === "" || propName === "" || propValue === "") return;

    inspector.trackSchemaFromEvent(eventName, { [propName]: propValue });
    Inspector.AvoInspector.networkTimeout = 1000;
    setSchema({
      eventName: "",
      propName: "",
      propValue: "",
    });
  };

  return (
    <div className="App">
      <h1>Avo Inspector TypeScript app</h1>

      <form className="App-inspector-form" onSubmit={handleSubmit}>
        <label>
          Event Name:
          <input
            type="text"
            name="eventName"
            value={eventName}
            onChange={handleChange}
          />
        </label>

        <label>
          Prop Name:
          <input
            type="text"
            name="propName"
            value={propName}
            onChange={handleChange}
          />
        </label>

        <label>
          Prop Value:
          <input
            type="text"
            name="propValue"
            value={propValue}
            onChange={handleChange}
          />
        </label>

        <button className="App-button" type="submit">
          Track Schema From Event
        </button>
      </form>
    </div>
  );
};

export default App;
