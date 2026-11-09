import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { OrderIdDto, QueryOrderDto, SearchOrderDto } from './dto/order.dto'
import { OrderService } from './order.service'

/** 后台订单入口全部受管理员鉴权，业务投影供后续客户端模块复用 */
@Controller()
@UseGuards(AdminAuthGuard)
export class OrderController {
  constructor(private readonly service: OrderService) {}

  /** 分页查询订单，兼容原后台路径与page、pageSize参数 */
  @Get('user-order-get')
  findPage(@Query() query: QueryOrderDto) {
    return this.service.findPage(query)
  }

  /** 兼容原后台按订单号或用户名搜索的数组响应 */
  @Post('user-order-search')
  search(@Body() dto: SearchOrderDto) {
    return this.service.search(dto.searchValue)
  }

  /** 管理员查看订单价格及权益快照详情 */
  @Get('admin/orders/:id')
  findOne(@Param() params: OrderIdDto) {
    return this.service.findOne(params.id)
  }
}
