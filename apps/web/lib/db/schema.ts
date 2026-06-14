import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    plan: text("plan").notNull().default("free"),
    createdAt: timestamp("created_at").defaultNow(),
    githubToken: text("github_token"),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    repoUrl: text("repo_url").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    provider: text("provider").default("github"),
    isPrivate: boolean("is_private").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    uniqueIndex("projects_user_repo_unique").on(table.userId, table.repoOwner, table.repoName),
  ],
);

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    config: jsonb("config"),
    createdAt: timestamp("created_at").defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    tokensUsed: integer("tokens_used").default(0),
  },
  (table) => [
    index("analyses_project_id_idx").on(table.projectId),
    index("analyses_created_at_idx").on(table.createdAt),
  ],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    stageName: text("stage_name").notNull(),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    output: jsonb("output"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("pipeline_stages_analysis_id_idx").on(table.analysisId),
    uniqueIndex("pipeline_stages_analysis_stage_unique").on(table.analysisId, table.stageName),
  ],
);

export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "cascade" }).unique(),
    systemNarrative: jsonb("system_narrative"),
    decisions: jsonb("decisions"),
    landmines: jsonb("landmines"),
    assessment: jsonb("assessment"),
    topFindings: jsonb("top_findings"),
    architectureDiagram: jsonb("architecture_diagram"),
    repoStats: jsonb("repo_stats"),
    modelVersions: jsonb("model_versions"),
    flaggedClaims: jsonb("flagged_claims"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("briefs_analysis_id_idx").on(table.analysisId)],
);

export const qaConversations = pgTable(
  "qa_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    messages: jsonb("messages").notNull().default([]),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("qa_conversations_analysis_id_idx").on(table.analysisId)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("artifacts_analysis_id_idx").on(table.analysisId),
    index("artifacts_type_idx").on(table.type),
  ],
);
