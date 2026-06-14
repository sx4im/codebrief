import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getAnalysisStatusForUser, getBriefForUser } from "@/lib/analysis/repository";
import { demoBriefs } from "@/lib/sample-data";

// Live proof of the authenticated brief-viewer data path: seed a real brief into
// Postgres, then read it back through the exact functions the viewer page uses
// (getBriefForUser / getAnalysisStatusForUser, including the user-ownership join
// and Zod re-parse). Skips cleanly when no database is configured.
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    process.stdout.write("brief roundtrip test skipped (DATABASE_URL not set)\n");
    return;
  }
  const source = demoBriefs[0];
  assert.ok(source, "expected at least one demo brief");

  const userId = `roundtrip-${randomUUID()}`;
  const projectId = randomUUID();
  const analysisId = randomUUID();
  const [repoOwner = "owner", repoName = "name"] = source.repoFullName.split("/");
  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    await sql`insert into users (id, email) values (${userId}, ${`${userId}@codebrief.local`})`;
    await sql`
      insert into projects (id, user_id, name, repo_url, repo_owner, repo_name, provider, is_private)
      values (${projectId}, ${userId}, ${source.repoFullName}, ${`https://github.com/${source.repoFullName}`}, ${repoOwner}, ${repoName}, 'github', false)
    `;
    await sql`insert into analyses (id, project_id, status, tokens_used) values (${analysisId}, ${projectId}, 'complete', 1234)`;
    await sql`
      insert into briefs (
        id, analysis_id, system_narrative, decisions, landmines, assessment,
        top_findings, architecture_diagram, repo_stats, model_versions, flagged_claims
      ) values (
        ${randomUUID()}, ${analysisId},
        ${sql.json(source.systemNarrative)}, ${sql.json(source.decisions)}, ${sql.json(source.landmines)},
        ${sql.json(source.assessment)}, ${sql.json(source.topFindings)}, ${sql.json(source.architectureDiagram)},
        ${sql.json(source.repoStats)}, ${sql.json(source.modelVersions)}, ${sql.json(source.flaggedClaims)}
      )
    `;

    // Read back through the viewer's real data access functions.
    const brief = await getBriefForUser(userId, analysisId);
    assert.ok(brief, "getBriefForUser should return the seeded brief");
    assert.equal(brief.repoFullName, source.repoFullName, "repoFullName should round-trip");
    assert.equal(brief.landmines.length, source.landmines.length, "landmine count should round-trip");
    assert.equal(brief.architectureDiagram.nodes.length, source.architectureDiagram.nodes.length, "diagram nodes should round-trip");

    const status = await getAnalysisStatusForUser(userId, analysisId);
    assert.equal(status.status, "complete", "analysis status should be complete");
    assert.equal(status.repoFullName, source.repoFullName, "status repoFullName should match");

    // Ownership isolation: a different user must not see this brief.
    const otherUserBrief = await getBriefForUser(`other-${randomUUID()}`, analysisId);
    assert.equal(otherUserBrief, null, "a different user must not read this brief");

    process.stdout.write(`brief roundtrip test passed (${brief.repoFullName}, ${brief.landmines.length} landmines)\n`);
  } finally {
    await sql`delete from users where id = ${userId}`;
    await sql.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0)) // getDb()'s cached pool has no idle timeout; exit explicitly.
  .catch((e) => {
    process.stderr.write(`brief roundtrip test FAILED: ${(e as Error).message}\n`);
    process.exit(1);
  });
