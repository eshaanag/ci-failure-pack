import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseRustTest } from "../src/parsers/rustTest.js";

const fixturePath = fileURLToPath(new URL("./fixtures/rust-test-output.txt", import.meta.url));

describe("parseRustTest", () => {
  it("parses normal Rust test failures from a fixture", () => {
    const result = parseRustTest(readFileSync(fixturePath, "utf8"));
    expect(result).toMatchObject({ total: 4, passed: 2, skipped: 0 });
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0]?.assertion).toContain("expected 409, got 500");
  });

  it("returns no failures when all tests pass", () => {
    expect(parseRustTest("test tests::one ... ok\ntest tests::two ... ok")).toMatchObject({
      total: 2,
      passed: 2,
      failed: [],
    });
  });

  it("handles output where all tests fail", () => {
    const result = parseRustTest("test tests::one ... FAILED\ntest tests::two ... FAILED");
    expect(result.failed).toHaveLength(2);
    expect(result.passed).toBe(0);
  });

  it("returns a partial result for truncated output", () => {
    const result = parseRustTest("running 1 test\ntest tests::one ... FAILED\nfailures:");
    expect(result.failed).toHaveLength(1);
    expect(result.parserErrors).toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseRustTest("")).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });
});
