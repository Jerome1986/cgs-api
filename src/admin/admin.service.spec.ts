import { BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcrypt'
import { Role } from '@prisma/client'
import { AdminRepository } from './admin.repository'
import { AdminService } from './admin.service'

jest.mock('bcrypt', () => ({ compare: jest.fn() }))

describe('AdminService', () => {
  const findByUsername = jest.fn()
  const signAsync = jest.fn()
  const comparePassword = jest.mocked(compare)
  const adminRepository = { findByUsername } as unknown as AdminRepository
  const jwtService = { signAsync } as unknown as JwtService
  const service = new AdminService(adminRepository, jwtService)

  beforeEach(() => jest.clearAllMocks())

  it('returns a token and safe admin information', async () => {
    const admin = {
      id: 1,
      username: 'admin',
      password: 'hashed-password',
      role: Role.ADMIN,
      status: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    findByUsername.mockResolvedValue(admin)
    comparePassword.mockResolvedValue(true as never)
    signAsync.mockResolvedValue('token')

    await expect(service.login({ username: 'admin', password: '123456' })).resolves.toEqual({
      token: 'token',
      userInfo: { id: 1, username: 'admin', role: Role.ADMIN }
    })
  })

  it('rejects an invalid password', async () => {
    findByUsername.mockResolvedValue({
      id: 1,
      username: 'admin',
      password: 'hashed-password',
      role: Role.ADMIN,
      status: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    comparePassword.mockResolvedValue(false as never)

    await expect(
      service.login({ username: 'admin', password: 'wrong-pass' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
