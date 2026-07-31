import { IQuery } from '@nestjs/cqrs';

/** Lista todas las companies (uso platform / superadmin) */
export class ListCompaniesQuery implements IQuery {}
