export declare class AvoSchemaParser {
    /**
     * Returns true only if we have a valid encryption key and can send encrypted values.
     * If no key is present, returns false and no property values will be sent.
     */
    private static canSendEncryptedValues;
    /**
     * Returns the encrypted property value if encryption is enabled, otherwise undefined.
     * Never returns unencrypted values - only encrypted or nothing.
     */
    private static getEncryptedPropertyValueIfEnabled;
    static extractSchema(eventProperties: Record<string, any>, publicEncryptionKey?: string, env?: string): Array<{
        propertyName: string;
        propertyType: string;
        encryptedPropertyValue?: string;
        children?: any;
    }>;
    private static removeDuplicates;
    private static getPropValueType;
}
