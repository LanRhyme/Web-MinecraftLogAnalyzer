require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json({ limit: '8mb' }));

const PORT = process.env.PORT || 3000;

const db = new sqlite3.Database('./stats.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('成功连接到SQLite数据库。');
        db.run('CREATE TABLE IF NOT EXISTS upload_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)');
    }
});


const GEMINI_PROXY_TARGET = process.env.GEMINI_PROXY_TARGET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CUSTOM_KEYWORDS_ENV = process.env.CUSTOM_KEYWORDS || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

console.log('Gemini Key:', GEMINI_API_KEY ? '已设置' : '未设置');
console.log('Custom Keywords (from .env):', CUSTOM_KEYWORDS_ENV || '未设置');
console.log('GitHub Token:', GITHUB_TOKEN ? '已设置' : '未设置');

app.use(express.static(__dirname));

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
        console.error('Gemini API 调用异常:', e.response?.data || e.message);
        return 'Gemini API 调用失败,请重试: ' + (e.response?.data?.error?.message || e.message);
    }
}

function extractInfo(log) {
    const info = {};
    const patterns = {
        launcher_name: [
            { regex: /\[Pre-Init\] (PojavLauncher INIT!|Amethyst INIT!)/, name: 'Amethyst_iOS' },
            { regex: /Info: Launcher version:/, name: 'Zalith Launcher' },
            { regex: /FCL Version:/, name: 'Fold Craft Launcher' }
        ],
        launcher_version: [
            { regex: /\[Pre-Init\] Version: (.*?)\n/, key: 'Launcher Version' }, // Amethyst_iOS
            { regex: /Info: Launcher version: (.*?) \(/, key: 'Launcher Version' }, // Zalith Launcher
            { regex: /FCL Version: (.*?)\n/, key: 'Launcher Version' } // Fold Craft Launcher
        ],
        architecture: [
            { regex: /Architecture: (.*?)($|\n)/, key: 'Architecture' } // General: Zalith, Fold Craft
        ],
        device: [
            { regex: /\[Pre-Init\] Device: (.*?)\n/, key: 'Device' }, // Amethyst_iOS
            { regex: /Info: Device model: (.*?)\n/, key: 'Device Model' }, // Zalith Launcher
            { regex: /Device: (.*?)\n/, key: 'Device' } // Fold Craft Launcher
        ],
        os: [
            { regex: /\[Pre-Init\] (iOS \d+\.\d+\.?\d*? \((.*?)\))\n/, key: 'OS Version' }, // Amethyst_iOS with build number
            { regex: /\[Pre-Init\] (iOS \d+\.\d+)/, key: 'OS Version' }, // Amethyst_iOS
            { regex: /Android SDK: (.*?)($|\n)/, key: 'Android SDK' } // Zalith, Fold Craft
        ],
        java_version: [
            { regex: /Info: Java Runtime: (.*?)\n/, key: 'Java Runtime' }, // Zalith Launcher
            { regex: /Java Version: (.*?)($|\n)/, key: 'Java Version' }, // Fold Craft Launcher
            { regex: /java-(\d+)-openjdk/, key: 'Java Version' } // Existing, might catch some cases
        ],
        renderer: [
            { regex: /Info: Renderer: (.*?)\n/, key: 'Renderer' }, // Zalith Launcher
            { regex: /Renderer: (.*?)\n/, key: 'Renderer' } // Fold Craft Launcher
        ],
        minecraft_version: [
            { regex: /Info: Selected Minecraft version: (.*?)\n/, key: 'Minecraft Version' }, // Zalith Launcher
            { regex: /Launching Minecraft .*?-([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-rc[0-9]+)?)\n/, key: 'Minecraft Version' } // Existing, general
        ],
        commit: [
            { regex: /Commit: (.*?)\n/, key: 'Commit' } // Amethyst_iOS
        ],
        cpu: [
            { regex: /CPU: (.*?)\n/, key: 'CPU' } // Fold Craft Launcher
        ],
        language: [
            { regex: /Language: (.*?)\n/, key: 'Language' } // Fold Craft Launcher
        ],
        api_version: [
            { regex: /Info: API version: (.*?)\n/, key: 'API Version' } // Zalith Launcher
        ],
        fcl_version_code: [
            { regex: /FCL Version Code: (.*?)\n/, key: 'FCL Version Code' } // Fold Craft Launcher
        ]
    };

    const detectedKeywords = new Set();

    for (const patternObj of patterns.launcher_name) {
        if (log.match(patternObj.regex)) {
            info.launcher_name = patternObj.name;
            break;
        }
    }

    for (const category in patterns) {
        if (category === 'launcher_name') {
            continue;
        }

        if (category === 'keyword_regex') {
            const match = log.match(/\[(.*?)\] Failed to load/);
            if (match && match[1] !== undefined) detectedKeywords.add(match[1].trim());
            continue;
        }

        for (const patternObj of patterns[category]) {
            const match = log.match(patternObj.regex);
            if (match && match[1] !== undefined) {
                info[patternObj.key] = match[1].trim();
                break;
            }
        }
    }

    const customKeywords = CUSTOM_KEYWORDS_ENV.split('|').map(k => k.trim()).filter(k => k.length > 0);
    for (const customKw of customKeywords) {
        if (log.includes(customKw)) detectedKeywords.add(customKw);
    }
    if (detectedKeywords.size > 0) info.keyword = Array.from(detectedKeywords).join(', ');
    return info;
}


function quickAnalysis(log) {
    const results = [];
    const checks = [
        {
            keywords: ["A potential solution has been determined:", "A potential solution has been determined, this may resolve your problem:", "确定了一种可能的解决方法，这样做可能会解决你的问题："],
            logic: 'any',
            dynamicReason: (log) => {
                const startIndexMatch = log.match(/(A potential solution has been determined:|A potential solution has been determined, this may resolve your problem:|确定了一种可能的解决方法，这样做可能会解决你的问题：)\s*[\n\r]+/);

                if (startIndexMatch) {
                    const startIndex = startIndexMatch.index + startIndexMatch[0].length;
                    const relevantLogSection = log.substring(startIndex);

                    const solutionLines = [];
                    const lineRegex = /^[\t ]*-\s*(.+)/gm;
                    let match;
                    while ((match = lineRegex.exec(relevantLogSection)) !== null) {
                        solutionLines.push(match[0].trimEnd());
                    }

                    if (solutionLines.length > 0) {
                        return `Fabric 提供了解决方案：\n${solutionLines.join('\n')}\n\n请根据上述信息进行对应处理，如果看不懂英文可以使用翻译软件`;
                    }
                }
                return null;
            }
        },
        {
            keywords: ["An exception was thrown, the game will display an error screen and halt."],
            dynamicReason: (log) => {
                const errorMessageMatch = log.match(/(?<=the game will display an error screen and halt\.[\n\r]+Exception: )[\s\S]+?(?=\n\tat|$)/);
                if (errorMessageMatch) {
                    return `Forge 提供了以下错误信息：\n${errorMessageMatch[0].trim()}\n\n请根据上述信息进行对应处理，如果看不懂英文可以使用翻译软件`;
                }
                return null;
            }
        },
        {
            keywords: ["java.lang.OutOfMemoryError", "an out of memory error", "Out of Memory Error"],
            reason: "Minecraft 内存不足，导致其无法继续运行\n这很可能是因为电脑内存不足、游戏分配的内存不足，或是配置要求过高\n\n你可以尝试在启动设置中增加为游戏分配的内存，并删除配置要求较高的材质、Mod、光影"
        },
        {
            keywords: ["Could not reserve enough space"],
            logic: 'all',
            reason: "你似乎正在使用 32 位 Java，这会导致 Minecraft 无法使用所需的内存，进而造成崩溃\n\n请在启动设置中改用 64 位的 Java 再启动游戏"
        },
        {
            keywords: ["Invalid maximum heap size"],
            reason: "你似乎正在使用 32 位 Java，这会导致 Minecraft 无法使用所需的内存，进而造成崩溃\n\n请在启动设置中改用 64 位 Java 再启动游戏"
        },
        {
            keywords: ["java.lang.ClassCastException: java.base/jdk", "java.lang.ClassCastException: class jdk."],
            reason: "游戏似乎因为使用 JDK，或 Java 版本过高而崩溃了\n请在启动设置中改用 JRE 8（Java 8），然后再启动游戏"
        },
        {
            keywords: ["Unsupported class file major version", "Unsupported major.minor version"],
            reason: "游戏不兼容你当前使用的 Java\n请根据游戏版本要求更换Java（例如高版本Minecraft需要Java 17），如果没有合适的 Java，可以从网络中下载、安装一个"
        },
        {
            keywords: ["Open J9 is not supported", "OpenJ9 is incompatible", ".J9VMInternals."],
            logic: 'any',
            reason: "你正在使用 OpenJ9，它与游戏不兼容\n请在启动设置中改用 HotSpot Java 再启动游戏"
        },
        {
            keywords: ["java.lang.NoSuchFieldException: ucp", "because module java.base does not export", "java.lang.ClassNotFoundException: jdk.nashorn.api.scripting.NashornScriptEngineFactory", "java.lang.ClassNotFoundException: java.lang.invoke.LambdaMetafactory"],
            logic: 'any',
            reason: "游戏不兼容你当前使用的 Java。\n请根据游戏版本要求更换Java（例如高版本Minecraft需要Java 17），如果没有合适的 Java，可以从网络中下载、安装一个"
        },
        {
            keywords: ["The driver does not appear to support OpenGL", "Couldn't set pixel format", "Pixel format not accelerated"],
            logic: 'any',
            reason: "显卡驱动不支持 OpenGL，或是显卡驱动版本过旧。\n请更新你的显卡驱动，如果还是有问题，请尝试更新或回滚驱动版本,若您使用的是笔记本电脑，请确保游戏使用的是独立显卡而非集成显卡"
        },
        {
            keywords: ["EXCEPTION_ACCESS_VIOLATION"],
            dynamicReason: (log) => {
                if (log.includes("# C [ig")) return "你的 Intel 显卡驱动不兼容，导致游戏崩溃\n请尝试更新或回滚显卡驱动版本。若您使用的是笔记本电脑，请确保游戏使用的是独立显卡而非集成显卡";
                if (log.includes("# C [atio")) return "你的 AMD 显卡驱动不兼容，导致游戏崩溃\n请尝试更新或回滚驱动版本。若您使用的是笔记本电脑，请确保游戏使用的是独立显卡而非集成显卡";
                if (log.includes("# C [nvoglv")) return "你的 Nvidia 显卡驱动不兼容，导致游戏崩溃\n请尝试更新或回滚驱动版本。若您使用的是笔记本电脑，请确保游戏使用的是独立显卡而非集成显卡";
                return null;
            }
        },
        {
            keywords: ["1282: Invalid operation"],
            reason: "可能是光影或资源包与游戏不兼容导致 OpenGL 错误\n请尝试删除光影和资源包，或更换其他兼容的版本"
        },
        {
            keywords: ["Maybe try a lower resolution resourcepack?"],
            reason: "材质包过大或显卡配置不足\n请尝试更换一个分辨率较低的材质包，或升级你的显卡"
        },
        {
            keywords: ["The system is out of physical RAM or swap space"],
            reason: "系统物理内存或虚拟内存不足\n请关闭其他程序，或尝试增加虚拟内存"
        },
        {
            keywords: ["Manually triggered debug crash"],
            reason: "玩家手动触发了调试崩溃"
        },
        {
            keywords: ["The directories below appear to be extracted jar files. Fix this before you continue.", "Extracted mod jars found, loading will NOT continue"],
            logic: 'any',
            reason: "Mod 文件被解压了，这会导致游戏无法正常加载\n请删除这些被解压的 Mod 文件，然后重新下载没有被解压的 Mod 文件"
        },
        {
            keywords: ["java.lang.ClassNotFoundException: org.spongepowered.asm.launch.MixinTweaker"],
            reason: "MixinBootstrap 缺失，这通常是因为 Mod 加载器安装不完整，或是游戏版本与 Mod 不匹配\n请重新安装 Mod 加载器，或检查 Mod 是否与当前游戏版本兼容"
        },
        {
            keywords: ["java.lang.RuntimeException: Shaders Mod detected. Please remove it, OptiFine has built-in support for shaders."],
            reason: "同时安装了 ShadersMod 和 OptiFine，这会导致冲突\n请删除 ShadersMod，OptiFine 已内置光影支持"
        },
        {
            keywords: ["java.lang.NoSuchMethodError: sun.security.util.ManifestEntryVerifier"],
            reason: "你使用的 Forge 版本过低，与当前 Java 版本不兼容\n请更新 Forge 版本，或更换兼容的 Java 版本（例如 Java 8）"
        },
        {
            keywords: ["Found multiple arguments for option fml.forgeVersion, but you asked for only one"],
            reason: "版本 Json 中存在多个 Forge 版本，这会导致冲突\n请检查你的游戏配置文件，确保只引用一个 Forge 版本"
        },
        {
            keywords: ["Cannot find launch target fmlclient", "Invalid paths argument, contained no existing paths", "libraries\\net\\minecraftforge\\fmlcore"],
            logic: 'any',
            reason: "Forge 安装不完整，或文件已损坏。\n请尝试重新安装 Forge"
        },
        {
            keywords: ["Invalid module name: '' is not a Java identifier"],
            reason: "Mod 名称包含特殊字符，导致无法加载。\n请修改 Mod 文件名，移除特殊字符"
        },
        {
            keywords: ["has been compiled by a more recent version of the Java Runtime (class file version 55.0), this version of the Java Runtime only recognizes class file versions up to", "java.lang.RuntimeException: java.lang.NoSuchMethodException: no such method: sun.misc.Unsafe.defineAnonymousClass(Class,byte[],Object[])Class/invokeVirtual", "java.lang.IllegalArgumentException: The requested compatibility level JAVA_11 could not be set. Level is not supported by the active JRE or ASM version"],
            logic: 'any',
            reason: "Mod 需要 Java 11 或更高版本才能运行，而你当前使用的 Java 版本过低\n请在启动设置中改用 Java 11 或更高版本再启动游戏"
        },
        {
            keywords: ["DuplicateModsFoundException", "Found a duplicate mod", "Found duplicate mods", "ModResolutionException: Duplicate"],
            logic: 'any',
            reason: "检测到重复安装的 Mod，这会导致冲突\n请删除重复的 Mod 文件"
        },
        {
            keywords: ["Incompatible mods found!"],
            reason: "检测到不兼容的 Mod，这会导致游戏崩溃\n请检查 Mod 列表，移除不兼容的 Mod"
        },
        {
            keywords: ["Missing or unsupported mandatory dependencies:"],
            reason: "Mod 缺少前置 Mod 或与当前 Minecraft 版本不兼容\n请检查 Mod 的依赖项和兼容性，确保所有前置 Mod 都已安装且版本正确"
        },
        {
            keywords: ["maximum id range exceeded"],
            reason: "Mod 过多导致超出 ID 限制\n请减少 Mod 的数量，或尝试调整游戏配置以增加 ID 限制"
        },
        {
            keywords: ["com.electronwill.nightconfig.core.io.ParsingException: Not enough data available"],
            reason: "NightConfig 的 Bug，这通常是 Mod 配置文件损坏导致的\n请尝试删除或重新生成 Mod 的配置文件"
        },
        {
            keywords: ["OptiFine"],
            dynamicReason: (log) => {
                if (log.includes("TRANSFORMER/net.optifine/net.optifine.reflect.Reflector.<clinit>(Reflector.java") ||
                    log.includes("java.lang.NoSuchMethodError: 'void net.minecraft.client.renderer.texture.SpriteContents.<init>") ||
                    log.includes("java.lang.NoSuchMethodError: 'java.lang.String com.mojang.blaze3d.systems.RenderSystem.getBackendDescription") ||
                    log.includes("java.lang.NoSuchMethodError: 'void net.minecraft.client.renderer.block.model.BakedQuad.<init>") ||
                    log.includes("java.lang.NoSuchMethodError: 'void net.minecraftforge.client.gui.overlay.ForgeGui.renderSelectedItemName") ||
                    log.includes("java.lang.NoSuchMethodError: 'void net.minecraft.server.level.DistanceManager") ||
                    log.includes("java.lang.NoSuchMethodError: 'net.minecraft.network.chat.FormattedText net.minecraft.client.gui.Font.ellipsize") ||
                    (log.includes("java.lang.NoSuchMethodError: net.minecraft.world.server.ChunkManager$ProxyTicketManager.shouldForceTicks(J)Z") && log.includes("OptiFine")) ||
                    (log.includes("The Mod File ") && log.includes("optifine\\OptiFine") && log.includes(" has mods that were not found"))
                ) {
                    return "OptiFine 与 Forge 不兼容，或与其他 Mod 冲突\n请尝试更新 OptiFine 或 Forge 版本，或移除冲突的 Mod";
                }
                return null;
            }
        },
        {
            keywords: ["Mixin prepare failed", "Mixin apply failed", "MixinApplyError", "MixinTransformerError", "mixin.injection.throwables.", ".json] FAILED during "],
            logic: 'any',
            dynamicReason: (log) => {
                const modNameMatch1 = log.match(/(?<=from mod )[^.\/ ]+(?=\])/);
                const modNameMatch2 = log.match(/(?<=for mod )[^.\/ ]+(?= failed)/);
                const jsonNameMatches = [...log.matchAll(/(?<=^[^ \t]+[ \[({]{1})[^ \[({]+\.[^ ]+(?=\.json)/gm)];
                let modName = null;
                if (modNameMatch1) modName = modNameMatch1[0].trim();
                else if (modNameMatch2) modName = modNameMatch2[0].trim();

                if (modName) {
                    return `Mod Mixin 失败，可能与 Mod [${modName}] 有关\n请检查该 Mod 是否与当前游戏版本兼容，或尝试更新/删除该 Mod`;
                } else if (jsonNameMatches.length > 0) {
                    const jsonNames = jsonNameMatches.map(match => match[0].replace(/mixins\./, '').replace(/\.mixin$/, ''));
                    return `Mod Mixin 失败，可能与 Mod 配置文件 [${jsonNames.join(', 因为它包含特殊字符或已损坏。')}] 有关\n请检查这些配置文件是否正确，或尝试删除/重新生成`;
                }
                return null;
            }
        },
        {
            keywords: ["Caught exception from "],
            dynamicReason: (log) => {
                const modNameMatch = log.match(/(?<=Caught exception from )([^\n\r]+?)(?=\n|\r|$)/);
                if (modNameMatch) {
                    const modName = modNameMatch[1].trim();
                    return `Mod [${modName}] 导致游戏崩溃\n请检查该 Mod 是否与当前游戏版本兼容，或尝试更新/删除该 Mod`;
                }
                return null;
            }
        },
        {
            keywords: ["LoaderExceptionModCrash: Caught exception from "],
            dynamicReason: (log) => {
                const modNameMatch = log.match(/(?<=LoaderExceptionModCrash: Caught exception from )([^\n\r]+?)(?=\n|\r|$)/);
                if (modNameMatch) {
                    const modName = modNameMatch[1].trim();
                    return `Mod [${modName}] 导致游戏崩溃\n请检查该 Mod 是否与当前游戏版本兼容，或尝试更新/删除该 Mod`;
                }
                return null;
            }
        },
        {
            keywords: ["Multiple entries with same key: "],
            dynamicReason: (log) => {
                const keyMatch = log.match(/(?<=Multiple entries with same key: )[^=\n\r]+/);
                if (keyMatch) {
                    const keyName = keyMatch[0].trim();
                    return `检测到重复的键: [${keyName}]，这可能导致 Mod 冲突\n请检查您的 Mod 列表，确保没有重复的 Mod 或配置冲突`;
                }
                return null;
            }
        },
        {
            keywords: ["Failed loading config file "],
            dynamicReason: (log) => {
                const filePathMatch = log.match(/(?<=Failed loading config file )[^ \n\r]+(?= of type)/);
                const modIdMatch = log.match(/(?<=for modid )[^ \n\r]+/);
                let infoParts = [];
                if (filePathMatch) {
                    infoParts.push(`文件: ${filePathMatch[0].trim()}`);
                }
                if (modIdMatch) {
                    infoParts.push(`Mod ID: ${modIdMatch[0].trim()}`);
                }
                const modInfo = infoParts.length > 0 ? `可能与 ${infoParts.join(', ')} 有关` : '未知 Mod';
                return `Mod 配置文件损坏，${modInfo}。\n请尝试删除或重新生成该 Mod 的配置文件`;
            }
        },
    ];

    for (const check of checks) {
        let matched = false;
        if (check.logic === 'all') {
            matched = check.keywords.every(keyword => log.includes(keyword));
        } else {
            matched = check.keywords.some(keyword => log.includes(keyword));
        }

        if (matched) {
            let reasonToAdd = null;
            if (check.dynamicReason) {
                reasonToAdd = check.dynamicReason(log);
            } else {
                reasonToAdd = check.reason;
            }

            if (reasonToAdd) {
                results.push(reasonToAdd);
            }
        }
    }

    if (results.length > 0) {
        const mainProblem = results[0];
        const otherProblems = results.slice(1);
        let finalResult = `【快速分析】\n主要问题：\n${mainProblem}`;
        if (otherProblems.length > 0) {
            finalResult += `\n\n--- 其他可能的问题 ---\n\n${otherProblems.join('\n\n')}`;
        }
        return finalResult;
    }

    return "未在快速分析中发现明显问题，建议等待AI的详细分析";
}


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

app.post('/api/extract', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '未上传文件' });
        }
        const log = fs.readFileSync(req.file.path, 'utf-8');
        fs.unlinkSync(req.file.path);

        db.run('INSERT INTO upload_stats DEFAULT VALUES', (err) => {
            if (err) {
                console.error('记录上传数据失败:', err.message);
            }
        });

        const info = extractInfo(log);
        const quickAnalysisResult = quickAnalysis(log);

        res.json({
            info,
            log,
            quickAnalysis: quickAnalysisResult
        });
    } catch (error) {
        console.error('API /api/extract 发生错误:', error);
        res.status(500).json({ error: '日志提取失败: ' + error.message });
    }
});

// --- 修改：更新统计API以提供图表数据 ---
app.get('/api/stats', (req, res) => {
    const stats = {
        total: 0,
        daily: 0,
        weekly: 0,
        dailyTrend: Array(7).fill(0) // 为过去7天初始化数组 [6天前, ..., 今天]
    };

    // 使用db.serialize确保查询按顺序执行
    db.serialize(() => {
        // 1. 获取总数 (此查询不变)
        db.get("SELECT COUNT(*) as count FROM upload_stats", [], (err, row) => {
            if (err) {
                console.error("查询总数失败:", err.message);
                return res.status(500).json({ error: '获取总数统计失败' });
            }
            stats.total = row.count || 0;
        });

        // 2. 获取今日数量 (使用SQLite的 'now' 和 'start of day')
        // 这会获取服务器当前日期（UTC）从0点开始的记录
        db.get("SELECT COUNT(*) as count FROM upload_stats WHERE timestamp >= DATE('now', 'start of day')", [], (err, row) => {
            if (err) {
                console.error("查询每日数量失败:", err.message);
                return res.status(500).json({ error: '获取每日统计失败' });
            }
            stats.daily = row.count || 0;
        });

        // 3. 获取本周数量 (使用SQLite的 'now' 和 '-7 days')
        db.get("SELECT COUNT(*) as count FROM upload_stats WHERE timestamp >= DATE('now', '-7 days')", [], (err, row) => {
            if (err) {
                console.error("查询每周数量失败:", err.message);
                return res.status(500).json({ error: '获取每周统计失败' });
            }
            stats.weekly = row.count || 0;
        });

        // 4. 获取过去7天的上传趋势
        // - 按天分组 (`DATE(timestamp)`)
        // - 筛选最近7天的数据 (`DATE('now', '-6 days')` 包括今天在内一共7天)
        const trendQuery = `
            SELECT 
                DATE(timestamp) as upload_day, 
                COUNT(*) as count 
            FROM upload_stats 
            WHERE timestamp >= DATE('now', '-6 days')
            GROUP BY upload_day;
        `;
        db.all(trendQuery, [], (err, rows) => {
            if (err) {
                console.error("查询趋势数据失败:", err.message);
                return res.status(500).json({ error: '获取趋势数据失败' });
            }

            // 5. 将查询到的数据填充到 dailyTrend 数组中
            // 因为查询只返回有数据的日期，我们需要手动处理没有数据的日期（补0）
            rows.forEach(row => {
                // 计算日期差异
                const day = new Date(row.upload_day);
                const today = new Date();
                // 将时间都设置为UTC的0点，以精确计算天数差异
                day.setUTCHours(0, 0, 0, 0);
                today.setUTCHours(0, 0, 0, 0);

                const diffTime = today.getTime() - day.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 0 && diffDays < 7) {
                    const index = 6 - diffDays; // 数组索引: 0是6天前, ..., 6是今天
                    stats.dailyTrend[index] = row.count;
                }
            });

            // 6. 所有查询完成后，发送最终结果
            res.json(stats);
        });
    });
});
// --- 统计 API 修改结束 ---

