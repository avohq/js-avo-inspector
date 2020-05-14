export declare class AvoSchemaParser {
    extractSchema(eventProperties: {
        [propName: string]: any;
    }): Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>;
    private removeDuplicates;
    private getPropValueType;
}
