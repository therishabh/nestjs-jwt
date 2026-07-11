import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

/**
 * Demonstrates role-based authorization: JwtAuthGuard (global, see
 * AppModule) already guarantees the caller is authenticated; RolesGuard is
 * applied here specifically because only these routes are ADMIN-only —
 * most routes have no role restriction at all.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List users' })
  async list(@Query() query: PaginationQueryDto) {
    const result = await this.usersService.listUsers(query);
    return { message: 'Users fetched successfully', data: result };
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Soft-delete a user' })
  async remove(@Param('id') id: string) {
    await this.usersService.softDelete(id);
    return { message: 'User deleted successfully', data: null };
  }
}
