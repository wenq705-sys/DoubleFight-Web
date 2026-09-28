# 夜市江湖 M2.24 独立可玩预览

手机地址：https://wenq705-sys.github.io/DoubleFight-Web/theme-preview/

## 已实现
- 4×4 2048 规则：四方向滑动、相邻合并、单次合并限制、2/4 随机生成、得分、最高纪录本地保存、游戏结束、2048 达成提示及继续挑战。
- 11 档棋子（2～2048）的独立颜色、数值标识、部分高阶装饰；**尚不是 11 个独立精雕角色 GLB**，三款已精雕角色保留在鉴赏模式。
- 棋子移动缓动、生成/合成弹跳、合成粒子、连击、程序化音效、可开启的程序化循环旋律、静音。
- 手机画质档、FPS / Draw Calls / 三角面数，触屏滑动、键盘方向键、角色鉴赏。

## 构建与验证
根目录 `npm run dev:theme` 启动独立预览，`npm run build:theme` 生成 `theme-factory/site/`，`npm test -- --reporter=dot` 包含独立 2048 规则测试，`node theme-factory/preview/audit-assets.mjs` 检查 GLB。

## 未完成
正式 Solo 系统整合、11 个独立精雕角色资产、专门制作的 BGM 与专业混音、真机性能及抖音端验收、广告/经济系统。此版本是 M2.23 规则闭环 + M2.24 基础反馈的可玩垂直切片，不能作为正式审核包。独立预览仅发布到 `public/theme-preview/`，不替换正式游戏首页。