app.get('/api/github-info', async (req, res) => {
    const repoOwner = 'LanRhyme';
    const repoName = 'Web-MinecraftLogAnalyzer';
    const headers = {
        'User-Agent': 'Node.js Server',
        'Accept': 'application/vnd.github.v3+json'
    };

    if (GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    try {
        const repoResponse = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}`, { headers });
        const stars = repoResponse.data.stargazers_count;

        const commitsResponse = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/commits?per_page=1`, { headers });
        const lastCommitDate = commitsResponse.data[0] ? commitsResponse.data[0].commit.author.date : null;

        res.json({ stars, lastCommitDate });
    } catch (error) {
        console.error('Error fetching GitHub info:', error.response?.data || error.message);
        res.status(500).json({ error: '无法获取 GitHub 信息', details: error.message });
    }
});

app.get('/api/check-gemini-status', async (req, res) => {
    const target = GEMINI_PROXY_TARGET;
    if (!target) {
        return res.json({ status: 'error', message: 'GEMINI_PROXY_TARGET 未设置', latency: 'N/A' });
    }
    const startTime = Date.now();
    try {
        await axios.get(target, { timeout: 5000 });
        const endTime = Date.now();
        const latency = endTime - startTime;
        res.json({ status: 'ok', message: 'Gemini 代理连接正常', latency: latency });
    } catch (error) {
        const endTime = Date.now();
        const latency = endTime - startTime;
        console.error('Error checking Gemini proxy status:', error.message);
        res.json({ status: 'error', message: 'Gemini 代理连接失败: ' + error.message, latency: latency });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});