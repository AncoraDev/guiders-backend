import { DomainError } from 'src/context/shared/domain/domain.error';

export class CompanyUserNotFoundError extends DomainError {
  constructor(userId: string) {
    super(`Usuario ${userId} no encontrado en la compañía`);
  }
}

export class CompanyUserEmailExistsError extends DomainError {
  constructor(email: string) {
    super(`Ya existe un usuario con el email ${email}`);
  }
}

export class InvalidCompanyUserRolesError extends DomainError {
  constructor(message?: string) {
    super(
      message ??
        'Roles inválidos. Permitidos: admin, commercial, supervisor',
    );
  }
}

export class CannotModifySelfError extends DomainError {
  constructor() {
    super('No puedes modificar o eliminar tu propio usuario');
  }
}

export class CompanyUserKeycloakMissingError extends DomainError {
  constructor(userId: string) {
    super(
      `El usuario ${userId} no tiene cuenta en Keycloak; no se puede completar la operación`,
    );
  }
}

export class CompanyUserPersistError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/** Roles asignables desde Console (sin superadmin) */
export const ASSIGNABLE_COMPANY_ROLES = [
  'admin',
  'commercial',
  'supervisor',
] as const;

export function validateAssignableRoles(
  roles: string[],
): InvalidCompanyUserRolesError | null {
  if (!Array.isArray(roles) || roles.length === 0) {
    return new InvalidCompanyUserRolesError(
      'Debes asignar al menos un rol',
    );
  }
  const invalid = roles.filter(
    (r) => !(ASSIGNABLE_COMPANY_ROLES as readonly string[]).includes(r),
  );
  if (invalid.length > 0) {
    return new InvalidCompanyUserRolesError(
      `Roles no permitidos: ${invalid.join(', ')}`,
    );
  }
  return null;
}
