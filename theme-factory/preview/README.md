# 夜市江湖独立美术预览（M2.22）

在仓库根目录执行 `npm run dev:theme`，使用终端显示的本地 / 局域网地址打开。执行 `npm run build:theme` 可构建完整静态站点到 `theme-factory/site/`；GLB 自动从 `theme-factory/dist/` 复制，站点不依赖正式游戏路由。可将 `site/` 独立部署到静态托管。

画质按钮切换省电（DPR 1，无阴影）、标准（DPR 1.3，1024 阴影）、精细（DPR 1.8，2048 阴影），手机默认省电。右上角显示 FPS、Draw Calls、三角面数、DPR；实际帧率必须在目标手机上验证。拖动旋转场景，底部切换三款角色。

运行 `node theme-factory/preview/audit-assets.mjs` 检查 GLB 头、绘制批次、三角面数与文件大小；环境合批目标不超过 20 个 primitive。环境目前 24,460 triangles / 13 batches；三款角色各 8 batches。这里是独立美术垂直切片，尚未接入正式 Solo 玩法、广告、登录、排行榜。`theme-factory/site/` 是构建产物，不纳入 Git。
