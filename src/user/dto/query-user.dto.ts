import { Transform, Type } from 'class-transformer'
import { IsInt, IsString, Length, Max, Min } from 'class-validator'

export class QueryUserDto {
  /** 用户名包含查询，空字符串不限制，最长191字符 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 191)
  keyword = ''
  /** 页码，从1开始 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagesNum = 1

  /** 每页条数，最多100条 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pagesSize = 10
}
