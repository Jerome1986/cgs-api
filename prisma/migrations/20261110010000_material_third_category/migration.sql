-- 旧素材不推断三级分类，保留NULL；先执行迁移，再部署使用新字段的API。
ALTER TABLE `materials`
  ADD COLUMN `third_id` INTEGER NULL COMMENT '三级分类编号，旧素材为空';

CREATE INDEX `materials_third_id_idx` ON `materials`(`third_id`);

ALTER TABLE `materials`
  ADD CONSTRAINT `materials_third_id_fkey` FOREIGN KEY (`third_id`)
  REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
