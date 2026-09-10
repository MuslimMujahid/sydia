import { Global, Module } from '@nestjs/common';
import { SecretCipher } from './secret-cipher';
import { TokenCipher } from './token-cipher';

@Global()
@Module({
  providers: [SecretCipher, TokenCipher],
  exports: [SecretCipher, TokenCipher],
})
export class CryptoModule {}
