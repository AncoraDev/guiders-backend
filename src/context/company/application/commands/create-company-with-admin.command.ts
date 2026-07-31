// Comando para crear una compañía junto con su usuario administrador (superadmin) sin password
// Ubicación: src/context/company/application/commands/create-company-with-admin.command.ts
import { ICommand } from '@nestjs/cqrs';

// Interfaz para los primitivos de un sitio
export interface SitePrimitivesDto {
  id?: string; // Opcional, se generará si no se proporciona
  name: string;
  canonicalDomain: string;
  domainAliases: string[];
}

// DTO para agrupar los datos necesarios para crear la compañía y el admin
export interface CreateCompanyWithAdminProps {
  companyName: string;
  sites: SitePrimitivesDto[];
  /** @deprecated Preferir adminFirstName + adminLastName */
  adminName?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminEmail: string;
  adminTel?: string;
  /** Contraseña temporal; el admin deberá cambiarla en el primer login */
  adminPassword: string;
}

// Comando principal
export class CreateCompanyWithAdminCommand implements ICommand {
  // Recibe un solo objeto con todas las propiedades
  constructor(public readonly props: CreateCompanyWithAdminProps) {}
}
