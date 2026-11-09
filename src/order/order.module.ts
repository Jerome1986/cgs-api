import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { OrderRepository } from './order.repository'

/** 装配订单四层及现有管理员认证 */
@Module({
  imports: [AdminModule],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService]
})
export class OrderModule {}
