import "dotenv/config";

export interface M0Config {
  githubToken: string;
  nvidiaApiKey: string;
  models: {
    architecture: string;
    history: string;
    synthesis: string;
    risk: string;
    qa: string;
  };
  repo: {
    owner: string;
    name: string;
  };
  limits: {
    commitLimit: number;
    prLimit: number;
    maxTsFiles: number;
    maxFileBytes: number;
  };
}

function readRequiredEnv(name: string, missing: string[]): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    missing.push(name);
    return "";
  }
  return value.trim();
}

function readRequiredGitHubToken(missing: string[]): string {
  const value = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
  if (!value || value.trim().length === 0) {
    missing.push("GITHUB_TOKEN");
    return "";
  }
  return value.trim();
}

function readOptionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

export function loadM0Config(): M0Config {
  const missing: string[] = [];
  const config: M0Config = {
    githubToken: readRequiredGitHubToken(missing),
    nvidiaApiKey: readRequiredEnv("NVIDIA_API_KEY", missing),
    models: {
      architecture: readRequiredEnv("NVIDIA_ARCHITECTURE_MODEL", missing),
      history: readRequiredEnv("NVIDIA_HISTORY_MODEL", missing),
      synthesis: readRequiredEnv("NVIDIA_SYNTHESIS_MODEL", missing),
      risk: readRequiredEnv("NVIDIA_RISK_MODEL", missing),
      qa: readRequiredEnv("NVIDIA_QA_MODEL", missing),
    },
    repo: {
      owner: process.env.M0_OWNER?.trim() || "supabase",
      name: process.env.M0_REPO?.trim() || "supabase",
    },
    limits: {
      commitLimit: readOptionalInt("M0_COMMIT_LIMIT", 100),
      prLimit: readOptionalInt("M0_PR_LIMIT", 50),
      maxTsFiles: readOptionalInt("M0_MAX_TS_FILES", 80),
      maxFileBytes: readOptionalInt("M0_MAX_FILE_BYTES", 200_000),
    },
  };
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return config;
}
