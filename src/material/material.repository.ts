import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
@Injectable()
export class MaterialRepository {
  constructor(private readonly prisma: PrismaService) {}
  /** 统一素材分页，固定编号倒序 */
  findMany(where: Prisma.MaterialWhereInput, skip: number, take: number) {
    return this.prisma.material.findMany({
      where,
      skip,
      take,
      include: {
        top: { select: { name: true, enName: true } },
        sub: { select: { name: true, enName: true } }
      },
      orderBy: { id: 'desc' }
    })
  }
  /** 同条件素材总数 */
  count(where: Prisma.MaterialWhereInput) {
    return this.prisma.material.count({ where })
  }
  /** 全部匹配素材标签，用于Electron筛选选项 */
  facets(where: Prisma.MaterialWhereInput) {
    return this.prisma.material.findMany({
      where,
      select: { tags: true, colors: true }
    })
  }
  /** 查询分类归属 */
  category(id: number) {
    return this.prisma.category.findUnique({ where: { id } })
  }
  /** 即使文件扩展名是图片，也不能绕过其作为付费素材文件的授权边界 */
  async isDownloadAsset(name: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM materials WHERE JSON_SEARCH(files_url, 'one', ${'%/material-assets/' + name}) IS NOT NULL LIMIT 1
    `)
    return rows.length > 0
  }
  /** 新增素材白名单数据 */
  create(data: Prisma.MaterialUncheckedCreateInput) {
    return this.prisma.material.create({ data })
  }
  /** 更新素材白名单数据 */
  update(id: number, data: Prisma.MaterialUncheckedCreateInput) {
    return this.prisma.material.update({ where: { id }, data })
  }
  /** 删除素材记录，保留磁盘文件避免误删共享资源 */
  remove(id: number) {
    return this.prisma.material.delete({ where: { id } })
  }
}
