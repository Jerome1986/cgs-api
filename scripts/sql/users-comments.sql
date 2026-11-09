-- 根据测试库 SHOW CREATE TABLE users 核对，保留完整列定义，仅补充中文注释。
ALTER TABLE `users`
  COMMENT = '业务用户表，与后台管理员账号独立存储',
  MODIFY COLUMN `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '业务用户编号，MySQL自增整数主键',
  MODIFY COLUMN `username` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务用户账号，唯一',
  MODIFY COLUMN `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '业务用户身份，与后台管理员权限独立',
  MODIFY COLUMN `status` int(11) NOT NULL DEFAULT '1' COMMENT '账号状态：1正常，0禁用',
  MODIFY COLUMN `coins` int(11) NOT NULL DEFAULT '0' COMMENT '用户金币余额，单位：金币',
  MODIFY COLUMN `end_date` datetime(3) DEFAULT NULL COMMENT '会员到期时间，空表示未设置',
  MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '用户创建时间',
  MODIFY COLUMN `updated_at` datetime(3) NOT NULL COMMENT '用户更新时间，由Prisma写入时维护';
