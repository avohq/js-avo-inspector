"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let isArray = (obj) => {
    return Object.prototype.toString.call(obj) === "[object Array]";
};
class AvoSchemaParser {
    extractSchema(eventProperties) {
        if (eventProperties === null || eventProperties === undefined) {
            return [];
        }
        let mapping = (object) => {
            if (isArray(object)) {
                let list = object.map((x) => {
                    return mapping(x);
                });
                return this.removeDuplicates(list);
            }
            else if (typeof object === "object") {
                let mappedResult = [];
                for (var key in object) {
                    if (object.hasOwnProperty(key)) {
                        let val = object[key];
                        let mappedEntry = {
                            propertyName: key,
                            propertyType: this.getPropValueType(val),
                        };
                        if (typeof val === "object" && val != null) {
                            mappedEntry["children"] = mapping(val);
                        }
                        mappedResult.push(mappedEntry);
                    }
                }
                return mappedResult;
            }
            else {
                return this.getPropValueType(object);
            }
        };
        var mappedEventProps = mapping(eventProperties);
        return mappedEventProps;
    }
    removeDuplicates(array) {
        // XXX TODO fix any types
        var primitives = { boolean: {}, number: {}, string: {} };
        var objects = [];
        return array.filter((item) => {
            var type = typeof item;
            if (type in primitives) {
                return primitives[type].hasOwnProperty(item)
                    ? false
                    : (primitives[type][item] = true);
            }
            else {
                return objects.indexOf(item) >= 0 ? false : objects.push(item);
            }
        });
    }
    getPropValueType(propValue) {
        let propType = typeof propValue;
        if (propValue == null) {
            return "null";
        }
        else if (propType === "string") {
            return "string";
        }
        else if (propType === "number" || propType === "bigint") {
            if ((propValue + "").indexOf(".") >= 0) {
                return "float";
            }
            else {
                return "int";
            }
        }
        else if (propType === "boolean") {
            return "boolean";
        }
        else if (propType === "object") {
            if (isArray(propValue)) {
                return "list";
            }
            else {
                return "object";
            }
        }
        else {
            return "unknown";
        }
    }
}
exports.AvoSchemaParser = AvoSchemaParser;
