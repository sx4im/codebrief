import type { IssueSummary, PullRequestSummary } from "@codebrief/shared";

// Agent prompts must stay well within the model context window. PR/issue bodies and
// review threads are the largest free-text inputs, so they are truncated to keep the
// high-signal fields (title, labels, file paths, a few comments) while dropping bulk.

export function trimPullRequest(pr: PullRequestSummary): PullRequestSummary {
  return {
    ...pr,
    body: pr.body.slice(0, 1_500),
    changedFilePaths: pr.changedFilePaths?.slice(0, 20),
    reviewCommentDetails: pr.reviewCommentDetails?.slice(0, 5).map((comment) => ({ ...comment, body: comment.body.slice(0, 600) })),
    discussionComments: pr.discussionComments?.slice(0, 5).map((comment) => ({ ...comment, body: comment.body.slice(0, 600) })),
  };
}

export function trimIssue(issue: IssueSummary): IssueSummary {
  return { ...issue, body: issue.body.slice(0, 1_200) };
}
