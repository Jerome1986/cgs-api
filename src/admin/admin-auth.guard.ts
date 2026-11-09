import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { AdminService } from './admin.service'

/** 校验后台访问令牌及管理员当前权限，并向请求写入可信身份 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly adminService: AdminService
  ) {}

  /** 验证 Bearer 令牌的签名、有效期、管理员编号及角色，并复查数据库状态 */
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException('请先登录')
    let payload: { sub?: number; role?: string; ver?: number }
    try {
      payload = await this.jwtService.verifyAsync(match[1])
    } catch {
      throw new UnauthorizedException('登录已失效')
    }
    if (
      !Number.isSafeInteger(payload?.sub) ||
      (payload.sub ?? 0) <= 0 ||
      payload.role !== 'ADMIN' ||
      (payload.ver !== undefined && (!Number.isInteger(payload.ver) || payload.ver < 0))
    ) {
      throw new UnauthorizedException('登录已失效')
    }
    // 每次请求复查账号，确保禁用账号或撤销后台权限后旧令牌无法继续访问。
    request['admin'] = await this.adminService.findCurrent(payload.sub as number, payload.ver ?? 0)
    return true
  }
}
