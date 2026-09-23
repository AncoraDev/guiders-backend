import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyWidgetConfigCommand } from './update-company-widget-config.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  CompanyWidgetConfig,
  WidgetConfigPrimitives,
} from '../../domain/value-objects/company-widget-config';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';

@CommandHandler(UpdateCompanyWidgetConfigCommand)
export class UpdateCompanyWidgetConfigCommandHandler
  implements ICommandHandler<UpdateCompanyWidgetConfigCommand>
{
  private readonly logger = new Logger(
    UpdateCompanyWidgetConfigCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async execute(
    command: UpdateCompanyWidgetConfigCommand,
  ): Promise<Result<WidgetConfigPrimitives, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    let config: CompanyWidgetConfig;
    try {
      config = CompanyWidgetConfig.fromInput({
        ...found.unwrap().getWidgetConfig(),
        ...command.config,
        position: {
          ...found.unwrap().getWidgetConfig().position,
          ...(command.config.position ?? {}),
        },
      });
    } catch (error) {
      return err(
        new InvalidCompanyDataError(
          error instanceof Error
            ? error.message
            : 'Configuración del widget no válida',
        ),
      );
    }

    const updated = found.unwrap().updateWidgetConfig(config.getValue());
    const saveResult = await this.companyRepository.updateWidgetConfig(
      updated.getId(),
      updated.getWidgetConfig(),
    );
    if (saveResult.isErr()) {
      this.logger.error(
        `Error guardando widget config de company ${command.companyId}: ${saveResult.error.message}`,
      );
      return err(saveResult.error);
    }

    return ok(updated.getWidgetConfig());
  }
}
