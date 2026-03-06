import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from 'src/user/user.service';
import { SignupTenantDto } from './dto/signup-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { RateLimitGuard, RateLimit } from './rate-limit.guard';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/refresh-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import type { Response, Request } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 3, ttlMs: 3_600_000 }) // Saatte 3 kayıt
  @Post('signup-tenant')
  async signupTenant(@Body() dto: SignupTenantDto) {
    await this.usersService.createTenantWithOwner(dto);
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.authService.logout(dto.refresh_token, authHeader);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 3, ttlMs: 900_000 }) // 15 dakikada 3 istek
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestReset(dto.email);
    return { success: true };
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 5, ttlMs: 900_000 }) // 15 dakikada 5 istek
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }

  // ──── Mevcut kullanıcı bilgisi (JWT gerektirir) ────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Oturum açmış kullanıcının bilgilerini döner' })
  async getMe(@Req() req: Request & { user: any }) {
    const user = await this.usersService.getUserDetails(req.user.id);
    return user;
  }

  // ──── Google OAuth ────

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Guard Google'a yönlendirir
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user);
    const webUrl = this.configService.get<string>('APP_WEB_URL');
    // Sadece token URL'de — user verisi browser history'e düşmesin
    const params = new URLSearchParams({ token: result.access_token });
    return res.redirect(`${webUrl}/auth/callback?${params.toString()}`);
  }

  // ──── Microsoft OAuth ────

  @Public()
  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuth() {
    // Guard Microsoft'a yönlendirir
  }

  @Public()
  @Get('microsoft/callback')
  @UseGuards(MicrosoftAuthGuard)
  async microsoftAuthCallback(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.oauthLogin(req.user);
    const webUrl = this.configService.get<string>('APP_WEB_URL');
    // Sadece token URL'de — user verisi browser history'e düşmesin
    const params = new URLSearchParams({ token: result.access_token });
    return res.redirect(`${webUrl}/auth/callback?${params.toString()}`);
  }
}
