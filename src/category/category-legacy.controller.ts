import { Controller, Get, Query } from '@nestjs/common'
import { CategoryService } from './category.service'
import { LegacyFirstDto, LegacySubDto } from './dto/category.dto'

@Controller()
export class CategoryLegacyController {
  constructor(private readonly service: CategoryService) {}

  /** 兼容Electron现有一级分类读取路径与字段 */
  @Get('cate-first')
  first(@Query() query: LegacyFirstDto) {
    return this.service.legacyFirst(query.pageType)
  }

  /** 兼容Electron现有子分类读取路径与嵌套响应 */
  @Get('cate-sub')
  sub(@Query() query: LegacySubDto) {
    return this.service.legacySub(query.cateId)
  }
}
