import { DomainError } from 'src/context/shared/domain/domain.error';

export class AdminEmailRequiredError extends DomainError {
  constructor() {
    super('El email del administrador es obligatorio');
  }
}

export class AdminCredentialsRequiredError extends DomainError {
  constructor(
    message = 'Nombre, apellidos y contraseña temporal del administrador son obligatorios',
  ) {
    super(message);
  }
}
