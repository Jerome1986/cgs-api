import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { Prisma } from '@prisma/client'
import { TagController } from './tag.controller'
import { TagService } from './tag.service'
import { TagRepository } from './tag.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('标签HTTP契约（隔离数据库与身份认证）', () => {
  let app: INestApplication<App>
  const row = {
    id: 1,
    name: '现代',
    enName: 'modern',
    createdAt: new Date('2026-11-04T00:00:00Z')
  }
  const repository = {
    attributes: jest.fn().mockResolvedValue([row]),
    countAttributes: jest.fn().mockResolvedValue(1),
    colors: jest.fn().mockResolvedValue([]),
    countColors: jest.fn().mockResolvedValue(0),
    createAttribute: jest.fn().mockResolvedValue(row),
    updateAttribute: jest.fn().mockResolvedValue(row),
    removeAttribute: jest.fn().mockResolvedValue(row),
    createColor: jest.fn().mockResolvedValue({ id: 2 }),
    updateColor: jest.fn().mockResolvedValue({ id: 2 }),
    removeColor: jest.fn().mockResolvedValue({ id: 2, color: '#FFFFFF', createdAt: row.createdAt })
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TagController],
      providers: [TagService, { provide: TagRepository, useValue: repository }]
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (
            context.switchToHttp().getRequest<Request>().headers.authorization !==
            'Bearer test-admin'
          ) {
            throw new UnauthorizedException()
          }
          return true
        }
      })
      .compile()
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => jest.clearAllMocks())

  it('公开字典投影兼容旧字段，分页正确下推', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/attributeTag-get?pagesNum=2&pagesSize=10')
      .expect(200)
    expect((result.body as { data: { list: unknown[] } }).data.list[0]).toEqual({
      _id: '1',
      name: '现代',
      en_name: 'modern',
      createdAt: row.createdAt.toISOString()
    })
    expect(repository.attributes).toHaveBeenCalledWith(10, 10)
    await request(app.getHttpServer()).get('/api/colorTag-get').expect(200)
    expect(repository.colors).toHaveBeenCalledWith(undefined, undefined)
  })
  it('拒绝非法分页、空名称、额外字段及颜色', async () => {
    await request(app.getHttpServer()).get('/api/attributeTag-get?pagesSize=101').expect(400)
    for (const body of [{ name: ' ' }, { name: '现代', role: 'ADMIN' }]) {
      await request(app.getHttpServer())
        .post('/api/attributeTag-add')
        .set('Authorization', 'Bearer test-admin')
        .send(body)
        .expect(400)
    }
    await request(app.getHttpServer())
      .post('/api/colorTag-add')
      .set('Authorization', 'Bearer test-admin')
      .send({ color: 'red' })
      .expect(400)
  })
  it('全部写入路由均有认证保护', async () => {
    for (const prefix of ['attributeTag', 'colorTag']) {
      await request(app.getHttpServer())
        .post('/api/' + prefix + '-add')
        .send({})
        .expect(401)
      await request(app.getHttpServer())
        .put('/api/' + prefix + '-update')
        .send({})
        .expect(401)
      await request(app.getHttpServer())
        .delete('/api/' + prefix + '-del?_id=1')
        .expect(401)
    }
  })
  it('创建去除空白、颜色归一化、编辑删除及不存在处理', async () => {
    await request(app.getHttpServer())
      .post('/api/attributeTag-add')
      .set('Authorization', 'Bearer test-admin')
      .send({ name: ' 现代 ', en_name: ' modern ' })
      .expect(201)
    expect(repository.createAttribute).toHaveBeenCalledWith('现代', 'modern')
    await request(app.getHttpServer())
      .post('/api/colorTag-add')
      .set('Authorization', 'Bearer test-admin')
      .send({ color: '#ffff' })
      .expect(201)
    expect(repository.createColor).toHaveBeenCalledWith('#FFFFFF')
    await request(app.getHttpServer())
      .put('/api/attributeTag-update')
      .set('Authorization', 'Bearer test-admin')
      .send({ _id: '1', name: '新名' })
      .expect(200)
    expect(repository.updateAttribute).toHaveBeenCalledWith(1, '新名', '')
    await request(app.getHttpServer())
      .delete('/api/colorTag-del?_id=2')
      .set('Authorization', 'Bearer test-admin')
      .expect(200)
    repository.removeAttribute.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '7'
      })
    )
    await request(app.getHttpServer())
      .delete('/api/attributeTag-del?_id=1')
      .set('Authorization', 'Bearer test-admin')
      .expect(404)
    repository.createAttribute.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7'
      })
    )
    await request(app.getHttpServer())
      .post('/api/attributeTag-add')
      .set('Authorization', 'Bearer test-admin')
      .send({ name: '现代' })
      .expect(409)
  })
})
