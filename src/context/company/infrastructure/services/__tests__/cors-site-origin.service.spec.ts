import { Test, TestingModule } from '@nestjs/testing';
import { CorsSiteOriginService } from '../cors-site-origin.service';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../../domain/company.repository';
import { ok, err } from '../../../../shared/domain/result';
import { Company } from '../../../domain/company.aggregate';
import { CompanyNotFoundError } from '../../../domain/errors/company.error';

describe('CorsSiteOriginService', () => {
  let service: CorsSiteOriginService;
  let companyRepository: jest.Mocked<Pick<CompanyRepository, 'findByDomain'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorsSiteOriginService,
        {
          provide: COMPANY_REPOSITORY,
          useValue: {
            findByDomain: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CorsSiteOriginService);
    companyRepository = module.get(COMPANY_REPOSITORY);
  });

  describe('isRegisteredSiteOrigin', () => {
    it('debe permitir un origin cuyo host está dado de alta en company_sites', async () => {
      companyRepository.findByDomain.mockResolvedValue(
        ok({} as Company),
      );

      const allowed = await service.isRegisteredSiteOrigin(
        'https://cliente-nuevo.es',
      );

      expect(allowed).toBe(true);
      expect(companyRepository.findByDomain).toHaveBeenCalledWith(
        'cliente-nuevo.es',
      );
    });

    it('debe denegar un origin que no corresponde a ningún sitio', async () => {
      companyRepository.findByDomain.mockResolvedValue(
        err(new CompanyNotFoundError()),
      );

      const allowed = await service.isRegisteredSiteOrigin(
        'https://desconocido.example',
      );

      expect(allowed).toBe(false);
    });

    it('debe denegar un origin inválido sin consultar el repositorio', async () => {
      const allowed = await service.isRegisteredSiteOrigin('no-es-url');

      expect(allowed).toBe(false);
      expect(companyRepository.findByDomain).not.toHaveBeenCalled();
    });

    it('debe denegar si el repositorio falla', async () => {
      companyRepository.findByDomain.mockRejectedValue(new Error('db down'));

      const allowed = await service.isRegisteredSiteOrigin(
        'https://cliente-nuevo.es',
      );

      expect(allowed).toBe(false);
    });
  });
});
