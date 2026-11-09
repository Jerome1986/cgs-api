import { Test } from '@nestjs/testing'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { App } from 'supertest/types'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { UserRepository } from './user.repository'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('业务用户写操作HTTP契约（隔离数据库）', () => {
  let app: INestApplication<App>
  const row = { id: 7, username: 'memberOne', role: 'user', coins: 10, status: 1 }
  const body = { username: 'memberOne', role: 'user', coins: 10 }
  const repo = {
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
    findOne: jest.fn()
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [UserService, { provide: UserRepository, useValue: repo }]
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
    repo.create.mockResolvedValue(row)
    repo.update.mockResolvedValue({ count: 1 })
    repo.updateStatus.mockResolvedValue(row)
    repo.remove.mockResolvedValue({ id: 7 })
    repo.findOne.mockResolvedValue(row)
  })

  it('原根路径和api路径均支持新增、编辑、启禁用及删除，字段白名单不更新状态或会员期限', async () => {
    for (const prefix of ['', '/api']) {
      const added = await request(app.getHttpServer())
        .post(prefix + '/user-add')
        .set('Authorization', 'Bearer test')
        .send(body)
        .expect(201)
      expect(added.body).toMatchObject({ code: 200, data: { insertedId: 7 } })
      expect(repo.create).toHaveBeenLastCalledWith('memberOne', 'user', 10)
      await request(app.getHttpServer())
        .put(prefix + '/user-editInfo')
        .set('Authorization', 'Bearer test')
        .send({ id: 7, username: 'memberTwo', role: 'vip' })
        .expect(200)
      expect(repo.update).toHaveBeenLastCalledWith(
        7,
        { username: 'memberTwo', role: 'vip' },
        undefined
      )
      await request(app.getHttpServer())
        .put(prefix + '/user-status-update')
        .set('Authorization', 'Bearer test')
        .send({ id: 7, status: 0, role: 'ADMIN' })
        .expect(200)
      expect(repo.updateStatus).toHaveBeenLastCalledWith(7, 0)
      await request(app.getHttpServer())
        .delete(prefix + '/user-deleted?id=7')
        .set('Authorization', 'Bearer test')
        .expect(200)
      expect(repo.remove).toHaveBeenLastCalledWith(7)
    }
  })

  it('金币调整原子条件包含原余额，冲突409，资料更新不附带coins', async () => {
    const edit = { id: 7, username: 'memberTwo', role: 'user', coins: 20, expectedCoins: 10 }
    await request(app.getHttpServer())
      .put('/api/user-editInfo')
      .set('Authorization', 'Bearer test')
      .send(edit)
      .expect(200)
    expect(repo.update).toHaveBeenLastCalledWith(
      7,
      { username: 'memberTwo', role: 'user', coins: 20 },
      10
    )
    repo.update.mockResolvedValue({ count: 0 })
    await request(app.getHttpServer())
      .put('/api/user-editInfo')
      .set('Authorization', 'Bearer test')
      .send(edit)
      .expect(409)
    repo.findOne.mockResolvedValue(null)
    await request(app.getHttpServer())
      .put('/api/user-editInfo')
      .set('Authorization', 'Bearer test')
      .send(edit)
      .expect(404)
  })

  it('旧role字段不能替代令牌，所有写入口拒绝匿名请求', async () => {
    for (const prefix of ['', '/api']) {
      await request(app.getHttpServer())
        .post(prefix + '/user-add')
        .send(body)
        .expect(401)
      await request(app.getHttpServer())
        .put(prefix + '/user-editInfo')
        .send({ ...body, id: 7 })
        .expect(401)
      await request(app.getHttpServer())
        .put(prefix + '/user-status-update')
        .send({ id: 7, status: 0, role: 'ADMIN' })
        .expect(401)
      await request(app.getHttpServer())
        .delete(prefix + '/user-deleted?id=7')
        .expect(401)
    }
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
    expect(repo.remove).not.toHaveBeenCalled()
  })

  it.each([
    { username: 'abc' },
    { username: '1member' },
    { username: 'a'.repeat(13) },
    { username: '<img>' },
    { role: 'ADMIN' },
    { coins: -1 },
    { coins: 1.5 },
    { coins: '10' },
    { coins: null },
    { coins: 2147483648 },
    { status: 0 },
    { endDate: '2027-01-01' },
    { id: 1 },
    { password: 'test123456' }
  ])('新增拒绝非法字段 %j', async (changes) => {
    await request(app.getHttpServer())
      .post('/api/user-add')
      .set('Authorization', 'Bearer test')
      .send({ ...body, ...changes })
      .expect(400)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each([
    { id: '7' },
    { id: 0 },
    { coins: 20 },
    { expectedCoins: 10 },
    { coins: 20, expectedCoins: null },
    { status: 0 }
  ])('编辑拒绝非法参数 %j', async (changes) => {
    await request(app.getHttpServer())
      .put('/api/user-editInfo')
      .set('Authorization', 'Bearer test')
      .send({ id: 7, username: 'memberTwo', role: 'user', ...changes })
      .expect(400)
    expect(repo.update).not.toHaveBeenCalled()
  })

  it.each([
    { id: 7, status: 2 },
    { id: 7, status: '0' },
    { id: null, status: 1 },
    { id: 2147483648, status: 1 }
  ])('状态拒绝非法参数 %j', async (value) => {
    await request(app.getHttpServer())
      .put('/api/user-status-update')
      .set('Authorization', 'Bearer test')
      .send(value)
      .expect(400)
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it('重复用户名409，缺失用户404，历史订单关联禁止删除409', async () => {
    const error = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('database error', { code, clientVersion: '7' })
    repo.create.mockRejectedValue(error('P2002'))
    await request(app.getHttpServer())
      .post('/api/user-add')
      .set('Authorization', 'Bearer test')
      .send(body)
      .expect(409)
    repo.update.mockRejectedValue(error('P2002'))
    await request(app.getHttpServer())
      .put('/api/user-editInfo')
      .set('Authorization', 'Bearer test')
      .send({ id: 7, username: 'memberOne', role: 'user' })
      .expect(409)
    repo.updateStatus.mockRejectedValue(error('P2025'))
    await request(app.getHttpServer())
      .put('/api/user-status-update')
      .set('Authorization', 'Bearer test')
      .send({ id: 99, status: 1 })
      .expect(404)
    repo.remove.mockRejectedValue(error('P2003'))
    await request(app.getHttpServer())
      .delete('/api/user-deleted?id=7')
      .set('Authorization', 'Bearer test')
      .expect(409)
    repo.remove.mockRejectedValue(error('P2025'))
    await request(app.getHttpServer())
      .delete('/api/user-deleted?id=99')
      .set('Authorization', 'Bearer test')
      .expect(404)
    for (const id of ['0', '1.5', 'abc', '2147483648']) {
      await request(app.getHttpServer())
        .delete('/api/user-deleted?id=' + id)
        .set('Authorization', 'Bearer test')
        .expect(400)
    }
  })
})
