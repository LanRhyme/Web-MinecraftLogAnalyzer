require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const GEMINI_PROXY_TARGET = process.env.GEMINI_PROXY_TARGET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CUSTOM_KEYWORDS_ENV = process.env.CUSTOM_KEYWORDS || ''; // 从 .env 读取自定义关键词

console.log('Gemini Key:', GEMINI_API_KEY ? '已设置' : '未设置');
console.log('Custom Keywords (from .env):', CUSTOM_KEYWORDS_ENV || '未设置');


// Gemini API 调用函数
async function callGemini(log, proxyTarget) {
    const target = proxyTarget || GEMINI_PROXY_TARGET;
    const url = `${target}v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    console.log('Gemini Request URL:', url); // 调试用
    const prompt = `请分析以下Minecraft日志，给出主要错误原因和建议：\n${log}`;
    try {
        const res = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        console.log('Gemini Response Status:', res.status); // 调试用
        return res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Gemini无返回内容';
    } catch (e) {
        console.error('Gemini API 调用异常:', e.response?.data || e.message); // 更清晰的错误日志
        return 'Gemini API 调用失败,请重试: ' + (e.response?.data?.error?.message || e.message);
    }
}

// 日志信息提取函数
function extractInfo(log) {
    const info = {};
    console.log('原始日志内容（前200字）：', log.substring(0, 200)); // 调试用

    const patterns = {
        device: /\[Pre-Init\] Device: (.*?)\n/,
        os: /\[Pre-Init\] (iPadOS \d+\.\d+)/, // 提取 "iPadOS 18.5"
        launcher_version: /\[Pre-Init\] Version: (.*?)\n/,
        commit: /Commit: (.*?)\n/,
        java_version: /java-(\d+)-openjdk/, // 提取 Java 版本号，如 "21"
        renderer: /RENDERER is set to (.*?)\n/, // 提取渲染器信息
        minecraft_version: /Launching Minecraft .*?-([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-rc[0-9]+)?)\n/,
        // 通用的关键词提取模式，捕获方括号内的内容作为关键词
        // 注意：这里只用于匹配如 "[keyword] Failed to load" 这样的特定格式
        keyword_regex: /\[(.*?)\] Failed to load/
    };

    // 用于收集所有关键词的临时数组
    const detectedKeywords = new Set(); // 使用Set来避免重复

    for (const key in patterns) {
        // 特殊处理 keyword_regex，将其结果放入 detectedKeywords
        if (key === 'keyword_regex') {
            const match = log.match(patterns[key]);
            if (match && match[1] !== undefined) {
                detectedKeywords.add(match[1].trim());
            }
            continue; // 跳过后续的 info[key] 赋值
        }

        const match = log.match(patterns[key]);
        if (match && match[1] !== undefined) {
            info[key] = match[1].trim();
        } else {
            console.log(`未找到或无法提取: ${key}`); // 调试用
        }
    }

    // 处理自定义关键词 (从 .env 加载)
    const customKeywords = CUSTOM_KEYWORDS_ENV.split('|').map(k => k.trim()).filter(k => k.length > 0);
    for (const customKw of customKeywords) {
        if (log.includes(customKw)) {
            detectedKeywords.add(customKw); // 将所有匹配的自定义关键词添加到Set中
        }
    }

    // 将所有检测到的关键词加入 info 对象，作为逗号分隔的字符串
    if (detectedKeywords.size > 0) {
        info.keyword = Array.from(detectedKeywords).join(', ');
    } else {
        console.log('未找到任何关键词');
    }

    console.log('提取到的信息:', info); // 调试用
    return info;
}


// AI 分析接口
app.post('/api/gemini', async (req, res) => {
    try {
        if (!req.body.log) {
            return res.status(400).json({ error: '缺少日志内容' });
        }
        const geminiResult = await callGemini(req.body.log);
        res.json({ gemini: geminiResult });
    } catch (error) {
        console.error('API /api/gemini 发生错误:', error);
        res.status(500).json({ error: 'AI分析服务器处理失败: ' + error.message });
    }
});

// 只提取基础信息
app.post('/api/extract', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '未上传文件' });
        }
        // 读取文件内容
        const log = fs.readFileSync(req.file.path, 'utf-8');
        // 删除临时文件
        fs.unlinkSync(req.file.path);

        const info = extractInfo(log);
        res.json({ info, log });
    } catch (error) {
        console.error('API /api/extract 发生错误:', error);
        // 如果是文件读取错误或其他服务器内部错误，返回JSON错误信息
        res.status(500).json({ error: '服务器处理文件失败: ' + error.message });
    }
});

// 服务静态文件
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});