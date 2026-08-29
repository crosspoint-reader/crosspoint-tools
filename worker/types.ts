// Cloudflare Email Service binding (send-only). Kept as a local interface
// until the installed workers-types ships an official one.
export interface EmailSendBinding {
  send(msg: {
    to: string;
    from: { email: string; name?: string } | string;
    replyTo?: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export interface Env {
  EMAIL: EmailSendBinding;
  // Google Chat incoming-webhook URL for contact form messages (secret)
  CONTACT_CHAT_WEBHOOK?: string;
  FIRMWARE_BUCKET: R2Bucket;
  BUILD_META: KVNamespace;
  ASSETS: Fetcher;
  AI: Ai;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN?: string;
  // Instatus release notification integration. The API key is a Worker secret;
  // page, group, and component IDs are public configuration in wrangler.jsonc.
  INSTATUS_API_KEY?: string;
  INSTATUS_PAGE_ID?: string;
  INSTATUS_X3_GROUP_ID?: string;
  INSTATUS_X4_GROUP_ID?: string;
  INSTATUS_X4_PRO_GROUP_ID?: string;
  INSTATUS_X4C_GROUP_ID?: string;
  INSTATUS_STICKY_GROUP_ID?: string;
  INSTATUS_M5PAPER_GROUP_ID?: string;
  INSTATUS_LILYGO_GROUP_ID?: string;
  INSTATUS_PAPERMONO_GROUP_ID?: string;
  INSTATUS_X3_STABLE_COMPONENT_ID?: string;
  INSTATUS_X4_STABLE_COMPONENT_ID?: string;
  INSTATUS_X3_NIGHTLY_COMPONENT_ID?: string;
  INSTATUS_X4_NIGHTLY_COMPONENT_ID?: string;
  INSTATUS_X3_BETA_COMPONENT_ID?: string;
  INSTATUS_X4_BETA_COMPONENT_ID?: string;
  INSTATUS_X4_PRO_BETA_COMPONENT_ID?: string;
  INSTATUS_X4C_BETA_COMPONENT_ID?: string;
  INSTATUS_STICKY_BETA_COMPONENT_ID?: string;
  INSTATUS_M5PAPER_BETA_COMPONENT_ID?: string;
  INSTATUS_LILYGO_BETA_COMPONENT_ID?: string;
  INSTATUS_PAPERMONO_BETA_COMPONENT_ID?: string;
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

// Xteink models that share the release/nightly/stock/beta catalog and can have
// their firmware options hidden per-device from the admin panel.
export type FirmwareDevice = 'x3' | 'x4';

export interface BetaBuild {
  id: string;
  title: string;
  version: string;
  // Compatibility alias for older clients. New code should use title.
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  binaryUpdatedAt: string;
  firmwareSize: number;
  firmwareSha256?: string;
  // Absent on legacy entries; treat undefined as { type: 'upload' }.
  source?: BetaSource;
  // Devices on which this beta is hidden in the web flasher. Absent/empty means
  // shown on every device (backwards-compatible with legacy entries).
  hiddenDevices?: FirmwareDevice[];
}

// Per-device visibility for the fixed "official release" firmware buttons
// (CrossPoint stable, Nightly, Stock English, Stock Chinese). Keyed by release
// key; the value lists the devices on which that button is hidden. A missing
// key or absent device means the button is shown.
export interface ReleaseVisibility {
  hidden: Record<string, FirmwareDevice[]>;
}

export interface Accessory {
  id: string;
  title: string;
  // Empty string = no purchase link yet; rendered as a "coming soon" card.
  link: string;
  // Optional short blurb shown under the title on shop cards.
  description?: string;
  // Marks the item "coming soon" even when a link is set; the link then
  // renders as an "Explore Device" CTA instead of "Buy Now".
  comingSoon?: boolean;
  // Which shop page the item appears on. Absent on legacy entries; treat
  // undefined as 'accessory'.
  category?: 'device' | 'accessory';
  createdAt: string;
  // Set when an image has been uploaded; bumped on replacement so the
  // frontend can cache-bust /api/accessories/{id}/image?v={imageUpdatedAt}.
  imageUpdatedAt?: string;
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
