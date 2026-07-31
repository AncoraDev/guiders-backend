import { UserAccountCreatedAt } from './user-account-created-at';
import { UserAccountEmail } from './user-account-email';
import { UserAccountId } from './user-account-id';
import { UserAccountLastLogin } from './user-account-last-login';
import { UserAccountPassword } from './user-account-password';
import { UserAccountUpdatedAt } from './user-account-updated-at';
import { Optional } from 'src/context/shared/domain/optional';
import { UserAccountRoles } from './value-objects/user-account-roles';
import { Role } from './value-objects/role';
import { AggregateRoot } from '@nestjs/cqrs';
import { UserPasswordUpdatedEvent } from './events/user-password-updated-event';
import { UserAccountCompanyId } from './value-objects/user-account-company-id';
import { UserAccountIsActive } from './value-objects/user-account-is-active';
import { UserAccountCreatedEvent } from './events/user-account-created-event';
import { UserAvatarUpdatedEvent } from './events/user-avatar-updated-event';
import { UserNameUpdatedEvent } from './events/user-name-updated-event';
import { UserAccountName } from './value-objects/user-account-name';
import { UserAccountKeycloakId } from './value-objects/user-account-keycloak-id';
import { UserAccountAvatarUrl } from './value-objects/user-account-avatar-url';

export interface UserAccountPrimitives {
  id: string;
  email: string;
  name: string;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
  roles: string[];
  companyId: string; // Asociación a compañía
  isActive: boolean; // Campo para estado activo/inactivo
  keycloakId: string | null; // Referencia al ID de usuario en Keycloak
  avatarUrl: string | null; // URL del avatar en S3
}

export class UserAccount extends AggregateRoot {
  // Propiedades privadas siguiendo convención _xxxx
  private readonly _id: UserAccountId;
  private readonly _email: UserAccountEmail;
  private readonly _name: UserAccountName;
  private readonly _password: UserAccountPassword;
  private readonly _createdAt: UserAccountCreatedAt;
  private readonly _updatedAt: UserAccountUpdatedAt;
  private readonly _lastLoginAt: UserAccountLastLogin;
  private readonly _roles: UserAccountRoles;
  private readonly _companyId: UserAccountCompanyId;
  private readonly _isActive: UserAccountIsActive;
  private readonly _keycloakId: UserAccountKeycloakId | null;
  private readonly _avatarUrl: UserAccountAvatarUrl;

  private constructor(
    id: UserAccountId,
    email: UserAccountEmail,
    name: UserAccountName,
    password: UserAccountPassword,
    createdAt: UserAccountCreatedAt,
    updatedAt: UserAccountUpdatedAt,
    lastLoginAt: UserAccountLastLogin,
    roles: UserAccountRoles,
    companyId: UserAccountCompanyId,
    isActive: UserAccountIsActive = new UserAccountIsActive(true), // Por defecto activo
    keycloakId: UserAccountKeycloakId | null = null, // Por defecto null (usuarios legacy)
    avatarUrl: UserAccountAvatarUrl = new UserAccountAvatarUrl(null), // Por defecto sin avatar
  ) {
    super();
    this._id = id;
    this._email = email;
    this._name = name;
    this._password = password;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._lastLoginAt = lastLoginAt;
    this._roles = roles;
    this._companyId = companyId;
    this._isActive = isActive;
    this._keycloakId = keycloakId;
    this._avatarUrl = avatarUrl;
  }

  // Métodos estáticos de fábrica
  public static create(params: {
    email: UserAccountEmail;
    name: UserAccountName;
    password: UserAccountPassword;
    id?: UserAccountId;
    roles?: UserAccountRoles;
    companyId: UserAccountCompanyId;
    isActive?: UserAccountIsActive;
    keycloakId?: UserAccountKeycloakId | null;
    avatarUrl?: UserAccountAvatarUrl;
  }): UserAccount {
    const now = new Date();
    const user = new UserAccount(
      params.id ?? UserAccountId.random(),
      params.email,
      params.name,
      params.password,
      UserAccountCreatedAt.create(now),
      UserAccountUpdatedAt.create(now),
      new UserAccountLastLogin(null),
      params.roles ?? UserAccountRoles.fromRoles([Role.admin()]), // Por defecto admin
      params.companyId,
      params.isActive ?? new UserAccountIsActive(true),
      params.keycloakId ?? null,
      params.avatarUrl ?? new UserAccountAvatarUrl(null),
    );
    // Aplica el evento de dominio al crear el usuario
    user.apply(
      new UserAccountCreatedEvent({
        user: user.toPrimitives(),
      }),
    );
    return user;
  }

