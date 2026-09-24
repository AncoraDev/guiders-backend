import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompanyNotFoundError } from '../../../domain/errors/company.error';
import { DeletePlatformCompanyCommand } from '../delete-platform-company.command';
import { DeletePlatformCompanyCommandHandler } from '../delete-platform-company.command-handler';

describe('DeletePlatformCompanyCommandHandler', () => {
  const companyId = Uuid.random().value;

  function handler(overrides?: {
    findById?: jest.Mock;
    keycloakId?: { isPresent: () => boolean; get?: () => { value: string } };
  }) {
    const userId = Uuid.random().value;
    const keycloakUserId = Uuid.random().value;
    const companies = {
      findById: overrides?.findById ?? jest.fn().mockResolvedValue(ok({})),
      delete: jest.fn().mockResolvedValue(okVoid()),
    };
    const users = {
      findByCompanyId: jest.fn().mockResolvedValue([
        {
          id: { getValue: () => userId },
          keycloakId: overrides?.keycloakId ?? {
            isPresent: () => true,
            get: () => ({ value: keycloakUserId }),
          },
        },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const keycloak = { deleteUser: jest.fn().mockResolvedValue(okVoid()) };
    const commercialLinks = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    const integrationKeys = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    const providerLinks = {
      deleteByChild: jest.fn().mockResolvedValue(undefined),
      deleteByProvider: jest.fn().mockResolvedValue(undefined),
    };
    const apiKeys = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    const instance = new DeletePlatformCompanyCommandHandler(
      companies as never,
      users as never,
      keycloak as never,
      commercialLinks as never,
      integrationKeys as never,
      providerLinks as never,
      apiKeys as never,
    );
    return {
      instance,
      companies,
      users,
      keycloak,
      commercialLinks,
      integrationKeys,
      providerLinks,
      apiKeys,
      userId,
      keycloakUserId,
    };
  }

  it('borra usuarios de Keycloak, claves, vínculos y la empresa', async () => {
    const ctx = handler();

    const result = await ctx.instance.execute(
      new DeletePlatformCompanyCommand(companyId),
    );

    expect(result.isOk()).toBe(true);
    expect(ctx.keycloak.deleteUser).toHaveBeenCalledWith(ctx.keycloakUserId);
    expect(ctx.users.delete).toHaveBeenCalledWith(ctx.userId);
    expect(ctx.commercialLinks.deleteByCompanyId).toHaveBeenCalledWith(
      companyId,
    );
    expect(ctx.integrationKeys.deleteByCompanyId).toHaveBeenCalledWith(
      companyId,
    );
    expect(ctx.providerLinks.deleteByChild).toHaveBeenCalledWith(companyId);
    expect(ctx.providerLinks.deleteByProvider).toHaveBeenCalledWith(companyId);
    expect(ctx.apiKeys.deleteByCompanyId).toHaveBeenCalledWith(companyId);
    expect(ctx.companies.delete).toHaveBeenCalled();
  });

  it('no borra nada si la empresa no existe', async () => {
    const ctx = handler({
      findById: jest.fn().mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: new CompanyNotFoundError(),
      }),
    });

    const result = await ctx.instance.execute(
      new DeletePlatformCompanyCommand(companyId),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(CompanyNotFoundError);
    expect(ctx.users.delete).not.toHaveBeenCalled();
    expect(ctx.companies.delete).not.toHaveBeenCalled();
  });
});
