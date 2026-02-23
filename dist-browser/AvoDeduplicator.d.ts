export declare class AvoDeduplicator {
    avoFunctionsEvents: Record<number, string>;
    manualEvents: Record<number, string>;
    avoFunctionsEventsParams: Record<string, Record<string, any>>;
    manualEventsParams: Record<string, Record<string, any>>;
    shouldRegisterEvent(eventName: string, params: Record<string, any>, fromAvoFunction: boolean): boolean;
    private hasSameEventAs;
    private lookForEventIn;
    hasSeenEventParams(params: Record<string, any>, checkInAvoFunctions: boolean): boolean;
    private lookForEventParamsIn;
    shouldRegisterSchemaFromManually(eventName: string, eventSchema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>): boolean;
    private hasSameShapeInAvoFunctionsAs;
    private lookForEventSchemaIn;
    private clearOldEvents;
    private _clearEvents;
}
