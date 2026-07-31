import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

export class KeycloakAdminError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakUser {
  id: string;
  email?: string;
  username?: string;
  enabled?: boolean;
}

/**
 * Cliente Admin API de Keycloak (patrón de tools/cli.ts).
 * Env: KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  /** backend role → posibles nombres de realm role en Keycloak */
  private readonly backendToKcRoles: Record<string, string[]> = {
    admin: ['administrator', 'admin'],
    commercial: ['commercial'],
    supervisor: ['supervisor'],
  };

  constructor(private readonly config: ConfigService) {}

  private get keycloakUrl(): string {
    return this.config.get<string>('KEYCLOAK_URL') ?? 'http://localhost:8080';
  }

  private get realm(): string {
    return this.config.get<string>('KEYCLOAK_REALM') ?? 'guiders';
  }

  private get adminUser(): string {
    return (
      this.config.get<string>('KEYCLOAK_ADMIN_USERNAME') ??
      this.config.get<string>('KEYCLOAK_ADMIN') ??
      'admin'
    );
  }

  private get adminPass(): string {
    return this.config.get<string>('KEYCLOAK_ADMIN_PASSWORD') ?? 'admin123';
  }

  private get adminBase(): string {
    return `${this.keycloakUrl}/admin/realms/${this.realm}`;
  }

  async getAdminToken(): Promise<Result<string, DomainError>> {
    try {
      const res = await fetch(
        `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: 'admin-cli',
            username: this.adminUser,
            password: this.adminPass,
          }),
        },
      );
      if (!res.ok) {
        return err(
          new KeycloakAdminError(
            `Token admin Keycloak falló: ${res.status} ${await res.text()}`,
          ),
        );
      }
      const data = (await res.json()) as { access_token: string };
      return ok(data.access_token);
    } catch (e) {
      this.logger.error('Error obteniendo token admin Keycloak', e);
      return err(
        new KeycloakAdminError('No se pudo autenticar con Keycloak Admin'),
      );
    }
  }

  async findByEmail(
    email: string,
  ): Promise<Result<KeycloakUser | null, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const res = await fetch(
        `${this.adminBase}/users?email=${encodeURIComponent(email)}&exact=true`,
        { headers: this.headers(token) },
      );
      if (!res.ok) {
        return err(
          new KeycloakAdminError(
            `Búsqueda Keycloak falló: ${res.status} ${await res.text()}`,
          ),
        );
      }
      const users = (await res.json()) as KeycloakUser[];
      return ok(users[0] ?? null);
    } catch (e) {
      this.logger.error('Error buscando usuario en Keycloak', e);
      return err(new KeycloakAdminError('Error buscando usuario en Keycloak'));
    }
  }

  /**
   * Crea usuario en Keycloak con contraseña temporal.
   * No envía email: el operador entrega las credenciales y Keycloak
   * exige UPDATE_PASSWORD en el primer login.
   */
  async createUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword: string;
    phone?: string;
    enabled?: boolean;
  }): Promise<Result<string, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    const firstName = params.firstName.trim();
    const lastName = params.lastName.trim();
    const phone = params.phone?.trim();

    const attributes: Record<string, string[]> | undefined = phone
      ? { phoneNumber: [phone], phone: [phone] }
      : undefined;

    try {
      const res = await fetch(`${this.adminBase}/users`, {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({
          username: params.email,
          email: params.email,
          firstName,
          lastName,
          enabled: params.enabled ?? true,
          emailVerified: true,
          requiredActions: ['UPDATE_PASSWORD'],
          ...(attributes ? { attributes } : {}),
        }),
      });

      if (!res.ok) {
        return err(
          new KeycloakAdminError(
            `Error creando usuario en Keycloak: ${res.status} ${await res.text()}`,
          ),
        );
      }

      const location = res.headers.get('location') ?? '';
      const keycloakId = location.split('/').pop() ?? '';
      if (!keycloakId) {
        return err(
          new KeycloakAdminError(
            'No se pudo obtener el ID del usuario creado en Keycloak',
          ),
        );
      }

      const pwd = await this.setTemporaryPassword(
        keycloakId,
        params.temporaryPassword,
        token,
      );
      if (pwd.isErr()) {
        await this.deleteUser(keycloakId);
        return err(pwd.error);
      }

      return ok(keycloakId);
    } catch (e) {
      this.logger.error('Error creando usuario en Keycloak', e);
      return err(new KeycloakAdminError('Error creando usuario en Keycloak'));
    }
  }

  /**
   * Establece contraseña temporal (Keycloak pedirá cambiarla en el login).
   */
  async setTemporaryPassword(
    keycloakId: string,
    password: string,
    existingToken?: string,
  ): Promise<Result<void, DomainError>> {
    let token = existingToken;
    if (!token) {
      const tokenResult = await this.getAdminToken();
      if (tokenResult.isErr()) return err(tokenResult.error);
      token = tokenResult.unwrap();
    }

    try {
      const res = await fetch(
        `${this.adminBase}/users/${keycloakId}/reset-password`,
        {
          method: 'PUT',
          headers: this.headers(token),
          body: JSON.stringify({
            type: 'password',
            value: password,
            temporary: true,
          }),
        },
      );
      if (!res.ok) {
        return err(
          new KeycloakAdminError(
            `Error asignando contraseña temporal: ${res.status} ${await res.text()}`,
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      this.logger.error('Error setTemporaryPassword Keycloak', e);
      return err(
        new KeycloakAdminError('Error asignando contraseña temporal en Keycloak'),
      );
    }
  }

  /** Envía email de Keycloak para UPDATE_PASSWORD */
  async sendUpdatePasswordEmail(
    keycloakId: string,
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const clientId =
        this.config.get<string>('OIDC_CONSOLE_CLIENT_ID') ?? 'console';
      const res = await fetch(
        `${this.adminBase}/users/${keycloakId}/execute-actions-email?client_id=${encodeURIComponent(clientId)}`,
        {
          method: 'PUT',
          headers: this.headers(token),
          body: JSON.stringify(['UPDATE_PASSWORD']),
        },
      );
      if (!res.ok) {
        return err(
          new KeycloakAdminError(
            `Error enviando email de contraseña: ${res.status} ${await res.text()}`,
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      this.logger.error('Error execute-actions-email', e);
      return err(
        new KeycloakAdminError('No se pudo enviar el email de contraseña'),
      );
    }
  }

  async setEnabled(
    keycloakId: string,
    enabled: boolean,
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const getRes = await fetch(`${this.adminBase}/users/${keycloakId}`, {
        headers: this.headers(token),
      });
      if (!getRes.ok) {
        return err(
          new KeycloakAdminError(
            `Usuario Keycloak no encontrado: ${getRes.status}`,
          ),
        );
      }
      const user = (await getRes.json()) as Record<string, unknown>;
      const putRes = await fetch(`${this.adminBase}/users/${keycloakId}`, {
        method: 'PUT',
        headers: this.headers(token),
        body: JSON.stringify({ ...user, enabled }),
      });
      if (!putRes.ok) {
        return err(
          new KeycloakAdminError(
            `Error actualizando enabled: ${putRes.status} ${await putRes.text()}`,
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      this.logger.error('Error setEnabled Keycloak', e);
      return err(new KeycloakAdminError('Error actualizando estado en Keycloak'));
    }
  }

  async updateUserProfile(
    keycloakId: string,
    params: { name?: string; email?: string },
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const getRes = await fetch(`${this.adminBase}/users/${keycloakId}`, {
        headers: this.headers(token),
      });
      if (!getRes.ok) {
        return err(
          new KeycloakAdminError(
            `Usuario Keycloak no encontrado: ${getRes.status}`,
          ),
        );
      }
      const user = (await getRes.json()) as Record<string, unknown>;
      const patch: Record<string, unknown> = { ...user };
      if (params.email) {
        patch.email = params.email;
        patch.username = params.email;
      }
      if (params.name) {
        const parts = params.name.trim().split(/\s+/);
        patch.firstName = parts[0] ?? params.name;
        patch.lastName = parts.slice(1).join(' ') || '';
      }
      const putRes = await fetch(`${this.adminBase}/users/${keycloakId}`, {
        method: 'PUT',
        headers: this.headers(token),
        body: JSON.stringify(patch),
      });
      if (!putRes.ok) {
        return err(
          new KeycloakAdminError(
            `Error actualizando perfil KC: ${putRes.status} ${await putRes.text()}`,
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      this.logger.error('Error updateUserProfile Keycloak', e);
      return err(new KeycloakAdminError('Error actualizando perfil en Keycloak'));
    }
  }

  /**
   * Sustituye los roles de aplicación (admin/commercial/supervisor)
   * por los mapeados desde backend.
   */
  async setRealmRoles(
    keycloakId: string,
    backendRoles: string[],
  ): Promise<Result<void, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const rolesRes = await fetch(`${this.adminBase}/roles`, {
        headers: this.headers(token),
      });
      if (!rolesRes.ok) {
        return err(
          new KeycloakAdminError(
            `Error listando roles KC: ${rolesRes.status}`,
          ),
        );
      }
      const allRoles = (await rolesRes.json()) as KeycloakRole[];

      const managedNames = new Set(
        Object.values(this.backendToKcRoles).flat(),
      );

      const currentRes = await fetch(
        `${this.adminBase}/users/${keycloakId}/role-mappings/realm`,
        { headers: this.headers(token) },
      );
      const currentRoles = currentRes.ok
        ? ((await currentRes.json()) as KeycloakRole[])
        : [];

      const toRemove = currentRoles.filter((r) => managedNames.has(r.name));
      if (toRemove.length > 0) {
        await fetch(
          `${this.adminBase}/users/${keycloakId}/role-mappings/realm`,
          {
            method: 'DELETE',
            headers: this.headers(token),
            body: JSON.stringify(toRemove),
          },
        );
      }

      const toAdd: KeycloakRole[] = [];
      for (const backendRole of backendRoles) {
        const candidates = this.backendToKcRoles[backendRole] ?? [backendRole];
        const found = candidates
          .map((name) => allRoles.find((r) => r.name === name))
          .find(Boolean);
        if (found) {
          toAdd.push(found);
        } else {
          this.logger.warn(
            `Rol Keycloak no encontrado para backend role "${backendRole}" (candidatos: ${candidates.join(', ')})`,
          );
        }
      }

      if (toAdd.length > 0) {
        const addRes = await fetch(
          `${this.adminBase}/users/${keycloakId}/role-mappings/realm`,
          {
            method: 'POST',
            headers: this.headers(token),
            body: JSON.stringify(toAdd),
          },
        );
        if (!addRes.ok) {
          return err(
            new KeycloakAdminError(
              `Error asignando roles KC: ${addRes.status} ${await addRes.text()}`,
            ),
          );
        }
      }

      return ok(undefined);
    } catch (e) {
      this.logger.error('Error setRealmRoles Keycloak', e);
      return err(new KeycloakAdminError('Error sincronizando roles en Keycloak'));
    }
  }

  async deleteUser(keycloakId: string): Promise<Result<void, DomainError>> {
    const tokenResult = await this.getAdminToken();
    if (tokenResult.isErr()) return err(tokenResult.error);
    const token = tokenResult.unwrap();

    try {
      const res = await fetch(`${this.adminBase}/users/${keycloakId}`, {
        method: 'DELETE',
        headers: this.headers(token),
      });
      if (!res.ok && res.status !== 404) {
        return err(
          new KeycloakAdminError(
            `Error eliminando usuario KC: ${res.status} ${await res.text()}`,
          ),
        );
      }
      return ok(undefined);
    } catch (e) {
      this.logger.error('Error deleteUser Keycloak', e);
      return err(new KeycloakAdminError('Error eliminando usuario en Keycloak'));
    }
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
}
