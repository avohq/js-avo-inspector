export declare class AvoDeduplicator {
    avoFunctionsEvents: {
        [time: number]: string;
    };
    manualEvents: {
        [time: number]: string;
    };
    avoFunctionsEventsParams: {
        [eventName: string]: {
            [propName: string]: any;
        };
    };
    manualEventsParams: {
        [eventName: string]: {
            [propName: string]: any;
        };
    };
    shouldRegisterEvent(eventName: string, params: {
        [propName: string]: any;
    }, fromAvoFunction: boolean): boolean;
    private hasSameEventAs;
    private lookForEventIn;
    hasSeenEventParams(params: {
        [propName: string]: any;
    }, checkInAvoFunctions: boolean): boolean;
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
