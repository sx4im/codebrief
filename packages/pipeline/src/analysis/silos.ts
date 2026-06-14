import type { CommitSummary, RiskFileScore } from "@codebrief/shared";

export interface KnowledgeSilo {
  file: string;
  author: string;
  authorShare: number;
  commits: number;
  authorLastCommitAt: string | null;
  monthsSinceAuthorLastCommit: number | null;
  authorActive: boolean;
}

// PRD Step 2.3: cross-reference the silo owner's recent activity. A silo owned by
// someone who still commits is a concentration risk; a silo owned by someone who
// has gone quiet is a bus-factor risk (the knowledge may have already left).
const ACTIVE_WINDOW_MONTHS = 6;
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export function detectSilos(commits: CommitSummary[], riskScores: RiskFileScore[]): KnowledgeSilo[] {
  const critical = new Set(riskScores.slice(0, Math.max(1, Math.ceil(riskScores.length * 0.2))).map((score) => score.path));

  // Most recent commit per author across the whole repo, and the repo's latest
  // commit as the "now" reference so cached/old datasets stay self-consistent.
  const authorLastCommit = new Map<string, number>();
  let repoLatest = 0;
  for (const commit of commits) {
    const timestamp = Date.parse(commit.date);
    if (Number.isNaN(timestamp)) continue;
    if (timestamp > repoLatest) repoLatest = timestamp;
    const previous = authorLastCommit.get(commit.authorName) ?? 0;
    if (timestamp > previous) authorLastCommit.set(commit.authorName, timestamp);
  }
  const reference = repoLatest || Date.now();

  const fileAuthors = new Map<string, Map<string, number>>();
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!critical.has(file)) continue;
      const authors = fileAuthors.get(file) || new Map<string, number>();
      authors.set(commit.authorName, (authors.get(commit.authorName) || 0) + 1);
      fileAuthors.set(file, authors);
    }
  }

  return [...fileAuthors.entries()]
    .flatMap(([file, authors]) => {
      const total = [...authors.values()].reduce((sum, count) => sum + count, 0);
      const [author = "unknown", commitsForAuthor = 0] = [...authors.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      const authorShare = total ? commitsForAuthor / total : 0;
      if (authorShare <= 0.7) return [];
      const lastTimestamp = authorLastCommit.get(author) ?? null;
      const monthsSinceAuthorLastCommit =
        lastTimestamp === null ? null : Math.round((Math.max(0, reference - lastTimestamp) / MS_PER_MONTH) * 10) / 10;
      const authorActive = monthsSinceAuthorLastCommit === null ? false : monthsSinceAuthorLastCommit <= ACTIVE_WINDOW_MONTHS;
      return [
        {
          file,
          author,
          authorShare,
          commits: total,
          authorLastCommitAt: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
          monthsSinceAuthorLastCommit,
          authorActive,
        },
      ];
    })
    // Surface inactive-owner silos first (highest bus-factor risk), then by concentration.
    .sort((a, b) => {
      if (a.authorActive !== b.authorActive) return a.authorActive ? 1 : -1;
      return b.authorShare - a.authorShare;
    });
}
