import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { MaterialController } from './material.controller'
import { MaterialService } from './material.service'
import { MaterialRepository } from './material.repository'
import { MaterialUploadController } from './material-upload.controller'
import { MaterialUploadService } from './material-upload.service'
import { MaterialAssetGuard } from './material-asset.guard'
@Module({
  imports: [AdminModule],
  controllers: [MaterialController, MaterialUploadController],
  providers: [MaterialService, MaterialRepository, MaterialUploadService, MaterialAssetGuard],
  exports: [MaterialService, MaterialUploadService]
})
export class MaterialModule {}
