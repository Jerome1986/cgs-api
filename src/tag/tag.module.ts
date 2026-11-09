import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { TagController } from './tag.controller'
import { TagService } from './tag.service'
import { TagRepository } from './tag.repository'

@Module({
  imports: [AdminModule],
  controllers: [TagController],
  providers: [TagService, TagRepository],
  exports: [TagService]
})
export class TagModule {}
