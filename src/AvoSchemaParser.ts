const isArray = (obj: any): boolean => {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

// Helper function to detect built-in objects that shouldn't have their schema extracted
const isBuiltInObject = (obj: any): boolean => {
  if (obj === null || obj === undefined) {
    return false;
  }
  
  // Check for common built-in objects that have no enumerable properties
  return obj instanceof Date ||
         obj instanceof RegExp ||
         obj instanceof Error ||
         obj instanceof Function ||
         typeof obj === 'function' ||
         typeof obj === 'symbol';
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

    const mapping = (object: any, depth: number = 0): any => {
      if (isArray(object)) {
        const list = object.map((x: any) => {
          return mapping(x, depth);
        });
        return this.removeDuplicates(list);
      } else if (typeof object === "object" && object !== null) {
        // Check if this is a built-in object that we shouldn't try to extract schema from
        if (isBuiltInObject(object)) {
          return this.getPropValueType(object);
        }
        
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

            // Only recurse into children if we haven't reached max depth (4 levels)
            if (typeof val === "object" && val != null && depth < 4) {
              mappedEntry.children = mapping(val, depth + 1);
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
    } else if (propValue instanceof Date) {
      return "string"; 
    } else if (propValue instanceof RegExp) {
      return "string"; 
    } else if (propValue instanceof Error) {
      return "object"; // Keep as "object" for backward compatibility
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
    } else if (propType === "function" || propType === "symbol") {
      return "unknown";
    } else if (propType === "object") {
      if (isArray(propValue)) {
        return "list";
      } else {
        return "object";
      }
    } else {
      return "unknown";
    }
  }
}
