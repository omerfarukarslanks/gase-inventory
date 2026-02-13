import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from 'src/user/user.service';
import { SignupTenantDto } from './dto/signup-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/refresh-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
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
    return { success: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }

  // ──── Google OAuth ────

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Guard Google'a yönlendirir
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user);
    const webUrl = this.configService.get<string>('APP_WEB_URL');
    const params = new URLSearchParams({
      token: result.access_token,
      user: JSON.stringify(result.user),
    });
    return res.redirect(`${webUrl}/auth/callback?${params.toString()}`);
  }

  // ──── Microsoft OAuth ────

  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuth() {
    // Guard Microsoft'a yönlendirir
  }

  @Get('microsoft/callback')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user);
    const webUrl = this.configService.get<string>('APP_WEB_URL');
    const params = new URLSearchParams({
      token: result.access_token,
      user: JSON.stringify(result.user),
    });
    return res.redirect(`${webUrl}/auth/callback?${params.toString()}`);
  }
}
