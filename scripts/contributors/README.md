# Contributor collage

From the repository root, run:

```sh
npm run build:contributors
```

Requires Python 3, Pillow (`python3 -m pip install Pillow`), and internet access. Pillow is also used by the screenshot pipeline.

The script fetches every page of GitHub’s contributor list for `crosspoint-reader/crosspoint-reader`, deduplicates accounts, sorts by username, and downloads every avatar. It includes all returned account types, including bots; anonymous commits and people absent from GitHub’s contributor list are not included. This is repository-wide, not limited to release 2.0.

It creates:

- `public/community/contributors.webp`: 2400 × 1600 collage with equal-sized avatars and beige background.
- `public/community/contributors.json`: source, generation time, count, and each contributor’s username, profile, and avatar URL.

The homepage uses the WebP on the left of “Made by people who actually use it.” Both assets should be committed together. Regeneration is manual; visitors do not contact GitHub to load the image. Failed downloads stop generation before replacing existing assets.

If GitHub rate-limits requests, set `GITHUB_TOKEN` or `GH_TOKEN` in your environment. Credentials are sent only to the GitHub API, never to avatar downloads or output files.

Optional overrides:

```sh
npm run build:contributors -- --repo owner/repository --output /tmp/contributors.webp
```

For agents: regenerate with the command above, verify the manifest count and visually inspect the output, then run `npm run test:contributors` and `npm run build`. Keep the 3:2 aspect ratio so the homepage does not crop contributors. Preserve the Octoverse badge beside the collage and unrelated working-tree changes. Do not deploy unless requested.
