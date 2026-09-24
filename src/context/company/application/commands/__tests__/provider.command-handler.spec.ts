import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompanyNotFoundError } from '../../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../../errors/company-platform.errors';
import {
  ProviderHasClientsError,
  ProviderNotFoundError,
} from '../../errors/provider.errors';
import {
  CreateProviderCommand,
  CreateProviderCommandHandler,
} from '../create-provider.command-handler';
import {
  DeleteProviderCommand,
  DeleteProviderCommandHandler,
} from '../delete-provider.command-handler';
import {
  RegenerateProviderTokenCommand,
  RegenerateProviderTokenCommandHandler,
} from '../regenerate-provider-token.command-handler';
import {
  RenameProviderCommand,
  RenameProviderCommandHandler,
} from '../rename-provider.command-handler';
import { ListCompaniesQuery } from '../../queries/list-companies.query';
import { ListCompaniesQueryHandler } from '../../queries/list-companies.query-handler';

describe('Proveedores de plataforma', () => {
  const providerId = Uuid.random().value;
  const companyId = Uuid.random().value;

  function createHandler() {
    const companies = {
      findByDomain: jest.fn().mockResolvedValue(err(new CompanyNotFoundError())),
      save: jest.fn().mockResolvedValue(okVoid()),
      delete: jest.fn().mockResolvedValue(okVoid()),
    };
    const providers = {
      findByDemoAdminEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({
        id: providerId,
        companyId,
        createdAt: new Date(),
      }),
    };
    const integrationKeys = {
      deleteByCompanyId: jest.fn().mockResolvedValue(undefined),
    };
    const apiKeys = { deleteByCompanyId: jest.fn().mockResolvedValue(undefined) };
    const createKey = {
      execute: jest.fn().mockResolvedValue(
        ok({
          id: Uuid.random().value,
          name: 'LeadCars',
          plainToken: 'gdr_live_token',
          tokenPrefix: 'gdr_live_abcd...',
          environment: 'live',
          createdAt: new Date(),
        }),
      ),
    };
    const publisher = {
      mergeObjectContext: jest.fn((company) => {
        company.commit = jest.fn();
        return company;
      }),
    };
    const instance = new CreateProviderCommandHandler(
      companies as never,
      providers as never,
      integrationKeys as never,
      apiKeys as never,
      createKey as never,
      publisher as never,
    );
    return { instance, companies, providers, integrationKeys, apiKeys, createKey };
  }

  it('crea la empresa, guarda el token y el acceso a la demo', async () => {
    const ctx = createHandler();

    const result = await ctx.instance.execute(
      new CreateProviderCommand(
        'LeadCars',
        'admin@leadcars.local',
        'password1',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toMatchObject({
      id: providerId,
      name: 'LeadCars',
      token: 'gdr_live_token',
      tokenPrefix: 'gdr_live_abcd...',
    });
    expect(ctx.createKey.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LeadCars', environment: 'live' }),
    );
    expect(ctx.providers.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'gdr_live_token',
        demoAdminEmail: 'admin@leadcars.local',
        demoAdminPassword: 'password1',
      }),
    );
    expect(ctx.companies.delete).not.toHaveBeenCalled();
  });

  it('rechaza un nombre vacío', async () => {
    const ctx = createHandler();

    const result = await ctx.instance.execute(
      new CreateProviderCommand('  ', 'admin@leadcars.local', 'password1'),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(InvalidCompanyDataError);
      expect(result.error.message).toContain('obligatorio');
    }
    expect(ctx.companies.save).not.toHaveBeenCalled();
  });

  it('deshace la empresa si la clave no se crea', async () => {
    const ctx = createHandler();
    ctx.createKey.execute.mockResolvedValue(
      err(new InvalidCompanyDataError('clave')),
    );

    const result = await ctx.instance.execute(
      new CreateProviderCommand(
        'LeadCars',
        'admin@leadcars.local',
        'password1',
      ),
    );

    expect(result.isErr()).toBe(true);
    expect(ctx.apiKeys.deleteByCompanyId).toHaveBeenCalled();
    expect(ctx.companies.delete).toHaveBeenCalled();
    expect(ctx.providers.save).not.toHaveBeenCalled();
  });

  it('renombra manteniendo los sitios', async () => {
    const updateCompany = { execute: jest.fn().mockResolvedValue(okVoid()) };
    const instance = new RenameProviderCommandHandler(
      {
        findById: jest.fn().mockResolvedValue({
          id: providerId,
          companyId,
          createdAt: new Date(),
        }),
        findByDemoAdminEmail: jest.fn().mockResolvedValue(null),
        updateAccess: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        findById: jest.fn().mockResolvedValue(
          ok({
            toPrimitives: () => ({
              sites: [
                {
                  id: Uuid.random().value,
                  name: 'LeadCars',
                  canonicalDomain: 'leadcars.provider.internal',
                  domainAliases: [],
                },
              ],
            }),
          }),
        ),
      } as never,
      updateCompany as never,
    );

    const result = await instance.execute(
      new RenameProviderCommand(
        providerId,
        'LeadCars ES',
        'admin@leadcars.local',
        'password1',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(updateCompany.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        companyName: 'LeadCars ES',
      }),
    );
  });

  it('regenerar revoca la clave activa y devuelve otra', async () => {
    const keyId = Uuid.random().value;
    const revokeKey = { execute: jest.fn().mockResolvedValue(okVoid()) };
    const createKey = {
      execute: jest.fn().mockResolvedValue(
        ok({
          plainToken: 'gdr_live_nueva',
          tokenPrefix: 'gdr_live_nuev...',
        }),
      ),
    };
    const providers = {
      findById: jest.fn().mockResolvedValue({
        id: providerId,
        companyId,
        createdAt: new Date(),
      }),
      updateAccess: jest.fn().mockResolvedValue(undefined),
    };
    const instance = new RegenerateProviderTokenCommandHandler(
      providers as never,
      {
        findById: jest.fn().mockResolvedValue(
          ok({
            getCompanyName: () => ({ getValue: () => 'LeadCars' }),
          }),
        ),
      } as never,
      {
        findByCompanyId: jest.fn().mockResolvedValue([
          {
            id: { getValue: () => keyId },
            status: { isActive: () => true },
          },
          {
            id: { getValue: () => Uuid.random().value },
            status: { isActive: () => false },
          },
        ]),
      } as never,
      revokeKey as never,
      createKey as never,
    );

    const result = await instance.execute(
      new RegenerateProviderTokenCommand(providerId),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap().token).toBe('gdr_live_nueva');
    expect(revokeKey.execute).toHaveBeenCalledTimes(1);
    expect(revokeKey.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: keyId, companyId }),
    );
    expect(providers.updateAccess).toHaveBeenCalledWith(providerId, {
      accessToken: 'gdr_live_nueva',
    });
  });

  it('no borra un proveedor que tiene clientes', async () => {
    const deleteCompany = { execute: jest.fn() };
    const providers = { delete: jest.fn() };
    const instance = new DeleteProviderCommandHandler(
      {
        findById: jest.fn().mockResolvedValue({
          id: providerId,
          companyId,
          createdAt: new Date(),
        }),
      } as never,
      { countByProvider: jest.fn().mockResolvedValue(2) } as never,
      deleteCompany as never,
    );

    const result = await instance.execute(new DeleteProviderCommand(providerId));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ProviderHasClientsError);
    }
    expect(deleteCompany.execute).not.toHaveBeenCalled();
    expect(providers.delete).not.toHaveBeenCalled();
  });

  it('borra el proveedor y la empresa si no tiene clientes', async () => {
    const deleteCompany = { execute: jest.fn().mockResolvedValue(okVoid()) };
    const providers = {
      findById: jest.fn().mockResolvedValue({
        id: providerId,
        companyId,
        createdAt: new Date(),
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const instance = new DeleteProviderCommandHandler(
      providers as never,
      { countByProvider: jest.fn().mockResolvedValue(0) } as never,
      deleteCompany as never,
    );

    const result = await instance.execute(new DeleteProviderCommand(providerId));

    expect(result.isOk()).toBe(true);
    expect(deleteCompany.execute).toHaveBeenCalledWith(
      expect.objectContaining({ companyId }),
    );
    expect(providers.delete).toHaveBeenCalledWith(providerId);
  });

  it('responde proveedor no encontrado', async () => {
    const instance = new DeleteProviderCommandHandler(
      { findById: jest.fn().mockResolvedValue(null) } as never,
      { countByProvider: jest.fn() } as never,
      { execute: jest.fn() } as never,
    );

    const result = await instance.execute(new DeleteProviderCommand(providerId));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ProviderNotFoundError);
    }
  });
});

describe('ListCompaniesQueryHandler', () => {
  it('oculta las empresas que son proveedor', async () => {
    const clientId = Uuid.random().value;
    const providerCompanyId = Uuid.random().value;
    const company = (id: string, companyName: string) => ({
      getId: () => ({ getValue: () => id }),
      toPrimitives: () => ({
        id,
        companyName,
        sites: [],
        createdAt: new Date().toISOString(),
      }),
    });
    const handler = new ListCompaniesQueryHandler(
      {
        findAll: jest
          .fn()
          .mockResolvedValue(
            ok([
              company(clientId, 'Autopractik'),
              company(providerCompanyId, 'LeadCars'),
            ]),
          ),
      } as never,
      {
        companyIds: jest.fn().mockResolvedValue([providerCompanyId]),
      } as never,
    );

    const listed = await handler.execute(new ListCompaniesQuery());

    expect(listed.map((item) => item.companyName)).toEqual(['Autopractik']);
  });
});
