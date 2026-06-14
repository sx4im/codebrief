import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadM0Config } from "./config.js";
import { extractAstSummaries, pickTypeScriptFiles } from "./ast.js";
import { GitHubClient } from "./github.js";
import { evaluateM0Gate } from "./gate.js";
import { runArchitectureAgent } from "./nvidia.js";
import { computeRiskScores } from "./risk.js";
import { validateArchitectureSources } from "./source-validation.js";
import type { M0IngestionResult, M0Result } from "./types.js";

async function main(): Promise<void> {
  const config = loadM0Config();
  const github = new GitHubClient(config.githubToken);

  const repo = await github.getRepo(config.repo.owner, config.repo.name);
  const [readmeText, treeFiles, commits, pullRequests] = await Promise.all([
    github.getReadme(config.repo.owner, config.repo.name),
    github.getTree(config.repo.owner, config.repo.name, repo.defaultBranch),
    github.getRecentCommits(config.repo.owner, config.repo.name, config.limits.commitLimit),
    github.getMergedPullRequests(config.repo.owner, config.repo.name, config.limits.prLimit),
  ]);

  const tsFiles = pickTypeScriptFiles(treeFiles, config.limits.maxTsFiles, config.limits.maxFileBytes);
  const fileContents = [];
  for (const file of tsFiles) {
    const content = await github.getBlobText(config.repo.owner, config.repo.name, file.sha);
    fileContents.push({ path: file.path, content });
  }

  const astFiles = extractAstSummaries(fileContents);
  const riskScores = computeRiskScores(astFiles, commits, treeFiles);
  const ingestion: M0IngestionResult = {
    repo,
    readme: {
      path: "README.md",
      text: readmeText,
      source: {
        type: "readme",
        path: "README.md",
      },
    },
    treeFiles,
    commits,
    pullRequests,
    astFiles,
    riskScores,
  };

  const architectureResult = await runArchitectureAgent(config, ingestion);
  const validation = validateArchitectureSources(architectureResult.output);
  const gateSignals = evaluateM0Gate(architectureResult.output, validation);

  const result: M0Result = {
    generatedAt: new Date().toISOString(),
    ingestion: {
      repo,
      counts: {
        treeFiles: treeFiles.length,
        commits: commits.length,
        pullRequests: pullRequests.length,
        astFiles: astFiles.length,
        riskScores: riskScores.length,
      },
    },
    architecture: architectureResult.output,
    validation,
    gateSignals,
    tokenUsage: architectureResult.tokenUsage,
  };

  await writeArtifact(result, config.repo.owner, config.repo.name);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.gateSignals.passed) {
    process.stderr.write(`M0 gate failed: ${result.gateSignals.failures.join(" ")}\n`);
    process.exitCode = 1;
  }
}

async function writeArtifact(result: M0Result, owner: string, repo: string): Promise<void> {
  const dir = path.join(process.cwd(), "artifacts", "m0");
  await mkdir(dir, { recursive: true });
  const timestamp = result.generatedAt.replace(/[:.]/g, "-");
  await writeFile(
    path.join(dir, `${owner}-${repo}-${timestamp}.json`),
    JSON.stringify(result, null, 2),
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
