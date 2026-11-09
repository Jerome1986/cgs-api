import { Test } from '@nestjs/testing'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { App } from 'supertest/types'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { WatermarkController } from './watermark.controller'
import { WatermarkService } from './watermark.service'
import { WatermarkRepository } from './watermark.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('水印HTTP契约（隔离数据库）', () => {
  let app: INestApplication<App>
  const row = {
    id: 7,
    name: '水印',
    imageUrl: 'https://example.com/watermark.png',
    deletedAt: null,
    createdAt: new Date('2026-11-04T00:00:00Z'),
    updatedAt: new Date('2026-11-04T00:00:00Z')
  }
  const body = { name: ' 水印 ', images: row.imageUrl }
  const repo = {
    findMany: jest.fn(),
    count: jest.fn(),
    findAt: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WatermarkController],
      providers: [WatermarkService, { provide: WatermarkRepository, useValue: repo }]
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
    repo.findAt.mockResolvedValue({ imageUrl: row.imageUrl })
    repo.create.mockResolvedValue(row)
    repo.update.mockResolvedValue(row)
  })

  it('原路径与api路径保留分页list、total和字符串_id', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer())
        .get(`${prefix}/watermark-get`)
        .set('Authorization', 'Bearer test')
        .expect(200)
      expect(response.body).toMatchObject({
        code: 200,
        data: {
          list: [{ _id: '7', name: '水印', images: row.imageUrl }],
          total: 21,
          currentPage: 1,
          pageSize: 10
        }
      })
      expect((response.body as { data: { list: unknown[] } }).data.list[0]).not.toHaveProperty(
        'deletedAt'
      )
    }
  })

  it('关键词去空白后用于列表及总数，页码偏移正确', async () => {
    await request(app.getHttpServer())
      .get('/api/watermark-get')
      .query({ pagesNum: 2, pagesSize: 10, keyword: ' logo ' })
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(repo.findMany).toHaveBeenCalledWith({ name: { contains: 'logo' } }, 10, 10)
    expect(repo.count).toHaveBeenCalledWith({ name: { contains: 'logo' } })
  })

  it('Electron公开随机读取仅返回images，兼容根路径和api前缀', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer())
        .get(`${prefix}/watermark-randomGet`)
        .expect(200)
      expect(response.body).toEqual({
        code: 200,
        message: 'success',
        data: { images: row.imageUrl }
      })
    }
    const offsets = repo.findAt.mock.calls as [number][]
    expect(
      offsets.every(([offset]) => Number.isInteger(offset) && offset >= 0 && offset < 21)
    ).toBe(true)
  })

  it('空库及统计后并发删除返回空字符串，保持可访问的images字段', async () => {
    repo.count.mockResolvedValue(0)
    const empty = await request(app.getHttpServer()).get('/watermark-randomGet').expect(200)
    expect(empty.body).toMatchObject({ data: { images: '' } })
    expect(repo.findAt).not.toHaveBeenCalled()
    repo.count.mockResolvedValue(1)
    repo.findAt.mockResolvedValue(null)
    const raced = await request(app.getHttpServer()).get('/api/watermark-randomGet').expect(200)
    expect(raced.body).toMatchObject({ data: { images: '' } })
  })

  it('管理列表与全部写入口都拒绝匿名身份', async () => {
    for (const prefix of ['', '/api']) {
      await request(app.getHttpServer()).get(`${prefix}/watermark-get`).expect(401)
      await request(app.getHttpServer()).post(`${prefix}/watermark-add`).send(body).expect(401)
      await request(app.getHttpServer())
        .post(`${prefix}/watermark-update`)
        .send({ ...body, watermarkId: '7' })
        .expect(401)
      await request(app.getHttpServer())
        .post(`${prefix}/watermark-del`)
        .send({ watermarkId: '7' })
        .expect(401)
    }
    expect(repo.findMany).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('新增、编辑保留旧POST协议，写入仅映射名称与地址，删除仅写软删除时间', async () => {
    for (const prefix of ['', '/api']) {
      const response = await request(app.getHttpServer())
        .post(`${prefix}/watermark-add`)
        .set('Authorization', 'Bearer test')
        .send(body)
        .expect(201)
      expect(response.body).toMatchObject({ data: { acknowledged: true, insertedId: '7' } })
      expect(repo.create).toHaveBeenLastCalledWith('水印', row.imageUrl)
      await request(app.getHttpServer())
        .post(`${prefix}/watermark-update`)
        .set('Authorization', 'Bearer test')
        .send({ ...body, watermarkId: '7' })
        .expect(201)
      expect(repo.update).toHaveBeenLastCalledWith(7, { name: '水印', imageUrl: row.imageUrl })
      await request(app.getHttpServer())
        .post(`${prefix}/watermark-del`)
        .set('Authorization', 'Bearer test')
        .send({ watermarkId: '7' })
        .expect(201)
      expect(repo.update).toHaveBeenLastCalledWith(7, { deletedAt: expect.any(Date) as unknown })
    }
    const longUrl = 'https://example.com/' + 'a'.repeat(3000) + '.png'
    await request(app.getHttpServer())
      .post('/api/watermark-add')
      .set('Authorization', 'Bearer test')
      .send({ name: '长地址水印', images: longUrl })
      .expect(201)
    expect(repo.create).toHaveBeenLastCalledWith('长地址水印', longUrl)
  })

  it.each([
    { name: '' },
    { name: ' ' },
    { name: 'a'.repeat(101) },
    { images: '' },
    { images: null },
    { images: 1 },
    { images: '/local.png' },
    { images: 'javascript:alert(1)' },
    { images: 'file:///tmp/a.png' },
    { images: 'https://user:pass@example.com/a.png' },
    { images: 'https://example.com/' + 'a'.repeat(4096) },
    { role: 'ADMIN' }
  ])('拒绝非法水印数据 %j', async (changes) => {
    for (const path of ['watermark-add', 'watermark-update']) {
      await request(app.getHttpServer())
        .post('/api/' + path)
        .set('Authorization', 'Bearer test')
        .send({ ...body, ...(path === 'watermark-update' ? { watermarkId: '7' } : {}), ...changes })
        .expect(400)
    }
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it.each(['pagesNum=0', 'pagesNum=1.5', 'pagesSize=101', 'pagesSize=0', 'pagesNum=', 'extra=1'])(
    '拒绝非法分页 %s',
    async (query) => {
      await request(app.getHttpServer())
        .get('/api/watermark-get?' + query)
        .set('Authorization', 'Bearer test')
        .expect(400)
      expect(repo.findMany).not.toHaveBeenCalled()
    }
  )

  it('无效主键400，已删除或不存在404，超范围页保留真实total', async () => {
    for (const watermarkId of ['0', 'abc', '2147483648', 7, null]) {
      await request(app.getHttpServer())
        .post('/api/watermark-del')
        .set('Authorization', 'Bearer test')
        .send({ watermarkId })
        .expect(400)
    }
    repo.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '7' })
    )
    await request(app.getHttpServer())
      .post('/api/watermark-del')
      .set('Authorization', 'Bearer test')
      .send({ watermarkId: '99' })
      .expect(404)
    await request(app.getHttpServer())
      .post('/api/watermark-update')
      .set('Authorization', 'Bearer test')
      .send({ ...body, watermarkId: '99' })
      .expect(404)
    repo.findMany.mockResolvedValue([])
    const response = await request(app.getHttpServer())
      .get('/api/watermark-get?pagesNum=100')
      .set('Authorization', 'Bearer test')
      .expect(200)
    expect(response.body).toMatchObject({ data: { list: [], total: 21, currentPage: 100 } })
  })
})
