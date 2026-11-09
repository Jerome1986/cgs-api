import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AdminService } from './admin.service'
import { AdminRepository } from './admin.repository'
import { PrismaService } from '../prisma/prisma.service'

describe('首次登录初始化管理员', () => {
  const dto = { username: 'first-admin', password: 'test123456' }
  const tx = {} as Prisma.TransactionClient
  const repo = {
    findByUsername: jest.fn(),
    countAll: jest.fn(),
    createInitial: jest.fn()
  }
  const jwt = { signAsync: jest.fn() }
  const prisma = { $transaction: jest.fn() }
  const service = new AdminService(
    repo as unknown as AdminRepository,
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService
  )

  beforeEach(() => {
    jest.resetAllMocks()
    repo.findByUsername.mockResolvedValue(null)
    repo.countAll.mockResolvedValue(0)
    jwt.signAsync.mockResolvedValue('token')
    prisma.$transaction.mockImplementation((run: (client: Prisma.TransactionClient) => unknown) =>
      run(tx)
    )
    repo.createInitial.mockImplementation((username: string, password: string) => {
      const admin = { id: 1, username, password, role: 'ADMIN', status: true }
      repo.findByUsername.mockResolvedValue(admin)
      return Promise.resolve(admin)
    })
  })

  it('空表首次登录创建密码哈希并返回登录凭据', async () => {
    const result = await service.login(dto)
    const [, password] = repo.createInitial.mock.calls[0] as [string, string]
    expect(password).not.toBe(dto.password)
    expect(await bcrypt.compare(dto.password, password)).toBe(true)
    expect(repo.countAll).toHaveBeenCalledWith(tx)
    expect(repo.createInitial).toHaveBeenCalledWith(dto.username, password, tx)
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })
    expect(result).toEqual({
      token: 'token',
      userInfo: { id: 1, username: dto.username, role: 'ADMIN', displayName: '', userAvatarUrl: '' }
    })
  })

  it('存在其他账号时拒绝自动创建', async () => {
    repo.countAll.mockResolvedValue(1)
    await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(repo.createInitial).not.toHaveBeenCalled()
  })

  it('已有禁用账号时不重新初始化', async () => {
    repo.findByUsername.mockResolvedValue({ status: false })
    await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(repo.countAll).not.toHaveBeenCalled()
    expect(repo.createInitial).not.toHaveBeenCalled()
  })

  it('事务内发现其他请求已创建账号时停止初始化', async () => {
    repo.countAll.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(repo.createInitial).not.toHaveBeenCalled()
    expect(jwt.signAsync).not.toHaveBeenCalled()
  })

  it('遇到序列化冲突时重新检查并重试事务', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('transaction conflict', {
        code: 'P2034',
        clientVersion: '7.5.0'
      })
    )
    await expect(service.login(dto)).resolves.toHaveProperty('token', 'token')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(repo.createInitial).toHaveBeenCalledTimes(1)
  })
})
