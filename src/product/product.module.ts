import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'
import { ProductRepository } from './product.repository'

/** 装配商品四层与现有管理员认证能力 */
@Module({
  imports: [AdminModule],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository]
})
export class ProductModule {}
