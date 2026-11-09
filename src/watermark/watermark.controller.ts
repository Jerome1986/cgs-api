import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import {
  QueryWatermarkDto,
  UpdateWatermarkDto,
  WatermarkDto,
  WatermarkIdDto
} from './dto/watermark.dto'
import { WatermarkService } from './watermark.service'

/** 保留旧水印路由和字段，公开随机读取与管理权限分开声明 */
@Controller()
export class WatermarkController {
  constructor(private readonly service: WatermarkService) {}

  /** Electron公开随机获取展示水印，只返回images */
  @Get('watermark-randomGet')
  findRandom() {
    return this.service.findRandom()
  }

  /** 管理员分页查询与名称筛选水印 */
  @Get('watermark-get')
  @UseGuards(AdminAuthGuard)
  findPage(@Query() query: QueryWatermarkDto) {
    return this.service.findPage(query)
  }

  /** 管理员新增水印配置 */
  @Post('watermark-add')
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: WatermarkDto) {
    return this.service.create(dto)
  }

  /** 管理员编辑水印，保留旧POST方法与watermarkId字段 */
  @Post('watermark-update')
  @UseGuards(AdminAuthGuard)
  update(@Body() dto: UpdateWatermarkDto) {
    return this.service.update(dto, dto.watermarkId)
  }

  /** 管理员软删除指定水印配置 */
  @Post('watermark-del')
  @UseGuards(AdminAuthGuard)
  remove(@Body() dto: WatermarkIdDto) {
    return this.service.remove(dto.watermarkId)
  }
}
