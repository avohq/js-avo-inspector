"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var AvoInspector = /** @class */ (function () {
    function AvoInspector() {
    }
    AvoInspector.prototype.trackSchemaFromEvent = function (eventName, eventProperties) {
        console.log('Inspected evemt: ' + eventName + ": " + JSON.stringify(eventProperties));
    };
    return AvoInspector;
}());
exports.AvoInspector = AvoInspector;
