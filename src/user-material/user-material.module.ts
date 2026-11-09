import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { UserAuthModule } from '../user-auth/user-auth.module'
import { MaterialModule } from '../material/material.module'
import { UserMaterialController } from './user-material.controller'
import { UserMaterialRepository } from './user-material.repository'
import { UserMaterialService } from './user-material.service'
import { UserMaterialFileService } from './user-material-file.service'

@Module({
  imports: [UserAuthModule, MaterialModule, AdminModule],
  controllers: [UserMaterialController],
  providers: [UserMaterialService, UserMaterialRepository, UserMaterialFileService]
})
export class UserMaterialModule {}
