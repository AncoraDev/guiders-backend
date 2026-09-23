import { UpdateCompanyWidgetConfigDto } from '../dtos/update-company-widget-config.dto';

export class UpdateCompanyWidgetConfigCommand {
  constructor(
    public readonly companyId: string,
    public readonly config: UpdateCompanyWidgetConfigDto,
  ) {}
}
