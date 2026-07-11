import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}
