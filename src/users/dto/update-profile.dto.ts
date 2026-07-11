import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Deliberately excludes email/password/role — those change through
 * dedicated, more carefully guarded endpoints (change-password, and no
 * endpoint at all for role, which only an admin action should ever touch).
 * Because the global ValidationPipe uses `forbidNonWhitelisted`, a request
 * body containing `email` or `role` is rejected outright rather than
 * silently ignored.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be a valid E.164-style phone number',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/jane.png' })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}
