import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UserAuthService } from './user-auth.service'

/** 客户端请求中已验证的当前用户资料 */
export type UserRequest = Request & {
  /** 从签名令牌及实时数据库状态确认的身份 */
  user: Awaited<ReturnType<UserAuthService['findCurrent']>>
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly service: UserAuthService
  ) {}

  /** 兼容旧裸token及Bearer写法，拒绝管理员令牌并复查实时用户状态 */
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<UserRequest>()
    const match = /^(?:Bearer )?(\S+)$/i.exec(request.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException('请先登录')
    let payload: { sub?: number; role?: string }
    try {
      payload = await this.jwt.verifyAsync(match[1])
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录')
    }
    if (!Number.isSafeInteger(payload?.sub) || (payload.sub ?? 0) < 1 || payload.role !== 'USER')
      throw new UnauthorizedException('登录已失效，请重新登录')
    request.user = await this.service.findCurrent(payload.sub as number)
    return true
  }
}
