// LITE COPY of src/AvoSchemaParser.ts — Sync: review src/AvoSchemaParser.ts changes for applicability here
import type { EventProperty, SchemaChild } from "./AvoNetworkCallsHandlerLite";

const isArray = (obj: any): boolean => {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

export class AvoSchemaParserLite {
  static async extractSchema (
    eventProperties: Record<string, any>
  ): Promise<EventProperty[]> {
    if (eventProperties === null || eventProperties === undefined) {
      return [];
    }

    const mapping = async (object: any): Promise<SchemaChild> => {
      if (isArray(object)) {
        const list = await Promise.all(object.map(async (x: any) => {
          return await mapping(x);
        }));
        return this.removeDuplicates(list);
      } else if (typeof object === "object") {
        const mappedResult: EventProperty[] = [];
        for (const key in object) {
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            const val = object[key];

            const mappedEntry: EventProperty = {
              propertyName: key,
              propertyType: this.getPropValueType(val)
            };

            if (typeof val === "object" && val != null) {
              // Object/array properties: children are mapped individually
              mappedEntry.children = (await mapping(val)) as SchemaChild[];
            }

            mappedResult.push(mappedEntry);
          }
        }

        return mappedResult;
      } else {
        return this.getPropValueType(object);
      }
    };

    // eventProperties is always an object (Record), so mapping returns EventProperty[]
    const mappedEventProps = (await mapping(eventProperties)) as EventProperty[];

    return mappedEventProps;
  }

  private static removeDuplicates (array: SchemaChild[]): SchemaChild[] {
    const primitives: Record<string, Record<string, boolean>> = { boolean: {}, number: {}, string: {} };
    const objects: SchemaChild[] = [];

    return array.filter((item: SchemaChild) => {
      const type: string = typeof item;
      if (type in primitives && typeof item === "string") {
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
        return "list";
      } else {
        return "object";
      }
    } else {
      return "unknown";
    }
  }
}

// Alias export so sibling lite modules can import { AvoSchemaParser } from "./AvoSchemaParserLite"
export { AvoSchemaParserLite as AvoSchemaParser };
