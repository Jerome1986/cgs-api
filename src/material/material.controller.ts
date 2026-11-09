import { Body, Controller, Delete, Get, Post, Put, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { MaterialService } from './material.service'
import {
  DeleteMaterialDto,
  MaterialDto,
  QueryMaterialDto,
  UpdateMaterialDto
} from './dto/material.dto'
@Controller()
export class MaterialController {
  constructor(private readonly service: MaterialService) {}
  /** 后台素材分页 */
  @Get('material-get')
  @UseGuards(AdminAuthGuard)
  findPage(@Query() q: QueryMaterialDto) {
    return this.service.findPage(q, true)
  }
  /** 后台搜索保留数组data和顶层total */
  @Post('material-search')
  @UseGuards(AdminAuthGuard)
  async search(@Body() q: QueryMaterialDto, @Res() res: Response) {
    const page = await this.service.findPage(q, true)
    res.json({
      code: 200,
      message: 'success',
      data: page.list,
      total: page.total
    })
  }
  /** 管理员新增素材 */
  @Post('material-add')
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: MaterialDto) {
    return this.service.create(dto)
  }
  /** 管理员编辑素材 */
  @Put('material-update')
  @UseGuards(AdminAuthGuard)
  update(@Body() dto: UpdateMaterialDto) {
    return this.service.update(dto._id, dto)
  }
  /** 管理员删除素材 */
  @Delete('material-deleted')
  @UseGuards(AdminAuthGuard)
  remove(@Query() q: DeleteMaterialDto) {
    return this.service.remove(q.material_id)
  }
  /** Electron按分类或标签及组合筛选共享查询 */
  @Get(['material-byCateId-get', 'material-tags-get', 'filterMaterial'])
  filter(@Query() q: QueryMaterialDto) {
    return this.service.findPage(q)
  }
  /** Electron搜索保留数组data与顶层total */
  @Post('material-searchWeb')
  async searchWeb(@Body() q: QueryMaterialDto, @Res() res: Response) {
    const page = await this.service.findPage(q)
    res.json({
      code: 200,
      message: 'success',
      data: page.list,
      total: page.total
    })
  }
  /** Electron收藏下载编号筛选，仅查询不授予下载权益 */
  @Get('bothFilterMaterial')
  both(@Query() q: QueryMaterialDto) {
    return this.service.findPage(q, false, true)
  }
}
