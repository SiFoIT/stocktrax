import { describe, expect, it } from "vitest";
import { smtpWrite } from "../smtp-fields";

describe("smtpWrite", () => {
  it("clears the stored value when it equals the env value", () => {
    expect(smtpWrite("smtp.example.com", "smtp.example.com")).toEqual({ action: "clear" });
    expect(smtpWrite(465, 465)).toEqual({ action: "clear" });
    expect(smtpWrite(false, false)).toEqual({ action: "clear" });
  });

  it("stores a value that overrides env", () => {
    expect(smtpWrite("other.example.com", "smtp.example.com")).toEqual({
      action: "set",
      value: "other.example.com",
    });
  });

  it("stores any value when env is unset", () => {
    expect(smtpWrite(587, undefined)).toEqual({ action: "set", value: 587 });
    expect(smtpWrite("", undefined)).toEqual({ action: "set", value: "" });
  });
});
