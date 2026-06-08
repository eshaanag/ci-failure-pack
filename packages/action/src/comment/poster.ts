import type { Logger } from "@ci-failure-pack/shared";
import { z } from "zod";

import { createLogger } from "../lib/logger.js";
import { COMMENT_MARKER } from "./verbosity.js";

export interface GitHubApiResponse {
  status: number;
  data: unknown;
}

export interface GitHubApiClient {
  request(
    method: "GET" | "POST" | "PATCH",
    url: string,
    token: string,
    body?: unknown,
  ): Promise<GitHubApiResponse>;
}

export interface PostCommentOptions {
  owner: string;
  repository: string;
  pullRequestNumber?: number;
  token?: string;
  body: string;
  client?: GitHubApiClient;
  logger?: Logger;
}

export type PostCommentResult = "created" | "updated" | "skipped" | "failed";

const posterInputSchema = z.object({
  owner: z.string().min(1),
  repository: z.string().min(1),
  pullRequestNumber: z.number().int().positive().optional(),
  token: z.string().min(1).optional(),
  body: z.string().min(1),
});

const commentsSchema = z.array(
  z.object({ id: z.number().int().positive(), body: z.string().nullable() }).passthrough(),
);

const defaultClient: GitHubApiClient = {
  async request(
    method: "GET" | "POST" | "PATCH",
    url: string,
    token: string,
    body?: unknown,
  ): Promise<GitHubApiResponse> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let data: unknown = {};
      if (text !== "") {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
      return { status: response.status, data };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown GitHub API error";
      throw new Error(`GitHub API request failed: ${message}`, { cause: error });
    }
  },
};

/**
 * Posts or updates the single CI Failure Pack comment on a pull request.
 *
 * @param options - Repository, PR, token, Markdown body, and optional injected dependencies.
 * @returns Whether a comment was created, updated, skipped, or failed non-fatally.
 */
export async function postOrUpdateComment(options: PostCommentOptions): Promise<PostCommentResult> {
  const logger = options.logger ?? createLogger();
  const input = posterInputSchema.safeParse(options);
  if (!input.success) {
    logger.warn("PR comment input is invalid; comment skipped", {
      recovery: "Check repository, pull request number, and GITHUB_TOKEN inputs.",
    });
    return options.pullRequestNumber === undefined ? "skipped" : "failed";
  }
  if (input.data.pullRequestNumber === undefined) {
    logger.info("PR comment skipped because this run is not a pull request.");
    return "skipped";
  }
  if (input.data.token === undefined) {
    logger.warn("PR comment skipped because GITHUB_TOKEN is unavailable.", {
      recovery: "Provide GITHUB_TOKEN and grant pull-requests: write permission.",
    });
    return "failed";
  }

  const client = options.client ?? defaultClient;
  const issueUrl = `https://api.github.com/repos/${input.data.owner}/${input.data.repository}/issues/${input.data.pullRequestNumber}`;
  try {
    const listResponse = await client.request("GET", `${issueUrl}/comments`, input.data.token);
    if (listResponse.status >= 400) {
      logger.warn("GitHub API could not list PR comments.", {
        status: listResponse.status,
        recovery: "Grant pull-requests: write permission to GITHUB_TOKEN.",
      });
      return "failed";
    }
    const comments = commentsSchema.safeParse(listResponse.data);
    if (!comments.success) {
      logger.warn("GitHub API returned an invalid PR comment response.", {
        recovery: "Retry the workflow or check GitHub API availability.",
      });
      return "failed";
    }
    const existing = comments.data.find(
      (comment) => comment.body?.includes(COMMENT_MARKER) === true,
    );
    const response =
      existing === undefined
        ? await client.request("POST", `${issueUrl}/comments`, input.data.token, {
            body: input.data.body,
          })
        : await client.request(
            "PATCH",
            `https://api.github.com/repos/${input.data.owner}/${input.data.repository}/issues/comments/${existing.id}`,
            input.data.token,
            { body: input.data.body },
          );
    if (response.status >= 400) {
      logger.warn("GitHub API could not write the PR comment.", {
        status: response.status,
        recovery: "Grant pull-requests: write permission to GITHUB_TOKEN.",
      });
      return "failed";
    }
    return existing === undefined ? "created" : "updated";
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown PR comment error";
    logger.warn("PR comment posting failed without stopping the action.", {
      error: message,
      recovery: "Check GITHUB_TOKEN permissions and GitHub API availability.",
    });
    return "failed";
  }
}
