import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthUserService } from './services/auth-user.service';
import { UserAccountService } from './services/user-account.service';
import { UserAccountEntity } from './user-account.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRegisterUseCase } from '../application/usecases/user-register.usecase';
import { USER_ACCOUNT_REPOSITORY } from '../domain/user-account.repository';
import { BcryptHashService } from './services/bcrypt-hash.service';
import { TokenService } from './services/token.service';
import { UserLoginUseCase } from '../application/usecases/user-login.usecase';
import { UserAccountMapper } from './user-account-mapper';
import { USER_PASSWORD_HASHER } from '../application/service/user-password-hasher';
import { USER_TOKEN_SERVICE } from '../application/service/user-token-service';
import { RefreshTokenUseCase } from '../application/usecases/refresh-token.usecase';
import { TokenVerifyService } from 'src/context/shared/infrastructure/token-verify.service';
import { HttpModule } from '@nestjs/axios';
import { FindOneUserByIdQueryHandler } from '../application/read/find-one-user-by-id.query-handler';
import { InviteTypeOrmEntity } from './persistence/entity/invite-typeorm.entity';
import { InviteRepositoryImpl } from './persistence/impl/invite.repository.impl';
import { INVITE_REPOSITORY } from '../domain/invite.repository';
import { CreateInviteCommandHandler } from '../application/commands/create-invite-command.handler';
import { CreateAdminOnCompanyCreatedWithAdminEventHandler } from '../application/events/create-admin-on-company-created-with-admin-event.handler';
import { EMAIL_SENDER_SERVICE } from 'src/context/shared/domain/email/email-sender.service';
import { CqrsModule } from '@nestjs/cqrs';
import { MockEmailSenderService } from 'src/context/shared/infrastructure/email/mock-email-sender.service';
import { EtherealEmailSenderService } from 'src/context/shared/infrastructure/email/ethereal-email-sender.service';
import { ResendEmailSenderService } from 'src/context/shared/infrastructure/email/resend-email-sender.service';
import { AcceptInviteCommandHandler } from '../application/commands/accept-invite-command.handler';
import { AuthUserController } from './controllers/auth-user.controller';
import { PlatformUsersController } from './controllers/platform-users.controller';
import { FindUsersByCompanyIdQueryHandler } from '../application/queries/find-users-by-company-id.query-handler';
import { ListPlatformUsersQueryHandler } from '../application/queries/list-platform-users.query-handler';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { CreateInviteOnUserAccountCreatedEventHandler } from '../application/events/create-invite-on-user-account-created-event.handler';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LinkUserWithKeycloakCommandHandler } from '../application/commands/link-user-with-keycloak-command.handler';
import { FindUserByKeycloakIdQueryHandler } from '../application/queries/find-user-by-keycloak-id.query-handler';
import { SyncUserWithKeycloakCommandHandler } from '../application/commands/sync-user-with-keycloak-command.handler';
import { KeycloakRoleMapperService } from '../application/services/keycloak-role-mapper.service';
import { VerifyRoleMappingQueryHandler } from '../application/queries/verify-role-mapping.query-handler';
import { FindUserByIdQueryHandler } from '../application/queries/find-user-by-id.query-handler';
import { UpdateUserAvatarCommandHandler } from '../application/commands/update-user-avatar-command.handler';
import { UploadModule } from 'src/context/shared/infrastructure/modules/upload.module';
import { UpdateCommercialAvatarOnUserAvatarUpdatedEventHandler } from '../application/events/update-commercial-avatar-on-user-avatar-updated-event.handler';
import { UpdateCommercialNameOnUserNameUpdatedEventHandler } from '../application/events/update-commercial-name-on-user-name-updated-event.handler';
import { CommercialModule } from 'src/context/commercial/commercial.module';
import { BffSessionAuthService } from 'src/context/shared/infrastructure/services/bff-session-auth.service';
import { KeycloakAdminService } from './services/keycloak-admin.service';
import { CreateCompanyUserCommandHandler } from '../application/commands/create-company-user-command.handler';
import { UpdateCompanyUserCommandHandler } from '../application/commands/update-company-user-command.handler';
import { SetCompanyUserActiveCommandHandler } from '../application/commands/set-company-user-active-command.handler';
import { DeleteCompanyUserCommandHandler } from '../application/commands/delete-company-user-command.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAccountEntity, InviteTypeOrmEntity]),
    HttpModule,
    CqrsModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    UploadModule,
    forwardRef(() => CommercialModule), // forwardRef para evitar dependencia circular
  ],
  controllers: [AuthUserController, PlatformUsersController],
  providers: [
    JwtStrategy,
    { provide: USER_ACCOUNT_REPOSITORY, useClass: UserAccountService },
    { provide: USER_PASSWORD_HASHER, useClass: BcryptHashService },
    { provide: USER_TOKEN_SERVICE, useClass: TokenService },
    { provide: INVITE_REPOSITORY, useClass: InviteRepositoryImpl },
    // Email service configurado por entorno:
    // - test: MockEmailSenderService (no envía emails, solo log)
    // - development: EtherealEmailSenderService (genera URLs de preview)
    // - staging/production: ResendEmailSenderService (emails reales via API)
    {
      provide: EMAIL_SENDER_SERVICE,
      useFactory: (configService: ConfigService) => {
        const env = configService.get<string>('NODE_ENV') || 'development';

        if (env === 'test') {
          return new MockEmailSenderService();
        }

        if (env === 'production' || env === 'staging') {
          return new ResendEmailSenderService(configService);
        }

        // development: usa Ethereal para preview de emails
        return new EtherealEmailSenderService();
      },
      inject: [ConfigService],
    },
    AuthUserService,
    UserAccountMapper,
    UserRegisterUseCase,
    UserLoginUseCase,
    RefreshTokenUseCase,
    TokenVerifyService,
    KeycloakAdminService,
    // handlers
    FindOneUserByIdQueryHandler,
    FindUserByIdQueryHandler,
    CreateInviteCommandHandler,
    CreateAdminOnCompanyCreatedWithAdminEventHandler,
    CreateInviteOnUserAccountCreatedEventHandler,
    AcceptInviteCommandHandler,
    FindUsersByCompanyIdQueryHandler,
    ListPlatformUsersQueryHandler,
    LinkUserWithKeycloakCommandHandler,
    FindUserByKeycloakIdQueryHandler,
    SyncUserWithKeycloakCommandHandler,
    KeycloakRoleMapperService,
    VerifyRoleMappingQueryHandler,
    UpdateUserAvatarCommandHandler,
    UpdateCommercialAvatarOnUserAvatarUpdatedEventHandler,
    UpdateCommercialNameOnUserNameUpdatedEventHandler,
    CreateCompanyUserCommandHandler,
    UpdateCompanyUserCommandHandler,
    SetCompanyUserActiveCommandHandler,
    DeleteCompanyUserCommandHandler,
    // Servicios necesarios para DualAuthGuard
    BffSessionAuthService,
    DualAuthGuard,
    RolesGuard,
  ],
  exports: [USER_ACCOUNT_REPOSITORY, EMAIL_SENDER_SERVICE, PassportModule],
})
export class AuthUserModule {}
