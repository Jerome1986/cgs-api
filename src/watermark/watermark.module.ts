import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { WatermarkController } from './watermark.controller'
import { WatermarkService } from './watermark.service'
import { WatermarkRepository } from './watermark.repository'

/** 装配水印四层及现有管理员认证能力 */
@Module({
  imports: [AdminModule],
  controllers: [WatermarkController],
  providers: [WatermarkService, WatermarkRepository],
  exports: [WatermarkService]
})
export class WatermarkModule {}
