export class AvoSchemaParser {
  private removeDuplicates(array: Array<any>) {
    var primitives = { boolean: {}, number: {}, string: {} };
    var objects = [];

    return array.filter(function (item) {
      var type = typeof item;
      if (type in primitives) {
        return primitives[type].hasOwnProperty(item)
          ? false
          : (primitives[type][item] = true);
      } else {
        return objects.indexOf(item) >= 0 ? false : objects.push(item);
      }
    });
  }

  public extractSchema(eventProperties: { [propName: string]: any }): string {
    if (eventProperties == null) {
      return "";
    }

    let inspector = this;

    let mapping = function (object) {
      if (object instanceof Array) {
        let list = object.map((x) => {
          return mapping(x);
        });
        return inspector.removeDuplicates(list);
      } else if (typeof object === "object") {
        let mappedResult = [];
        for (var key in object) {
          if (object.hasOwnProperty(key)) {
            let val = object[key];

            let mappedEntry = {
              propertyName: key,
              propertyValue: inspector.getPropValueType(val),
            };

            if (typeof val === "object" && val != null) {
              mappedEntry["children"] = mapping(val);
            }

            mappedResult.push(mappedEntry);
          }
        }

        return mappedResult;
      } else {
        return inspector.getPropValueType(object);
      }
    };

    var mappedEventProps = mapping(eventProperties);

    return JSON.stringify(mappedEventProps);
  }

  private getPropValueType(propValue: any): string {
    let propType = typeof propValue;
    if (propValue == null) {
      return "null";
    } else if (propType === "string") {
      return "string";
    } else if (propType === "number" || propType === "bigint") {
      if ((propValue + "").indexOf(".") >= 0) {
        return "float";
      } else {
        return "int";
      }
    } else if (propType === "boolean") {
      return "boolean";
    } else if (propType === "object") {
      if (Object.prototype.toString.call(propValue) === "[object Array]") {
        return "list";
      } else {
        return "object";
      }
    } else {
      return "unknown";
    }
  }
}
