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

  private static trackingEndpoint = "https://api.avo.app/inspector/v1/track";

  startSession(): void {}

  trackEventSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): void {
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoBatcher.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "text/plain");
    xmlhttp.send(
      JSON.stringify({
        type: "event",
        eventName: eventName,
        eventProperties: schema,
      })
    );
  }

  private checkIfBatchNeedsToBeSent(): boolean {
    // check if batch is ready
    return true;
  }

  private postAllAvailableEvents(): void {
    // XHR post to api.avo.app?
    // this will require CORS
    // is there a nicer way to do this?
  }
}
