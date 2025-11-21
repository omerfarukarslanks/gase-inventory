import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/user/user.entity';
import { UsersService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  validateUser(email: string, password: string) {
    return this.usersService.validateUser(email, password);
  }

  async login(user: User) {
    const payload = {
      sub: user.id,
      tenantId: user.tenant.id,
      role: user.role,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        tenantId: user.tenant.id,
        role: user.role,
      },
    };
  }
}
