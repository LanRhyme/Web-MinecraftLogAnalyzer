# Minecraft-IOS日志分析器

![GitHub top language](https://github.com/LanRhyme/Web-MinecraftLogAnalyzer)
![GitHub license](https://img.shields.io/badge/license-GPLv3-blue.svg)

基于Web的Minecraft日志分析工具，提供日志上传、基础信息提取、错误统计和AI智能分析功能。特别针对Amethyst(Pojav) IOS启动器优化，其他启动器日志可能兼容。

## 技术栈
- 前端：HTML5/CSS3 + Tailwind CSS + Chart.js + Font Awesome
- 后端：Node.js + Express + Multer + Axios
- AI分析：Google Gemini API（需自行申请API密钥）

## 功能特性
1. **日志上传** 支持.log/.txt格式文件，最大8MB
2. **基础解析** 自动提取：
   - Launcher版本
   - Java版本
   - 渲染器类型
   - 游戏版本
   - 关键词检测（如sodium模组）
3. **错误统计** 实时展示：
   - 错误类型分布图
   - 常见错误案例
4. **智能分析** 通过Gemini API生成：
   - 错误原因诊断
   - 优化建议
   - 解决方案参考

## 许可协议
本项目采用GPLv3开源协议，完整协议文本可通过以下途径获取：
- [GNU GPLv3官网](https://www.gnu.org/licenses/gpl-3.0.en.html)
- [项目根目录LICENSE文件](./LICENSE)

**核心条款摘要**：
1. 任何基于本项目的衍生作品必须保持GPLv3开源
2. 必须保留原始版权声明和许可证信息
3. 商业用途需遵守GPLv3协议条款

## 快速开始

### 1. 环境准备
```bash
# 安装依赖
npm install
npm install dotenv

# 设置环境变量（创建.env文件）
GEMINI_API_KEY=your_gemini_api_key    #设置api key，在此处获取https://aistudio.google.com/app/apikey
GEMINI_PROXY_TARGET=https://generativelanguage.googleapis.com/   #设置代理地址，用于访问Gemini API，默认无反向代理https://generativelanguage.googleapis.com/
CUSTOM_KEYWORDS=sodium|iris|xaero|customskinloader   #设置关键词，用于日志关键词检测，使用 | 进行分隔
```

### 2. 运行服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 3. 部署要求
* Node.js >=18.0
* *需要配置反向代理处理Gemini API请求
* 建议使用PM2进行进程管理
* 静态资源需支持HTTPS部署

## API文档

### 1. 日志上传接口
`POST /api/extract`
* 参数：multipart/form-data (file字段)
* 返回：

```json
{
  "info": {
    "launcher_version": "1.2.3",
    "java_version": "17.0.5",
    "minecraft_version": "1.20.1",
    "renderer": "OpenGL",
    "keyword": "sodium"
  },
  "log": "原始日志内容"
}
```

### 2. AI分析接口
`POST /api/gemini`
* 参数：
```json
{
  "log": "原始日志文本",
  "proxy": "可选代理地址"
}
```
- 返回：
```json
{
  "gemini": "AI分析结果文本"
}
```
## 使用说明
1. 打开网页后点击「选择文件」按钮
2. 选择Minecraft日志文件（.log/.txt）
3. 点击「上传日志文件」开始分析
4. 分析完成后查看
* 基础信息卡片
* 错误统计图表
* AI分析建议
5. 点击「复制分析内容」可保存结果

## 扩展开发
1. 添加新错误类型：修改extractInfo()正则表达式
2. 自定义AI提示词：编辑callGemini()中的prompt参数
3. 新增可视化图表：扩展Chart.js配置
4. 添加多语言支持：集成i18n库

