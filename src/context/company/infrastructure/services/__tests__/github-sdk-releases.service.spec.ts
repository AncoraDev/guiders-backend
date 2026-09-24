import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubSdkReleasesService } from '../github-sdk-releases.service';

describe('GithubSdkReleasesService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function service(): GithubSdkReleasesService {
    return new GithubSdkReleasesService({
      get: () => undefined,
    } as unknown as ConfigService);
  }

  it('debe cachear la lista y no volver a pedir GitHub', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          tag_name: 'v2.14.4',
          body: '= 2.14.4 =\n* Nota',
          draft: false,
          prerelease: false,
          published_at: '2026-09-20T10:00:00Z',
          assets: [],
        },
      ],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const releases = service();
    const first = await releases.list();
    const second = await releases.list();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first[0].version).toBe('2.14.4');
  });

  it('debe pedir la página siguiente cuando la primera viene llena', async () => {
    const page = (tag: string) => ({
      tag_name: tag,
      body: '',
      draft: false,
      prerelease: false,
      published_at: '2026-09-20T10:00:00Z',
      assets: [],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          Array.from({ length: 100 }, (_, index) => page(`v1.0.${index}`)),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [page('v2.0.0')],
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mapped = await service().list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    expect(mapped).toHaveLength(101);
  });

  it('debe fallar en español si GitHub no responde', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(service().list()).rejects.toBeInstanceOf(BadGatewayException);
    await expect(service().list()).rejects.toThrow(
      'No se ha podido leer el registro de versiones',
    );
  });
});
