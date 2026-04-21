import type { Sandbox } from '@cloudflare/sandbox';

export interface Env {
  SANDBOX: DurableObjectNamespace<Sandbox>;
  FIRMWARE_BUCKET: R2Bucket;
  BUILD_META: KVNamespace;
  ASSETS: Fetcher;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN?: string;
  REPO_URL: string;
  REPO_BRANCH: string;
  BUILD_ENV: string;
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
}

export interface ChangelogEntry {
  hash: string;
  hashShort: string;
  author: string;
  date: string;
  message: string;
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
