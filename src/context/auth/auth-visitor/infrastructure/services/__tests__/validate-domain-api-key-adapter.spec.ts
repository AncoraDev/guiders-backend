import { Test, TestingModule } from '@nestjs/testing';
import { ValidateDomainApiKeyAdapter } from '../validate-domain-api-key-adapter';
import { ApiKeyRepository } from 'src/context/auth/api-key/domain/repository/api-key.repository';
import { ConfigService } from '@nestjs/config';
import { VisitorAccountApiKey } from '../../../domain/models/visitor-account-api-key';
import { ApiKey } from 'src/context/auth/api-key/domain/model/api-key';
import { ApiKeyDomain } from 'src/context/auth/api-key/domain/model/api-key-domain';
import { ApiKeyValue } from 'src/context/auth/api-key/domain/model/api-key-value';
import { ApiKeyCompanyId } from 'src/context/auth/api-key/domain/model/api-key-company-id';
import { ApiKeyKid } from 'src/context/auth/api-key/domain/model/api-key-kid';
import { ApiKeyPrivateKey } from 'src/context/auth/api-key/domain/model/api-key-private-key';
import { ApiKeyPublicKey } from 'src/context/auth/api-key/domain/model/api-key-public-key';

describe('ValidateDomainApiKeyAdapter', () => {
  let adapter: ValidateDomainApiKeyAdapter;
  let apiKeyRepository: jest.Mocked<ApiKeyRepository>;

  beforeEach(async () => {
    const mockApiKeyRepository = {
      getApiKeyByApiKey: jest.fn(),
      save: jest.fn(),
      getApiKeyByDomain: jest.fn(),
      getAllApiKeys: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidateDomainApiKeyAdapter,
        {
          provide: 'API_KEY_REPOSITORY',
          useValue: mockApiKeyRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    adapter = module.get<ValidateDomainApiKeyAdapter>(
      ValidateDomainApiKeyAdapter,
    );
    apiKeyRepository = module.get('API_KEY_REPOSITORY');
  });

  const createMockApiKey = (domain: string): ApiKey => {
    return ApiKey.create({
      domain: new ApiKeyDomain(domain),
      apiKey: new ApiKeyValue('test-api-key'),
      companyId: new ApiKeyCompanyId('test-company-id'),
      kid: new ApiKeyKid('test-kid'),
      privateKey: new ApiKeyPrivateKey('test-private-key'),
      publicKey: new ApiKeyPublicKey('test-public-key'),
    });
  };

  describe('validate', () => {
    it('debe validar correctamente cuando el dominio almacenado y proporcionado no tienen www', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const providedDomain = 'rmotion.es';
      const storedDomain = 'rmotion.es';
      const mockApiKey = createMockApiKey(storedDomain);

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('debe validar correctamente cuando el dominio almacenado no tiene www pero el proporcionado sí', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const providedDomain = 'www.rmotion.es';
      const storedDomain = 'rmotion.es';
      const mockApiKey = createMockApiKey(storedDomain);

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('debe validar correctamente cuando el dominio almacenado tiene www pero el proporcionado no', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const providedDomain = 'rmotion.es';
      const storedDomain = 'www.rmotion.es';
      const mockApiKey = createMockApiKey(storedDomain);

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('debe validar correctamente cuando ambos dominios tienen www', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const providedDomain = 'www.rmotion.es';
      const storedDomain = 'www.rmotion.es';
      const mockApiKey = createMockApiKey(storedDomain);

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('debe devolver false cuando los dominios son diferentes', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const providedDomain = 'different.com';
      const storedDomain = 'rmotion.es';
      const mockApiKey = createMockApiKey(storedDomain);

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('debe devolver false cuando no se encuentra la API key', async () => {
      // Arrange
      const apiKeyValue = new VisitorAccountApiKey('non-existent-key');
      const providedDomain = 'rmotion.es';

      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(null);

      // Act
      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: providedDomain,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('debe validar cuando el dominio proporcionado incluye puerto y el almacenado no', async () => {
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const mockApiKey = createMockApiKey('127.0.0.1');
      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: '127.0.0.1:8083',
      });

      expect(result).toBe(true);
    });

    it('debe validar cuando el dominio almacenado incluye puerto y el proporcionado no', async () => {
      const apiKeyValue = new VisitorAccountApiKey('test-api-key');
      const mockApiKey = createMockApiKey('127.0.0.1:8083');
      apiKeyRepository.getApiKeyByApiKey.mockResolvedValue(mockApiKey);

      const result = await adapter.validate({
        apiKey: apiKeyValue,
        domain: '127.0.0.1',
      });

      expect(result).toBe(true);
    });
  });

  describe('normalizeDomain', () => {
    it('debe eliminar el prefijo www. correctamente', () => {
      // Act & Assert usando reflection para acceder al método privado
      const normalizedDomain = (adapter as any).normalizeDomain(
        'www.rmotion.es',
      );
      expect(normalizedDomain).toBe('rmotion.es');
    });

    it('debe mantener el dominio sin cambios si no tiene www', () => {
      // Act & Assert usando reflection para acceder al método privado
      const normalizedDomain = (adapter as any).normalizeDomain('rmotion.es');
      expect(normalizedDomain).toBe('rmotion.es');
    });

    it('debe eliminar el puerto numérico', () => {
      const normalizedDomain = (adapter as any).normalizeDomain(
        '127.0.0.1:8083',
      );
      expect(normalizedDomain).toBe('127.0.0.1');
    });

    it('debe manejar correctamente dominios con www. en el medio', () => {
      // Act & Assert usando reflection para acceder al método privado
      const normalizedDomain = (adapter as any).normalizeDomain(
        'test.www.domain.com',
      );
      expect(normalizedDomain).toBe('test.www.domain.com');
    });
  });
});
