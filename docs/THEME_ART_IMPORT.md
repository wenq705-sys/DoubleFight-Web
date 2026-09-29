# 双数对决 · 3D 主题美术通用导入口

一套主题只提交一份 theme.json 和约定的美术文件。Web 与抖音共用自动生成的主题注册表、资源装载器和原有 Board2048，未来新增主题无需再次手写首页卡片、11 阶模型与环境映射。

## 标准资源目录

在 public/assets/themes/<主题英文ID>/ 内提供：

    theme.json                   唯一注册入口
    scene-hero.png               首页主题岛形象（Web）
    board-4x4.glb                独立 4x4 棋盘
    environment-mobile.glb       移动端环境；抖音包内离线读取
    environment-full.glb         可选，Web 高精度环境
    tiles/
      0002.glb
      0004.glb
      0008.glb
      0016.glb
      0032.glb
      0064.glb
      0128.glb
      0256.glb
      0512.glb
      1024.glb
      2048.glb
    stage/                       可选，阶段环境 GLB
      awakening.glb
      festival.glb

直接复制 public/assets/themes/nightmarket/theme.json 作为模板：改 id（必须与文件夹名相同）、中文名称、11 阶角色名、资源路径、主题配色、棋盘尺寸参数。无需逐个修改 TS 类型、主题岛、原生轮播或打包脚本。

## 美术规范

- 角色 GLB 必须自包含，glTF Binary v2；Blender 导出选择 Y-up，保留原始 blend 文件供迭代。
- 11 阶分别代表 2 至 2048，不要把数字/文字烙进模型；70px 棋格下轮廓仍须可识别。
- 不能引用模型包外的贴图、URL，也不能默认需要 Draco；流水线会拦截不符合要求的文件。
- 4x4 棋盘模型、场景模型分别输出，环境不得挡住 16 格交互；坐标映射以配置中的 gridGap、artFloorY、gameSurfaceY、centerZ 为准。
- Web 可选完整环境，抖音自动使用移动端 LOD。角色只解码一次，之后克隆共用资源。
- mood.preset 选 generic 即可复用五段递进，阈值为 [2,16,64,256,1024]，labels 定义五个中文阶段名称。
- 需要额外的阶段场景模型时，在 assets.overlays 中配置形如 {"stage":1,"file":"stage/awakening.glb"}；达到阶段时异步装载和渐显。清块不倒退，重新开局复位。
- 已做完的东方夜市保留专属庆典视觉插件，未来主题默认使用通用舞台，确有特殊需求再采用可选插件。

## 一键同步和打包

在仓库根目录（DoubleFight-Theme-Publish）执行：

    npm run sync:themes
    npm run check:themes
    npm run build
    npm run build:douyin

同步命令自动扫描 theme.json、校验 GLB 文件、生成 src/config/artThemes.generated.ts；网页主题地图和抖音原生轮播自动识别新增 ID。核心逻辑仍使用 BattleBoardView、SoloController 和 Board2048，不会生成第二套玩法。

抖音开发者工具应该导入仓库的 platform/douyin/dist 文件夹。
它包含 game.js、game.json、project.config.json、art-themes-manifest.json，
以及 assets/themes/<id>/{theme.json,board-4x4.glb,environment-mobile.glb,tiles/...}。
抖音原生运行时通过 tt.getFileSystemManager().readFile 从包内读取 ArrayBuffer，
再交给 GLTFLoader.parse，无需 GitHub Pages、外部 CDN 或 Web CORS。

## 工厂自动验收

check:themes 额外创建一个临时的第二主题“极光山谷”，验证仅添加 theme.json + 文件后即可自动注册、打包；校验缺文件、损坏 GLB、目录穿越及整体包预算。临时主题不会进入正式发布包。

原生主包现设置 20 MiB 的工程预算门禁。未来多主题累计超过限额时，构建会明确报错，需要开启分包或按需下载与缓存，而不是悄悄超过平台限额；主题导入接口和美术规范无需改变。

