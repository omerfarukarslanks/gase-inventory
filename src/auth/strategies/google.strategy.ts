import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured';
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured';
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL') || 'http://localhost';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
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
      authProvider: 'google',
      authProviderId: id,
    };

    done(null, user);
  }
}
