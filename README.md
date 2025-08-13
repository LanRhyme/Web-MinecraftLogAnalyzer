# 🪓 Minecraft-Mobile 日志分析器

一个为 **Minecraft 安卓 / iOS 启动器日志**设计的智能分析工具，支持自动提取基础信息、快速匹配崩溃原因，并提供 AI 智能分析。🌟

## 🖼️ 在线体验地址

👉 [https://lanrhymelog.netlify.app/](https://lanrhymelog.netlify.app/)

## netlify快速部署版本

👉 [https://github.com/LanRhyme/Web-MinecraftLogAnalyzer-Netlify](https://github.com/LanRhyme/Web-MinecraftLogAnalyzer-Netlify)

之后将主要更新netlify版本，原始版本部分内容会同步更新(但是我比较懒，可能非常——不及时，有需要的话可以提issue)

---

## 📖 开发文档

[https://zread.ai/LanRhyme/Web-MinecraftLogAnalyzer](https://zread.ai/LanRhyme/Web-MinecraftLogAnalyzer)

---

## 📦 功能特色

- 📝 支持上传 `.log` 或 `.txt` 日志文件（≤8MB）
- 📊 自动识别设备、系统、启动器、Minecraft 版本等关键信息
- ⚠️ 检测崩溃关键词，识别潜在的 Mod 冲突或环境异常
- ⚡ 内置快速分析模块（PCL2 同款规则）
- 🤖 调用 Gemini 2.5 Flash 进行 AI 分析和建议
- 🌙 支持深色模式 & 动态美化 UI
- 🧠 自定义关键词警告机制
- 📈 自动获取 GitHub 项目统计信息

---

## 🚀 快速开始

### 克隆项目

```bash
git clone https://github.com/LanRhyme/Web-MinecraftLogAnalyzer.git
cd Web-MinecraftLogAnalyzer
```

### 安装依赖

```bash
npm install
```

### 配置环境变量
创建 .env 文件，内容如下：

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key    #设置api key，在此处获取https://aistudio.google.com/app/apikey
GEMINI_PROXY_TARGET=https://generativelanguage.googleapis.com/   #设置代理地址，用于访问Gemini API，默认无反向代理https://generativelanguage.googleapis.com/
#推荐项目:https://github.com/DragonEmpery/cfll-gemini
CUSTOM_KEYWORDS=sodium|iris|xaero|customskinloader    #设置关键词，用于日志关键词检测，使用 | 进行分隔
GITHUB_TOKEN=GitHub令牌（可选）  #用于github仓库信息卡片，不用管
```

### 启动项目

```bash
node server.js
```

默认访问地址：http://localhost:3000

---

## 📁 项目结构
```
├── index.html              # 前端界面（使用 Tailwind + Chart.js + Marked）
├── server.js               # Node.js 后端服务，处理上传、解析、AI 分析
├── uploads/                # 上传日志文件的临时目录（自动清理）
├── .env                    # 环境变量配置
└── README.md               # 项目说明文档
```

---

## 💡 技术栈
* 前端：
 * 🎨 Tailwind CSS + 自定义暗黑主题
 * 📈 Chart.js 数据可视化
 * 🧩 FontAwesome 图标系统
 * 📝 Marked.js 解析 AI 输出的 Markdown 内容
* 后端：
 * ⚙️ Express.js 服务
 * 🤖 Gemini AI 代理调用（支持代理转发）
 * 📄 自定义正则匹配器（支持 Amethyst、Zalith、Fold Craft 启动器日志格式）

---

## 🔍 支持的启动器

* ✅ Amethyst (Pojav)_iOS
* ✅ Zalith Launcher
* ✅ Fold Craft Launcher

---

## 🤝 鸣谢
* PCL2 代码崩溃匹配规则参考 [https://github.com/Meloong-Git/PCL](https://github.com/Meloong-Git/PCL/blob/main/Plain%20Craft%20Launcher%202/Modules/Minecraft/ModCrash.vb)
* Google Gemini AI 模型支持
* TailwindCSS 社区设计资源

---

## 📫 联系我
欢迎访问个人主页 👉 [https://lanrhyme.netlify.app/](https://lanrhyme.netlify.app/)

或通过 GitHub 提交 Issue！

## ⭐ Star 一下吧！
如果你觉得这个项目有帮助，欢迎点个 ⭐ Star！

