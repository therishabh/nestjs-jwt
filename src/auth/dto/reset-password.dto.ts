import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import {
  STRONG_PASSWORD_MESSAGE,
  STRONG_PASSWORD_REGEX,
} from '../../common/constants/validation.constants';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The raw reset token received via email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'N3w!StrongPassw0rd' })
  @IsString()
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  newPassword: string;
}
