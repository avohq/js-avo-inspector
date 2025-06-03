const isArray = (obj: any): boolean => {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

export class AvoSchemaParser {
  static extractSchema (eventProperties: Record<string, any>): Array<{
    propertyName: string
    propertyType: string
    children?: any
  }> {
    if (eventProperties === null || eventProperties === undefined) {
      return [];
    }

    const mapping = (object: any) => {
      if (isArray(object)) {
        const list = object.map((x: any) => {
          return mapping(x);
        });
        return this.removeDuplicates(list);
      } else if (typeof object === "object") {
        const mappedResult: any = [];
        for (const key in object) {
          if (object.hasOwnProperty(key)) {
            const val = object[key];

            const mappedEntry: {
              propertyName: string
              propertyType: string
              children?: any
            } = {
              propertyName: key,
              propertyType: this.getPropValueType(val)
            };

            if (typeof val === "object" && val != null) {
              mappedEntry.children = mapping(val);
            }

            mappedResult.push(mappedEntry);
          }
        }

        return mappedResult;
      } else {
        return this.getPropValueType(object);
      }
    };

    const mappedEventProps = mapping(eventProperties);

    return mappedEventProps;
  }

  private static removeDuplicates (array: any[]): any[] {
    // XXX TODO fix any types
    const primitives: any = { boolean: {}, number: {}, string: {} };
    const objects: any[] = [];

    return array.filter((item: any) => {
      const type: string = typeof item;
      if (type in primitives) {
        return primitives[type].hasOwnProperty(item)
          ? false
          : (primitives[type][item] = true);
      } else {
        return objects.includes(item) ? false : objects.push(item);
      }
    });
  }

  private static getPropValueType (propValue: any): string {
    const propType = typeof propValue;
    if (propValue == null) {
      return "null";
    } else if (propType === "string") {
      return "string";
    } else if (propType === "number" || propType === "bigint") {
      if ((propValue + "").includes(".")) {
        return "float";
      } else {
        return "int";
      }
    } else if (propType === "boolean") {
      return "boolean";
    } else if (propType === "object") {
      if (isArray(propValue)) {
        // Get types of all non-empty elements
        const elementTypes = propValue
          .filter((item: any) => item != null && (!isArray(item) || item.length > 0))
          .map((item: any) => this.getPropValueType(item));

        if (elementTypes.length === 0) {
          return "list(unknown)";
        }

        // Check if all elements have the same type
        const firstType = elementTypes[0];
        const allSameType = elementTypes.every((type: string) => type === firstType);

        if (allSameType) {
          return `list(${firstType})`;
        }

        // If types are inconsistent, return the type of the first non-empty element
        return `list(${firstType})`;
      } else {
        return "object";
      }
    } else {
      return "unknown";
    }
  }
}
