export interface Env {
  FIRMWARE_BUCKET: R2Bucket;
  BUILD_META: KVNamespace;
  ASSETS: Fetcher;
  AI: Ai;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN?: string;
  REPO_URL: string;
}

export interface BuildMetadata {
  status: 'building' | 'success' | 'failed';
  commit: string;
  commitShort: string;
  commitMessage: string;
  buildDate: string;
  buildTimestamp: number;
  version: string;
  firmwareSize?: number;
  buildLog?: string;
  error?: string;
  changelog: ChangelogEntry[];
  summary?: string;
}

export interface ChangelogEntry {
  hash: string;
  hashShort: string;
  author: string;
  date: string;
  message: string;
}

export interface FontFile {
  name: string;       // e.g. "NotoSerif-Regular.ttf"
  path: string;       // relative path in source dir, e.g. "NotoSerif/NotoSerif-Regular.ttf"
  family: string;     // e.g. "NotoSerif"
}

export interface FontTree {
  families: Record<string, FontFile[]>;
  defaultSizes: Record<string, number[]>;
  fetchedAt: string;
}

export interface CustomBuildMetadata {
  buildId: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  email: string;
  createdAt: string;
  completedAt?: string;
  version?: string;
  firmwareSize?: number;
  error?: string;
  replacedFonts: Record<string, string>;  // path -> original filename
  fontLabels?: Record<string, string>;    // family -> custom display label
  fontSizes?: Record<string, number[]>;   // family -> [small, medium, large, xlarge] point sizes
}

export interface BetaBuild {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  firmwareSize: number;
}

export interface GitHubPushEvent {
  ref: string;
  after: string;
  head_commit: {
    id: string;
    message: string;
    author: { name: string };
    timestamp: string;
  };
  commits: Array<{
    id: string;
    message: string;
    author: { name: string };
    timestamp: string;
  }>;
  repository: {
    full_name: string;
    clone_url: string;
  };
}
