-- 新分类表：三级树、整数主键、禁止级联删除，所有字段落地中文COMMENT。
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '分类编号，自增整数主键',
  `parent_id` INT NULL COMMENT '直属父分类编号，空表示一级分类',
  `name` VARCHAR(50) NOT NULL COMMENT '分类中文名称',
  `en_name` VARCHAR(100) NOT NULL COMMENT '分类英文名称',
  `type` VARCHAR(16) NOT NULL COMMENT '素材类型：模型、贴图、灯光、材质',
  `level` INT NOT NULL COMMENT '分类层级：1一级、2二级、3三级',
  `sort` INT NOT NULL DEFAULT 0 COMMENT '排序值，越小越靠前，同值按编号升序',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL COMMENT '更新时间，由Prisma维护',
  PRIMARY KEY (`id`),
  INDEX `categories_type_level_parent_id_sort_id_idx` (`type`, `level`, `parent_id`, `sort`, `id`),
  CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '素材分类，最多三级，父子素材类型一致';
