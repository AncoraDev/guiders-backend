import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../../../domain/company.repository';
import { Company } from '../../../domain/company.aggregate';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Criteria } from 'src/context/shared/domain/criteria';
import { CriteriaConverter } from 'src/context/shared/infrastructure/criteria-converter/criteria-converter';
import { CompanyTypeOrmEntity } from '../entity/company-typeorm.entity';
import {
  CompanyPersistenceError,
  CompanyNotFoundError,
} from '../../../domain/errors/company.error';
import { CompanyMapper } from './company.mapper';
import { domainLookupCandidates } from 'src/context/shared/domain/domain-matching.util';

// Implementación TypeORM del repositorio de Company
@Injectable()
export class CompanyRepositoryTypeOrmImpl implements CompanyRepository {
  constructor(
    @InjectRepository(CompanyTypeOrmEntity)
    private readonly companyRepo: Repository<CompanyTypeOrmEntity>,
  ) {}

  // Guarda una empresa
  async save(company: Company): Promise<Result<void, DomainError>> {
    try {
      const entity = CompanyMapper.toPersistence(company);
      await this.companyRepo.save(entity);
      return okVoid();
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al guardar la empresa: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Busca una empresa por su ID
  async findById(id: Uuid): Promise<Result<Company, DomainError>> {
    try {
      const entity = await this.companyRepo.findOne({
        where: { id: id.getValue() },
        relations: ['sites'],
      });
      if (!entity) {
        return err(new CompanyNotFoundError());
      }
      return ok(CompanyMapper.toDomain(entity));
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al buscar la empresa: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Elimina una empresa por su ID
  async delete(id: Uuid): Promise<Result<void, DomainError>> {
    try {
      await this.companyRepo.delete(id.getValue());
      return okVoid();
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al eliminar la empresa: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Devuelve todas las empresas
  async findAll(): Promise<Result<Company[], DomainError>> {
    try {
      const entities = await this.companyRepo.find({
        relations: ['sites'],
      });
      return ok(entities.map((entity) => CompanyMapper.toDomain(entity)));
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al buscar empresas: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Busca empresas por criterios usando CriteriaConverter
  async match(
    criteria: Criteria<Company>,
  ): Promise<Result<Company[], DomainError>> {
    try {
      const fieldNameMap = {
        id: 'id',
        companyName: 'company_name',
        domain: 'domain',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      };
      const { sql, parameters } = CriteriaConverter.toPostgresSql(
        criteria,
        'companies',
        fieldNameMap,
      );
      const entities = await this.companyRepo
        .createQueryBuilder('companies')
        .where(sql.replace(/^WHERE /, ''))
        .setParameters(parameters)
        .getMany();
      // Usar función flecha para evitar problemas de this
      return ok(entities.map((entity) => CompanyMapper.toDomain(entity)));
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al buscar empresas por criterio: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Actualiza una empresa existente
  async update(company: Company): Promise<Result<void, DomainError>> {
    try {
      const entity = CompanyMapper.toPersistence(company);
      await this.companyRepo.save(entity);
      return okVoid();
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al actualizar la empresa: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Busca una empresa por un criterio único
  async findOne(
    criteria: Criteria<Company>,
  ): Promise<Result<Company, DomainError>> {
    try {
      const fieldNameMap = {
        id: 'id',
        companyName: 'company_name',
        domain: 'domain',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      };
      const { sql, parameters } = CriteriaConverter.toPostgresSql(
        criteria,
        'companies',
        fieldNameMap,
      );
      const entity = await this.companyRepo
        .createQueryBuilder('companies')
        .where(sql.replace(/^WHERE /, ''))
        .setParameters(parameters)
        .getOne();
      if (!entity) {
        return err(new CompanyNotFoundError());
      }
      return ok(CompanyMapper.toDomain(entity));
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al buscar la empresa: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }

  // Busca una empresa por dominio (acepta host con o sin puerto / www)
  async findByDomain(domain: string): Promise<Result<Company, DomainError>> {
    try {
      const candidates = domainLookupCandidates(domain);

      for (const candidate of candidates) {
        const entity = await this.companyRepo
          .createQueryBuilder('companies')
          .leftJoinAndSelect('companies.sites', 'sites')
          .where('sites.domain = :domain', { domain: candidate })
          .getOne();

        if (entity) {
          return ok(CompanyMapper.toDomain(entity));
        }
      }

      return err(new CompanyNotFoundError());
    } catch (error) {
      return err(
        new CompanyPersistenceError(
          'Error al buscar empresa por dominio: ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
    }
  }
}

// Proveedor para el contenedor de dependencias
export const companyRepositoryProvider = {
  provide: COMPANY_REPOSITORY,
  useClass: CompanyRepositoryTypeOrmImpl,
};
