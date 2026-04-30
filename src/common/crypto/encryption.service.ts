import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  createCipheriv, createDecipheriv,
  randomBytes, scryptSync, timingSafeEqual,
} from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16;
  private readonly TAG_LENGTH = 16;
  private encryptionKey!: Buffer;

  onModuleInit() {
    const secret = process.env.ENCRYPTION_SECRET ?? 'dev-encryption-secret-32-chars-ok!';
    const salt   = process.env.ENCRYPTION_SALT   ?? 'dev-salt-string-here';
    this.encryptionKey = scryptSync(secret, salt, 32) as Buffer;
  }

  encrypt(plaintext: string): Buffer {
    const iv     = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, this.encryptionKey, iv);
    const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decrypt(buf: Buffer): string {
    const iv         = buf.subarray(0, this.IV_LENGTH);
    const tag        = buf.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
    const ciphertext = buf.subarray(this.IV_LENGTH + this.TAG_LENGTH);
    const decipher   = createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
  }

  encryptAmount(value: number): Buffer {
    return this.encrypt(value.toFixed(8));
  }

  decryptAmount(buf: Buffer): number {
    return parseFloat(this.decrypt(buf));
  }

  encryptTotpSecret(s: string): Buffer { return this.encrypt(s); }
  decryptTotpSecret(b: Buffer): string { return this.decrypt(b); }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try { return await argon2.verify(hash, password); }
    catch { return false; }
  }

  safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}