import type { AttributeTag, ColorTag } from '@prisma/client'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { TagRepository } from './tag.repository'
import { AttributeTagDto, QueryTagDto } from './dto/tag.dto'

/** 标签业务规则与旧字段投影，后台及Electron共享同一数据源 */
@Injectable()
export class TagService {
  constructor(private readonly repository: TagRepository) {}

  /** 公开分页读取；省略条数返回完整字典 */
  async findPage(kind: 'attribute' | 'color', query: QueryTagDto) {
    const take = query.pagesSize
    const skip = take === undefined ? undefined : (query.pagesNum - 1) * take
    const [rows, total] =
      kind === 'attribute'
        ? await Promise.all([
            this.repository.attributes(skip, take),
            this.repository.countAttributes()
          ])
        : await Promise.all([this.repository.colors(skip, take), this.repository.countColors()])
    return {
      list: rows.map((row: AttributeTag | ColorTag) => this.project(row)),
      total,
      currentPage: take === undefined ? 1 : query.pagesNum,
      pageSize: take ?? total
    }
  }

  /** 保留旧客户端使用的_id及en_name，不向调用方扩散持久化字段 */
  private project(row: {
    id: number
    createdAt: Date
    name?: string
    enName?: string
    color?: string
  }) {
    return {
      _id: String(row.id),
      createdAt: row.createdAt,
      ...(row.name !== undefined ? { name: row.name, en_name: row.enName } : { color: row.color })
    }
  }

  /** 严格限制MySQL整数编号 */
  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new BadRequestException('标签编号无效')
    return id
  }

  /** 数据库唯一约束处理并发重复，隐藏底层错误 */
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('标签已存在')
        if (error.code === 'P2025') throw new NotFoundException('标签不存在')
        if (error.code === 'P2003') throw new ConflictException('标签正在使用，无法删除')
      }
      throw error
    }
  }

  /** 新增属性标签，兼容insertedId响应 */
  async createAttribute(dto: AttributeTagDto) {
    const row = await this.write(() => this.repository.createAttribute(dto.name, dto.en_name))
    return { acknowledged: true, insertedId: String(row.id) }
  }
  /** 修改属性标签 */
  async updateAttribute(id: string, dto: AttributeTagDto) {
    await this.write(() => this.repository.updateAttribute(this.parseId(id), dto.name, dto.en_name))
    return { acknowledged: true, matchedCount: 1 }
  }
  /** 删除属性标签并返回删除前的字段快照 */
  async removeAttribute(id: string) {
    const row = await this.write(() => this.repository.removeAttribute(this.parseId(id)))
    return { deletedCount: 1, deletedTag: this.project(row) }
  }
  /** 将简写颜色展开，避免同色重复 */
  private normalizeColor(value: string) {
    const hex = value.slice(1).toUpperCase()
    const full = hex.length <= 4 ? [...hex].map((char) => char + char).join('') : hex
    return '#' + (full.length === 8 && full.endsWith('FF') ? full.slice(0, 6) : full)
  }
  /** 新增颜色标签 */
  async createColor(color: string) {
    const row = await this.write(() => this.repository.createColor(this.normalizeColor(color)))
    return { acknowledged: true, insertedId: String(row.id) }
  }
  /** 修改颜色标签 */
  async updateColor(id: string, color: string) {
    await this.write(() =>
      this.repository.updateColor(this.parseId(id), this.normalizeColor(color))
    )
    return { acknowledged: true, matchedCount: 1 }
  }
  /** 删除颜色标签 */
  async removeColor(id: string) {
    const row = await this.write(() => this.repository.removeColor(this.parseId(id)))
    return { deletedCount: 1, deletedTag: this.project(row) }
  }
}
