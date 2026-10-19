import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { PrintFormService } from './print-form.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ApplicationsService } from '../applications/applications.service';
import { ApplicationStatus } from '../applications/entities/application.entity';
import { AdminRole } from './entities/admin-user.entity';

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class RejectDto {
  @IsString() reason: string;
}

class CreateUserDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() fullName: string;
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
  @IsOptional()
  @IsIn(['super_admin', 'reviewer'])
  role?: 'super_admin' | 'reviewer';
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

class SetActiveDto {
  @IsString()
  active: 'true' | 'false';
}

class UpdateProfileDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() fullName?: string;
}

class ChangeOwnPasswordDto {
  @IsString() currentPassword: string;
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

class CompletePasswordChangeDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly applications: ApplicationsService,
    private readonly printForm: PrintFormService,
  ) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // ---------- own profile / password ----------

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: any) {
    return this.auth.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.id, {
      email: dto.email,
      phone: dto.phone,
      fullName: dto.fullName,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/change-password')
  changeOwnPassword(@Req() req: any, @Body() dto: ChangeOwnPasswordDto) {
    return this.auth.changeOwnPassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/complete-password-change')
  completePasswordChange(@Req() req: any, @Body() dto: CompletePasswordChangeDto) {
    return this.auth.changeOwnPassword(req.user.id, '', dto.newPassword, true);
  }

  // ---------- application review ----------

  @UseGuards(JwtAuthGuard)
  @Get('applications')
  list(@Query('status') status?: ApplicationStatus) {
    return this.applications.listForAdmin(status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('applications/by-cbs/:cbsApplicationId')
  syncFromCbs(@Param('cbsApplicationId') cbsApplicationId: string) {
    return this.applications.syncFromCbs(cbsApplicationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('applications/:id')
  detail(@Param('id') id: string) {
    return this.applications.findOneOrFail(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('applications/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto, @Req() req: any) {
    return this.applications.reject(id, req.user.id, dto.reason);
  }

  // Printable membership application form pre-filled with the member's data.
  @UseGuards(JwtAuthGuard)
  @Get('applications/:id/membership-form')
  @Header('Content-Type', 'application/msword')
  async membershipForm(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, filename } = await this.printForm.buildMembershipForm(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(buffer);
  }

  // ---------- portal user management ----------

  @UseGuards(JwtAuthGuard)
  @Get('users')
  listUsers(@Req() req: any) {
    return this.auth.listUsers();
  }

  @UseGuards(JwtAuthGuard)
  @Post('users')
  createUser(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.auth.createUser(req.user.id, {
      email: dto.email,
      phone: dto.phone || undefined,
      fullName: dto.fullName,
      password: dto.password,
      role: dto.role as AdminRole | undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:id/reset-password')
  resetPassword(@Req() req: any, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(req.user.id, id, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:id/set-active')
  setActive(@Req() req: any, @Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.auth.setActive(req.user.id, id, dto.active === 'true');
  }
}
