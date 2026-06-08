import { describe, expect, it } from "vitest";

import { parseDockerBuild } from "../src/parsers/dockerBuild.js";

describe("parseDockerBuild", () => {
  it("extracts the failing BuildKit RUN command", () => {
    const result = parseDockerBuild(`
#8 [4/5] RUN pnpm install --frozen-lockfile
#8 0.123 Lockfile is up to date
#8 ERROR: process "/bin/sh -c pnpm install --frozen-lockfile" did not complete successfully: exit code: 1
`);

    expect(result).toMatchObject({ format: "docker-build", total: 1 });
    expect(result.failed[0]).toMatchObject({
      name: "Docker RUN failed: pnpm install --frozen-lockfile",
      assertion: "Docker #8 exited 1",
    });
  });

  it("extracts the failing classic builder RUN command", () => {
    const result = parseDockerBuild(`
Step 5/8 : RUN npm ci
 ---> Running in abc123
The command '/bin/sh -c npm ci' returned a non-zero code: 127
`);

    expect(result.failed[0]).toMatchObject({
      name: "Docker RUN failed: npm ci",
      assertion: "Docker step 5/8 exited 127",
    });
  });

  it("returns empty output for a successful build", () => {
    const result = parseDockerBuild(`
#7 [3/3] RUN npm test
#7 DONE 2.1s
Successfully built abc123
`);

    expect(result).toMatchObject({ total: 0, failed: [], parserErrors: [] });
  });

  it("returns empty output for empty input", () => {
    expect(parseDockerBuild("")).toMatchObject({ total: 0, failed: [] });
  });
});
