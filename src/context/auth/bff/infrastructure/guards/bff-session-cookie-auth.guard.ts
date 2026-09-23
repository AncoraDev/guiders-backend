import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { extractAuditContext } from 'src/context/shared/utils/audit-context';
import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
} from '../../domain/services/bff-session.service';
import {
  BffSessionCorruptedError,
  BffSessionNotFoundError,
  BffSessionServiceUnavailableError,
} from '../../domain/errors/bff-session.errors';
import {
  JwtCookieAuthGuard,
  detectTokenKind,
} from 'src/context/shared/infrastructure/guards/jwt-cookie-auth.guard';

type TokenKind = 'jwt' | 'opaque' | 'missing' | 'invalid';

interface GuardUser {
  sub: string;
  companyId: string;
  roles: string[];
  email?: string;
}

@Injectable()
export class BffSessionCookieAuthGuard extends JwtCookieAuthGuard {
  private readonly bffLogger = new Logger(BffSessionCookieAuthGuard.name);

  constructor(
    @Inject(BFF_SESSION_SERVICE)
    private readonly bffSessionService: IBffSessionService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request?.cookies?.['access_token'];
    const tokenKind = this.detectTokenKindLocal(token);

    if (tokenKind === 'opaque') {
      return this.handleOpaqueSession(token as string, request);
    }

    return super.canActivate(context);
  }

  private detectTokenKindLocal(token: string | undefined): TokenKind {
    return detectTokenKind(token);
  }

  private async handleOpaqueSession(
    sessionId: string,
    request: Request,
  ): Promise<boolean> {
    const auditContext = extractAuditContext(request);
    const result = await this.bffSessionService.getSession(sessionId);

    if (result.isOk()) {
      const user: GuardUser = {
        sub: result.unwrap().userId,
        companyId: result.unwrap().companyId,
        roles: result.unwrap().roles,
      };
      this.setRequestUser(request, user);
      return true;
    }

    if (result.isErr()) {
      const err = result.error;
      this.handleSessionError(err, auditContext);
    }

    return false;
  }

  private handleSessionError(
    err: unknown,
    auditContext: ReturnType<typeof extractAuditContext>,
  ): never {
    if (err instanceof BffSessionNotFoundError) {
      this.bffLogger.warn(
        `BFF session not found: origin=${auditContext.origin} ip=${auditContext.ipAddress}`,
      );
      throw new UnauthorizedException('BFF session invalid or expired');
    }

    if (err instanceof BffSessionServiceUnavailableError) {
      this.bffLogger.error(
        `BFF service unavailable: origin=${auditContext.origin} ip=${auditContext.ipAddress}`,
      );
      throw new ServiceUnavailableException('BFF session service unavailable');
    }

    if (err instanceof BffSessionCorruptedError) {
      this.bffLogger.error(
        `BFF session data corrupted: origin=${auditContext.origin} ip=${auditContext.ipAddress}`,
      );
      throw new ServiceUnavailableException('BFF session data corrupted');
    }

    this.bffLogger.warn(
      `BFF session lookup failed (unknown error): ${err instanceof Error ? err.name : 'unknown'} origin=${auditContext.origin}`,
    );
    throw new UnauthorizedException('BFF session lookup failed');
  }

  private setRequestUser(request: Request, user: GuardUser): void {
    (request as unknown as { user: GuardUser }).user = user;
  }
}
