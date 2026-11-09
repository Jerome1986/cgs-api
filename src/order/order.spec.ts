import { Test } from '@nestjs/testing'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { App } from 'supertest/types'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { OrderRepository } from './order.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('订单HTTP契约（隔离数据库）', () => {
  let app: INestApplication<App>
  const row = {
    id: 7,
    orderNo: 'ORD-SNAPSHOT',
    userId: 3,
    productId: 2,
    productName: '购买时的金币包',
    productType: 'gold',
    amount: new Prisma.Decimal('19.90'),
    status: 'COMPLETED',
    paymentId: null,
    goldCoinsAmount: 100,
    membershipType: '',
    dailyDownloadLimit: 0,
    paidAt: new Date('2026-11-04T00:01:00Z'),
    createdAt: new Date('2026-11-04T00:00:00Z'),
    updatedAt: new Date('2026-11-04T00:02:00Z'),
    user: { username: 'buyer' }
  }
  const repo = { findMany: jest.fn(), count: jest.fn(), findOne: jest.fn() }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [OrderService, { provide: OrderRepository, useValue: repo }]
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (context.switchToHttp().getRequest<Request>().headers.authorization !== 'Bearer test')
            throw new UnauthorizedException()
          return true
        }
      })
      .compile()
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => {
    jest.resetAllMocks()
    repo.findMany.mockResolvedValue([row])
    repo.count.mockResolvedValue(21)
    repo.findOne.mockResolvedValue(row)
  })

  it('原路径及api路径保留分页层级、字符串编号、元金额和快照', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer())
        .get(`${prefix}/user-order-get`)
        .set('Authorization', 'Bearer test')
        .expect(200)
      expect(response.body).toMatchObject({
        code: 200,
        data: {
          list: [
            {
              _id: '7',
              order_id: 'ORD-SNAPSHOT',
              payment_id: '',
              user_id: '3',
              product_id: '2',
              product_name: '购买时的金币包',
              amount: 19.9,
              recharge_type: '金币充值',
              status: 1,
              orderStatus: 'COMPLETED',
              goldCoinsAmount: 100,
              create_date: row.createdAt.getTime(),
              paidAt: row.paidAt.toISOString()
            }
          ],
          total: 21,
          page: 1,
          pageSize: 10
        }
      })
    }
    expect(repo.findMany).toHaveBeenCalledWith(expect.any(Object), 0, 10)
  })

  it('组合筛选与分页使用相同数据库条件，关键词去除两端空格', async () => {
    await request(app.getHttpServer())
      .get('/api/user-order-get')
      .query({
        page: 2,
        pageSize: 10,
        searchValue: ' buyer ',
        orderStatus: 'PAID',
        productType: 'gold'
      })
      .set('Authorization', 'Bearer test')
      .expect(200)
    const where = {
      status: 'PAID',
      productType: 'gold',
      OR: [
        { orderNo: { contains: 'buyer' } },
        { paymentId: { contains: 'buyer' } },
        { user: { username: { contains: 'buyer' } } }
      ]
    }
    expect(repo.findMany).toHaveBeenCalledWith(where, 10, 10)
    expect(repo.count).toHaveBeenCalledWith(where)
  })

  it('旧搜索入口保持data数组，详情从数据库读取最新订单快照', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer())
        .post(`${prefix}/user-order-search`)
        .set('Authorization', 'Bearer test')
        .send({ searchValue: 'ORD' })
        .expect(201)
      expect(response.body).toMatchObject({
        data: [{ order_id: 'ORD-SNAPSHOT' }]
      })
      expect(Array.isArray((response.body as { data: unknown }).data)).toBe(true)
    }
    const detail = await request(app.getHttpServer())
      .get('/api/admin/orders/7')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(detail.body).toMatchObject({
      data: { _id: '7', username: 'buyer' }
    })
    expect(repo.findOne).toHaveBeenCalledWith(7)
    repo.findOne.mockResolvedValue({
      ...row,
      productType: 'membership',
      productName: '购买时的年费套餐',
      goldCoinsAmount: 0,
      membershipType: 'annual',
      dailyDownloadLimit: 30,
      paidAt: null
    })
    const membership = await request(app.getHttpServer())
      .get('/api/admin/orders/7')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(membership.body).toMatchObject({
      data: {
        product_name: '购买时的年费套餐',
        recharge_type: '购买会员',
        membershipType: 'annual',
        goldCoinsAmount: 0,
        dailyDownloadLimit: 30,
        paidAt: null
      }
    })
  })

  it.each([
    ['PENDING', 0],
    ['PAID', 1],
    ['COMPLETED', 1],
    ['CANCELLED', 2],
    ['FAILED', 2],
    ['FUTURE', -1]
  ])('兼容旧支付码并保留原始状态 %s', async (status, legacy) => {
    repo.findOne.mockResolvedValue({ ...row, status })
    const response = await request(app.getHttpServer())
      .get('/api/admin/orders/7')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(response.body).toMatchObject({
      data: { status: legacy, orderStatus: status }
    })
  })

  it('全部管理入口拒绝匿名身份，不能匿名暴露订单详情', async () => {
    for (const prefix of ['', '/api']) {
      await request(app.getHttpServer()).get(`${prefix}/user-order-get`).expect(401)
      await request(app.getHttpServer())
        .post(`${prefix}/user-order-search`)
        .send({ searchValue: '' })
        .expect(401)
    }
    await request(app.getHttpServer()).get('/api/admin/orders/7').expect(401)
    expect(repo.findMany).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it.each([
    'page=0',
    'page=1.5',
    'pageSize=101',
    'pageSize=0',
    'orderStatus=1',
    'productType=invalid',
    'userId=3',
    'page='
  ])('拒绝非法查询 %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/user-order-get?${query}`)
      .set('Authorization', 'Bearer test')
      .expect(400)
    expect(repo.findMany).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { searchValue: null },
    { searchValue: 1 },
    { searchValue: 'x'.repeat(129) },
    { searchValue: '', userId: 1 }
  ])('旧搜索也严格校验 %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/user-order-search')
      .set('Authorization', 'Bearer test')
      .send(body)
      .expect(400)
    expect(repo.findMany).not.toHaveBeenCalled()
  })

  it('非法主键400、不存在404，空列表和超范围页仍返回真实总数', async () => {
    for (const id of ['abc', '0', '1.5', '2147483648']) {
      await request(app.getHttpServer())
        .get(`/api/admin/orders/${id}`)
        .set('Authorization', 'Bearer test')
        .expect(400)
    }
    repo.findOne.mockResolvedValue(null)
    await request(app.getHttpServer())
      .get('/api/admin/orders/99')
      .set('Authorization', 'Bearer test')
      .expect(404)
    repo.findMany.mockResolvedValue([])
    const response = await request(app.getHttpServer())
      .get('/api/user-order-get?page=100')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(response.body).toMatchObject({
      data: { list: [], total: 21, page: 100 }
    })
    repo.count.mockResolvedValue(0)
    const empty = await request(app.getHttpServer())
      .get('/api/user-order-get')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(empty.body).toMatchObject({ data: { list: [], total: 0 } })
  })
})
