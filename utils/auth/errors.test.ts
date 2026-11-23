import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("shows fixed text for known codes", () => {
    expect(authErrorMessage("auth_failed")).toMatch(/couldn't sign you in/);
  });
  it("never echoes text from the URL", () => {
    const crafted = "Your account is locked. Call +1-555-0100";
    expect(authErrorMessage(crafted)).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(["auth_failed"])).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
  });
});
