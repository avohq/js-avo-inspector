import { encryptValue } from "./AvoEncryption";

const isArray = (obj: any): boolean => {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

export class AvoSchemaParser {
  /**
   * Returns true only if we have a valid encryption key and can send encrypted values.
   * If no key is present, returns false and no property values will be sent.
   */
  private static canSendEncryptedValues(
    publicEncryptionKey: string | undefined,
    env: string | undefined
  ): boolean {
    const hasEncryptionKey = publicEncryptionKey != null && publicEncryptionKey !== "";
    const isDevOrStaging = env === "dev" || env === "staging";
    return hasEncryptionKey && isDevOrStaging;
  }

  /**
   * Returns the encrypted property value if encryption is enabled, otherwise undefined.
   * Never returns unencrypted values - only encrypted or nothing.
   */
  private static getEncryptedPropertyValueIfEnabled(
    propertyValue: any,
    canEncrypt: boolean,
    publicEncryptionKey: string | undefined
  ): string | undefined {
    if (!canEncrypt || !publicEncryptionKey) {
      return undefined; // No encryption key: do not send any property values
    }
    return encryptValue(propertyValue, publicEncryptionKey); // Only send encrypted values
  }

  static extractSchema (
    eventProperties: Record<string, any>,
    publicEncryptionKey?: string,
    env?: string
  ): Array<{
    propertyName: string
    propertyType: string
    encryptedPropertyValue?: string
    children?: any
  }> {
    if (eventProperties === null || eventProperties === undefined) {
      return [];
    }

    const canSendEncryptedValues = this.canSendEncryptedValues(publicEncryptionKey, env);

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
              encryptedPropertyValue?: string
              children?: any
            } = {
              propertyName: key,
              propertyType: this.getPropValueType(val)
            };

            // Only set encryptedPropertyValue if we can encrypt. Never send unencrypted values.
            const encryptedValue = this.getEncryptedPropertyValueIfEnabled(
              val,
              canSendEncryptedValues,
              publicEncryptionKey
            );
            if (encryptedValue !== undefined) {
              mappedEntry.encryptedPropertyValue = encryptedValue;
            }

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
