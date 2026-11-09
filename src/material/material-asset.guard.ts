import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { MaterialRepository } from './material.repository'

@Injectable()
export class MaterialAssetGuard implements CanActivate {
  constructor(
    private readonly admin: AdminAuthGuard,
    private readonly materials: MaterialRepository
  ) {}
  /** 图片保持公开预览，文件包只允许管理员读取，用户统一走授权下载入口 */
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    const name = request.params.name as string
    if (
      /[.](?:jpg|jpeg|png|gif|webp|bmp)$/i.test(name) &&
      !(await this.materials.isDownloadAsset(name))
    )
      return true
    return this.admin.canActivate(context)
  }
}
