import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { UsersService } from 'src/user/user.service';
import { SignupTenantDto } from './dto/signup-tenant.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('signup-tenant')
  async signupTenant(@Body() dto: SignupTenantDto) {
    const user = await this.usersService.createTenantWithOwner(dto);
    return this.authService.login(user); // ilk kayıt sonrası direkt login
  }

  @UseGuards(LoginRateLimitGuard, LocalAuthGuard)
  @Post('login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }
}
