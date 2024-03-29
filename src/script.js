!(function () {
  const inspector = (window.inspector = window.inspector || []);
  inspector.methods = [
    "trackSchemaFromEvent",
    "trackSchema",
    "setBatchSize",
    "setBatchFlushSeconds"
  ];
  inspector.factory = function (method) {
    return function () {
      const t = Array.prototype.slice.call(arguments);
      t.unshift(method);
      inspector.push(t);
      return inspector;
    };
  };
  for (let e = 0; e < inspector.methods.length; e++) {
    const key = inspector.methods[e];
    inspector[key] = inspector.factory(key);
  }
  inspector.load = function () {
    const t = document.createElement("script");
    t.type = "text/javascript";
    t.async = !0;
    t.src = "https://cdn.avo.app/inspector/inspector-v1.min.js";
    const n = document.getElementsByTagName("script")[0];
    n.parentNode.insertBefore(t, n);
  };
  inspector._scriptVersion = 1;
})();
