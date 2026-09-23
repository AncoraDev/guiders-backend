import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCompanyLeadCaptureNotifyQuery } from './get-company-lead-capture-notify.query';
import { CompanyLeadCaptureNotifySettings } from './company-lead-capture-notify.settings';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  COMPANY_SECRET_CIPHER,
  CompanySecretCipher,
} from '../../domain/company-secret-cipher';
import { LeadCaptureResendApiKey } from '../../domain/value-objects/lead-capture-resend-api-key';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

@QueryHandler(GetCompanyLeadCaptureNotifyQuery)
export class GetCompanyLeadCaptureNotifyQueryHandler
  implements
    IQueryHandler<
      GetCompanyLeadCaptureNotifyQuery,
      CompanyLeadCaptureNotifySettings | null
    >
{
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(COMPANY_SECRET_CIPHER)
    private readonly cipher: CompanySecretCipher,
  ) {}

  async execute(
    query: GetCompanyLeadCaptureNotifyQuery,
  ): Promise<CompanyLeadCaptureNotifySettings | null> {
    if (!Uuid.validate(query.companyId)) {
      return null;
    }
    const found = await this.companyRepository.findById(
      new Uuid(query.companyId),
    );
    if (found.isErr()) {
      return null;
    }
    const company = found.unwrap();
    const plainKey = this.cipher.decrypt(
      company.getLeadCaptureResendApiKeyEncrypted(),
    );
    return {
      email: company.getLeadCaptureNotifyEmail(),
      from: company.getLeadCaptureResendFrom(),
      apiKeyConfigured: !!plainKey,
      apiKeyLast4: LeadCaptureResendApiKey.last4(plainKey),
      apiKey: plainKey || null,
    };
  }
}
