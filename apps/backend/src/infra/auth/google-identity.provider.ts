import { Logger } from '@nestjs/common';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';

export type GoogleIdentityConfig = { clientId: string; clientSecret: string };
type GoogleEmailClaims = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
};
interface GoogleTokenVerifier {
  verifyIdToken(input: {
    idToken: string;
    audience: string;
  }): Promise<Pick<LoginTicket, 'getPayload'>>;
}

// A third-party email can have email_verified=true even after its ownership
// changes. Only Google-hosted mail may bypass Sydia's mailbox challenge.
export function googleEmailIsAuthoritative(
  profile: GoogleEmailClaims,
): boolean {
  return (
    profile.email_verified === true &&
    (profile.email?.toLowerCase().endsWith('@gmail.com') === true ||
      Boolean(profile.hd))
  );
}

export function googleIdentityProvider(
  config: GoogleIdentityConfig,
  verifier: GoogleTokenVerifier = new OAuth2Client(config.clientId),
) {
  const logger = new Logger('GoogleIdentityProvider');

  return {
    ...config,
    scope: ['openid', 'email', 'profile'],
    disableDefaultScope: true,
    includeGrantedScopes: false,
    accessType: 'online' as const,
    prompt: 'select_account' as const,
    async getUserInfo(tokens: {
      idToken?: string;
      expectedIdTokenNonce?: string;
    }) {
      try {
        if (!tokens.idToken) throw new Error('Google omitted the ID token');
        const profile = (
          await verifier.verifyIdToken({
            idToken: tokens.idToken,
            audience: config.clientId,
          })
        ).getPayload();

        if (!profile?.sub || !profile.email)
          throw new Error('Google omitted the stable subject or email');
        if (
          tokens.expectedIdTokenNonce &&
          (!('nonce' in profile) ||
            profile.nonce !== tokens.expectedIdTokenNonce)
        )
          throw new Error('Google identity nonce mismatch');
        // Better Auth's GoogleProfile contract requires optional OIDC metadata.
        // Represent absent metadata explicitly as empty strings; authentication
        // relies on the verified issuer/audience/subject, never these defaults.
        const data = {
          ...profile,
          azp: profile.azp || '',
          email: profile.email,
          email_verified: profile.email_verified === true,
          family_name: profile.family_name || '',
          given_name: profile.given_name || '',
          name: profile.name || profile.email,
          picture: profile.picture || '',
        };

        return {
          user: {
            name: data.name,
            email: profile.email,
            image: profile.picture,
            emailVerified: googleEmailIsAuthoritative(profile),
          },
          data,
        };
      } catch {
        logger.warn(
          'Google identity validation failed. No account was authenticated or linked; check the identity client configuration and Google availability.',
        );

        // Better Auth's typed nullable provider contract redirects this failure
        // to the configured error callback; never create a partially trusted user.
        return null;
      }
    },
  };
}