  public static fromPrimitives(params: {
    id: string;
    email: string;
    name: string;
    password: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt?: Date | null;
    roles: string[];
    companyId: string;
    isActive?: boolean;
    keycloakId?: string | null;
    avatarUrl?: string | null;
  }): UserAccount {
    const newUser = new UserAccount(
      UserAccountId.create(params.id),
      UserAccountEmail.create(params.email),
      new UserAccountName(params.name),
      new UserAccountPassword(params.password ?? null),
      UserAccountCreatedAt.create(params.createdAt),
      UserAccountUpdatedAt.create(params.updatedAt),
      new UserAccountLastLogin(params.lastLoginAt ?? null),
      UserAccountRoles.fromPrimitives(params.roles),
      UserAccountCompanyId.create(params.companyId),
      new UserAccountIsActive(params.isActive ?? true),
      params.keycloakId
        ? UserAccountKeycloakId.fromString(params.keycloakId)
        : null,
      new UserAccountAvatarUrl(params.avatarUrl ?? null),
    );

    return newUser;
  }

  // Métodos públicos para exponer los value objects
  get id(): UserAccountId {
    return this._id;
  }
  get email(): UserAccountEmail {
    return this._email;
  }
  get name(): UserAccountName {
    return this._name;
  }
  // Getter que expone password como Optional
  get password(): Optional<string> {
    return this._password.value === null
      ? Optional.empty()
      : Optional.of(this._password.getValue()!);
  }

  get createdAt(): UserAccountCreatedAt {
    return this._createdAt;
  }
  get updatedAt(): UserAccountUpdatedAt {
    return this._updatedAt;
  }
  // Getter que expone lastLoginAt como Optional
  get lastLoginAt(): Optional<Date> {
    return this._lastLoginAt.value === null
      ? Optional.empty()
      : Optional.of(this._lastLoginAt.getValue()!);
  }

  // Getter para roles
  get roles(): UserAccountRoles {
    return this._roles;
  }

  get companyId(): UserAccountCompanyId {
    return this._companyId;
  }

  get isActive(): boolean {
    return this._isActive.value;
  }

  get keycloakId(): Optional<UserAccountKeycloakId> {
    return this._keycloakId === null
      ? Optional.empty()
      : Optional.of(this._keycloakId);
  }

  get avatarUrl(): Optional<string> {
    return this._avatarUrl.hasAvatar()
      ? Optional.of(this._avatarUrl.getValue()!)
      : Optional.empty();
  }

  // Métodos públicos
  public equals(userAccount: UserAccount): boolean {
    return (
      (this._id.equals(userAccount._id) &&
        this._email.equals(userAccount._email) &&
        this._name.equals(userAccount._name) &&
        this._password.equals(userAccount._password) &&
        this._createdAt.equals(userAccount._createdAt) &&
        this._updatedAt.equals(userAccount._updatedAt) &&
        this._lastLoginAt.equals(userAccount._lastLoginAt) &&
        JSON.stringify(this._roles.toPrimitives()) ===
          JSON.stringify(userAccount._roles.toPrimitives()) &&
        this._companyId.equals(userAccount._companyId) &&
        this._isActive.equals(userAccount._isActive) &&
        this._keycloakId === null &&
        userAccount._keycloakId === null) ||
      (this._keycloakId !== null &&
        userAccount._keycloakId !== null &&
        this._keycloakId.equals(userAccount._keycloakId))
    );
  }

