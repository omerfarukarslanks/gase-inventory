import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('MICROSOFT_CLIENT_ID') || 'not-configured';
    const clientSecret = config.get<string>('MICROSOFT_CLIENT_SECRET') || 'not-configured';
    const callbackURL = config.get<string>('MICROSOFT_CALLBACK_URL') || 'http://localhost';
    const tenant = config.get<string>('MICROSOFT_TENANT_ID') || 'common';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['user.read'],
      tenant,
    } as any);
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user: any) => void,
  ) {
    const { id, emails, name, photos } = profile;

    const user = {
      email: emails[0].value,
      name: name?.givenName ?? '',
      surname: name?.familyName ?? '',
      avatar: photos?.[0]?.value ?? null,
      authProvider: 'microsoft',
      authProviderId: id,
    };

    done(null, user);
  }
}
