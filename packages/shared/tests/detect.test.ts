import { describe, expect, it } from "vitest";

import { detectTestOutputFormat, parseTestOutput } from "../src/parsers/detect.js";

describe("test output detection", () => {
  it("detects JUnit XML by extension", () => {
    expect(detectTestOutputFormat("junit.xml", "<testsuite />")).toBe("junit");
  });

  it("detects Jest JSON by content", () => {
    expect(detectTestOutputFormat("report.json", '{"testResults":[]}')).toBe("jest-json");
  });

  it("detects Playwright JSON by content", () => {
    expect(detectTestOutputFormat("report.json", '{"suites":[]}')).toBe("playwright-json");
  });

  it("detects TAP by content", () => {
    expect(detectTestOutputFormat("output.txt", "TAP version 13\nok 1 - works")).toBe("tap");
  });

  it("detects Go test output by content", () => {
    expect(
      detectTestOutputFormat("output.txt", "=== RUN   TestOne\n--- PASS: TestOne (0.01s)"),
    ).toBe("go-test");
  });

  it("detects Rust test output by content", () => {
    expect(detectTestOutputFormat("output.txt", "running 1 test\ntest tests::one ... ok")).toBe(
      "rust-test",
    );
  });

  it("dispatches to the detected parser", () => {
    const result = parseTestOutput("TAP version 13\nnot ok 1 - fails", "tap.log");
    expect(result).toMatchObject({ format: "tap", total: 1 });
  });
});
