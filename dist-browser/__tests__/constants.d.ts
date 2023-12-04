declare const defaultOptions: {
    apiKey: string;
    env: "prod";
    version: string;
    shouldLog: boolean;
};
declare const error: {
    API_KEY: string;
    VERSION: string;
};
declare const mockedReturns: {
    INSTALLATION_ID: string;
    GUID: string;
    SESSION_ID: string;
};
declare const networkCallType: {
    EVENT: string;
    SESSION_STARTED: string;
};
declare const requestMsg: {
    ERROR: string;
    TIMEOUT: string;
};
declare const trackingEndpoint = "https://api.avo.app/inspector/v1/track";
declare const sessionTimeMs: number;
declare const type: {
    STRING: string;
    INT: string;
    OBJECT: string;
    FLOAT: string;
    LIST: string;
    BOOL: string;
    NULL: string;
    UNKNOWN: string;
};
export { defaultOptions, error, mockedReturns, networkCallType, requestMsg, sessionTimeMs, type, trackingEndpoint, };
