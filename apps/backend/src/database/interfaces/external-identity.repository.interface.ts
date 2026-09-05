import { ExternalIdentity } from '../entities';

export interface IExternalIdentityRepository {
  findByProviderExternalId(
    provider: string,
    externalId: string,
  ): Promise<ExternalIdentity | null>;

  create(input: {
    userId: string;
    provider: string;
    externalId: string;
    verifiedAt?: Date | null;
  }): Promise<ExternalIdentity>;
}

export const EXTERNAL_IDENTITY_REPOSITORY = Symbol(
  'IExternalIdentityRepository',
);
