import type { CommentVerbosity } from "@ci-failure-pack/shared";

import {
  renderBriefComment,
  renderFullComment,
  renderStandardComment,
  type CommentContext,
} from "./verbosity.js";

/**
 * Formats a PR failure comment at the configured verbosity.
 *
 * @param context - Captured failure data to summarize.
 * @param verbosity - Brief, standard, or full output level.
 * @returns GitHub-flavored Markdown for the PR comment.
 */
export function formatFailureComment(
  context: CommentContext,
  verbosity: CommentVerbosity = "brief",
): string {
  if (verbosity === "full") {
    return renderFullComment(context);
  }
  if (verbosity === "standard") {
    return renderStandardComment(context);
  }
  return renderBriefComment(context);
}
