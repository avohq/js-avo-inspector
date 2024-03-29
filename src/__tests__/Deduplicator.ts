import { AvoDeduplicator } from "../AvoDeduplicator";
import { deepEquals } from "../utils";
import { AvoSchemaParser } from "../AvoSchemaParser";
import { AvoInspector } from "../AvoInspector";
import { defaultOptions } from "./constants";

describe("Deduplicator", () => {
  const deduplicator = new AvoDeduplicator();

  const testObject = {
    0: "some string",
    1: [1, 2, 3],
    2: [["str", true]],
    3: { avo: [1.1, 2.2, 3.3] }
  };

  test("AvoDeduplicator.deepEqual tests", () => {
    const secondObject = {
      0: "some string",
      1: [1, 2, 3],
      2: [["str", true]],
      3: { avo: [1.1, 2.2, 3.3] }
    };

    expect(deepEquals(testObject, secondObject)).toBe(true);

    expect(deepEquals(testObject, { ...secondObject, 4: "4" })).toBe(false);

    expect(deepEquals(testObject, { ...secondObject, 3: { ...secondObject[3], avo: [1.1] } })).toBe(false);

    expect(deepEquals(testObject, { ...secondObject, 0: "other string" })).toBe(false);
  });

  test("Detects duplications when track in avo and then manually", () => {
    const shouldRegisterFromAvo = deduplicator.shouldRegisterEvent("Test", testObject, true);
    const shouldRegisterManual = deduplicator.shouldRegisterEvent("Test", testObject, false);

    expect(shouldRegisterFromAvo).toBe(true);
    expect(shouldRegisterManual).toBe(false);
  });

  test("Detects duplications when track manually and then in avo", () => {
    const shouldRegisterManual = deduplicator.shouldRegisterEvent("Test", testObject, false);
    const shouldRegisterFromAvo = deduplicator.shouldRegisterEvent("Test", testObject, true);

    expect(shouldRegisterManual).toBe(true);
    expect(shouldRegisterFromAvo).toBe(false);
  });

  test("Detects duplications when track in avo and then schema manually", () => {
    const shouldRegisterFromAvo = deduplicator.shouldRegisterEvent("Test", testObject, true);
    const shouldRegisterSchemaManual = deduplicator.shouldRegisterSchemaFromManually("Test", AvoSchemaParser.extractSchema(testObject));

    expect(shouldRegisterFromAvo).toBe(true);
    expect(shouldRegisterSchemaManual).toBe(false);
  });

  test("Inspector deduplicates only one event when track manually, in avo and then manually again", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    const manuallyTrackedSchema = inspector.trackSchemaFromEvent("test", testObject);
    // @ts-expect-error
    const avoTrackedSchema = inspector._avoFunctionTrackSchemaFromEvent("test", testObject, "eventId", "eventhash");
    const manuallyTrackedSchemaAgain = inspector.trackSchemaFromEvent("test", testObject);

    expect(manuallyTrackedSchema.length).toBe(4);
    expect(avoTrackedSchema.length).toBe(0);
    expect(manuallyTrackedSchemaAgain.length).toBe(4);
  });

  test("Inspector deduplicates only one event when track in avo, manually and then in avo again", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    // @ts-expect-error
    const avoTrackedSchema = inspector._avoFunctionTrackSchemaFromEvent("test", testObject, "eventId", "eventhash");
    const manuallyTrackedSchema = inspector.trackSchemaFromEvent("test", testObject);
    // @ts-expect-error
    const avoTrackedSchemaAgain = inspector._avoFunctionTrackSchemaFromEvent("test", testObject, "eventId", "eventhash");

    expect(avoTrackedSchema.length).toBe(4);
    expect(manuallyTrackedSchema.length).toBe(0);
    expect(avoTrackedSchemaAgain.length).toBe(4);
  });

  test("Allows two same manual events in a row", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    const manuallyTrackedSchema = inspector.trackSchemaFromEvent("test", testObject);
    const manuallyTrackedSchemaAgain = inspector.trackSchemaFromEvent("test", testObject);

    expect(manuallyTrackedSchema.length).toBe(4);
    expect(manuallyTrackedSchemaAgain.length).toBe(4);
  });

  test("Allows two same avo events in a row", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    // @ts-expect-error
    const avoTrackedSchema = inspector._avoFunctionTrackSchemaFromEvent("test", testObject, "eventId", "eventhash");
    // @ts-expect-error
    const avoTrackedSchemaAgain = inspector._avoFunctionTrackSchemaFromEvent("test", testObject, "eventId", "eventhash");

    expect(avoTrackedSchema.length).toBe(4);
    expect(avoTrackedSchemaAgain.length).toBe(4);
  });

  test("Does not deduplicate if more than 300ms pass", () => {
    const shouldRegisterFromAvo = deduplicator.shouldRegisterEvent("Test", testObject, true);
    const now = new Date();
    const dateNowSpy = jest
      .spyOn(Date, "now")
      .mockImplementation(() =>
        now.setMilliseconds(
          now.getMilliseconds() + 301
        )
      );
    const shouldRegisterManual = deduplicator.shouldRegisterEvent("Test", testObject, false);

    expect(shouldRegisterFromAvo).toBe(true);
    expect(shouldRegisterManual).toBe(true);

    dateNowSpy.mockRestore();
  });
});
