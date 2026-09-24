export interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

export interface GithubRelease {
  tag_name?: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: GithubReleaseAsset[];
}

export interface SdkReleaseView {
  version: string;
  publishedAt: string | null;
  prerelease: boolean;
  notes: string;
  wordpressZipUrl: string | null;
  webScriptUrl: string | null;
}

const ZIP_ASSET = /guiders-wp-plugin.*\.zip$/i;
const SCRIPT_ASSET = /(^|\/)guiders-sdk\.min\.js$/i;
const AUTOMATED_FOOTER = /\n---\nAutomated release generated from tag[\s\S]*$/;

/**
 * Convierte los releases de GitHub en la ficha que ve Admin.
 * Omite borradores, ordena del más reciente al más antiguo
 * y deja las descargas solo en la última versión.
 */
export function mapGithubReleases(releases: GithubRelease[]): SdkReleaseView[] {
  const mapped = releases
    .filter((release) => !release.draft)
    .map((release) => ({
      version: versionFromTag(release.tag_name),
      publishedAt: release.published_at ?? null,
      prerelease: release.prerelease === true,
      notes: notesFromBody(release.body),
      wordpressZipUrl: assetUrl(release.assets, ZIP_ASSET),
      webScriptUrl: assetUrl(release.assets, SCRIPT_ASSET),
    }))
    .sort((left, right) =>
      publishedAtDesc(left.publishedAt, right.publishedAt),
    );

  return mapped.map((item, index) =>
    index === 0
      ? item
      : { ...item, wordpressZipUrl: null, webScriptUrl: null },
  );
}

function versionFromTag(tagName: string | undefined): string {
  const tag = (tagName ?? '').trim();
  return tag.replace(/^v/i, '') || tag;
}

function notesFromBody(body: string | null | undefined): string {
  return (body ?? '').replace(AUTOMATED_FOOTER, '').trim();
}

function assetUrl(
  assets: GithubReleaseAsset[] | undefined,
  pattern: RegExp,
): string | null {
  const match = (assets ?? []).find((asset) => {
    const name = asset.name ?? '';
    return pattern.test(name) && typeof asset.browser_download_url === 'string';
  });
  return match?.browser_download_url ?? null;
}

function publishedAtDesc(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  const leftRank = Number.isNaN(leftTime) ? 0 : leftTime;
  const rightRank = Number.isNaN(rightTime) ? 0 : rightTime;
  return rightRank - leftRank;
}
