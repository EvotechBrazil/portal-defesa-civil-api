import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../types/authenticated-request';

/**
 * Auth publico: chaveia por IP. Admin de alto impacto: chaveia pelo ator
 * autenticado, para um mesmo usuario nao furar o teto rotacionando IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as AuthenticatedUser | undefined;
    if (user?.id) {
      return Promise.resolve(`actor:${user.id}`);
    }
    const forwarded = (req.headers ?? {}) as Record<
      string,
      string | string[] | undefined
    >;
    const raw = forwarded?.['x-forwarded-for'];
    const forwardedIp =
      typeof raw === 'string' ? raw.split(',')[0]?.trim() : undefined;
    const ip =
      forwardedIp ||
      (typeof req.ip === 'string' ? req.ip : undefined) ||
      (Array.isArray(req.ips) ? (req.ips[0] as string | undefined) : undefined);
    return Promise.resolve(ip || 'anonymous');
  }
}
