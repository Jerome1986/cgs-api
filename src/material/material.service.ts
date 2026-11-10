import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Material, Prisma } from '@prisma/client'
import { MaterialRepository } from './material.repository'
import { MaterialDto, QueryMaterialDto } from './dto/material.dto'
@Injectable()
export class MaterialService {
  constructor(private readonly repo: MaterialRepository) {}
  /** 严格解析数据库整数编号 */
  private id(value: string) {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647)
      throw new BadRequestException('编号无效')
    return Number(value)
  }
  /** 输出兼容旧客户端的素材字段 */
  private project(
    row: Material & {
      top?: { name: string; enName: string }
      sub?: { name: string; enName: string } | null
      third?: { name: string; enName: string } | null
    },
    admin = false
  ) {
    const categories = [row.top, row.sub, row.third].filter((item) => item != null)
    return {
      _id: String(row.id),
      top_id: String(row.topId),
      sub_id: row.subId === null ? '' : String(row.subId),
      third_id: row.thirdId == null ? '' : String(row.thirdId),
      cate_path: categories.map((item) => item.name).join(' / '),
      en_cate_path: categories.map((item) => item.enName || item.name).join(' / '),
      name: row.name,
      en_name: row.enName,
      cover_url: row.coverUrl,
      files_url: admin ? row.filesUrl : [],
      fileCount: Array.isArray(row.filesUrl) ? row.filesUrl.length : row.filesUrl ? 1 : 0,
      tags: row.tags,
      colors: row.colors,
      type: row.type,
      status: row.status,
      createAt: row.createdAt,
      createdAt: row.createdAt
    }
  }
  /** 后台和Electron共用筛选；公开查询只展示上架素材 */
  async findPage(q: QueryMaterialDto, admin = false, both = false, scopeIds?: number[]) {
    const page = q.pagesNum ?? q.pageNum ?? 1,
      size = q.pagesSize ?? q.pageSize ?? 20
    const where: Prisma.MaterialWhereInput = {}
    if (!admin) where.status = 1
    const type = q.materialType ?? q.pagesType ?? q.pageType
    if (type) where.type = type
    const cate = q.cate_id ?? q.cateId
    if (cate && !['ALL', 'NEW'].includes(cate)) {
      const id = this.id(cate)
      where.OR = [{ topId: id }, { subId: id }, { thirdId: id }]
    }
    const text = (q.searchValue ?? q.searchVal)?.trim()
    const and: Prisma.MaterialWhereInput[] = []
    if (scopeIds !== undefined) and.push({ id: { in: scopeIds } })
    if (text)
      and.push({
        OR: [{ name: { contains: text } }, { enName: { contains: text } }]
      })
    const tag = q.currentTag ?? q.tag,
      color = q.currentColor ?? q.color
    if (tag) and.push({ tags: { array_contains: [tag] } })
    if (color) and.push({ colors: { array_contains: [color] } })
    if (q.tags?.length) and.push({ tags: { array_contains: q.tags } })
    if (q.colors?.length) and.push({ colors: { array_contains: q.colors } })
    if (both) {
      const ids = [q.loveIds, q.downIds].filter(Boolean).join(',').split(',').filter(Boolean)
      if (ids.length > 1000) throw new BadRequestException('编号过多')
      where.id = { in: ids.map((id) => this.id(id)) }
    }
    where.AND = and
    const [rows, total, facets] = await Promise.all([
      this.repo.findMany(where, (page - 1) * size, size),
      this.repo.count(where),
      this.repo.facets(where)
    ])
    const values = (key: 'tags' | 'colors') => [
      ...new Set(
        facets.flatMap((row) =>
          Array.isArray(row[key]) ? row[key].filter((v): v is string => typeof v === 'string') : []
        )
      )
    ]
    return {
      list: rows.map((row) => this.project(row, admin)),
      total,
      currentPage: page,
      pageSize: size,
      tags: values('tags'),
      colors: values('colors')
    }
  }
  /** 校验分类层级和类型，显式映射持久化字段 */
  private async data(dto: MaterialDto): Promise<Prisma.MaterialUncheckedCreateInput> {
    const topId = this.id(dto.top_id),
      subId = dto.sub_id ? this.id(dto.sub_id) : null,
      thirdId = dto.third_id ? this.id(dto.third_id) : null
    const top = await this.repo.category(topId)
    if (!top || top.level !== 1 || top.type !== dto.type)
      throw new BadRequestException('一级分类与素材类型不匹配')
    if (subId) {
      const sub = await this.repo.category(subId)
      if (!sub || sub.level !== 2 || sub.parentId !== topId || sub.type !== dto.type)
        throw new BadRequestException('二级分类不属于当前一级分类')
    }
    if (thirdId) {
      if (!subId) throw new BadRequestException('选择三级分类前必须选择二级分类')
      const third = await this.repo.category(thirdId)
      if (!third || third.level !== 3 || third.parentId !== subId || third.type !== dto.type)
        throw new BadRequestException('三级分类不属于当前二级分类')
    }
    return {
      topId,
      subId,
      thirdId,
      name: dto.name,
      enName: dto.en_name,
      coverUrl: dto.cover_url,
      filesUrl: dto.files_url,
      tags: [...new Set(dto.tags)],
      colors: [...new Set(dto.colors)],
      type: dto.type,
      status: dto.status
    }
  }
  /** 转换持久化缺失和关联冲突 */
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException('素材不存在')
        if (e.code === 'P2003') throw new ConflictException('分类已变更，请刷新重试')
      }
      throw e
    }
  }
  /** 管理员新增素材 */
  async create(dto: MaterialDto) {
    const data = await this.data(dto)
    const row = await this.write(() => this.repo.create(data))
    return { acknowledged: true, insertedId: String(row.id) }
  }
  /** 管理员更新素材 */
  async update(id: string, dto: MaterialDto) {
    const data = await this.data(dto)
    await this.write(() => this.repo.update(this.id(id), data))
    return { acknowledged: true, matchedCount: 1 }
  }
  /** 管理员删除素材 */
  async remove(id: string) {
    try {
      await this.repo.remove(this.id(id))
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')
        throw new NotFoundException('素材不存在')
      throw e
    }
    return { deletedCount: 1 }
  }
}
