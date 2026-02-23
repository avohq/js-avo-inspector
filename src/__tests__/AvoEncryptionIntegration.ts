/**
 * Integration tests for encryption in AvoNetworkCallsHandler.
 *
 * Covers:
 * - publicEncryptionKey in base body when non-null and non-empty
 * - Prod negative test: no encryptedPropertyValue in prod env payload
 * - Dev positive test: encryptedPropertyValue present in dev env payload
 */
import AvoGuid from "../AvoGuid";
import { AvoStreamId } from "../AvoStreamId";
import { AvoNetworkCallsHandler, BaseBody } from "../AvoNetworkCallsHandler";
import { p256 } from "@noble/curves/p256";

import { mockedReturns } from "./constants";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateTestKeyPair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = p256.utils.randomPrivateKey();
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);
  return {
    privateKey: bytesToHex(privateKeyBytes).padStart(64, "0"),
    publicKey: bytesToHex(publicKeyBytes),
  };
}

const keyPair = generateTestKeyPair();

describe("AvoNetworkCallsHandler encryption integration", () => {
  const now = new Date();

  beforeAll(() => {
    // @ts-ignore
    jest.spyOn(global, "Date").mockImplementation(() => now);

    jest
      .spyOn(AvoStreamId as any, "initialize")
      .mockResolvedValue(mockedReturns.ANONYMOUS_ID);

    jest
      .spyOn(AvoGuid as any, "newGuid")
      .mockImplementation(() => mockedReturns.GUID);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("publicEncryptionKey is included in base body when non-null and non-empty", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "dev",
      "TestApp",
      "1.0.0",
      "1.0.0",
      keyPair.publicKey
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "name", propertyType: "string" }],
      null,
      null,
      { name: "Alice" }
    );

    expect(body.publicEncryptionKey).toBe(keyPair.publicKey);
  });

  test("publicEncryptionKey is NOT included in base body when null", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "dev",
      "TestApp",
      "1.0.0",
      "1.0.0"
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "name", propertyType: "string" }],
      null,
      null
    );

    expect(body.publicEncryptionKey).toBeUndefined();
  });

  test("publicEncryptionKey is NOT included in base body when empty string", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "dev",
      "TestApp",
      "1.0.0",
      "1.0.0",
      ""
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "name", propertyType: "string" }],
      null,
      null
    );

    expect(body.publicEncryptionKey).toBeUndefined();
  });

  test("Prod negative test: no encryptedPropertyValue in prod env payload", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "prod",
      "TestApp",
      "1.0.0",
      "1.0.0",
      keyPair.publicKey
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "name", propertyType: "string" }],
      null,
      null,
      { name: "Alice" }
    );

    // In prod, shouldEncrypt returns false, so no encryption
    for (const prop of body.eventProperties) {
      expect(prop.encryptedPropertyValue).toBeUndefined();
    }
  });

  test("Dev positive test: encryptedPropertyValue present in dev env payload", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "dev",
      "TestApp",
      "1.0.0",
      "1.0.0",
      keyPair.publicKey
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "name", propertyType: "string" }],
      null,
      null,
      { name: "Alice" }
    );

    expect(body.eventProperties).toHaveLength(1);
    expect(body.eventProperties[0].encryptedPropertyValue).toBeDefined();
    expect(typeof body.eventProperties[0].encryptedPropertyValue).toBe("string");
  });

  test("Staging positive test: encryptedPropertyValue present in staging env payload", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "staging",
      "TestApp",
      "1.0.0",
      "1.0.0",
      keyPair.publicKey
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [{ propertyName: "price", propertyType: "float" }],
      null,
      null,
      { price: 9.99 }
    );

    expect(body.eventProperties).toHaveLength(1);
    expect(body.eventProperties[0].encryptedPropertyValue).toBeDefined();
  });

  test("List-type properties are omitted in encrypted payload", async () => {
    const handler = new AvoNetworkCallsHandler(
      "test-api-key",
      "dev",
      "TestApp",
      "1.0.0",
      "1.0.0",
      keyPair.publicKey
    );

    const body = await handler.bodyForEventSchemaCall(
      "testEvent",
      [
        { propertyName: "tags", propertyType: "list", children: ["string"] },
        { propertyName: "name", propertyType: "string" },
      ],
      null,
      null,
      { tags: ["a", "b"], name: "Alice" }
    );

    // list property should be omitted
    expect(body.eventProperties).toHaveLength(1);
    expect(body.eventProperties[0].propertyName).toBe("name");
  });
});
