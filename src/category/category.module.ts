import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { CategoryController } from './category.controller'
import { CategoryLegacyController } from './category-legacy.controller'
import { CategoryRepository } from './category.repository'
import { CategoryService } from './category.service'

@Module({
  imports: [AdminModule],
  controllers: [CategoryController, CategoryLegacyController],
  providers: [CategoryService, CategoryRepository]
})
export class CategoryModule {}
