import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGreetingMessageDto {
  @ApiProperty({
    description:
      'Mensaje que se envía al pulsar Saludar. Vacío o null restaura el texto por defecto.',
    required: false,
    nullable: true,
    maxLength: 500,
    example: '¡Hola! Soy Marta, ¿en qué te ayudo?',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'El mensaje de saludo no puede superar 500 caracteres',
  })
  greetingMessage?: string | null;
}
