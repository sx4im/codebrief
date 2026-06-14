import type { CommitSummary } from "@codebrief/shared";

export interface CouplingCluster {
  files: [string, string];
  coChanges: number;
  probability: number;
}

export function detectCoupling(commits: CommitSummary[]): CouplingCluster[] {
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  for (const commit of commits) {
    const files = [...new Set(commit.files)].sort();
    for (const file of files) fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    for (let i = 0; i < files.length; i += 1) {
      for (let j = i + 1; j < files.length; j += 1) {
        pairCounts.set(`${files[i]}\u0000${files[j]}`, (pairCounts.get(`${files[i]}\u0000${files[j]}`) || 0) + 1);
      }
    }
  }
  return [...pairCounts.entries()]
    .map(([key, coChanges]) => {
      const [a = "", b = ""] = key.split("\u0000");
      const either = (fileCounts.get(a) || 0) + (fileCounts.get(b) || 0) - coChanges;
      return { files: [a, b] as [string, string], coChanges, probability: either ? coChanges / either : 0 };
    })
    .filter((cluster) => cluster.coChanges >= 5 && cluster.probability > 0.5)
    .sort((a, b) => b.probability - a.probability);
}

