export interface AvoBatcherType {
  startSession(): void;

  trackEventSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): void;
}

export class AvoBatcher {
  private static avoInspectorBatchKey = "avo_inspector_batch_key";

  startSession(): void {}

  trackEventSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): void {}

  private checkIfBatchNeedsToBeSent(): void {
    // check if batch is ready
  }

  private postAllAvailableEvents(): void {
    // XHR post to api.avo.app?
    // this will require CORS
    // is there a nicer way to do this?
  }
}
