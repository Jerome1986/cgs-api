import { Test } from '@nestjs/testing'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { App } from 'supertest/types'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'
import { ProductRepository } from './product.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('商品HTTP契约（隔离数据库）', () => {
  let app: INestApplication<App>
  const row = {
    id: 1,
    productType: 'gold',
    productName: '金币包',
    enName: 'Coins',
    price: new Prisma.Decimal('19.90'),
    goldCoinsAmount: 100,
    membershipType: '',
    dailyDownloadLimit: 0,
    description: '100金币',
    enDescription: '',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const body = {
    productType: 'gold',
    productName: ' 金币包 ',
    price: 19.9,
    goldCoinsAmount: 100,
    description: '100金币'
  }
  const repo = {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [ProductService, { provide: ProductRepository, useValue: repo }]
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
    repo.count.mockResolvedValue(25)
    repo.create.mockResolvedValue(row)
    repo.update.mockResolvedValue(row)
  })

  it('Electron原路径与api路径均保留数组data、字符串编号、中文类型及数字价格', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer()).get(`${prefix}/products-get`).expect(200)
      expect(response.body).toMatchObject({
        code: 200,
        data: [{ _id: '1', productType: '金币充值', price: 19.9, isActive: true }]
      })
      expect(Array.isArray((response.body as { data: unknown }).data)).toBe(true)
    }
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: null, isActive: true }),
      undefined,
      undefined
    )
  })

  it('后台分页使用英文枚举，名称与状态筛选用于列表和总数', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/admin/products?pagesNumber=2&pagesSize=10&productType=gold&isActive=false&keyword=Coins'
      )
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(response.body).toMatchObject({
      data: {
        list: [{ productType: 'gold' }],
        total: 25,
        currentPage: 2,
        pageSize: 10
      }
    })
    const where = {
      deletedAt: null,
      isActive: false,
      productType: 'gold',
      OR: [{ productName: { contains: 'Coins' } }, { enName: { contains: 'Coins' } }]
    }
    expect(repo.findMany).toHaveBeenCalledWith(where, 10, 10)
    expect(repo.count).toHaveBeenCalledWith(where)
  })

  it('公开接口支持中文筛选且不能读取下架商品', async () => {
    await request(app.getHttpServer())
      .get('/products-get')
      .query({ productType: '购买会员', isActive: 'false' })
      .expect(200)
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        productType: 'membership',
        isActive: true,
        deletedAt: null
      }),
      undefined,
      undefined
    )
  })

  it('全部管理入口拒绝匿名身份，旧根写路径同样受保护', async () => {
    await request(app.getHttpServer()).get('/api/admin/products').expect(401)
    for (const prefix of ['', '/api']) {
      await request(app.getHttpServer()).post(`${prefix}/products-add`).send(body).expect(401)
      await request(app.getHttpServer())
        .put(`${prefix}/products-update`)
        .send({ ...body, _id: '1' })
        .expect(401)
      await request(app.getHttpServer())
        .put(`${prefix}/products-status`)
        .send({ _id: '1', isActive: false })
        .expect(401)
      await request(app.getHttpServer()).delete(`${prefix}/products-delete?id=1`).expect(401)
    }
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it.each([
    { price: 0 },
    { price: -1 },
    { price: 1.001 },
    { price: 100000000 },
    { price: '19.90' },
    { goldCoinsAmount: 0 },
    { goldCoinsAmount: 1.5 },
    { productName: ' ' },
    { isActive: 'false' },
    { price: null },
    { productType: 'membership', membershipType: '', dailyDownloadLimit: 30 },
    {
      productType: 'membership',
      membershipType: 'annual',
      dailyDownloadLimit: 0
    },
    { role: 'ADMIN' },
    { _id: '' }
  ])('拒绝非法商品数据 %j', async (changes) => {
    await request(app.getHttpServer())
      .post('/api/products-add')
      .set('Authorization', 'Bearer test')
      .send({ ...body, ...changes })
      .expect(400)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each(['pagesSize=0', 'pagesNumber=-1', 'pagesSize=101', 'isActive=0', 'productType=invalid'])(
    '拒绝非法分页筛选 %s',
    async (query) => {
      await request(app.getHttpServer()).get(`/products-get?${query}`).expect(400)
      expect(repo.findMany).not.toHaveBeenCalled()
    }
  )

  it('新增商品白名单映射及跨类型编辑清理无关权益', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/products-add')
      .set('Authorization', 'Bearer test')
      .send(body)
      .expect(201)
    expect(response.body).toMatchObject({ data: { insertedId: '1' } })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: '金币包',
        price: new Prisma.Decimal('19.9'),
        goldCoinsAmount: 100,
        membershipType: '',
        dailyDownloadLimit: 0
      })
    )
    await request(app.getHttpServer())
      .put('/api/products-update')
      .set('Authorization', 'Bearer test')
      .send({
        ...body,
        _id: '1',
        productType: 'membership',
        membershipType: 'permanent',
        dailyDownloadLimit: 30
      })
      .expect(200)
    expect(repo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        productType: 'membership',
        membershipType: 'permanent',
        dailyDownloadLimit: 30,
        goldCoinsAmount: 0
      })
    )
  })

  it('独立上下架不覆盖权益，删除仅写入软删除时间与下架状态', async () => {
    await request(app.getHttpServer())
      .put('/api/products-status')
      .set('Authorization', 'Bearer test')
      .send({ _id: '1', isActive: false })
      .expect(200)
    expect(repo.update).toHaveBeenLastCalledWith(1, { isActive: false })
    await request(app.getHttpServer())
      .delete('/api/products-delete?id=1')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(repo.update).toHaveBeenLastCalledWith(1, {
      isActive: false,
      deletedAt: expect.any(Date) as unknown
    })
  })

  it('无效编号400，记录缺失或已删除404，空列表仍成功', async () => {
    await request(app.getHttpServer())
      .delete('/api/products-delete?id=2147483648')
      .set('Authorization', 'Bearer test')
      .expect(400)
    repo.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '7'
      })
    )
    await request(app.getHttpServer())
      .delete('/api/products-delete?id=99')
      .set('Authorization', 'Bearer test')
      .expect(404)
    repo.findMany.mockResolvedValue([])
    repo.count.mockResolvedValue(0)
    const response = await request(app.getHttpServer()).get('/products-get').expect(200)
    expect(response.body).toMatchObject({ data: [] })
  })
})
