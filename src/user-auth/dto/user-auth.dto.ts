import { IsOptional, IsString, Length, Matches, MaxLength, ValidateBy } from 'class-validator'

/** 注册与登录沿用Electron账号密码字段，密码不做trim转换 */
export class UserCredentialsDto {
  /** 用户名6至12位，不允许空白字符 */
  @IsString()
  @Length(6, 12)
  @Matches(/^\S+$/u)
  username: string

  /** 密码至少6位，UTF-8不得超过bcrypt的72字节限制 */
  @IsString()
  @Length(6, 72)
  @ValidateBy({
    name: 'passwordBytes',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0')
    }
  })
  password: string
}

/** 兼容旧客户端user_id参数，仅允许查询令牌所属用户 */
export class CurrentUserQueryDto {
  /** 可省略；提供时必须与当前身份一致 */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[1-9]\d*$/)
  user_id?: string
}
