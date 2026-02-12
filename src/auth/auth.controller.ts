import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from 'src/user/user.service';
import { SignupTenantDto } from './dto/signup-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/refresh-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('signup-tenant')
  async signupTenant(@Body() dto: SignupTenantDto) {
    await this.usersService.createTenantWithOwner(dto);
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestReset(dto.email);
    // her zaman aynı cevap → kullanıcı var/yok anlaşılmasın
    return { success: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }
}
