import type { Env, GitHubPushEvent } from './types';

export async function verifyGitHubSignature(
  request: Request,
  secret: string
): Promise<{ valid: boolean; body: string }> {
  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) return { valid: false, body: '' };

  const body = await request.text();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const valid = signature === expected;
  return { valid, body };
}

export function isPushToMaster(event: GitHubPushEvent, branch: string): boolean {
  return event.ref === `refs/heads/${branch}`;
}
