import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { basename } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'
import { MaterialService } from '../material/material.service'
import { UserMaterialRepository } from './user-material.repository'
import { UserMaterialFilterDto } from './dto/user-material.dto'

@Injectable()
export class UserMaterialService {
  constructor(
    private readonly repo: UserMaterialRepository,
    private readonly db: PrismaService,
    private readonly materials: MaterialService
  ) {}
  /** 解析MySQL整数编号，禁止无效或超范围输入 */
  id(value: string) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647)
      throw new BadRequestException('编号无效')
    return Number(value)
  }
  /** 使用上海业务日期，不依赖服务器部署时区 */
  private day() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
  }
  /** 校验兼容用户编号始终等于可信身份 */
  checkOwner(id: number, legacyId?: string) {
    if (legacyId !== undefined && legacyId !== String(id))
      throw new ForbiddenException('不能操作其他用户数据')
  }
  /** 输出旧收藏列表编号结构 */
  async favorites(userId: number) {
    return (await this.repo.favorites(userId)).map((row) => ({
      _id: String(row.id),
      user_id: String(userId),
      material_id: String(row.materialId)
    }))
  }
  /** 明确设置或取消当前用户收藏，禁止收藏不存在或下架素材 */
  async favorite(userId: number, materialId: number, collected: boolean) {
    const material = await this.repo.material(materialId)
    if (collected && (!material || material.status !== 1))
      throw new NotFoundException('素材不存在或已下架')
    try {
      await this.repo.favorite(userId, materialId, collected)
    } catch (error) {
      if (
        !(
          collected &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      )
        throw error
    }
    return { collected }
  }
  /** 输出旧下载历史格式，与本机文件存在状态分离 */
  async downloads(userId: number) {
    return (await this.repo.downloads(userId)).map((row) => ({
      _id: String(row.id),
      user_id: String(userId),
      material_id: String(row.materialId),
      completedAt: row.completedAt
    }))
  }
  /** 当前用户实时下载额度和已授权编号，不暴露远程文件URL */
  async status(userId: number) {
    const user = await this.repo.user(userId)
    if (!user || user.status !== 1) throw new UnauthorizedException('登录已失效')
    const used = (await this.repo.usage(userId, this.day()))?.used ?? 0
    const member =
      user.role === 'permanent' ||
      (['annual', 'vip'].includes(user.role) &&
        (user.endDate ? user.endDate > new Date() : user.role === 'vip'))
    return {
      coins: user.coins,
      member: !!member,
      dailyDownloadLimit: user.dailyDownloadLimit,
      dailyUsed: used,
      remaining: member ? Math.max(0, user.dailyDownloadLimit - used) : 0,
      grantIds: (await this.repo.grants(userId)).map((row) => String(row.materialId))
    }
  }
  /** 只从服务端读取下载URL，拒绝没有可用文件的素材 */
  private files(value: Prisma.JsonValue) {
    const files = typeof value === 'string' ? [value] : value
    if (
      !Array.isArray(files) ||
      !files.length ||
      files.some((url) => typeof url !== 'string' || !/^https?:\/\//.test(url))
    )
      throw new BadRequestException('素材尚未配置可下载文件')
    return files as string[]
  }
  /** 首次授权原子消耗会员额度或金币，重复素材复用授权，失败重试不再次扣费 */
  async authorize(userId: number, materialId: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const user = await this.repo.user(userId, tx)
            if (!user || user.status !== 1) throw new UnauthorizedException('登录已失效')
            const material = await this.repo.material(materialId, tx)
            if (!material || material.status !== 1)
              throw new NotFoundException('素材不存在或已下架')
            const urls = this.files(material.filesUrl)
            let grant = await this.repo.grant(userId, materialId, tx)
            const reused = !!grant
            if (!grant) {
              const member =
                user.role === 'permanent' ||
                (['annual', 'vip'].includes(user.role) &&
                  (user.endDate ? user.endDate > new Date() : user.role === 'vip'))
              if (member) {
                if (!user.dailyDownloadLimit)
                  throw new ForbiddenException('会员每日下载额度尚未配置，请联系管理员')
                const dayKey = this.day()
                if (
                  ((await this.repo.usage(userId, dayKey, tx))?.used ?? 0) >=
                  user.dailyDownloadLimit
                )
                  throw new ForbiddenException('今日下载额度已用完')
                await this.repo.useDaily(userId, dayKey, tx)
                grant = await this.repo.createGrant(
                  { userId, materialId, kind: 'membership', dailyKey: dayKey },
                  tx
                )
              } else {
                if (!(await this.repo.debit(userId, tx)).count)
                  throw new ForbiddenException('金币不足，首次授权需要5金币')
                grant = await this.repo.createGrant(
                  { userId, materialId, kind: 'coins', chargedCoins: 5 },
                  tx
                )
              }
            }
            const current = await this.repo.user(userId, tx)
            return {
              grantId: String(grant.id),
              reused,
              coins: current!.coins,
              files: urls.map((url, index) => ({
                path: `/api/user-download-file?material_id=${materialId}&index=${index}`,
                name: this.fileName(url, index)
              }))
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code) &&
          attempt < 3
        )
          continue
        throw error
      }
    }
    throw new BadRequestException('授权繁忙，请重试')
  }
  /** 解码URL文件名；畸形转义保留原值，解码后再次取文件名避免目录片段 */
  private fileName(url: string, index: number) {
    const name = basename(new URL(url).pathname)
    try {
      return basename(decodeURIComponent(name)) || `file-${index + 1}.bin`
    } catch {
      return name || `file-${index + 1}.bin`
    }
  }
  /** 下载文件入口复查用户、素材状态和本人授权，不接受任意外部URL */
  async file(userId: number, materialId: number, index: number) {
    if (!(await this.repo.grant(userId, materialId)))
      throw new ForbiddenException('请先取得素材下载授权')
    const material = await this.repo.material(materialId)
    if (!material || material.status !== 1) throw new NotFoundException('素材不存在或已下架')
    const url = this.files(material.filesUrl)[index]
    if (!url) throw new NotFoundException('文件不存在')
    return url
  }
  /** 客户端确认完成仅更新已有授权的历史标记，不发放权益或重复扣费 */
  async complete(userId: number, materialId: number) {
    if (!(await this.repo.grant(userId, materialId)))
      throw new ForbiddenException('素材没有下载授权')
    await this.repo.complete(userId, materialId)
    return { acknowledged: true }
  }
  /** 当前用户收藏与本机素材按交集筛选，客户端编号不能读取他人收藏 */
  async filter(userId: number, dto: UserMaterialFilterDto) {
    let ids = dto.localIds?.map((id) => this.id(id))
    if (dto.onlyFavorites) {
      const favorites = new Set((await this.repo.favorites(userId)).map((row) => row.materialId))
      ids = ids === undefined ? [...favorites] : ids.filter((id) => favorites.has(id))
    }
    return this.materials.findPage(dto, false, false, ids)
  }
}
