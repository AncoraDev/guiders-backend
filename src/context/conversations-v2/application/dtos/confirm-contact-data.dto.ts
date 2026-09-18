import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmContactDataDto {
  @ApiProperty({
    description: 'Identificador de la solicitud de datos que se confirma',
    example: '9d1f2a52-8b1e-4c7f-9d3a-1c2b3a4d5e6f',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;
}
