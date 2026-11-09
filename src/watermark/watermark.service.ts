import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Watermark } from '@prisma/client'
import { randomInt } from 'node:crypto'
import { QueryWatermarkDto, WatermarkDto } from './dto/watermark.dto'
import { WatermarkRepository } from './watermark.repository'

/** 后台管理及Electron随机读取共享同一水印业务与字段映射 */
@Injectable()
export class WatermarkService {
  constructor(private readonly repository: WatermarkRepository) {}

  /** 将数据库水印映射为旧后台字段，不暴露软删除信息 */
  private project(row: Watermark) {
    return {
      _id: String(row.id),
      name: row.name,
      images: row.imageUrl,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }
  }

  /** 校验水印主键在MySQL有符号整数范围内 */
  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new BadRequestException('水印编号无效')
    return id
  }

  /** 统一将不存在或已删除水印的并发写入转换为404 */
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('水印不存在或已删除')
      throw error
    }
  }

  /** 按名称筛选并分页查询水印，列表与总数使用相同范围 */
  async findPage(query: QueryWatermarkDto) {
    const where: Prisma.WatermarkWhereInput = query.keyword
      ? { name: { contains: query.keyword } }
      : {}
    const [rows, total] = await Promise.all([
      this.repository.findMany(where, (query.pagesNum - 1) * query.pagesSize, query.pagesSize),
      this.repository.count(where)
    ])
    return {
      list: rows.map((row) => this.project(row)),
      total,
      currentPage: query.pagesNum,
      pageSize: query.pagesSize
    }
  }

  /** Electron随机读取一张未删除水印，空库或并发删除时返回空地址 */
  async findRandom() {
    const total = await this.repository.count()
    if (!total) return { images: '' }
    const row = await this.repository.findAt(randomInt(total))
    return { images: row?.imageUrl ?? '' }
  }

  /** 管理员新增水印配置，不从服务端抓取远程图片 */
  async create(dto: WatermarkDto) {
    const row = await this.repository.create(dto.name, dto.images)
    return { acknowledged: true, insertedId: String(row.id) }
  }

  /** 管理员完整修改未删除水印的名称和图片 */
  async update(dto: WatermarkDto, value: string) {
    await this.write(() =>
      this.repository.update(this.parseId(value), { name: dto.name, imageUrl: dto.images })
    )
    return { acknowledged: true, matchedCount: 1 }
  }

  /** 软删除水印配置，保留记录与共享上传图片以免误删其他引用 */
  async remove(value: string) {
    await this.write(() => this.repository.update(this.parseId(value), { deletedAt: new Date() }))
    return { acknowledged: true, deletedCount: 1 }
  }
}
