import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Separate from AuthController on purpose: Auth owns *authentication*
 * (proving who you are, issuing tokens); this controller owns the *user
 * resource* once you're already authenticated. Both are protected by the
 * global JwtAuthGuard — no @Public() here, so every request must carry a
 * valid access token.
 */
@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async getProfile(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findActiveByIdOrThrow(userId);
    return { message: 'Profile fetched successfully', data: user };
  }

  @Put()
  @ApiOperation({ summary: 'Update the current user profile' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(userId, dto);
    return { message: 'Profile updated successfully', data: user };
  }
}
