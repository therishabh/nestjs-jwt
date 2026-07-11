import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token issued at login' })
  @IsJWT()
  refreshToken: string;
}