  public updateLastLoginAt(): UserAccount {
    return new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      this._updatedAt,
      new UserAccountLastLogin(new Date()),
      this._roles,
      this._companyId,
      this._isActive,
      this._keycloakId,
      this._avatarUrl,
    );
  }

  public updatePassword(password: string): UserAccount {
    // Actualiza la contraseña y aplica el evento de dominio
    const updatedUser = new UserAccount(
      this._id,
      this._email,
      this._name,
      new UserAccountPassword(password),
      this._createdAt,
      this._updatedAt,
      this._lastLoginAt,
      this._roles,
      this._companyId,
      this._isActive,
      this._keycloakId,
      this._avatarUrl,
    );
    this.apply(new UserPasswordUpdatedEvent(this._id.value));
    return updatedUser;
  }

  public toPrimitives(): UserAccountPrimitives {
    return {
      email: this._email.getValue(),
      name: this._name.getValue(),
      password: this._password.getValue(),
      createdAt: this._createdAt.getValue(),
      updatedAt: this._updatedAt.getValue(),
      lastLoginAt: this._lastLoginAt.getValue(),
      roles: this._roles.toPrimitives(),
      id: this._id.getValue(),
      companyId: this._companyId.getValue(),
      isActive: this._isActive.value,
      keycloakId: this._keycloakId?.value ?? null,
      avatarUrl: this._avatarUrl.getValue(),
    };
  }

  // Método para asociar un usuario existente con Keycloak
  public linkWithKeycloak(keycloakId: UserAccountKeycloakId): UserAccount {
    return new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      this._updatedAt,
      this._lastLoginAt,
      this._roles,
      this._companyId,
      this._isActive,
      keycloakId,
      this._avatarUrl,
    );
  }

  // Método para actualizar el avatar del usuario
  public updateAvatar(newAvatarUrl: string | null): UserAccount {
    const previousAvatarUrl = this._avatarUrl.getValue();
    const updatedUser = new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      this._updatedAt,
      this._lastLoginAt,
      this._roles,
      this._companyId,
      this._isActive,
      this._keycloakId,
      new UserAccountAvatarUrl(newAvatarUrl),
    );

    // Aplica el evento de dominio
    this.apply(
      new UserAvatarUpdatedEvent(
        this._id.value,
        this._keycloakId?.value ?? null,
        newAvatarUrl,
        previousAvatarUrl,
      ),
    );

    return updatedUser;
  }

  // Método para verificar si el usuario está vinculado con Keycloak
  public isLinkedWithKeycloak(): boolean {
    return this._keycloakId !== null;
  }

  // Método para actualizar el nombre del usuario
  public updateName(newName: string): UserAccount {
    const previousName = this._name.getValue();
    const updatedUser = new UserAccount(
      this._id,
      this._email,
      new UserAccountName(newName),
      this._password,
      this._createdAt,
      this._updatedAt,
      this._lastLoginAt,
      this._roles,
      this._companyId,
      this._isActive,
      this._keycloakId,
      this._avatarUrl,
    );

    // Aplica el evento de dominio
    this.apply(
      new UserNameUpdatedEvent(
        this._id.value,
        this._keycloakId?.value ?? null,
        newName,
        previousName,
      ),
    );

    return updatedUser;
  }

  public updateRoles(roles: UserAccountRoles): UserAccount {
    return new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      UserAccountUpdatedAt.create(new Date()),
      this._lastLoginAt,
      roles,
      this._companyId,
      this._isActive,
      this._keycloakId,
      this._avatarUrl,
    );
  }

  public activate(): UserAccount {
    if (this._isActive.value) {
      return this;
    }
    return new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      UserAccountUpdatedAt.create(new Date()),
      this._lastLoginAt,
      this._roles,
      this._companyId,
      new UserAccountIsActive(true),
      this._keycloakId,
      this._avatarUrl,
    );
  }

  public deactivate(): UserAccount {
    if (!this._isActive.value) {
      return this;
    }
    return new UserAccount(
      this._id,
      this._email,
      this._name,
      this._password,
      this._createdAt,
      UserAccountUpdatedAt.create(new Date()),
      this._lastLoginAt,
      this._roles,
      this._companyId,
      new UserAccountIsActive(false),
      this._keycloakId,
      this._avatarUrl,
    );
  }
}
