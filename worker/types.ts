export interface Env {
  FIRMWARE_BUCKET: R2Bucket;
  BUILD_META: KVNamespace;
  ASSETS: Fetcher;
  AI: Ai;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN?: string;
  WEBHOOK_BASE_URL?: string;
  ALLOW_INSECURE_DEV_WEBHOOKS?: string;
  GITHUB_ACTIONS_REPO?: string;
  GITHUB_ACTIONS_REF?: string;
  // Firmware repo + ref the theme-icon build workflow checks out to run the
  // canonical generate-theme-icons.py / convert_icon.py scripts. Defaults to
  // crosspoint-reader/crosspoint-reader @ feat-sd-themes (the branch that
  // currently holds the scripts); set FIRMWARE_THEME_REF=master once merged.
  FIRMWARE_THEME_REPO?: string;
  FIRMWARE_THEME_REF?: string;
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

export interface FontBuildMetadata {
  buildId: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  uid: string;
  family: string;
  fallbackFamily?: string;
  fallbackFamilies?: string[];
  sizes: number[];
  intervals: string;
  styles: string[];                       // styles uploaded, e.g. ["regular","bold"]
  fallbackStyles?: string[];              // optional fallback family uploads
  outputs?: string[];                     // .cpfont filenames produced
  generatorVersion?: string;              // revision of the local font generator that ran
  log?: string;                           // tail of stderr (glyph/kern stats)
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ThemeBuildMetadata {
  buildId: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  uid: string;
  // Icon keys the user supplied a custom SVG/PNG for (e.g. ["folder","wifi"]).
  // An empty list means "regenerate the standard Lyra icon set unchanged".
  customIcons: string[];
  firmwareRef: string;                    // firmware ref the scripts were run from
  outputs?: string[];                     // .bmp filenames produced
  log?: string;                           // tail of build log
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export type BetaSource =
  | { type: 'upload' }
  | { type: 'github-release'; owner: string; repo: string; tag: string; asset: string };

export interface BetaBuild {
  id: string;
  name: string;
  notes: string;
  version?: string;
  createdAt: string;
  firmwareSize: number;
  firmwareSha256?: string;
  // Absent on legacy entries; treat undefined as { type: 'upload' }.
  source?: BetaSource;
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
