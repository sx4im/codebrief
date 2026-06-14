export interface CorpusRepo {
  owner: string;
  name: string;
  category: "typescript" | "python" | "go" | "ruby" | "java" | "mixed";
  repoUrl: string;
}

export const DEFAULT_CORPUS_REPOS: CorpusRepo[] = [
  {
    owner: "shadcn-ui",
    name: "ui",
    category: "typescript",
    repoUrl: "https://github.com/shadcn-ui/ui",
  },
  {
    owner: "django",
    name: "django",
    category: "python",
    repoUrl: "https://github.com/django/django",
  },
  {
    owner: "go-gorm",
    name: "gorm",
    category: "go",
    repoUrl: "https://github.com/go-gorm/gorm",
  },
  {
    owner: "rails",
    name: "rails",
    category: "ruby",
    repoUrl: "https://github.com/rails/rails",
  },
  {
    owner: "supabase",
    name: "supabase",
    category: "mixed",
    repoUrl: "https://github.com/supabase/supabase",
  },
];
