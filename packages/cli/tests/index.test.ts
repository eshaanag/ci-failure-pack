import { describe, expect, it } from "vitest";

import { normalizeReplayOptions } from "../src/index.js";

describe("normalizeReplayOptions", () => {
  it("keeps install steps by default", () => {
    expect(normalizeReplayOptions({ dryRun: true, yes: false })).toMatchObject({
      dryRun: true,
      noInstall: false,
      yes: false,
    });
  });

  it("skips install steps only when --no-install is explicit", () => {
    expect(normalizeReplayOptions({ install: false })).toMatchObject({
      noInstall: true,
    });
  });
});
