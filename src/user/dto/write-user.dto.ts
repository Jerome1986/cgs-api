import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsString, IsDateString, Matches, Max, Min, ValidateIf } from 'class-validator'

/** 管理员新增业务用户，不创建后台管理员凭据 */
export class CreateUserDto {
  /** 用户名：字母开头，6至12位字母或数字 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9]{5,11}$/)
  username: string
  /** 业务角色，不能使用后台ADMIN角色 */
  @IsIn(['admin', 'user', 'vip', 'annual', 'permanent'])
  role: string
  /** 初始金币余额，非负MySQL整数 */
  @IsInt()
  @Min(0)
  @Max(2147483647)
  coins: number
}

/** 管理员编辑业务用户，金币未变更时省略金币相关字段 */
export class UpdateUserDto {
  /** 业务用户整数主键 */
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number
  /** 用户名沿用新增规则 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9]{5,11}$/)
  username: string
  /** 业务角色，与后台权限独立 */
  @IsIn(['admin', 'user', 'vip', 'annual', 'permanent'])
  role: string
  /** 管理员明确配置每日额度，0表示未配置 */
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100000)
  dailyDownloadLimit?: number
  /** 会员到期时间，null清空；年会员必须有有效到期时间才享受额度 */
  @ValidateIf((_dto, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  endDate?: string | null
  /** 人工调整后的金币余额，可省略；提交时必须同时提供expectedCoins */
  @ValidateIf(
    (dto: UpdateUserDto, value: unknown) => value !== undefined || dto.expectedCoins !== undefined
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  coins?: number
  /** 打开表单时的原金币余额，用于原子并发校验 */
  @ValidateIf(
    (dto: UpdateUserDto, value: unknown) => value !== undefined || dto.coins !== undefined
  )
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedCoins?: number
}

/** 管理员修改业务用户启禁用状态 */
export class UserStatusDto {
  /** 业务用户主键，不是管理员主键 */
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number
  /** 目标状态，0禁用、1启用 */
  @IsInt()
  @IsIn([0, 1])
  status: number
  /** 兼容旧调用方字段，仅接受字符串但完全不用于授权 */
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsString()
  role?: string
}

/** 删除业务用户的Query参数 */
export class DeleteUserDto {
  /** Query数字主键，转换后校验MySQL范围 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number
}
