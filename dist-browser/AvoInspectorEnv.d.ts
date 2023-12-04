export declare const AvoInspectorEnv: {
    readonly Prod: "prod";
    readonly Dev: "dev";
    readonly Staging: "staging";
};
export type AvoInspectorEnvType = typeof AvoInspectorEnv;
export type AvoInspectorEnvValueType = AvoInspectorEnvType[keyof AvoInspectorEnvType];
