import { Transform } from 'class-transformer'
import { IsString, IsUrl, Length, ValidateIf } from 'class-validator'

/** 修改当前管理员显示资料，不允许变更角色和账号状态 */
export class AdminProfileDto {
  /** 显示名称，0至100字符，空字符串清除 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 100)
  displayName: string
}

/** 修改当前管理员头像引用 */
export class AdminAvatarDto {
  /** HTTP或HTTPS头像地址，空字符串移除头像，最长4096字符 */
  @IsString()
  @Length(0, 4096)
  @ValidateIf((_dto, value: unknown) => value !== '')
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
    max_allowed_length: 4096,
    disallow_auth: true
  })
  avatarUrl: string
}

/** 当前管理员验证原密码后更换密码 */
export class AdminPasswordDto {
  /** 当前密码，遵守已有登录长度约束 */
  @IsString()
  @Length(6, 20)
  currentPassword: string
  /** 新密码，6至20字符，不能与原密码相同 */
  @IsString()
  @Length(6, 20)
  newPassword: string
}
