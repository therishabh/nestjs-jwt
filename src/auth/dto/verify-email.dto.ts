import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'The raw verification token received via email' })
  @IsString()
  token: string;
}
