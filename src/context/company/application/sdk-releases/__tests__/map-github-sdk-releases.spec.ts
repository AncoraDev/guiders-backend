import { GithubRelease, mapGithubReleases } from '../map-github-sdk-releases';

describe('mapGithubReleases', () => {
  const zip =
    'https://github.com/AncoraDev/guiders-sdk/releases/download/v2.14.4/guiders-wp-plugin-2.14.4.zip';
  const script =
    'https://github.com/AncoraDev/guiders-sdk/releases/download/v2.14.4/guiders-sdk.min.js';

  function release(overrides: Partial<GithubRelease> = {}): GithubRelease {
    return {
      tag_name: 'v2.14.4',
      body: '= 2.14.4 =\n* Cambio de prueba\n\n---\nAutomated release generated from tag v2.14.4.\n',
      draft: false,
      prerelease: false,
      published_at: '2026-09-20T10:00:00Z',
      assets: [
        { name: 'guiders-wp-plugin-2.14.4.zip', browser_download_url: zip },
        { name: 'guiders-sdk.min.js', browser_download_url: script },
      ],
      ...overrides,
    };
  }

  it('debe ordenar de la más nueva a la más antigua y quitar la v del tag', () => {
    const mapped = mapGithubReleases([
      release({
        tag_name: 'v2.14.2',
        published_at: '2026-09-01T10:00:00Z',
      }),
      release({
        tag_name: 'v2.14.4',
        published_at: '2026-09-20T10:00:00Z',
      }),
      release({
        tag_name: 'v2.14.3',
        published_at: '2026-09-10T10:00:00Z',
      }),
    ]);

    expect(mapped.map((item) => item.version)).toEqual([
      '2.14.4',
      '2.14.3',
      '2.14.2',
    ]);
    expect(mapped[0].wordpressZipUrl).toBe(zip);
    expect(mapped[0].webScriptUrl).toBe(script);
    expect(mapped[1].wordpressZipUrl).toBeNull();
    expect(mapped[1].webScriptUrl).toBeNull();
    expect(mapped[2].wordpressZipUrl).toBeNull();
  });

  it('debe omitir borradores y marcar las previas', () => {
    const mapped = mapGithubReleases([
      release({ tag_name: 'v2.14.5', draft: true }),
      release({
        tag_name: 'v2.15.0-beta.1',
        prerelease: true,
        published_at: '2026-09-24T10:00:00Z',
      }),
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].version).toBe('2.15.0-beta.1');
    expect(mapped[0].prerelease).toBe(true);
  });

  it('debe devolver el ZIP y el script, y limpiar el pie automático de las notas', () => {
    const [item] = mapGithubReleases([release()]);

    expect(item.wordpressZipUrl).toBe(zip);
    expect(item.webScriptUrl).toBe(script);
    expect(item.notes).toBe('= 2.14.4 =\n* Cambio de prueba');
    expect(item.notes).not.toContain('Automated release');
  });

  it('debe dejar el script vacío cuando el release solo trae el ZIP', () => {
    const [item] = mapGithubReleases([
      release({
        assets: [
          { name: 'guiders-wp-plugin-2.14.4.zip', browser_download_url: zip },
        ],
        body: null,
      }),
    ]);

    expect(item.wordpressZipUrl).toBe(zip);
    expect(item.webScriptUrl).toBeNull();
    expect(item.notes).toBe('');
  });

  it('debe colocar al final las versiones sin fecha', () => {
    const mapped = mapGithubReleases([
      release({ tag_name: 'v2.0.0', published_at: null }),
      release({
        tag_name: 'v2.14.4',
        published_at: '2026-09-20T10:00:00Z',
      }),
    ]);

    expect(mapped.map((item) => item.version)).toEqual(['2.14.4', '2.0.0']);
  });
});
