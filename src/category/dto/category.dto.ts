import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator'

export const CATEGORY_TYPES = ['模型', '贴图', '灯光', '材质']

export class CategoryTypeDto {
  /** 素材类型 */
  @IsIn(CATEGORY_TYPES)
  type: string
}

export class CategoryIdDto {
  /** MySQL分类编号，限制为正整数主键范围 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id: number
}

export class QueryCategoryDto {
  /** 素材类型，不传则查询全部类型 */
  @IsOptional()
  @IsIn(CATEGORY_TYPES)
  type?: string

  /** 分类层级 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  level?: number

  /** 直属父分类编号 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  parentId?: number

  /** 中文或英文名称关键字 */
  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string

  /** 页码，从1开始 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pageNum = 1

  /** 每页条数，上限100 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10
}

export class CategoryFieldsDto {
  /** 分类中文名称，去除首尾空白 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  name: string

  /** 分类英文名称，去除首尾空白 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  enName: string

  /** 分类排序值 */
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sort: number
}

export class CreateCategoryDto extends CategoryFieldsDto {
  /** 素材类型，子分类必须与父级一致 */
  @IsIn(CATEGORY_TYPES)
  type: string

  /** 父分类编号，不传表示一级分类 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  parentId?: number
}

export class LegacyFirstDto {
  /** Electron现有页面类型参数 */
  @IsIn(CATEGORY_TYPES)
  pageType: string
}

export class LegacySubDto {
  /** Electron分类编号，或NEW/ALL虚拟入口，不对应数据库记录 */
  @IsString()
  @Matches(/^(NEW|ALL|[1-9]\d{0,9})$/)
  cateId: string
}
