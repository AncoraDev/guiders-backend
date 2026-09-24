import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RemoveCommercialFromExternalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  companyId: string;

  @ApiProperty({
    description: 'Id del comercial en el proveedor',
    example: 'leadcars-commercial-42',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalUserId: string;
}
