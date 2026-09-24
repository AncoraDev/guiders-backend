import { DomainError } from 'src/context/shared/domain/domain.error';

export class ProviderNotFoundError extends DomainError {
  constructor() {
    super('Proveedor no encontrado');
  }
}

export class ProviderDemoAdminEmailTakenError extends DomainError {
  constructor() {
    super('Ya hay un proveedor con ese email de acceso a la demo');
  }
}

export class ProviderHasClientsError extends DomainError {
  constructor() {
    super(
      'Este proveedor tiene clientes vinculados. Elimínalos antes de borrarlo.',
    );
  }
}
