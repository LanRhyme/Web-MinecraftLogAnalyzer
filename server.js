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

const GEMINI_PROXY_TARGET = process.env.GEMINI_PROXY_TARGET || 'https://gemini-proxy.keyikai.me/';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD9RoIiKi1bAUO0nypRqyavUiFgxo4nJ3o';

// 反向代理接口
app.post('/proxy/gemini', async (req, res) => {
    const url = `${GEMINI_PROXY_TARGET}v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await axios.post(url, req.body, {
            headers: { 'Content-Type': 'application/json' }
        });
        res.status(response.status).json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.response?.data?.error?.message || e.message });
    }
});

// 日志信息提取函数
function extractInfo(log) {
    const info = {};

    // Launcher Version
    const launcherMatch = log.match(/\[Pre-Init\] Version:\s*([^\r\n]+)/);
    if (launcherMatch) info.launcher_version = launcherMatch[1].trim();

    // Java Version
    const javaMatch = log.match(/\[JavaLauncher\] JAVA_HOME has been set to\s*([^\r\n]+)/);
    if (javaMatch) info.java_version  = javaMatch[1].trim();

    // 渲染器
    const rendererMatch = log.match(/\[JavaLauncher\] RENDERER is set to\s*([^\r\n]+)/);
    if (rendererMatch) info.renderer = rendererMatch[1].trim();

    // 游戏版本（兼容中英文括号）
     const mcMatch = log.match(/Launching\s+Minecraft\s+([^\s\r\n]+)/);
    if (mcMatch) info.minecraft_version = mcMatch[1].trim();

    return info;
}

// Gemini API 调用
async function callGemini(log, proxyTarget) {
    const target = proxyTarget || GEMINI_PROXY_TARGET;
    const url = `${target}v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = `请分析以下Minecraft日志，给出主要错误原因和建议：\n${log}`;
    try {
        const res = await axios.post(url, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        return res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Gemini无返回内容';
    } catch (e) {
         console.error('Gemini API 调用异常:', e); // 增加这行
        return 'Gemini API 调用失败,请重试: ' + (e.response?.data?.error?.message || e.message);
    }
}

// 只提取基础信息
app.post('/api/extract', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    const log = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path);
    const info = extractInfo(log);
    res.json({ info, log }); // 返回log内容，供后续分析
});

// 只做Gemini分析
app.post('/api/gemini', async (req, res) => {
    const { log, proxy } = req.body;
    if (!log) return res.status(400).json({ error: '缺少日志内容' });
    const gemini = await callGemini(log, proxy);
    res.json({ gemini });
});

app.use(express.static(__dirname));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});