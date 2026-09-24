import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GithubRelease,
  SdkReleaseView,
  mapGithubReleases,
} from '../../application/sdk-releases/map-github-sdk-releases';

const RELEASES_URL =
  'https://api.github.com/repos/AncoraDev/guiders-sdk/releases';
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const CACHE_MS = 10 * 60 * 1000;

/**
 * Lee el registro de versiones del SDK en GitHub.
 * Una caché corta evita agotar el límite de la API en cada visita a Admin.
 */
@Injectable()
export class GithubSdkReleasesService {
  private cache: { at: number; data: SdkReleaseView[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  async list(): Promise<SdkReleaseView[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.data;
    }

    const pages: GithubRelease[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = await this.fetchPage(page);
      pages.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    const data = mapGithubReleases(pages);
    this.cache = { at: Date.now(), data };
    return data;
  }

  private async fetchPage(page: number): Promise<GithubRelease[]> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'guiders-backend',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = this.config.get<string>('GITHUB_TOKEN')?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(
        `${RELEASES_URL}?per_page=${PAGE_SIZE}&page=${page}`,
        { headers },
      );
    } catch {
      throw new BadGatewayException(
        'No se ha podido leer el registro de versiones',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'No se ha podido leer el registro de versiones',
      );
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new BadGatewayException(
        'No se ha podido leer el registro de versiones',
      );
    }
    return body as GithubRelease[];
  }
}
