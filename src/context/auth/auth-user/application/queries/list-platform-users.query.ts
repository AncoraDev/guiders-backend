import { IQuery } from '@nestjs/cqrs';

/** Lista todos los usuarios de todas las companies (platform / superadmin) */
export class ListPlatformUsersQuery implements IQuery {}
