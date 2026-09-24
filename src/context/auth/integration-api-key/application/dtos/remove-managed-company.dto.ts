import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RemoveManagedCompanyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  companyId: string;
}
