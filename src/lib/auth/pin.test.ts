import { describe, expect, it } from "vitest";
import { hashPin, isPin, verifyPin } from "./pin";

describe("PIN", () => {
  it("accepts exactly four digits", () => {
    expect(isPin("0000")).toBe(true);
    expect(isPin("5555")).toBe(true);
    expect(isPin("123")).toBe(false);
    expect(isPin("12345")).toBe(false);
    expect(isPin("12a4")).toBe(false);
  });

  it("stores a verifiable hash instead of the PIN", async () => {
    const hash = await hashPin("5555");

    expect(hash).not.toContain("5555");
    await expect(verifyPin("5555", hash)).resolves.toBe(true);
    await expect(verifyPin("0000", hash)).resolves.toBe(false);
  });

  it("uses a new salt for every hash", async () => {
    const first = await hashPin("1111");
    const second = await hashPin("1111");

    expect(first).not.toBe(second);
  });
});
