/**
 * AI 创意工坊 - 主应用脚本
 * 整合 Design Agent 系统 + 画布式 Agent 搭建器
 */

// ==================== 全局配置 ====================
const DEFAULT_API_URL = 'https://ai.comfly.chat';

// 预设 API 线路
const API_LINES = [
    { label: '线路一（默认）', url: 'https://ai.comfly.chat' },
    { label: '线路二', url: 'https://www.aitrylook.top' }
];

// 切换 API 线路
function switchApiLine(url) {
    const input = document.getElementById('api-base-url');
    if (input) input.value = url;
}

let apiConfig = {
    baseUrl: DEFAULT_API_URL,
    apiKey: '',
    runninghubApiKey: ''
};

let modelConfig = {
    llm: 'gemini-3-flash-preview',
    imageGen: 'nano-banana-pro'
};

// Agent 模式状态
let isAgentModeActive = true;

// 上传的图片
let uploadedImages = [];

// 聊天上传的图片
let chatUploadedImages = [];

// 生成数量
let generationCount = 1;

// 对话历史
let conversationHistory = [];

// 模块实例
let contextManager = null;
let intentDetector = null;
let planGenerator = null;
let ragManager = null;
let mainFlow = null;

// 当前工作流配置
let currentWorkflow = null;

// ==================== 默认工作流预设 ====================
const WORKFLOW_PRESETS = {
    default: {
        name: '默认设计 Agent',
        nodes: [
            { id: 'n1', type: 'intent', name: '意图识别', x: 100, y: 150 },
            { id: 'n2', type: 'rag', name: 'RAG 检索', x: 300, y: 80 },
            { id: 'n3', type: 'planner', name: '任务规划', x: 300, y: 220 },
            { id: 'n4', type: 'optimizer', name: '提示词优化', x: 500, y: 150 },
            { id: 'n5', type: 'generator', name: '图片生成', x: 700, y: 150 },
            { id: 'n6', type: 'checker', name: '质量检查', x: 900, y: 150 }
        ],
        connections: [
            { from: 'n1', to: 'n2' },
            { from: 'n1', to: 'n3' },
            { from: 'n2', to: 'n4' },
            { from: 'n3', to: 'n4' },
            { from: 'n4', to: 'n5' },
            { from: 'n5', to: 'n6' }
        ]
    },
    fast: {
        name: '快速出图 Agent',
        nodes: [
            { id: 'n1', type: 'intent', name: '意图识别', x: 150, y: 150 },
            { id: 'n2', type: 'optimizer', name: '提示词优化', x: 400, y: 150 },
            { id: 'n3', type: 'generator', name: '图片生成', x: 650, y: 150 }
        ],
        connections: [
            { from: 'n1', to: 'n2' },
            { from: 'n2', to: 'n3' }
        ]
    },
    quality: {
        name: '高质量精修 Agent',
        nodes: [
            { id: 'n1', type: 'intent', name: '意图识别', x: 80, y: 150 },
            { id: 'n2', type: 'rag', name: 'RAG 检索', x: 250, y: 80 },
            { id: 'n3', type: 'planner', name: '任务规划', x: 250, y: 220 },
            { id: 'n4', type: 'optimizer', name: '提示词优化', x: 420, y: 150 },
            { id: 'n5', type: 'generator', name: '图片生成', x: 590, y: 150 },
            { id: 'n6', type: 'checker', name: '质量检查', x: 760, y: 150 },
            { id: 'n7', type: 'optimizer', name: '二次优化', x: 760, y: 280 },
            { id: 'n8', type: 'generator', name: '重新生成', x: 930, y: 220 }
        ],
        connections: [
            { from: 'n1', to: 'n2' },
            { from: 'n1', to: 'n3' },
            { from: 'n2', to: 'n4' },
            { from: 'n3', to: 'n4' },
            { from: 'n4', to: 'n5' },
            { from: 'n5', to: 'n6' },
            { from: 'n6', to: 'n7' },
            { from: 'n7', to: 'n8' }
        ]
    }
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 加载配置
    loadConfig();
    
    // 初始化模块
    await initModules();
    
    // 初始化工作流
    currentWorkflow = { ...WORKFLOW_PRESETS.default };
    
    // 设置拖拽事件
    setupDragAndDrop();

    // 初始化对话框拖拽缩放
    initChatPanelResize();

    // 初始化模式与生成数量按钮
    updateTaskModeButton('text2img');
    setGenerationCount(generationCount);
    
    console.log('[App] 初始化完成');
});

function loadConfig() {
    try {
        const savedApi = localStorage.getItem('ai_studio_api_config');
        if (savedApi) {
            const parsed = JSON.parse(savedApi);
            // 加载用户自行配置的所有 API 参数
            if (parsed.baseUrl) apiConfig.baseUrl = parsed.baseUrl;
            if (parsed.apiKey) apiConfig.apiKey = parsed.apiKey;
            if (parsed.runninghubApiKey) apiConfig.runninghubApiKey = parsed.runninghubApiKey;
        }
        
        const savedModel = localStorage.getItem('ai_studio_model_config');
        if (savedModel) {
            const parsed = JSON.parse(savedModel);
            modelConfig = { ...modelConfig, ...parsed };
        }
        
        // 也尝试加载 design_agent 格式的配置（兼容旧版本）
        const oldModelConfig = localStorage.getItem('design_agent_model_config');
        if (oldModelConfig) {
            const parsed = JSON.parse(oldModelConfig);
            if (parsed.llm) modelConfig.llm = parsed.llm;
            if (parsed.imageGen) modelConfig.imageGen = parsed.imageGen;
        }
        
        const savedWorkflow = localStorage.getItem('ai_studio_workflow');
        if (savedWorkflow) currentWorkflow = JSON.parse(savedWorkflow);
        
        // 确保必要字段有值
        modelConfig.llm = modelConfig.llm || 'gemini-3-flash-preview';
        modelConfig.imageGen = modelConfig.imageGen || 'nano-banana-pro';
        apiConfig.baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
        
        // 填充设置表单（所有字段均可由用户自由配置）
        document.getElementById('api-base-url').value = apiConfig.baseUrl;
        // 同步线路选择下拉框
        const lineSelect = document.getElementById('api-line-select');
        if (lineSelect) {
            const matched = Array.from(lineSelect.options).some(opt => opt.value === apiConfig.baseUrl);
            lineSelect.value = matched ? apiConfig.baseUrl : API_LINES[0].url;
        }
        const apiKeyInput = document.getElementById('api-key');
        if (apiKeyInput) apiKeyInput.value = apiConfig.apiKey || '';
        document.getElementById('llm-model').value = modelConfig.llm;
        document.getElementById('image-model').value = modelConfig.imageGen;
        const rhInput = document.getElementById('rh-api-key');
        if (rhInput) rhInput.value = apiConfig.runninghubApiKey || '';
        
        console.log('[App] 配置加载完成:', { modelConfig, hasApiKey: !!apiConfig.apiKey, runninghubKey: '***' });
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}

// loadGlobalApiConfig 已移除（不再从后端获取配置，用户自行在设置中配置）
function loadGlobalApiConfig() {
    console.log('[App] 使用本地配置，无需远程加载');
}
window.loadGlobalApiConfig = loadGlobalApiConfig;

async function initModules() {
    try {
        contextManager = new ContextManager();
        intentDetector = new IntentDetector();
        planGenerator = new PlanGenerator();
        ragManager = new RAGManager();
        
        // 加载知识库
        await ragManager.loadKnowledgeBase('data/knowledge-base.json');
        
        mainFlow = new MainFlowController(
            contextManager,
            intentDetector,
            planGenerator,
            ragManager
        );
        
        console.log('[App] 模块初始化成功');
    } catch (error) {
        console.error('[App] 模块初始化失败:', error);
    }
}

// ==================== 视图切换 ====================
function goHome() {
    // 首页已移除，直接在画布中操作
    console.log('[App] 已在画布模式中');
}

function clearCanvasImages() {
    const container = document.getElementById('generated-content');
    if (container) {
        // 保留空状态提示
        const emptyHint = document.getElementById('canvas-empty-hint');
        container.innerHTML = '';
        if (emptyHint) {
            container.appendChild(emptyHint);
            emptyHint.style.display = 'block';
        }
    }
    canvasImages = [];
    generatedImages = [];
}

function startChat() {
    const input = document.getElementById('home-input').value.trim();
    
    // 切换视图
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('chat-canvas-view').classList.remove('hidden');
    const nav = document.getElementById('top-nav');
    if (nav) nav.classList.add('hidden');
    
    // 清空聊天历史
    document.getElementById('chat-history').innerHTML = '';
    conversationHistory = [];
    
    // 初始化画布节点系统
    if (typeof initCanvasNodeSystem === 'function') {
        initCanvasNodeSystem();
    }
    
    // 重置画布视图
    if (typeof resetCanvasView === 'function') {
        resetCanvasView();
    }
    
    // 如果有输入或图片，自动发送
    if (input || uploadedImages.length > 0) {
        document.getElementById('chat-input').value = input;
        sendMessage();
    }
}

// ==================== 消息发送 ====================
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const query = input.value.trim();
    
    // 合并两种图片来源
    const allImages = [
        ...uploadedImages,
        ...chatUploadedImages.map(img => img.url)
    ];
    
    if (!query && allImages.length === 0) return;
    
    // 检查API配置
    if (!apiConfig.apiKey) {
        showToast('请先在设置中配置 API Key', 'error');
        openSettings();
        return;
    }
    
    // 清空输入
    input.value = '';
    input.style.height = 'auto';
    
    // 构建用户消息内容（包含图片和文字）
    let userMessageContent = '';
    if (allImages.length > 0) {
        userMessageContent += `<div class="flex flex-wrap gap-2 mb-2">`;
        allImages.forEach((img, idx) => {
            userMessageContent += `<img src="${img}" alt="上传图片${idx+1}" class="w-16 h-16 rounded-lg object-cover border-2 border-blue-200 shadow-sm" />`;
        });
        userMessageContent += `</div>`;
    }
    if (query) {
        userMessageContent += `<p>${escapeHtml(query)}</p>`;
    }
    
    // 显示用户消息（包含图片）
    addMessage(userMessageContent, true);

    // 发送后立即释放聊天区上传的图片
    uploadedImages = [];
    chatUploadedImages = [];
    updateImagePreview('home-images-preview');
    updateChatImagePreview();
    const chatInputFile = document.getElementById('chat-image-upload');
    if (chatInputFile) chatInputFile.value = '';
    const chatUploadInput = document.getElementById('chat-image-upload');
    if (chatUploadInput) chatUploadInput.value = '';
    
    // 保存上下文
    conversationHistory.push({ role: 'user', content: query });
    
    // 显示加载状态
    const loadingEl = addLoadingMessage();
    
    try {
        // 获取当前选择的模式
        const modeBtn = document.getElementById('task-mode-btn');
        const currentMode = modeBtn ? (modeBtn.dataset.mode || 'text2img') : 'text2img';

        // 根据模式直接分发任务
        if (currentMode === 'text2img') {
            // 文生图模式：使用 banana-2 模型
            if (!query) {
                loadingEl.remove();
                addMessage('请输入图片描述文字。', false);
                return;
            }
            loadingEl.remove();
            const genMsg = addMessage(`
                <div class="space-y-2">
                    <p>🎨 正在生成图片（文生图）...</p>
                    <div class="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 max-h-32 overflow-y-auto">
                        <strong>提示词:</strong> ${escapeHtml(query)}
                    </div>
                    <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div id="gen-progress" class="h-full bg-black transition-all" style="width: 10%"></div>
                    </div>
                </div>
            `, false);
            try {
                const result = await generateImage({
                    prompt: query,
                    aspectRatio: '1:1',
                    resolution: '1024x1024',
                    model: 'nano-banana-2',
                    referenceImages: []
                });
                let imageUrl = null;
                if (result.type === 'immediate') {
                    imageUrl = result.url;
                } else if (result.type === 'async') {
                    const progressEl = document.getElementById('gen-progress');
                    const pollResult = await pollImageTask(result.taskId, (progress) => {
                        if (progressEl) progressEl.style.width = `${progress}%`;
                    });
                    imageUrl = pollResult.url;
                }
                genMsg.innerHTML = `<div class="ai-message message-animate space-y-3"><p>✅ 图片生成成功！</p>${renderChatImageBlock(imageUrl, `design-${Date.now()}.png`)}</div>`;
                addImageToCanvas(imageUrl);
            } catch (err) {
                genMsg.innerHTML = `<div class="ai-message message-animate"><p class="text-red-600">❌ 图片生成失败: ${escapeHtml(err.message)}</p></div>`;
            }

        } else if (currentMode === 'img2img') {
            // 图生图模式：使用 banana-2 模型，需要参考图
            if (allImages.length === 0) {
                loadingEl.remove();
                addMessage('请先上传参考图片再进行图生图。', false);
                return;
            }
            loadingEl.remove();
            const genMsg = addMessage(`
                <div class="space-y-2">
                    <p>🖼️ 正在生成图片（图生图）...</p>
                    <div class="flex gap-2 mb-2">${allImages.map(img => `<img src="${img}" class="w-12 h-12 rounded object-cover border"/>`).join('')}</div>
                    <div class="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 max-h-32 overflow-y-auto">
                        <strong>提示词:</strong> ${escapeHtml(query || '基于参考图生成')}
                    </div>
                    <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div id="gen-progress" class="h-full bg-black transition-all" style="width: 10%"></div>
                    </div>
                </div>
            `, false);
            try {
                const result = await generateImage({
                    prompt: query || '基于参考图片生成相似风格的图片',
                    aspectRatio: '1:1',
                    resolution: '1024x1024',
                    model: 'nano-banana-2',
                    referenceImages: allImages
                });
                let imageUrl = null;
                if (result.type === 'immediate') {
                    imageUrl = result.url;
                } else if (result.type === 'async') {
                    const progressEl = document.getElementById('gen-progress');
                    const pollResult = await pollImageTask(result.taskId, (progress) => {
                        if (progressEl) progressEl.style.width = `${progress}%`;
                    });
                    imageUrl = pollResult.url;
                }
                genMsg.innerHTML = `<div class="ai-message message-animate space-y-3"><p>✅ 图生图完成！</p>${renderChatImageBlock(imageUrl, `design-${Date.now()}.png`)}</div>`;
                addImageToCanvas(imageUrl);
            } catch (err) {
                genMsg.innerHTML = `<div class="ai-message message-animate"><p class="text-red-600">❌ 图生图失败: ${escapeHtml(err.message)}</p></div>`;
            }

        } else if (currentMode === 'analyze') {
            // 图片反推模式：使用 gemini-3-flash-preview 进行提示词反推
            if (allImages.length === 0) {
                loadingEl.remove();
                addMessage('请先上传需要反推提示词的图片。', false);
                return;
            }
            try {
                const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
                const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
                const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;
                const analyzeModel = 'gemini-3-flash-preview';

                // 将所有图片转为 base64
                const imageContents = [];
                for (const imgUrl of allImages) {
                    const base64Url = await imageUrlToBase64DataUrl(imgUrl);
                    imageContents.push({ type: 'image_url', image_url: { url: base64Url } });
                }

                const systemPrompt = `你是一位专业的AI绘图提示词工程师。请仔细分析用户上传的图片，反推出能够用AI绘图工具重新生成该图片的详细提示词。

要求：
1. 用英文输出主提示词（prompt），尽量详细描述画面内容、风格、构图、光影、色调等
2. 同时提供中文翻译版本
3. 如果图片有明显的艺术风格，请指出风格名称
4. 提供推荐的生成参数（如比例、风格关键词等）

输出格式：
🎨 英文提示词：
[详细英文prompt]

📝 中文翻译：
[中文翻译]

🏷️ 风格标签：[风格1] [风格2] ...

⚙️ 推荐参数：
- 比例：[推荐比例]
- 风格关键词：[关键词]`;

                const messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: [
                        { type: 'text', text: query || '请分析这张图片并反推AI绘图提示词。' },
                        ...imageContents
                    ] }
                ];

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: analyzeModel,
                        messages: messages,
                        temperature: 0.3,
                        max_tokens: 3000
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API 错误: ${response.status} ${errorText}`);
                }

                const data = await response.json();
                const analysisResult = data.choices?.[0]?.message?.content || '无法解析响应';

                loadingEl.remove();
                addMessage(`<div class="space-y-2">
                    <p>🔍 图片反推结果：</p>
                    <div class="flex gap-2 mb-2">${allImages.map(img => `<img src="${img}" class="w-16 h-16 rounded object-cover border"/>`).join('')}</div>
                    <div class="bg-gray-50 p-4 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(analysisResult)}</div>
                </div>`, false);
                conversationHistory.push({ role: 'assistant', content: analysisResult });
            } catch (err) {
                loadingEl.remove();
                addMessage(`❌ 图片反推失败: ${escapeHtml(err.message)}`, false, 'error');
            }

        } else if (currentMode === 'agent') {
            // Agent 模式：保持原有逻辑
            if (isAgentModeActive && window.agentChat) {
                let agentTaskType = null;
                let agentAutoGenerated = false;
                await window.agentChat.processMessage(query, allImages, {
                    onTaskIdentified: (taskInfo) => {
                        console.log('[App] 任务识别:', taskInfo);
                        updateAgentStatus(getTaskLabel(taskInfo.type), 'blue');
                        agentTaskType = taskInfo.type;
                    },
                    onThinking: (text) => {
                        loadingEl.querySelector('.text-sm')?.remove();
                        const span = document.createElement('span');
                        span.className = 'text-sm text-gray-500 ml-2';
                        span.textContent = text || '正在思考...';
                        loadingEl.querySelector('.ai-message')?.appendChild(span);
                    },
                    onMessage: (content, type) => {
                        loadingEl.remove();
                        const isImageTask = agentTaskType === 'text_to_image' || agentTaskType === 'image_to_image';
                        if (isImageTask && !agentAutoGenerated && content && typeof generateImage === 'function') {
                            agentAutoGenerated = true;
                            const friendly = buildAgentFriendlyReply(query);
                            addMessage(friendly, false, type);
                            generateImage({
                                prompt: content,
                                aspectRatio: '1:1',
                                resolution: '1024x1024',
                                referenceImages: allImages
                            }).then(result => {
                                return result.type === 'immediate'
                                    ? result.url
                                    : pollImageTask(result.taskId).then(p => p.url);
                            }).then(imageUrl => {
                                addMessage(renderChatImageBlock(imageUrl, `design-${Date.now()}.png`), false);
                                addImageToCanvas(imageUrl);
                            }).catch(err => {
                                addMessage(`❌ 生成失败: ${err.message}`, false, 'error');
                            });
                            return;
                        }
                        if (isImageTask && agentAutoGenerated) {
                            return;
                        }
                        addMessage(formatAgentMessage(content), false, type);
                    },
                    onImageGenerated: (images, prompt) => {
                        loadingEl.remove();
                        images.forEach((imageUrl, idx) => {
                            addMessage(renderChatImageBlock(imageUrl, `design-${Date.now()}-${idx}.png`), false);
                            addImageToCanvas(imageUrl);
                        });
                        updateAgentStatus('就绪', 'green');
                    },
                    onVideoGenerated: (videos) => {
                        loadingEl.remove();
                        videos.forEach(videoUrl => {
                            addMessage(renderChatVideoBlock(videoUrl, `video-${Date.now()}.mp4`), false);
                        });
                        updateAgentStatus('就绪', 'green');
                    },
                    onTodoListCreated: (todoList) => {
                        console.log('[App] 任务列表:', todoList);
                    },
                    onTaskProgress: (current, total, task) => {
                        showTaskProgress(current, total, task.title);
                    },
                    onError: (error) => {
                        loadingEl.remove();
                        addMessage(`❌ 错误: ${error.message}`, false, 'error');
                        updateAgentStatus('错误', 'red');
                    }
                });
            } else if (mainFlow) {
                await executeAgentWorkflow(query, loadingEl);
            } else {
                await executeDirectChat(query, loadingEl);
            }
        } else {
            // 默认：直接对话
            await executeDirectChat(query, loadingEl);
        }
    } catch (error) {
        loadingEl.remove();
        addMessage(`❌ 错误: ${error.message}`, false, 'error');
    }
    
    // 清空已上传图片
    uploadedImages = [];
    chatUploadedImages = [];
    updateImagePreview('home-images-preview');
    updateChatImagePreview();
    const chatInputFileAfter = document.getElementById('chat-image-upload');
    if (chatInputFileAfter) chatInputFileAfter.value = '';
    hideTaskProgress();
}

// 获取任务类型标签
function getTaskLabel(taskType) {
    const labels = {
        'text_to_image': '文生图',
        'image_to_image': '图生图',
        'image_to_video': '图生视频',
        'image_analysis': '图片分析',
        'complex_task': '复杂任务',
        'chat': '对话'
    };
    return labels[taskType] || '处理中';
}

// 格式化Agent消息（支持Markdown）
function formatAgentMessage(content) {
    // 简单的Markdown处理
    return content
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/- /g, '• ');
}

function buildAgentFriendlyReply(query) {
    const text = (query || '').trim();
    const templates = [
        '我来帮您生成一个专业且美观的设计作品。',
        '好的，我马上为您生成一张高质量的设计稿。',
        '明白了，我这就帮您开始生成。'
    ];
    if (!text) return templates[0];
    const keywords = [
        { key: '海报', label: '海报' },
        { key: '主图', label: '主图' },
        { key: '封面', label: '封面' },
        { key: '头像', label: '头像' },
        { key: '插画', label: '插画' },
        { key: 'LOGO', label: 'LOGO' },
        { key: 'logo', label: 'LOGO' },
        { key: '宣传图', label: '宣传图' }
    ];
    const hit = keywords.find(item => text.includes(item.key));
    if (hit) {
        return `我来帮您生成一个专业且美观的${hit.label}。`;
    }
    return templates[Math.floor(Math.random() * templates.length)];
}

function openChatMediaFullscreen(url, type = 'image') {
    openChatMediaFullscreenWithCallback(url, type, null);
}

// 带回调的全屏查看函数
function openChatMediaFullscreenWithCallback(url, type = 'image', onCloseCallback = null) {
    if (!url) return;
    const existing = document.getElementById('fullscreen-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center cursor-zoom-out';
    
    const closeFullscreen = () => {
        overlay.remove();
        if (typeof onCloseCallback === 'function') {
            onCloseCallback();
        }
    };
    
    overlay.onclick = (e) => {
        if (e.target === overlay) closeFullscreen();
    };
    const media = type === 'video'
        ? `<video src="${url}" class="max-w-[90vw] max-h-[90vh] rounded-lg" controls autoplay></video>`
        : `<img src="${url}" class="max-w-[90vw] max-h-[90vh] rounded-lg" />`;
    const filename = type === 'video' ? `video-${Date.now()}.mp4` : `image-${Date.now()}.png`;
    overlay.innerHTML = `
        ${media}
        <div class="absolute top-4 right-4 flex items-center gap-2">
            <a href="${url}" download="${filename}" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-sm" title="下载">↓</a>
            <button id="fullscreen-close-btn" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl">×</button>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // 绑定关闭按钮事件
    const closeBtn = document.getElementById('fullscreen-close-btn');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeFullscreen();
        };
    }
}

function renderChatImageBlock(imageUrl, filename) {
    return `
        <div class="space-y-2">
            <div class="rounded-lg overflow-hidden border border-gray-200 bg-white">
                <img src="${imageUrl}" alt="生成的图片" class="w-full" />
            </div>
            <div class="flex gap-2">
                <button onclick="openChatMediaFullscreen('${imageUrl}','image')" class="flex-1 text-center text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">全屏查看</button>
                <a href="${imageUrl}" download="${filename || 'design.png'}" class="flex-1 text-center text-xs bg-black text-white px-3 py-2 rounded-lg hover:bg-gray-800">下载图片</a>
            </div>
        </div>
    `;
}

function renderChatVideoBlock(videoUrl, filename) {
    return `
        <div class="space-y-2">
            <div class="rounded-lg overflow-hidden border border-gray-200 bg-white">
                <video src="${videoUrl}" class="w-full" controls></video>
            </div>
            <div class="flex gap-2">
                <button onclick="openChatMediaFullscreen('${videoUrl}','video')" class="flex-1 text-center text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">全屏观看</button>
                <a href="${videoUrl}" download="${filename || 'video.mp4'}" class="flex-1 text-center text-xs bg-black text-white px-3 py-2 rounded-lg hover:bg-gray-800">下载视频</a>
            </div>
        </div>
    `;
}

// ==================== Agent 工作流执行 ====================
async function executeAgentWorkflow(query, loadingEl) {
    console.log('[Agent] 开始执行工作流');
    
    // 更新状态
    updateAgentStatus('执行中', 'blue');
    
    // 检查是否有上传的图片
    const hasImages = uploadedImages && uploadedImages.length > 0;
    
    try {
        // 1. 意图检测
        updateNodeStatus('intent', 'running');
        addAgentLog('🎯 正在分析意图...');
        
        // 如果有图片，调整查询以反映图生图意图
        let effectiveQuery = query;
        if (hasImages) {
            effectiveQuery = `基于上传的${uploadedImages.length}张参考图片，${query}`;
            addAgentLog(`📷 检测到 ${uploadedImages.length} 张参考图片`);
        }
        
        const intent = await intentDetector.detectIntent(effectiveQuery, {});
        updateNodeStatus('intent', 'completed');
        addAgentLog(`✅ 意图: ${intent.operation}, 约束: ${intent.constraints?.join(', ') || '无'}`);
        
        // 2. 根据工作流执行
        let ragResult = null;
        let plan = null;
        let optimizedPrompt = null;
        
        // RAG 检索
        if (hasNodeType('rag')) {
            updateNodeStatus('rag', 'running');
            addAgentLog('📚 正在检索相关知识...');
            
            ragResult = await ragManager.retrieve({ userInput: effectiveQuery }, []);
            updateNodeStatus('rag', 'completed');
            addAgentLog(`✅ 检索到 ${ragResult.templates?.length || 0} 个模板`);
        }
        
        // 任务规划
        if (hasNodeType('planner')) {
            updateNodeStatus('planner', 'running');
            addAgentLog('📋 正在规划任务...');
            
            plan = await planGenerator.generatePlan(effectiveQuery, {}, intent);
            updateNodeStatus('planner', 'completed');
            addAgentLog(`✅ 规划完成: ${plan.designType || '自定义设计'}`);
        }
        
        // 提示词优化
        if (hasNodeType('optimizer')) {
            updateNodeStatus('optimizer', 'running');
            addAgentLog('✨ 正在优化提示词...');
            
            optimizedPrompt = await ragManager.generateOptimizedPrompt(
                plan || { userInput: effectiveQuery },
                ragResult || {},
                intent
            );
            updateNodeStatus('optimizer', 'completed');
            addAgentLog('✅ 提示词优化完成');
        }
        
        // 如果有上传图片，增强提示词
        if (hasImages && optimizedPrompt) {
            optimizedPrompt = `Based on the reference image(s) style and composition: ${optimizedPrompt}`;
        }
        
        // 移除加载状态
        loadingEl.remove();
        
        // 图片生成
        if (hasNodeType('generator')) {
            updateNodeStatus('generator', 'running');
            addAgentLog('🎨 正在生成图片...');
            
            // 显示生成中消息
            const genMsg = addMessage(`
                <div class="space-y-2">
                    <p>🎨 正在生成图片${hasImages ? '（图生图模式）' : ''}...</p>
                    ${hasImages ? `<div class="flex gap-2 mb-2">${uploadedImages.map(img => `<img src="${img}" class="w-12 h-12 rounded object-cover border"/>`).join('')}</div>` : ''}
                    <div class="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 max-h-32 overflow-y-auto">
                        <strong>优化后的提示词:</strong><br/>
                        ${optimizedPrompt || query}
                    </div>
                    <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div id="gen-progress" class="h-full bg-black transition-all" style="width: 10%"></div>
                    </div>
                </div>
            `, false);
            
            try {
                const result = await generateImage({
                    prompt: optimizedPrompt || query,
                    aspectRatio: plan?.aspectRatio || '1:1',
                    resolution: plan?.resolution || '1024x1024',
                    referenceImages: hasImages ? uploadedImages : []
                });
                
                let imageUrl = null;
                
                if (result.type === 'immediate') {
                    imageUrl = result.url;
                } else if (result.type === 'async') {
                    // 轮询获取结果
                    const progressEl = document.getElementById('gen-progress');
                    const pollResult = await pollImageTask(result.taskId, (progress) => {
                        if (progressEl) progressEl.style.width = `${progress}%`;
                    });
                    imageUrl = pollResult.url;
                }
                
                updateNodeStatus('generator', 'completed');
                addAgentLog('✅ 图片生成成功');
                
                // 替换消息显示图片
                genMsg.innerHTML = `
                    <div class="ai-message message-animate space-y-3">
                        <p>✅ 图片生成成功！</p>
                        ${renderChatImageBlock(imageUrl, 'design.png')}
                    </div>
                `;
                
                // 在画布上显示图片
                addImageToCanvas(imageUrl);
                
            } catch (error) {
                updateNodeStatus('generator', 'failed');
                addAgentLog(`❌ 图片生成失败: ${error.message}`);
                
                const promptText = (optimizedPrompt || query).replace(/'/g, "\\'").replace(/"/g, "&quot;");
                const errorHtml = `
                    <div class="ai-message message-animate">
                        <p class="text-red-600 font-medium">❌ 图片生成失败</p>
                        <p class="text-sm text-gray-600 mt-1">${escapeHtml(error.message)}</p>
                        <div class="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 mt-2 break-all">
                            <strong>提示词:</strong> ${escapeHtml(optimizedPrompt || query)}
                        </div>
                        <button onclick="copyPromptToClipboard()" class="mt-2 text-xs text-blue-600 hover:underline">复制提示词手动生成</button>
                        <div class="mt-2 text-xs text-gray-400">
                            <details>
                                <summary class="cursor-pointer">调试信息</summary>
                                <div class="mt-1 bg-gray-100 p-2 rounded text-xs">
                                    模型: ${modelConfig.imageGen}
                                </div>
                            </details>
                        </div>
                    </div>
                `;
                genMsg.innerHTML = errorHtml;
                
                // 保存提示词到全局变量供复制使用
                window._lastPrompt = optimizedPrompt || query;
            }
        } else {
            // 仅输出提示词
            addMessage(`
                <div class="space-y-2">
                    <p>✨ 提示词已生成</p>
                    <div class="bg-blue-50 p-3 rounded-lg text-sm text-gray-900">
                        ${optimizedPrompt || query}
                    </div>
                    <button onclick="copyToClipboard('${(optimizedPrompt || query).replace(/'/g, "\\'")}', '提示词')" class="text-xs text-blue-600 hover:underline">📋 复制提示词</button>
                </div>
            `, false);
        }
        
        // 质量检查
        if (hasNodeType('checker')) {
            updateNodeStatus('checker', 'running');
            addAgentLog('✅ 正在进行质量检查...');
            setTimeout(() => {
                updateNodeStatus('checker', 'completed');
                addAgentLog('✅ 质量检查完成');
            }, 1000);
        }
        
        updateAgentStatus('就绪', 'green');
        
    } catch (error) {
        console.error('[Agent] 执行失败:', error);
        loadingEl.remove();
        addMessage(`❌ Agent 执行失败: ${error.message}`, false, 'error');
        updateAgentStatus('错误', 'red');
    }
}

// ==================== 直接对话模式 ====================
async function executeDirectChat(query, loadingEl) {
    try {
        const response = await callLLM(query, '你是一个专业的设计助手，擅长帮助用户生成创意设计方案。', conversationHistory.slice(-10));
        
        loadingEl.remove();
        addMessage(response, false);
        conversationHistory.push({ role: 'assistant', content: response });
        
    } catch (error) {
        throw error;
    }
}

// ==================== API 调用 ====================
async function callLLM(prompt, systemPrompt = '', context = []) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;
    
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    if (context.length > 0) messages.push(...context);
    messages.push({ role: 'user', content: prompt });
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelConfig.llm,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 错误: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '无法解析响应';
}

// 将任意图片URL（blob/http/data）转换为 base64 data URL，供API使用
async function imageUrlToBase64DataUrl(url) {
    // 已经是 data URL，直接返回
    if (url.startsWith('data:')) return url;
    
    // blob URL 或 http URL：通过 fetch + canvas 转换
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('图片读取失败'));
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        throw new Error('图片转换失败: ' + e.message);
    }
}

// 从图片中识别文字（Gemini 视觉OCR，返回按从上到下排序的文本数组）
async function extractTextFromImage(imageUrl) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;
    const model = modelConfig.llm || 'gemini-3-flash-preview';
    
    // 关键：将 blob/http URL 转换为 base64 data URL，确保 API 能访问图片
    let base64ImageUrl;
    try {
        base64ImageUrl = await imageUrlToBase64DataUrl(imageUrl);
        console.log('[OCR] 图片已转换为 base64，长度:', base64ImageUrl.length);
    } catch (e) {
        console.error('[OCR] 图片转换失败:', e);
        throw new Error('图片读取失败，无法进行文字识别');
    }
    
    // 按行识别+样式分析的OCR提示词
    const systemPrompt = `你是专业的OCR文字识别与排版分析助手。请严格按照以下规则识别图片中的文字及其视觉样式：

1. 逐行识别图片中所有可见的文字（每行为一个独立元素）
2. 按照视觉上从上到下、从左到右的阅读顺序排列
3. 保持原始文字内容，不要翻译或修改
4. 对每行文字同时分析其视觉样式属性：
   - color: 文字颜色（CSS hex值，如 #ffffff、#333333）
   - bold: 是否粗体（true/false）
   - fontSize: 相对字号（small/medium/large/xlarge）
   - fontStyle: 字体风格（normal/italic）
   - align: 对齐方式（left/center/right）
5. 忽略装饰性元素、图标和水印

输出严格的JSON数组格式，每个元素包含 text 和 style 字段：
[
  {"text": "标题文字", "style": {"color": "#ffffff", "bold": true, "fontSize": "xlarge", "fontStyle": "normal", "align": "center"}},
  {"text": "正文内容", "style": {"color": "#333333", "bold": false, "fontSize": "medium", "fontStyle": "normal", "align": "left"}}
]
若无法识别任何文字，输出空数组 []`;
    
    const textInstruction = '请逐行识别图片中的所有文字内容及其视觉样式（颜色、粗细、大小、对齐方式），按从上到下的顺序输出JSON数组。';
    
    const multimodalMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
            { type: 'text', text: textInstruction },
            { type: 'image_url', image_url: { url: base64ImageUrl } }
        ] }
    ];
    
    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages: multimodalMessages, temperature: 0.1 })
        });
    } catch (e) {
        response = null;
    }
    
    if (!response || !response.ok) {
        // 降级：尝试用 detail:low 模式减少 token 消耗
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: [
                            { type: 'text', text: textInstruction },
                            { type: 'image_url', image_url: { url: base64ImageUrl, detail: 'low' } }
                        ] }
                    ],
                    temperature: 0.1
                })
            });
        } catch (e2) {
            throw new Error('OCR 请求失败，请检查网络和 API 配置');
        }
    }
    
    if (!response || !response.ok) {
        const errorText = response ? await response.text() : '无响应';
        throw new Error(`OCR 识别失败: ${response?.status || '网络错误'} ${errorText}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('[OCR] API 返回内容:', content.substring(0, 200));
    const result = parseTextArrayFromContent(content);
    if (!result.length) throw new Error('未识别到文字');
    return result;
}

// 解析结构化OCR结果，返回 [{text, style}] 数组
// style: {color, bold, fontSize, fontStyle, align}
function parseTextArrayFromContent(content) {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                return parsed
                    .map(item => {
                        // 新格式：{text, style}
                        if (item && typeof item === 'object' && typeof item.text === 'string') {
                            const style = item.style || {};
                            return {
                                text: item.text.trim(),
                                style: {
                                    color: style.color || '#333333',
                                    bold: !!style.bold,
                                    fontSize: style.fontSize || 'medium',
                                    fontStyle: style.fontStyle || 'normal',
                                    align: style.align || 'left'
                                }
                            };
                        }
                        // 兼容旧格式：纯字符串
                        if (typeof item === 'string' && item.trim()) {
                            return {
                                text: item.trim(),
                                style: { color: '#333333', bold: false, fontSize: 'medium', fontStyle: 'normal', align: 'left' }
                            };
                        }
                        return null;
                    })
                    .filter(Boolean);
            }
        } catch (e) {
            console.warn('[OCR] JSON 解析失败:', e);
        }
    }
    
    // 兜底：按行提取形如"1. xxx"或"• xxx"的文本
    return content
        .split('\n')
        .map(line => line.replace(/^\s*([0-9]+\.|[-•])\s*/, '').trim())
        .filter(line => line.length > 0)
        .map(text => ({
            text,
            style: { color: '#333333', bold: false, fontSize: 'medium', fontStyle: 'normal', align: 'left' }
        }));
}

async function fetchWithProtocolFallback(url, options = {}, allowHttpFallback = true) {
    try {
        return await fetch(url, options);
    } catch (err) {
        const canFallback = allowHttpFallback
            && url.startsWith('https://')
            && typeof location !== 'undefined'
            && location.protocol !== 'https:'
            && location.protocol !== 'file:';
        if (!canFallback) throw err;
        const httpUrl = `http://${url.slice('https://'.length)}`;
        console.warn('[网络] HTTPS 请求失败，尝试 HTTP:', httpUrl, err);
        return await fetch(httpUrl, options);
    }
}

async function generateImage({ prompt, aspectRatio = '1:1', resolution = '1024x1024', referenceImages = [], model = null, skipBilling = false }) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    
    // 使用配置模型或传入的覆盖模型
    let imageModel = model || modelConfig.imageGen || 'nano-banana-pro';
    if (imageModel && typeof imageModel === 'object') {
        const candidates = [
            imageModel.model,
            imageModel.id,
            imageModel.value,
            imageModel.name,
            imageModel.label
        ];
        imageModel = candidates.find(v => typeof v === 'string' && v.trim()) || String(imageModel);
    }
    
    // 根据清晰度自动选择 nano-banana-pro 系列模型
    // nano-banana-pro 在平台上实际对应 nano-banana-2 系列（nano-banana-2 / nano-banana-2-2k / nano-banana-2-4k）
    const normalizedModel = (imageModel || '').toLowerCase();
    if (normalizedModel.startsWith('nano-banana-pro')) {
        if (resolution === '4096x4096' || resolution === '4K') {
            imageModel = 'nano-banana-2-4k';
        } else if (resolution === '2048x2048' || resolution === '2K') {
            imageModel = 'nano-banana-2-2k';
        } else {
            imageModel = 'nano-banana-2';
        }
    }
    
    // 根据清晰度自动选择 nano-banana-2 系列模型
    // nano-banana-2 在平台上实际对应 gemini-3.1-flash-image-preview 系列
    if (normalizedModel.startsWith('nano-banana-2')) {
        if (resolution === '4096x4096' || resolution === '4K') {
            imageModel = 'gemini-3.1-flash-image-preview-4k';
        } else if (resolution === '2048x2048' || resolution === '2K') {
            imageModel = 'gemini-3.1-flash-image-preview-2k';
        } else {
            imageModel = 'gemini-3.1-flash-image-preview';
        }
    }
    
    // MidJourney 模型自动选择：有参考图用 mj_fast_blend，无参考图用 mj_fast_imagine
    const cleanRefs = (referenceImages || []).filter(url => typeof url === 'string' && url.trim());
    if (normalizedModel === 'midjourney') {
        if (cleanRefs.length > 0) {
            imageModel = 'mj_fast_blend';  // 图生图/图融合
            console.log('[图片生成] MidJourney 自动选择: mj_fast_blend (图生图，有', cleanRefs.length, '张参考图)');
        } else {
            imageModel = 'mj_fast_imagine';  // 文生图
            console.log('[图片生成] MidJourney 自动选择: mj_fast_imagine (文生图)');
        }
    }
    
    // 根据分辨率和比例计算 image_size 参数
    // 基础尺寸：1K=1024, 2K=2048, 4K=4096
    let baseSize = 1024;
    if (resolution === '4096x4096' || resolution === '4K') {
        baseSize = 4096;
    } else if (resolution === '2048x2048' || resolution === '2K') {
        baseSize = 2048;
    } else if (resolution === '1024x1024' || resolution === '1K') {
        baseSize = 1024;
    }
    
    // 根据比例计算宽高
    let width = baseSize;
    let height = baseSize;
    
    // 解析比例 (如 "16:9" -> [16, 9])
    const ratioParts = aspectRatio.split(':').map(Number);
    if (ratioParts.length === 2 && ratioParts[0] > 0 && ratioParts[1] > 0) {
        const ratioW = ratioParts[0];
        const ratioH = ratioParts[1];
        
        if (ratioW > ratioH) {
            // 横向比例，宽度为基准
            width = baseSize;
            height = Math.round(baseSize * ratioH / ratioW);
        } else if (ratioH > ratioW) {
            // 纵向比例，高度为基准
            height = baseSize;
            width = Math.round(baseSize * ratioW / ratioH);
        }
        // 1:1 时保持 width = height = baseSize
    }
    
    const imageSize = `${width}x${height}`;
    
    console.log('[图片生成] 比例计算:', { aspectRatio, resolution, baseSize, width, height, imageSize });
    
    // 判断是图生图还是文生图（过滤无效引用）
    const cleanReferences = (referenceImages || []).filter(url => typeof url === 'string' && url.trim());
    const hasRefImages = cleanReferences.length > 0;
    
    // 选择端点和请求方式
    const endpoint = hasRefImages
        ? `${normalizedBaseUrl}/v1/images/edits`      // 图生图/多图生图（需要 FormData）
        : `${normalizedBaseUrl}/v1/images/generations`; // 文生图（JSON）
    
    const requestModel = imageModel;
    
    console.log(`[图片生成] ⭐ 使用模型: ${requestModel}`);
    console.log('[图片生成] 请求:', { 
        endpoint, 
        model: requestModel, 
        imageSize: imageSize,
        mode: hasRefImages ? (referenceImages.length > 1 ? '多图生图' : '图生图') : '文生图',
        refImageCount: cleanReferences.length,
        prompt: prompt.substring(0, 50) + '...'
    });
    
    let response;

    const postJsonImageWithContents = async (targetEndpoint, refs = []) => {
        const normalizedRefs = (refs || [])
            .filter(url => typeof url === 'string' && url.trim())
            .slice(0, 4);
        const contents = [
            { type: 'input_text', text: prompt }
        ];
        normalizedRefs.forEach((url) => {
            contents.push({ type: 'input_image', image_url: url });
        });
        const messageContent = [
            { type: 'text', text: prompt }
        ];
        normalizedRefs.forEach((url) => {
            messageContent.push({ type: 'image_url', image_url: { url } });
        });
        const body = {
            model: requestModel,
            prompt: prompt,
            messages: [{ role: 'user', content: messageContent }],
            contents: contents,
            input: [{ role: 'user', content: messageContent }],
            image_size: imageSize,
            aspect_ratio: aspectRatio,
            response_format: 'url'
        };
        console.log('[图片生成] 使用 messages/contents 回退协议:', {
            endpoint: targetEndpoint,
            model: requestModel,
            contentsCount: contents.length,
            messagesCount: messageContent.length
        });
        return await fetchWithProtocolFallback(targetEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
    };
    
    // ========== MidJourney 专用处理 ==========
    // MidJourney使用异步任务模式，端点和格式都不同
    if (imageModel === 'mj_fast_imagine' || imageModel === 'mj_fast_blend') {
        console.log('[MidJourney] 使用MJ专用API');
        
        if (imageModel === 'mj_fast_blend' && cleanReferences.length > 0) {
            // 图片混合：/mj/submit/blend
            const mjEndpoint = `${normalizedBaseUrl}/mj/submit/blend`;
            console.log('[MidJourney] 调用Blend端点:', mjEndpoint);
            
            // 将参考图转为base64数组
            const base64Array = [];
            for (const imgUrl of cleanReferences) {
                if (imgUrl.startsWith('data:')) {
                    base64Array.push(imgUrl);
                } else {
                    // 外部URL需要先转换为base64
                    try {
                        const res = await fetch(imgUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        const base64 = await new Promise((resolve) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        base64Array.push(base64);
                    } catch (e) {
                        console.warn('[MidJourney] 转换图片失败:', e);
                        base64Array.push(imgUrl);
                    }
                }
            }
            
            // 根据比例确定dimensions
            let dimensions = 'SQUARE';
            if (aspectRatio.includes('16:9') || aspectRatio.includes('21:9')) {
                dimensions = 'LANDSCAPE';
            } else if (aspectRatio.includes('9:16') || aspectRatio.includes('3:4')) {
                dimensions = 'PORTRAIT';
            }
            
            const mjBody = {
                base64Array: base64Array,
                dimensions: dimensions
            };
            
            console.log('[MidJourney] Blend请求:', { dimensions, imageCount: base64Array.length });
            
            response = await fetchWithProtocolFallback(mjEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(mjBody)
            });
        } else {
            // 文生图：/mj/submit/imagine
            const mjEndpoint = `${normalizedBaseUrl}/mj/submit/imagine`;
            console.log('[MidJourney] 调用Imagine端点:', mjEndpoint);
            
            // 添加比例参数到prompt
            let mjPrompt = prompt;
            if (aspectRatio && aspectRatio !== '1:1') {
                mjPrompt += ` --ar ${aspectRatio}`;
            }
            
            const mjBody = {
                prompt: mjPrompt
            };
            
            console.log('[MidJourney] Imagine请求:', { prompt: mjPrompt.substring(0, 50) + '...' });
            
            response = await fetchWithProtocolFallback(mjEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(mjBody)
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[MidJourney] 错误响应:', response.status, errorText);
            
            throw new Error(`MidJourney请求失败: ${response.status} - ${errorText}`);
        }
        
        const mjData = await safeParseJsonResponse(response, 'MidJourney接口');
        console.log('[MidJourney] 响应:', mjData);
        
        // MidJourney返回 code=1 表示成功，result是任务ID
        if (mjData.code === 1 && mjData.result) {
            console.log('[MidJourney] 任务提交成功，任务ID:', mjData.result);
            return { type: 'async', taskId: mjData.result, isMidJourney: true };
        } else {
            throw new Error(`MidJourney任务提交失败: ${mjData.description || JSON.stringify(mjData)}`);
        }
    }
    // ========== 普通模型处理 ==========
    
    if (hasRefImages) {
        // 图生图/多图生图：使用 FormData 格式
        const formData = new FormData();
        formData.append('model', requestModel);
        formData.append('prompt', prompt);
        formData.append('image_size', imageSize);
        formData.append('aspect_ratio', aspectRatio);
        formData.append('response_format', 'url');
        
        // 添加参考图片 - 统一转成 JPG 格式发送，彻底避免透明背景导致的偏色问题
        console.log('[图片生成] 处理参考图，数量:', cleanReferences.length);
        for (let i = 0; i < cleanReferences.length; i++) {
            let imgUrl = cleanReferences[i];
            const originalFormat = imgUrl.startsWith('data:image/png') ? 'PNG' : 
                                   imgUrl.startsWith('data:image/jpeg') ? 'JPEG' : 
                                   imgUrl.startsWith('data:') ? 'base64其他' : 
                                   imgUrl.startsWith('http') ? '外部URL' : '未知';
            console.log(`[图片生成] 参考图${i+1} 原始格式:`, originalFormat, '长度:', imgUrl.length);
            try {
                // 统一转成 JPG 格式（填充白色背景，避免任何透明问题）
                console.log(`[图片生成] 参考图${i+1} 开始转换为JPG...`);
                const jpgBlob = await convertToJPG(imgUrl);
                console.log(`[图片生成] 参考图${i+1} ✓ 转换成功! 类型:`, jpgBlob.type, '大小:', Math.round(jpgBlob.size/1024), 'KB');
                formData.append('image', jpgBlob, `reference_${i}.jpg`);
            } catch (e) {
                console.error('[图片生成] 参考图${i+1} ✗ 转换失败:', e.message);
                // 尝试直接发送URL
                formData.append('image', imgUrl);
            }
        }
        
        console.log('[图片生成] 使用 FormData 格式，参考图数量:', referenceImages.length);
        
        response = await fetchWithProtocolFallback(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
                // 注意：使用 FormData 时不要设置 Content-Type，让浏览器自动设置
            },
            body: formData
        });
    } else {
        // 文生图：使用 JSON 格式
        const requestBody = {
            model: requestModel,
            prompt: prompt,
            image_size: imageSize,
            aspect_ratio: aspectRatio,
            response_format: 'url'
        };
        
        response = await fetchWithProtocolFallback(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('[图片生成] 错误响应:', response.status, errorText);

        // 某些中转站图生图接口要求 contents/messages JSON 协议，不支持 FormData image 字段
        if (hasRefImages && /(contents|messages)\s+is\s+required/i.test(String(errorText || ''))) {
            console.warn('[图片生成] 检测到 contents/messages 协议要求，尝试 JSON 回退');
            const fallbackEndpoints = [endpoint, `${normalizedBaseUrl}/v1/images/generations`];
            for (const fallbackEndpoint of fallbackEndpoints) {
                try {
                    const retryResp = await postJsonImageWithContents(fallbackEndpoint, cleanReferences);
                    if (!retryResp.ok) {
                        const retryText = await retryResp.text();
                        console.warn('[图片生成] contents 回退失败:', retryResp.status, retryText);
                        continue;
                    }
                    response = retryResp;
                    console.log('[图片生成] contents 回退成功:', fallbackEndpoint);
                    break;
                } catch (retryErr) {
                    console.warn('[图片生成] contents 回退异常:', retryErr);
                }
            }
            if (response.ok) {
                // 回退成功后继续走统一响应解析
            } else {
                // 回退失败则继续使用原始错误信息
            }
        }

        if (!response.ok) {
        
        // 尝试解析错误信息
        let errorMsg = `图片生成失败: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
                errorMsg = errorJson.error.message;
            } else if (errorJson.message) {
                errorMsg = errorJson.message;
            }
        } catch (e) {
            if (errorText && errorText.length < 200) {
                errorMsg += ` - ${errorText}`;
            }
        }
        
        throw new Error(errorMsg);
        }
    }
    
    const data = await safeParseJsonResponse(response, '图片生成接口');
    console.log('[图片生成] 响应:', data);
    
    // 兼容多种响应格式
    if (data.data?.[0]?.url) {
        console.log('[图片生成] API返回格式: 外部URL');
        return { type: 'immediate', url: data.data[0].url };
    }
    if (data.data?.[0]?.b64_json) {
        // 检测实际图片格式（JPEG 以 /9j/ 开头，PNG 以 iVBOR 开头）
        const b64 = data.data[0].b64_json;
        const isJPEG = b64.startsWith('/9j/') || b64.startsWith('/9J/');
        const mime = isJPEG ? 'image/jpeg' : 'image/png';
        console.log('[图片生成] API返回格式: base64', isJPEG ? 'JPEG' : 'PNG', '(检测依据: 开头字符', b64.substring(0, 4), ')');
        return { type: 'immediate', url: `data:${mime};base64,${b64}` };
    }
    if (data.url) {
        console.log('[图片生成] API返回格式: 外部URL (data.url)');
        return { type: 'immediate', url: data.url };
    }
    if (data.output?.url) {
        console.log('[图片生成] API返回格式: 外部URL (data.output.url)');
        return { type: 'immediate', url: data.output.url };
    }
    
    // 异步任务
    const taskId = data.id || data.task_id || data.request_id;
    if (taskId) return { type: 'async', taskId };
    
    console.error('[图片生成] 无法解析响应:', data);
    throw new Error('无法解析图片生成响应，请检查API配置');
}

// 辅助函数：将 data URL 转换为 Blob
function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// 处理参考图片：JPEG 直接使用，PNG 填充白色背景后转 JPG
async function convertToJPG(imgUrl, quality = 0.92) {
    const inputType = imgUrl.startsWith('data:image/png') ? 'PNG base64' : 
                      imgUrl.startsWith('data:image/jpeg') ? 'JPEG base64' : 
                      imgUrl.startsWith('data:') ? '其他 base64' : '外部URL';
    console.log('[处理参考图] 输入类型:', inputType);
    
    // ========== 外部 URL ==========
    if (!imgUrl.startsWith('data:')) {
        console.log('[处理参考图] 下载外部图片...');
        const response = await fetch(imgUrl);
        const originalBlob = await response.blob();
        const mimeType = originalBlob.type || 'image/jpeg';
        console.log('[处理参考图] MIME:', mimeType, '大小:', Math.round(originalBlob.size/1024), 'KB');
        
        // JPEG 直接返回，不做任何处理
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
            console.log('[处理参考图] ✓ JPEG直接使用，不经过canvas');
            return originalBlob;
        }
        
        // PNG 转成 base64 后处理
        const base64 = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.readAsDataURL(originalBlob);
        });
        imgUrl = base64;
    }
    
    // ========== Base64 JPEG：直接转 Blob，不经过 canvas ==========
    if (imgUrl.startsWith('data:image/jpeg')) {
        console.log('[处理参考图] ✓ JPEG base64直接转Blob，不经过canvas');
        return await dataURLtoBlob(imgUrl);
    }
    
    // ========== Base64 PNG：需要 canvas 处理（填充白色背景）==========
    console.log('[处理参考图] PNG需要canvas处理（填充白色背景）...');
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                // 指定 sRGB 色彩空间，避免不同设备/浏览器的色彩偏移
                const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');

                // 填充白色背景（关键！避免透明区域变黑/紫）
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // 绘制图片
                ctx.drawImage(img, 0, 0);
                
                // 转换为 JPG blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        console.log('[处理参考图] ✓ PNG转JPG成功，尺寸:', img.width, 'x', img.height, '大小:', Math.round(blob.size/1024), 'KB');
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob 失败'));
                    }
                }, 'image/jpeg', quality);
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = imgUrl;
    });
}

// 预处理参考图：只对带透明背景的PNG填充白色背景（已废弃，现在统一用 convertToJPG）
async function preprocessReferenceImage(imgUrl) {
    if (!imgUrl || typeof imgUrl !== 'string') return imgUrl;
    
    // 外部URL无法预处理，直接返回
    if (!imgUrl.startsWith('data:')) {
        console.log('[预处理参考图] 跳过: 外部URL，无法预处理');
        return imgUrl;
    }
    
    // 只处理PNG格式（可能有透明背景）
    const isPNG = imgUrl.startsWith('data:image/png');
    if (!isPNG) {
        console.log('[预处理参考图] 跳过: 非PNG格式，不需要处理');
        return imgUrl; // JPEG等不需要处理
    }
    
    console.log('[预处理参考图] 检测到PNG格式，检查是否有透明像素...');
    
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');

            // 检测是否有透明像素
            ctx.drawImage(img, 0, 0);
            let hasTransparency = false;
            try {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                // 抽样检测透明像素（每隔100个像素检查一次，提高性能）
                for (let i = 3; i < data.length; i += 400) {
                    if (data[i] < 250) { // alpha < 250 视为有透明
                        hasTransparency = true;
                        break;
                    }
                }
            } catch (e) {
                // 跨域图片无法获取像素数据，假设没有透明
                hasTransparency = false;
            }
            
            if (!hasTransparency) {
                // 没有透明像素，直接返回原图，避免不必要的转换
                console.log('[预处理参考图] 未检测到透明像素，跳过处理');
                resolve(imgUrl);
                return;
            }
            
            // 有透明像素，填充白色背景后输出为PNG（保持质量）
            console.log('[预处理参考图] ⚠️ 检测到透明像素，填充白色背景');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            try {
                // 使用PNG格式保持质量，只是填充了白色背景
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                resolve(imgUrl);
            }
        };
        img.onerror = () => resolve(imgUrl);
        img.src = imgUrl;
    });
}

async function pollImageTask(taskId, onProgress) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    
    const maxAttempts = 120;
    
    for (let i = 0; i < maxAttempts; i++) {
        if (i > 0) {
            await new Promise(r => setTimeout(r, i < 5 ? 1000 : i < 15 ? 1500 : 2000));
        }
        
        try {
            const response = await fetchWithProtocolFallback(`${normalizedBaseUrl}/v1/images/generations/${taskId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            
            if (!response.ok) continue;
            
            const data = await response.json();
            const status = data.status || data.data?.status;
            
            if (onProgress) {
                const progress = data.progress || Math.min(90, ((i + 1) / maxAttempts) * 100);
                onProgress(progress);
            }
            
            if (status === 'completed' || status === 'succeeded' || status === 'success') {
                const url = data.data?.[0]?.url || data.url || data.data?.url;
                if (url) return { success: true, url };
            }
            
            if (status === 'failed' || status === 'error') {
                throw new Error(data.error?.message || '生成失败');
            }
        } catch (error) {
            if (error.message.includes('failed') || error.message.includes('失败')) {
                throw error;
            }
        }
    }
    
    throw new Error('生成超时（超过6分钟）');
}

// ==================== MidJourney 任务轮询 ====================
async function pollMidJourneyTask(taskId, onProgress) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    
    const maxAttempts = 180; // MJ可能需要更长时间
    
    console.log('[MidJourney] 开始轮询任务:', taskId);
    
    for (let i = 0; i < maxAttempts; i++) {
        if (i > 0) {
            // MJ生成较慢，间隔稍长
            await new Promise(r => setTimeout(r, i < 10 ? 2000 : 3000));
        }
        
        try {
            const response = await fetchWithProtocolFallback(`${normalizedBaseUrl}/mj/task/${taskId}/fetch`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            
            if (!response.ok) {
                console.log('[MidJourney] 查询响应异常:', response.status);
                continue;
            }
            
            const data = await response.json();
            console.log('[MidJourney] 任务状态:', data.status, '进度:', data.progress);
            
            if (onProgress && data.progress) {
                // 解析进度，如 "50%" -> 50
                const progressNum = parseInt(data.progress) || Math.min(90, ((i + 1) / maxAttempts) * 100);
                onProgress(progressNum);
            }
            
            // 成功状态
            if (data.status === 'SUCCESS') {
                const imageUrl = data.imageUrl;
                if (imageUrl) {
                    console.log('[MidJourney] ✅ 生成成功:', imageUrl);
                    return { success: true, url: imageUrl };
                }
            }
            
            // 失败状态
            if (data.status === 'FAILURE' || data.status === 'CANCEL') {
                const reason = data.failReason || '生成失败';
                console.error('[MidJourney] ❌ 任务失败:', reason);
                throw new Error(`MidJourney生成失败: ${reason}`);
            }
            
            // 其他状态继续等待: NOT_START, SUBMITTED, MODAL, IN_PROGRESS
        } catch (error) {
            if (error.message.includes('失败') || error.message.includes('failed')) {
                throw error;
            }
            console.warn('[MidJourney] 轮询出错，继续重试:', error.message);
        }
    }
    
    throw new Error('MidJourney生成超时（超过9分钟）');
}

// ==================== 视频生成 API ====================
function extractVideoTaskId(data) {
    return data?.data?.task_id ||
        data?.task_id ||
        data?.data?.data?.task_id ||
        data?.id ||
        data?.data?.id ||
        data?.request_id ||
        data?.data?.request_id ||
        data?.data?.[0]?.id ||
        data?.data?.[0]?.task_id;
}

function extractVideoStatus(data) {
    // Veo 3.1: operation.done == true 表示完成
    if (data?.done === true) return 'completed';
    if (data?.done === false) return 'in_progress';
    
    return data?.status ||
        data?.state ||
        data?.task_status ||
        data?.data?.status ||
        data?.data?.state ||
        data?.data?.task_status ||
        data?.data?.data?.task_status ||
        data?.data?.data?.status ||
        data?.data?.data?.state ||
        data?.data?.[0]?.status ||
        data?.data?.[0]?.state;
}

function extractVideoUrl(data) {
    return data?.data?.[0]?.url ||
        data?.data?.video_url ||
        data?.url ||
        data?.data?.url ||
        data?.video_url ||
        data?.result?.video_url ||
        data?.data?.result?.video_url ||
        data?.task_result?.videos?.[0]?.url ||
        data?.data?.task_result?.videos?.[0]?.url ||
        data?.data?.data?.task_result?.videos?.[0]?.url ||
        data?.data?.output ||
        data?.output ||
        data?.output?.url ||
        data?.output?.[0]?.url ||
        data?.result?.url ||
        data?.result?.[0]?.url ||
        // Veo 3.1 响应格式 (Gemini API)
        data?.response?.generated_videos?.[0]?.video?.uri ||
        data?.response?.generated_videos?.[0]?.video?.url ||
        data?.generated_videos?.[0]?.video?.uri ||
        data?.generated_videos?.[0]?.video?.url ||
        // Sora 2 响应格式
        data?.video?.url ||
        data?.content_url;
}

function isKlingVideoModel(model) {
    return model && model.startsWith('kling');
}

function normalizeKlingModelName(model) {
    const raw = String(model || '').trim().toLowerCase();
    if (!raw) return 'kling-video-v3';
    const map = {
        'kling-video-v3': 'kling-video-v3',
        'kling-v3': 'kling-video-v3',
        'kling3.0': 'kling-video-v3',
        'kling-video-v3-pro': 'kling-video-v3-pro',
        'kling-v3-pro': 'kling-video-v3-pro',
        'kling3.0-pro': 'kling-video-v3-pro',
        'kling-video-o1': 'kling-video-o1',
        'kling-o1': 'kling-video-o1',
        'kling_video_o1': 'kling-video-o1',
        'kling-video-v2-5-turbo': 'kling-video-v2-5-turbo',
        'kling-v2-5-turbo': 'kling-video-v2-5-turbo',
        'kling2.5-turbo': 'kling-video-v2-5-turbo',
        'kling-video-v2-6': 'kling-video-v2-6',
        'kling-v2-6': 'kling-video-v2-6',
        'kling2.6': 'kling-video-v2-6'
    };
    return map[raw] || raw;
}

function getKlingModelCandidates(model) {
    const normalized = normalizeKlingModelName(model);
    const candidateMap = {
        'kling-video-v3': ['kling-video-v3', 'kling-v3', 'kling3.0'],
        'kling-video-v3-pro': ['kling-video-v3-pro', 'kling-v3-pro', 'kling3.0-pro'],
        'kling-video-o1': ['kling-video-o1', 'kling-o1'],
        'kling-video-v2-5-turbo': ['kling-video-v2-5-turbo', 'kling-v2-5-turbo', 'kling2.5-turbo'],
        'kling-video-v2-6': ['kling-video-v2-6', 'kling-v2-6', 'kling2.6']
    };
    const defaults = ['kling-video-v3', 'kling-v3', 'kling3.0'];
    const list = candidateMap[normalized] || [normalized];
    return [...new Set([...list, ...defaults])];
}

function normalizeKlingDuration(duration, model) {
    const value = Number(duration);
    // Kling 3.0 支持 5, 10, 15 秒
    const m = String(model || '').toLowerCase();
    if (m.includes('v3') || m.includes('3.0')) {
        if (value === 15) return 15;
        if (value === 10) return 10;
        return 5;
    }
    return value === 10 ? 10 : 5;
}

function normalizeKlingAspectRatio(ratio, model) {
    const raw = String(ratio || '').trim();
    // Kling 3.0 支持更多比例
    const m = String(model || '').toLowerCase();
    if (m.includes('v3') || m.includes('3.0')) {
        const allowedV3 = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9']);
        if (allowedV3.has(raw)) return raw;
    }
    const allowed = new Set(['16:9', '9:16', '1:1']);
    if (allowed.has(raw)) return raw;
    const parts = raw.split(':').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        if (parts[0] === parts[1]) return '1:1';
        return parts[0] > parts[1] ? '16:9' : '9:16';
    }
    return '16:9';
}

function klingAspectToWidthHeight(ratio) {
    const sizeMap = {
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '1:1':  { width: 1080, height: 1080 },
        '4:3':  { width: 1440, height: 1080 },
        '3:4':  { width: 1080, height: 1440 },
        '3:2':  { width: 1620, height: 1080 },
        '2:3':  { width: 1080, height: 1620 },
        '21:9': { width: 1920, height: 822 }
    };
    return sizeMap[ratio] || sizeMap['16:9'];
}

function isSoraVideoModel(model) {
    return model && String(model).toLowerCase().includes('sora');
}

function isVeoVideoModel(model) {
    return model && String(model).toLowerCase().startsWith('veo');
}

// Sora 2 比例转 size 参数 (如 "1280x720")，用于官方格式接口回退
function soraAspectToSize(ratio, model) {
    const isPro = model && String(model).toLowerCase().includes('pro');
    if (isPro) {
        const sizeMap = {
            '16:9': '1792x1024',
            '9:16': '1024x1792',
            '1:1': '1280x720'
        };
        return sizeMap[ratio] || '1792x1024';
    }
    const sizeMap = {
        '16:9': '1280x720',
        '9:16': '720x1280',
        '1:1': '1280x720'
    };
    return sizeMap[ratio] || '1280x720';
}

function normalizeKlingImageInput(image) {
    if (!image || typeof image !== 'string') return image;
    // 保留 data URL 前缀，部分网关只接受 data:image/...;base64,xxx 形式
    if (image.startsWith('data:image/')) return image;
    return image;
}

function stripDataImagePrefix(image) {
    if (!image || typeof image !== 'string') return image;
    if (!image.startsWith('data:image/')) return image;
    const base64Index = image.indexOf('base64,');
    return base64Index !== -1 ? image.slice(base64Index + 'base64,'.length) : image;
}

function getImageType(value) {
    if (!value || typeof value !== 'string') return 'unknown';
    if (value.startsWith('http://') || value.startsWith('https://')) return 'url';
    if (value.startsWith('data:image/')) return 'base64';
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 120) return 'base64';
    return 'unknown';
}

function extractRequestId(raw) {
    const text = String(raw || '');
    const m = text.match(/request id[:：]\s*([A-Za-z0-9_-]+)/i);
    return m ? m[1] : null;
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Blob 转 DataURL 失败'));
        reader.readAsDataURL(blob);
    });
}

async function safeParseJsonResponse(response, contextLabel) {
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    if (!rawText) return {};
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
        const finalUrl = response.url ? ` (响应URL: ${response.url})` : '';
        throw new Error(`${contextLabel}返回了HTML页面，请检查 Base URL 是否填写为 API 地址${finalUrl}`);
    }
    try {
        return JSON.parse(rawText);
    } catch (err) {
        const brief = rawText.slice(0, 120).replace(/\s+/g, ' ');
        const typeHint = contentType ? ` (${contentType})` : '';
        const finalUrl = response.url ? ` (响应URL: ${response.url})` : '';
        throw new Error(`${contextLabel}返回内容不是JSON${typeHint}${finalUrl}: ${brief}`);
    }
}

async function resolveKlingImageInput(image) {
    if (!image || typeof image !== 'string') return image;
    if (image.startsWith('data:image/')) {
        // 统一转 JPEG 并提高质量
        if (image.startsWith('data:image/webp') || image.startsWith('data:image/png')) {
            try {
                const jpgBlob = await convertToJPG(image, 0.95);
                return await blobToDataURL(jpgBlob);
            } catch (e) {
                console.warn('[Kling] webp/png 转 JPEG 失败，回退原图:', e);
            }
        }
        // 保留完整 data URL 格式，兼容中转
        return image;
    }
    if (image.startsWith('http://') || image.startsWith('https://')) {
        return image;
    }
    if (image.startsWith('blob:')) {
        try {
            const resp = await fetch(image);
            if (!resp.ok) throw new Error('图片读取失败');
            const blob = await resp.blob();
            const jpgBlob = await convertToJPG(await blobToDataURL(blob), 0.95);
            return await blobToDataURL(jpgBlob);
        } catch (err) {
            throw new Error('参考图无法读取，请使用本地图片或允许跨域访问');
        }
    }
    return image;
}

async function generateVideo({ prompt, aspectRatio = '16:9', duration = 8, referenceImages = [], model = 'kling-video-v3', skipBilling = false }) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/v2\/?$/, '').replace(/\/+$/, '');
    const isKling = isKlingVideoModel(model);
    const isVeo = String(model || '').toLowerCase().startsWith('veo');
    const isSora = String(model || '').toLowerCase().includes('sora');
    const taskMode = referenceImages && referenceImages.length > 0 ? 'image2video' : 'text2video';
    let endpoint = `${normalizedBaseUrl}/v2/videos/generations`;
    let requestBody = {};
    let response = null;
    
    console.log('[视频生成] 开始生成, 模型:', model, '模式:', taskMode);
    
    if (isKling) {
        endpoint = `${normalizedBaseUrl}/kling/v1/videos/${taskMode}`;
        const klingDuration = normalizeKlingDuration(duration, model);
        const klingAspectRatio = normalizeKlingAspectRatio(aspectRatio, model);
        // 精简请求体：只保留 Kling API 需要的字段，不发 model_name（让中转自动映射）
        requestBody = {
            model: normalizeKlingModelName(model),
            prompt: prompt,
            duration: klingDuration,
            aspect_ratio: klingAspectRatio,
            mode: 'pro'
        };
        // Kling 3.0 支持原生音频生成
        const klingModelLower = String(model || '').toLowerCase();
        if (klingModelLower.includes('v3') || klingModelLower.includes('3.0')) {
            requestBody.generate_audio = true;
        }
        if (klingAspectRatio !== aspectRatio) {
            console.warn('[视频生成][Kling] 比例不受支持，已自动调整:', aspectRatio, '->', klingAspectRatio);
        }
        if (referenceImages && referenceImages.length > 0) {
            const resolvedImage = await resolveKlingImageInput(referenceImages[0]);
            // 可灵渠道要求纯 base64（不带 data:image/...;base64, 前缀）
            // 如果是 DataURL 格式，剥离前缀；如果是 URL 则直接使用
            if (typeof resolvedImage === 'string' && resolvedImage.startsWith('data:image/')) {
                requestBody.image = stripDataImagePrefix(resolvedImage);
            } else {
                requestBody.image = resolvedImage;
            }
            const imgType = typeof requestBody.image === 'string'
                ? (requestBody.image.startsWith('http') ? 'URL' : 'Base64')
                : 'unknown';
            const imgLen = typeof requestBody.image === 'string' ? requestBody.image.length : 0;
            console.log('[视频生成] Kling图生视频模式，参考图数量:', referenceImages.length, '图片格式:', imgType, '长度:', imgLen);
            requestBody.image_fidelity = 0.95;
        }
        console.log('[视频生成][Kling] 请求:', { endpoint, model: requestBody.model, duration: requestBody.duration, aspect_ratio: requestBody.aspect_ratio, hasImage: !!requestBody.image });
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
            if (response.ok) {
                console.log('[视频生成][Kling] ✓ 成功!');
            } else {
                const errText = await response.clone().text();
                console.warn('[视频生成][Kling] 失败:', response.status, errText.substring(0, 300));
            }
        } catch (fetchErr) {
            console.warn('[视频生成][Kling] 请求异常:', fetchErr.message);
        }
    } else if (isSora) {
        // ========== Sora 2 专用处理 ==========
        // Sora 2 使用统一格式接口: POST /v2/videos/generations
        endpoint = `${normalizedBaseUrl}/v2/videos/generations`;
        
        // 统一格式使用 aspect_ratio 和 duration
        const soraDuration = String(duration);
        const isPro = String(model).toLowerCase().includes('pro');
        
        requestBody = {
            model: model,
            prompt: prompt,
            aspect_ratio: aspectRatio === 'auto' ? '16:9' : aspectRatio,
            duration: soraDuration
        };
        
        // HD 高清仅 sora-2-pro 支持
        if (isPro) {
            requestBody.hd = false;
        }

        // Sora 图生视频使用 images 数组
        if (referenceImages && referenceImages.length > 0) {
            const resolvedImages = [];
            for (const ref of referenceImages) {
                const resolvedImage = await resolveKlingImageInput(ref);
                resolvedImages.push(resolvedImage);
            }
            requestBody.images = resolvedImages;
            console.log('[视频生成][Sora] 图生视频模式，参考图数量:', resolvedImages.length);
        }

        console.log('[视频生成][Sora] 请求:', { endpoint, model: requestBody.model, aspect_ratio: requestBody.aspect_ratio, duration: requestBody.duration, hasImages: !!requestBody.images });
    } else if (isVeo) {
        // ========== Veo 专用处理 ==========
        // Veo 使用 /v2/videos/generations 端点
        endpoint = `${normalizedBaseUrl}/v2/videos/generations`;

        // Veo 只支持 16:9 和 9:16，不传则根据参考图自动匹配
        const allowedVeoRatios = new Set(['16:9', '9:16']);
        const veoAspectRatio = allowedVeoRatios.has(aspectRatio) ? aspectRatio : '16:9';
        if (!allowedVeoRatios.has(aspectRatio)) {
            console.warn('[视频生成][Veo] 比例不受支持，已自动调整:', aspectRatio, '->', veoAspectRatio);
        }

        requestBody = {
            model: model,
            prompt: prompt,
            aspect_ratio: veoAspectRatio
        };

        // Veo 参考图处理 - 使用 images 数组，支持 url 或 base64
        if (referenceImages && referenceImages.length > 0) {
            const images = [];
            for (const ref of referenceImages) {
                // Veo API 支持直接传 URL，优先使用 HTTP URL 避免大体积 base64
                if (ref && (ref.startsWith('http://') || ref.startsWith('https://'))) {
                    images.push(ref);
                } else {
                    const resolved = await resolveKlingImageInput(ref);
                    images.push(resolved);
                }
            }
            requestBody.images = images;
            console.log('[视频生成][Veo] 图生视频模式，参考图数量:', images.length, '类型:', images.map(i => i?.startsWith('http') ? 'url' : 'base64'));
        }

        console.log('[视频生成][Veo] 请求:', { endpoint, model: requestBody.model, aspect_ratio: requestBody.aspect_ratio, imageCount: requestBody.images?.length || 0 });
    } else {
        // ========== 其他视频模型的默认处理 ==========
        requestBody = {
            model: model,
            prompt: prompt,
            aspect_ratio: aspectRatio
        };

        if (referenceImages && referenceImages.length > 0) {
            // 转换 blob URL 为 base64
            const resolvedImage = await resolveKlingImageInput(referenceImages[0]);
            requestBody.image = resolvedImage;
            if (referenceImages.length > 1) {
                const resolvedEndImage = await resolveKlingImageInput(referenceImages[1]);
                requestBody.end_image = resolvedEndImage;
            }
            console.log('[视频生成] 图生视频模式，参考图数量:', referenceImages.length, '首帧:', !!requestBody.image, '尾帧:', !!requestBody.end_image);
        }
    }
    
    console.log('[视频生成] 请求参数:', { endpoint, model, aspectRatio: requestBody.aspect_ratio || requestBody.size, hasImages: !!requestBody.images || !!requestBody.image || !!requestBody.input_reference });
    console.log('[视频生成] 完整请求体:', JSON.stringify(requestBody).substring(0, 500) + '...');
    
    // 构建备用端点列表 (Sora/Veo 首选端点失败时自动回退)
    const fallbackEndpoints = [];
    if (isSora) {
        // 统一格式失败时回退到官方格式
        fallbackEndpoints.push(`${normalizedBaseUrl}/v1/videos`);
    } else if (isVeo) {
        // Veo 已直接使用 v2 端点，回退到 v1
        fallbackEndpoints.push(`${normalizedBaseUrl}/v1/videos/generations`);
    }
    
    if (!response) {
        const submitController = new AbortController();
        const submitTimeout = setTimeout(() => submitController.abort(), 60000);
        const submitHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        // Sora 好易智算接口需要 ModelName header
        if (isSora) {
            submitHeaders['ModelName'] = model;
        }
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: submitHeaders,
                body: JSON.stringify(requestBody),
                signal: submitController.signal
            });
        } catch (fetchErr) {
            clearTimeout(submitTimeout);
            if (fetchErr.name === 'AbortError') {
                throw new Error('视频生成请求超时（60秒），请检查网络或稍后重试');
            }
            throw fetchErr;
        }
        clearTimeout(submitTimeout);
        
        // 如果首选端点失败且有备用端点，尝试回退
        if (!response.ok && fallbackEndpoints.length > 0) {
            const firstStatus = response.status;
            const firstErrorText = await response.clone().text();
            console.warn(`[视频生成] 首选端点 ${endpoint} 失败 (${firstStatus})，尝试备用端点...`);
            console.warn('[视频生成] 首选端点错误:', firstErrorText.substring(0, 200));
            
            // Sora 回退时也需要调整参数格式
            let fallbackBody = requestBody;
            if (isSora) {
                // 回退到官方格式接口 /v1/videos
                const soraSize = soraAspectToSize(aspectRatio, model);
                fallbackBody = {
                    model: model,
                    prompt: prompt,
                    size: soraSize,
                    seconds: String(duration)
                };
                if (referenceImages && referenceImages.length > 0) {
                    fallbackBody.input_reference = requestBody.images ? requestBody.images[0] : referenceImages[0];
                }
            }
            
            for (const fbEndpoint of fallbackEndpoints) {
                try {
                    console.log('[视频生成] 尝试备用端点:', fbEndpoint);
                    const fbHeaders = {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    };
                    if (isSora) {
                        fbHeaders['ModelName'] = model;
                    }
                    const fbResponse = await fetch(fbEndpoint, {
                        method: 'POST',
                        headers: fbHeaders,
                        body: JSON.stringify(fallbackBody)
                    });
                    if (fbResponse.ok) {
                        response = fbResponse;
                        endpoint = fbEndpoint;
                        console.log('[视频生成] ✓ 备用端点成功:', fbEndpoint);
                        break;
                    } else {
                        // 记录最后失败的响应
                        response = fbResponse;
                        console.warn(`[视频生成] 备用端点 ${fbEndpoint} 也失败 (${fbResponse.status})`);
                    }
                } catch (fbErr) {
                    console.warn(`[视频生成] 备用端点 ${fbEndpoint} 异常:`, fbErr.message);
                }
            }
        }
    }
    
    if (!response.ok) {
        let errorText = '';
        try { errorText = await response.text(); } catch(e) { errorText = '无法读取错误详情'; }
        console.error('[视频生成] 错误响应:', response.status, errorText);
        
        let errorMsg = '';
        
        // 特殊错误码处理
        if (response.status === 500) {
            errorMsg = '服务端错误，请检查API配置或联系服务商';
        } else if (response.status === 400) {
            errorMsg = '请求参数错误，请检查模型名称和参数是否正确';
        } else if (response.status === 401 || response.status === 403) {
            errorMsg = 'API Key无效或无权限';
        } else if (response.status === 503 || response.status === 502) {
            errorMsg = '服务暂时不可用，请稍后重试';
        } else if (response.status === 429) {
            errorMsg = '请求过于频繁，请稍后再试';
        } else if (response.status === 404) {
            errorMsg = 'API端点不存在，请检查API地址配置';
        } else {
            errorMsg = `视频生成失败 (${response.status})`;
        }
        
        try {
            const errorJson = JSON.parse(errorText);
            const serverMsg = errorJson.error?.message || errorJson.message || errorJson.code;
            if (serverMsg) {
                errorMsg += `: ${serverMsg}`;
            }
        } catch (e) {
            // 忽略JSON解析错误
        }
        
        throw new Error(errorMsg);
    }
    
    const data = await safeParseJsonResponse(response, '视频生成接口');
    console.log('[视频生成] 响应:', data);
    
    // 兼容多种响应格式
    const immediateUrl = extractVideoUrl(data);
    if (immediateUrl) return { type: 'immediate', url: immediateUrl };
    
    // 异步任务
    const taskId = extractVideoTaskId(data);
    if (taskId) {
        const provider = isKling ? 'kling' : (isSora ? 'sora' : (isVeo ? 'veo' : 'default'));
        return { type: 'async', taskId, provider, taskMode };
    }
    
    console.error('[视频生成] 无法解析响应:', data);
    throw new Error('无法解析视频生成响应，请检查API配置');
}

async function pollVideoTask(taskId, onProgress, options = {}) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/v2\/?$/, '').replace(/\/+$/, '');
    const provider = options.provider || 'default';
    const taskMode = options.taskMode || 'text2video';
    
    // Veo/Sora 生成时间较长，给予更长超时；其他模型约6分钟
    const isVeoProvider = provider === 'veo';
    const isSoraProvider = provider === 'sora';
    const maxAttempts = (isVeoProvider || isSoraProvider) ? 200 : 180;

    for (let i = 0; i < maxAttempts; i++) {
        if (i > 0) {
            if (isVeoProvider || isSoraProvider) {
                // Veo/Sora: 前10次2秒，之后5秒，总计约16分钟
                await new Promise(r => setTimeout(r, i < 10 ? 2000 : 5000));
            } else {
                // 默认：1秒 -> 1.5秒 -> 2秒，约6分钟
                await new Promise(r => setTimeout(r, i < 10 ? 1000 : i < 30 ? 1500 : 2000));
            }
        }
        
        try {
            let endpoints;
            if (provider === 'kling') {
                endpoints = [
                    `${normalizedBaseUrl}/kling/v1/videos/tasks/${taskId}`,
                    `${normalizedBaseUrl}/kling/v1/videos/${taskMode}/${taskId}`
                ];
            } else if (provider === 'sora') {
                // Sora 2 统一格式轮询: GET /v2/videos/generations/{task_id}
                endpoints = [
                    `${normalizedBaseUrl}/v2/videos/generations/${taskId}`,
                    `${normalizedBaseUrl}/v1/videos/${taskId}`
                ];
            } else if (provider === 'veo') {
                // Veo 只用 v2 端点
                endpoints = [
                    `${normalizedBaseUrl}/v2/videos/generations/${taskId}`
                ];
            } else {
                // 默认端点 - 尝试多种格式
                endpoints = [
                    `${normalizedBaseUrl}/v1/videos/generations/${taskId}`,
                    `${normalizedBaseUrl}/v2/videos/generations/${taskId}`
                ];
            }
            
            for (const endpoint of endpoints) {
                const pollStartAt = Date.now();
                const pollHeaders = { 'Authorization': `Bearer ${apiKey}` };
                if (isSoraProvider) {
                    pollHeaders['ModelName'] = options.model || 'sora-2';
                }
                const response = await fetch(endpoint, {
                    headers: pollHeaders
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn('[视频生成] 轮询异常响应:', response.status, errorText);
                    console.warn('[VideoTrace][poll]', {
                        endpoint,
                        provider,
                        task_id: taskId,
                        http_status: response.status,
                        response_status: null,
                        response_error: errorText,
                        latency_ms: Date.now() - pollStartAt,
                        request_id: extractRequestId(errorText) || response.headers.get('x-request-id') || null
                    });
                    continue;
                }
                
                const data = await safeParseJsonResponse(response, '视频轮询接口');
                const rawStatus = extractVideoStatus(data);
                const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : rawStatus;
                console.log('[VideoTrace][poll]', {
                    endpoint,
                    provider,
                    task_id: taskId,
                    http_status: response.status,
                    response_status: status || null,
                    response_error: data?.error || null,
                    latency_ms: Date.now() - pollStartAt,
                    request_id: data?.request_id || data?.data?.request_id || null
                });
                
                if (onProgress) {
                    const rawProgress = data.progress || data?.data?.progress || data?.data?.data?.progress;
                    const parsedProgress = typeof rawProgress === 'string'
                        ? parseFloat(rawProgress.replace('%', ''))
                        : Number(rawProgress);
                    const progress = Number.isFinite(parsedProgress)
                        ? parsedProgress
                        : Math.min(95, ((i + 1) / maxAttempts) * 100);
                    onProgress(progress);
                }
                
                let url = extractVideoUrl(data);
                
                // Sora 2 特殊处理：统一格式直接返回 data.output，官方格式可能需要 /content 端点
                if (!url && provider === 'sora' && (status === 'completed' || status === 'succeeded' || status === 'success')) {
                    try {
                        // 尝试官方格式的 /content 端点
                        const contentEndpoint = `${normalizedBaseUrl}/v1/videos/${taskId}/content`;
                        const contentResp = await fetch(contentEndpoint, {
                            headers: { 'Authorization': `Bearer ${apiKey}`, 'ModelName': options.model || 'sora-2' }
                        });
                        if (contentResp.ok) {
                            const contentType = contentResp.headers.get('content-type') || '';
                            if (contentType.includes('video') || contentType.includes('octet-stream')) {
                                // 直接返回视频 blob URL
                                const blob = await contentResp.blob();
                                url = URL.createObjectURL(blob);
                                console.log('[视频生成][Sora] 通过 /content 端点获取视频成功');
                            } else {
                                const contentData = await safeParseJsonResponse(contentResp, 'Sora视频内容');
                                url = extractVideoUrl(contentData) || contentData?.url;
                            }
                        }
                    } catch (contentErr) {
                        console.warn('[视频生成][Sora] /content 端点获取失败:', contentErr.message);
                    }
                }
                
                if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'succeed') {
                    if (url) return { success: true, url };
                }
                
                // 有些接口不返回 status，但会直接给出 url
                if (url && !status) {
                    return { success: true, url };
                }
                
                if (status === 'failed' || status === 'failure' || status === 'error' || status === 'canceled' || status === 'cancelled') {
                    const errMsg = data.error?.message || data.message || data.data?.error?.message || data.data?.message || data.error || data.reason || '视频生成失败';
                    console.error('[视频轮询] 任务失败:', errMsg, JSON.stringify(data).substring(0, 500));
                    throw new Error(typeof errMsg === 'string' ? errMsg : '视频生成失败');
                }
            }
        } catch (error) {
            if (error.message.includes('failed') || error.message.includes('失败')) {
                throw error;
            }
        }
    }
    
    // 视频生成超时
    console.warn('[视频轮询] 任务超时，taskId:', taskId);
    
    const timeoutMinutes = (isVeoProvider || isSoraProvider) ? 16 : 6;
    const timeoutError = new Error(`视频生成超时（超过${timeoutMinutes}分钟），任务可能仍在处理中。请稍后在积分详情中刷新获取结果。`);
    timeoutError.isTimeout = true;
    timeoutError.taskId = taskId;
    throw timeoutError;
}

// 手动轮询任务（供刷新按钮使用）
async function manualPollTask(externalTaskId, provider, taskType) {
    const baseUrl = apiConfig.baseUrl || DEFAULT_API_URL;
    const apiKey = apiConfig.apiKey;
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/v2\/?$/, '').replace(/\/+$/, '');
    
    console.log('[手动轮询] 开始轮询:', { externalTaskId, provider, taskType });
    
    try {
        let endpoints = [];
        
        if (provider === 'kling') {
            endpoints = [
                `${normalizedBaseUrl}/kling/v1/videos/tasks/${externalTaskId}`,
                `${normalizedBaseUrl}/kling/v1/videos/text2video/${externalTaskId}`,
                `${normalizedBaseUrl}/kling/v1/videos/image2video/${externalTaskId}`
            ];
        } else if (provider === 'sora') {
            endpoints = [
                `${normalizedBaseUrl}/v2/videos/generations/${externalTaskId}`,
                `${normalizedBaseUrl}/v1/videos/${externalTaskId}`
            ];
        } else if (provider === 'veo') {
            endpoints = [
                `${normalizedBaseUrl}/v2/videos/generations/${externalTaskId}`
            ];
        } else {
            endpoints = [
                `${normalizedBaseUrl}/v1/videos/generations/${externalTaskId}`,
                `${normalizedBaseUrl}/v2/videos/generations/${externalTaskId}`
            ];
        }
        
        for (const endpoint of endpoints) {
            try {
                const manualHeaders = { 'Authorization': `Bearer ${apiKey}` };
                if (provider === 'sora') {
                    manualHeaders['ModelName'] = 'sora-2';
                }
                const response = await fetch(endpoint, {
                    headers: manualHeaders
                });
                
                if (!response.ok) continue;
                
                const data = await safeParseJsonResponse(response, '手动轮询接口');
                const status = extractVideoStatus(data);
                const url = extractVideoUrl(data);
                
                console.log('[手动轮询] 响应:', { status, hasUrl: !!url });
                
                if (status === 'completed' || status === 'succeeded' || status === 'success' || url) {
                    return { success: true, url, status: 'completed' };
                }
                
                if (status === 'failed' || status === 'error') {
                    return { success: false, status: 'failed', error: data.error?.message || '任务失败' };
                }
                
                // 仍在处理中
                return { success: false, status: status || 'processing', message: '任务仍在处理中' };
            } catch (e) {
                console.warn('[手动轮询] 端点请求失败:', endpoint, e);
            }
        }
        
        return { success: false, status: 'unknown', message: '无法获取任务状态' };
    } catch (error) {
        console.error('[手动轮询] 错误:', error);
        return { success: false, error: error.message };
    }
}

// 导出手动轮询函数
window.manualPollTask = manualPollTask;

// 导出视频生成函数供canvas-nodes.js使用
window.generateVideo = generateVideo;
window.pollVideoTask = pollVideoTask;

// ==================== Sora 工作室 ====================
function getSoraBaseUrl() {
    const base = apiConfig.baseUrl || DEFAULT_API_URL;
    return base.replace(/\/v1\/?$/, '').replace(/\/v2\/?$/, '').replace(/\/+$/, '');
}
let soraCharacters = JSON.parse(localStorage.getItem('sora_characters') || '[]');

function openSoraStudio() {
    document.getElementById('sora-studio-modal').classList.remove('hidden');
    renderSoraCharacters();
}

function closeSoraStudio() {
    document.getElementById('sora-studio-modal').classList.add('hidden');
}

function switchSoraTab(tab) {
    const tabs = ['character', 'storyboard', 'remix'];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`sora-tab-${t}`);
        const panel = document.getElementById(`sora-panel-${t}`);
        if (t === tab) {
            tabBtn.className = 'px-4 py-2.5 text-sm font-medium text-gray-900 border-b-2 border-gray-900 transition';
            panel.classList.remove('hidden');
        } else {
            tabBtn.className = 'px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-gray-600 border-b-2 border-transparent transition';
            panel.classList.add('hidden');
        }
    });
}

function renderSoraCharacters() {
    const list = document.getElementById('sora-characters-list');
    if (!soraCharacters.length) {
        list.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">暂无角色，创建后将显示在这里</p>';
        return;
    }
    list.innerHTML = soraCharacters.map((c, i) => `
        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            ${c.profile_picture_url ? `<img src="${c.profile_picture_url}" class="w-10 h-10 rounded-full object-cover border border-gray-200" />` : '<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg">🎭</div>'}
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-800 truncate">@${c.username}</div>
                <div class="text-xs text-gray-400 truncate">${c.id || ''}</div>
            </div>
            <button onclick="copySoraCharTag(${i})" class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition" title="复制引用标签">复制</button>
            <button onclick="deleteSoraCharacter(${i})" class="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition">删除</button>
        </div>
    `).join('');
}

function copySoraCharTag(index) {
    const c = soraCharacters[index];
    if (c) {
        navigator.clipboard.writeText(`@${c.username}`);
        console.log('[Sora] 已复制角色标签:', `@${c.username}`);
    }
}

function deleteSoraCharacter(index) {
    soraCharacters.splice(index, 1);
    localStorage.setItem('sora_characters', JSON.stringify(soraCharacters));
    renderSoraCharacters();
}

async function createSoraCharacter() {
    const apiKey = apiConfig.apiKey;
    if (!apiKey) { alert('请先在设置中配置 API Key'); return; }

    const videoUrl = document.getElementById('sora-char-video-url').value.trim();
    const fromTask = document.getElementById('sora-char-task-id').value.trim();
    const startTime = document.getElementById('sora-char-start').value;
    const endTime = document.getElementById('sora-char-end').value;

    if (!videoUrl && !fromTask) { alert('请填写视频 URL 或任务 ID'); return; }

    const body = { timestamps: `${startTime},${endTime}` };
    if (videoUrl) body.url = videoUrl;
    if (fromTask) body.from_task = fromTask;

    try {
        const resp = await fetch(`${getSoraBaseUrl()}/sora/v1/characters`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'ModelName': 'sora-2'
            },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || data.message || JSON.stringify(data));

        soraCharacters.push({
            id: data.id,
            username: data.username,
            profile_picture_url: data.profile_picture_url || '',
            permalink: data.permalink || ''
        });
        localStorage.setItem('sora_characters', JSON.stringify(soraCharacters));
        renderSoraCharacters();
        document.getElementById('sora-char-video-url').value = '';
        document.getElementById('sora-char-task-id').value = '';
        console.log('[Sora] 角色创建成功:', data.username);
    } catch (err) {
        console.error('[Sora] 创建角色失败:', err);
        alert('创建角色失败: ' + err.message);
    }
}

// 故事板
function addStoryboardShot() {
    const container = document.getElementById('sora-storyboard-shots');
    const count = container.querySelectorAll('.storyboard-shot').length + 1;
    const shot = document.createElement('div');
    shot.className = 'storyboard-shot bg-white rounded-lg p-3 border border-gray-200';
    shot.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-600">Shot ${count}</span>
            <input type="number" value="5" min="1" max="15" step="0.5" class="shot-duration w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-black/10" placeholder="秒" />
        </div>
        <textarea class="shot-scene w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10" rows="2" placeholder="描述这个镜头的场景..."></textarea>
    `;
    container.appendChild(shot);
}

function removeLastStoryboardShot() {
    const container = document.getElementById('sora-storyboard-shots');
    const shots = container.querySelectorAll('.storyboard-shot');
    if (shots.length > 1) shots[shots.length - 1].remove();
}

async function generateStoryboardVideo() {
    const apiKey = apiConfig.apiKey;
    if (!apiKey) { alert('请先在设置中配置 API Key'); return; }

    const shots = document.querySelectorAll('#sora-storyboard-shots .storyboard-shot');
    const promptParts = [];
    shots.forEach((shot, i) => {
        const duration = shot.querySelector('.shot-duration').value || '5';
        const scene = shot.querySelector('.shot-scene').value.trim();
        if (scene) {
            promptParts.push(`Shot ${i + 1}:\nduration: ${duration}sec\nScene: ${scene}`);
        }
    });
    if (!promptParts.length) { alert('请至少填写一个镜头的场景描述'); return; }

    const model = document.getElementById('sora-sb-model').value;
    const ratio = document.getElementById('sora-sb-ratio').value;
    const prompt = promptParts.join('\n\n');

    const btn = document.getElementById('sora-sb-generate-btn');
    const status = document.getElementById('sora-sb-status');
    btn.disabled = true;
    btn.textContent = '生成中...';
    status.classList.remove('hidden');
    status.textContent = '正在提交故事板...';

    try {
        const resp = await fetch(`${getSoraBaseUrl()}/v2/videos/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'ModelName': model
            },
            body: JSON.stringify({ prompt, model, aspect_ratio: ratio, duration: '10' })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || data.message || JSON.stringify(data));

        const taskId = data.task_id || data.id;
        if (!taskId) throw new Error('未获取到任务 ID');

        status.textContent = `任务已提交 (${taskId})，正在轮询...`;
        const result = await pollVideoTask(taskId, (p) => {
            status.textContent = `生成中... ${Math.round(p)}%`;
        }, { provider: 'sora', model });

        if (result.success && result.url) {
            status.innerHTML = `✅ 生成完成 <a href="${result.url}" target="_blank" class="text-blue-500 underline">查看视频</a>`;
        } else {
            status.textContent = '生成完成，但未获取到视频链接';
        }
    } catch (err) {
        console.error('[Sora] 故事板生成失败:', err);
        status.textContent = '❌ ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '生成故事板视频';
    }
}

// Remix
async function remixSoraVideo() {
    const apiKey = apiConfig.apiKey;
    if (!apiKey) { alert('请先在设置中配置 API Key'); return; }

    const taskId = document.getElementById('sora-remix-task-id').value.trim();
    const prompt = document.getElementById('sora-remix-prompt').value.trim();
    if (!taskId) { alert('请填写原始视频任务 ID'); return; }
    if (!prompt) { alert('请填写编辑指令'); return; }

    const btn = document.getElementById('sora-remix-btn');
    const status = document.getElementById('sora-remix-status');
    btn.disabled = true;
    btn.textContent = 'Remix 中...';
    status.classList.remove('hidden');
    status.textContent = '正在提交 Remix 请求...';

    try {
        const resp = await fetch(`${getSoraBaseUrl()}/v1/videos/${taskId}/remix`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'ModelName': 'sora-2'
            },
            body: JSON.stringify({ prompt })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || data.message || JSON.stringify(data));

        const newTaskId = data.id || data.task_id;
        if (!newTaskId) throw new Error('未获取到 Remix 任务 ID');

        status.textContent = `Remix 任务已提交 (${newTaskId})，正在轮询...`;
        const result = await pollVideoTask(newTaskId, (p) => {
            status.textContent = `Remix 中... ${Math.round(p)}%`;
        }, { provider: 'sora', model: 'sora-2' });

        if (result.success && result.url) {
            status.innerHTML = `✅ Remix 完成 <a href="${result.url}" target="_blank" class="text-blue-500 underline">查看视频</a>`;
        } else {
            status.textContent = 'Remix 完成，但未获取到视频链接';
        }
    } catch (err) {
        console.error('[Sora] Remix 失败:', err);
        status.textContent = '❌ ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Remix 视频';
    }
}

// ==================== UI 辅助函数 ====================
function addMessage(content, isUser, type = '') {
    const chatHistory = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} message-animate`;
    
    const messageClass = isUser ? 'user-message' : (type === 'agent' ? 'ai-message agent-message' : 'ai-message');
    
    div.innerHTML = `<div class="${messageClass}">${content}</div>`;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    return div;
}

function addLoadingMessage() {
    const chatHistory = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = 'flex justify-start message-animate';
    div.innerHTML = `
        <div class="ai-message flex items-center gap-2">
            <div class="flex gap-1">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <span class="text-sm text-gray-500">思考中...</span>
        </div>
    `;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return div;
}

function addAgentLog(message) {
    const chatHistory = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = 'flex justify-start message-animate';
    div.innerHTML = `
        <div class="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
            ${message}
        </div>
    `;
    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateAgentStatus(text, color) {
    const statusEl = document.getElementById('agent-status');
    const colorMap = {
        green: 'text-green-600',
        blue: 'text-blue-600',
        red: 'text-red-600'
    };
    const bgMap = {
        green: 'bg-green-500',
        blue: 'bg-blue-500',
        red: 'bg-red-500'
    };
    statusEl.className = `text-xs ${colorMap[color] || 'text-gray-600'} flex items-center gap-1`;
    statusEl.innerHTML = `<span class="w-2 h-2 ${bgMap[color] || 'bg-gray-500'} rounded-full ${color === 'blue' ? 'animate-pulse' : ''}"></span>${text}`;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    let bgColor = 'bg-black';
    if (type === 'error') bgColor = 'bg-red-500';
    else if (type === 'warning') bgColor = 'bg-orange-500';
    toast.className = `toast ${bgColor}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function copyToClipboard(text, label = '内容') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label}已复制`);
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function copyPromptToClipboard() {
    if (window._lastPrompt) {
        copyToClipboard(window._lastPrompt, '提示词');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

// ==================== 键盘事件 ====================
function handleHomeEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        startChat();
    }
}

function handleChatEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// ==================== Agent 模式切换 ====================
function toggleAgentMode() {
    isAgentModeActive = !isAgentModeActive;
    
    const btn1 = document.getElementById('agent-toggle-btn');
    const btn2 = document.getElementById('agent-toggle-btn-2');
    
    [btn1, btn2].forEach(btn => {
        if (btn) {
            if (isAgentModeActive) {
                btn.classList.add('bg-gradient-to-r', 'from-purple-500', 'to-pink-500');
                btn.classList.remove('bg-black');
            } else {
                btn.classList.remove('bg-gradient-to-r', 'from-purple-500', 'to-pink-500');
                btn.classList.add('bg-black');
            }
        }
    });
    
    showToast(isAgentModeActive ? '✨ Agent 模式已开启' : 'Agent 模式已关闭');
}

// ==================== 聊天图片上传 ====================
function handleChatImageUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        Array.from(files).forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    chatUploadedImages.push({
                        id: Date.now() + index,
                        url: e.target.result,
                        name: file.name
                    });
                    updateChatImagePreview();
                };
                reader.readAsDataURL(file);
            }
        });
    }
    event.target.value = '';
}

function updateChatImagePreview() {
    const container = document.getElementById('chat-images-preview');
    if (!container) return;
    
    if (chatUploadedImages.length === 0) {
        container.innerHTML = '';
        container.style.minHeight = '0';
        return;
    }
    
    container.style.minHeight = '60px';
    container.innerHTML = chatUploadedImages.map((img, idx) => `
        <div class="relative group" draggable="true" data-img-idx="${idx}">
            <img src="${img.url}" class="w-14 h-14 rounded-lg object-cover border-2 border-gray-200 cursor-move" title="${img.name}" />
            <span class="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">${idx + 1}</span>
            <button onclick="removeChatImage(${img.id})" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center">×</button>
        </div>
    `).join('');
}

function removeChatImage(imgId) {
    chatUploadedImages = chatUploadedImages.filter(img => img.id !== imgId);
    updateChatImagePreview();
}

// ==================== 任务类型设置 ====================
function setTaskType(type) {
    const placeholders = {
        'text2img': '描述你想要生成的图片，例如：一只可爱的猫咪在草地上玩耍...',
        'img2img': '上传参考图片后，描述你想要的修改或风格转换...',
        'analyze': '上传图片后，我会帮你分析内容并反推AI绘图提示词...',
        'agent': '描述你的需求，Agent 将自动规划并执行...'
    };
    
    const input = document.getElementById('chat-input');
    if (input) {
        input.placeholder = placeholders[type] || '描述你的需求...';
        input.focus();
    }

    // 更新模式按钮显示
    updateTaskModeButton(type);

    // Agent模式单独处理
    if (type === 'agent' && !isAgentModeActive) {
        toggleAgentMode();
    }

    const labelMap = {
        text2img: '文生图',
        img2img: '图生图',
        analyze: '图片反推',
        agent: 'Agent'
    };
    showToast(`已切换到${labelMap[type] || '默认'}模式`);
}

// ==================== 生成数量设置 ====================
function setGenerationCount(count) {
    generationCount = count;

    const btn = document.getElementById('gen-count-btn');
    if (btn) btn.textContent = `x${count}`;
}

function cycleGenerationCount() {
    const next = generationCount >= 4 ? 1 : generationCount + 1;
    setGenerationCount(next);
}

function updateTaskModeButton(type) {
    const btn = document.getElementById('task-mode-btn');
    if (!btn) return;
    const labelMap = {
        text2img: '文生图',
        img2img: '图生图',
        analyze: '图片反推',
        agent: 'Agent'
    };
    const label = labelMap[type] || '文生图';
    btn.dataset.mode = type;
    btn.querySelector('span')?.remove();
    btn.innerHTML = `
        <span class="text-[11px] text-gray-500">模式</span>
        <span class="text-xs font-medium text-gray-900">${label}</span>
        <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
    `;
}

function toggleTaskModeMenu(forceOpen) {
    const menu = document.getElementById('task-mode-menu');
    if (!menu) return;
    const isOpen = !menu.classList.contains('hidden');
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
    menu.classList.toggle('hidden', !nextOpen);
}

function selectTaskMode(type) {
    setTaskType(type);
    toggleTaskModeMenu(false);
}

function initChatPanelResize() {
    const panel = document.getElementById('chat-panel');
    const handle = document.getElementById('chat-resize-handle');
    const indicator = document.getElementById('chat-resize-indicator');
    const collapsed = document.getElementById('chat-panel-collapsed');
    if (!panel || !handle || !indicator) return;

    const minWidth = 280;
    const maxWidth = 560;
    let isDragging = false;

    const setWidth = (width) => {
        const clamped = Math.max(minWidth, Math.min(maxWidth, width));
        document.documentElement.style.setProperty('--chat-panel-width', `${clamped}px`);
    };

    handle.addEventListener('mouseenter', () => {
        indicator.classList.remove('opacity-0');
    });
    handle.addEventListener('mouseleave', () => {
        if (!isDragging) indicator.classList.add('opacity-0');
    });
    handle.addEventListener('mousemove', (e) => {
        indicator.style.top = `${e.offsetY}px`;
    });
    handle.addEventListener('mousedown', (e) => {
        if (panel.classList.contains('chat-collapsed')) return;
        isDragging = true;
        indicator.classList.remove('opacity-0');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const width = window.innerWidth - e.clientX;
        setWidth(width);
    });
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        indicator.classList.add('opacity-0');
    });

    if (collapsed) {
        collapsed.addEventListener('click', () => toggleChatPanelCollapse(false));
    }

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('task-mode-menu');
        const btn = document.getElementById('task-mode-btn');
        if (!menu || !btn) return;
        if (menu.classList.contains('hidden')) return;
        if (menu.contains(e.target) || btn.contains(e.target)) return;
        toggleTaskModeMenu(false);
    });
}

function toggleChatPanelCollapse(forceState) {
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    const shouldCollapse = typeof forceState === 'boolean'
        ? forceState
        : !panel.classList.contains('chat-collapsed');
    panel.classList.toggle('chat-collapsed', shouldCollapse);
    const width = shouldCollapse ? 56 : 384;
    document.documentElement.style.setProperty('--chat-panel-width', `${width}px`);
}

// ==================== 清空对话历史 ====================
function clearChatHistory() {
    if (confirm('确定要清空对话历史吗？')) {
        document.getElementById('chat-history').innerHTML = '';
        conversationHistory = [];
        chatUploadedImages = [];
        updateChatImagePreview();
        
        // 清空Agent的历史
        if (window.agentChat) {
            window.agentChat.clearHistory();
        }
        
        showToast('对话已清空');
    }
}

// ==================== 任务进度显示 ====================
function showTaskProgress(current, total, taskName) {
    const container = document.getElementById('task-progress');
    const text = document.getElementById('task-progress-text');
    const count = document.getElementById('task-progress-count');
    const bar = document.getElementById('task-progress-bar');
    
    if (container) {
        container.classList.remove('hidden');
        if (text) text.textContent = taskName || '执行中...';
        if (count) count.textContent = `${current}/${total}`;
        if (bar) bar.style.width = `${(current / total) * 100}%`;
    }
}

function hideTaskProgress() {
    const container = document.getElementById('task-progress');
    if (container) {
        container.classList.add('hidden');
    }
}

// ==================== 图片上传 ====================
function handleImageUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    uploadedImages.push(e.target.result);
                    updateImagePreview('home-images-preview');
                    updateImagePreview('chat-images-preview');
                };
                reader.readAsDataURL(file);
            }
        });
    }
    event.target.value = '';
}

// handleCanvasImageUpload 已移至画布内容部分

function updateImagePreview(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = uploadedImages.map((img, idx) => `
        <div class="relative group">
            <img src="${img}" class="w-14 h-14 rounded-lg object-cover border-2 border-gray-200" />
            <button onclick="removeImage(${idx})" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition">×</button>
        </div>
    `).join('');
}

function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreview('home-images-preview');
    updateImagePreview('chat-images-preview');
}

// ==================== 快捷示例 ====================
function setExample(num) {
    const examples = {
        1: '一张极简风格的咖啡主图，白色背景，咖啡杯居中摆放，柔和的顶光，4K高清',
        2: '国潮风格的电商海报，产品是牛仔裤，配色以红金黑为主，加入传统纹样元素',
        3: '科技感智能手表产品图，深蓝色渐变背景，产品悬浮效果，光线科幻感'
    };
    document.getElementById('home-input').value = examples[num] || '';
}

// ==================== 设置弹窗 ====================
function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettings() {
    // 用户可自由配置所有 API 参数
    apiConfig.baseUrl = document.getElementById('api-base-url').value.trim() || DEFAULT_API_URL;
    apiConfig.apiKey = document.getElementById('api-key').value.trim();
    const rhInput = document.getElementById('rh-api-key');
    apiConfig.runninghubApiKey = rhInput ? rhInput.value.trim() : '';
    modelConfig.llm = document.getElementById('llm-model').value.trim() || 'gemini-3-flash-preview';
    modelConfig.imageGen = document.getElementById('image-model').value.trim() || 'nano-banana-pro';
    
    try {
        // 保存所有 API 配置
        localStorage.setItem('ai_studio_api_config', JSON.stringify({
            baseUrl: apiConfig.baseUrl,
            apiKey: apiConfig.apiKey,
            runninghubApiKey: apiConfig.runninghubApiKey
        }));
        localStorage.setItem('ai_studio_model_config', JSON.stringify(modelConfig));
        syncRunningHubApiKey();
        showToast('✅ 设置已保存');
        closeSettings();
    } catch (e) {
        showToast('保存失败', 'error');
    }
}

async function testConnection() {
    const baseUrl = document.getElementById('api-base-url').value.trim() || DEFAULT_API_URL;
    const apiKey = document.getElementById('api-key').value.trim();
    
    if (!apiKey) {
        showToast('请填写 API Key', 'error');
        return;
    }
    
    try {
        const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        const response = await fetch(`${normalizedBaseUrl}/v1/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) {
            showToast('连接失败: ' + response.status, 'error');
            return;
        }
        await safeParseJsonResponse(response, '连接测试接口');
        showToast('✅ 连接成功');
    } catch (e) {
        showToast('连接错误: ' + e.message, 'error');
    }
}

// ==================== RunningHub Key 同步 ====================
function syncRunningHubApiKey() {
    const rhKey = apiConfig.runninghubApiKey;
    if (!rhKey) return;
    const rhIframe = document.getElementById('rh-iframe');
    if (rhIframe && rhIframe.contentWindow) {
        rhIframe.contentWindow.postMessage({ type: 'SET_RH_API_KEY', apiKey: rhKey }, '*');
    }
}

// ==================== Agent Builder 画布 ====================
let builderNodes = [];
let builderConnections = [];
let selectedNode = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

function openAgentBuilder() {
    document.getElementById('agent-builder-modal').classList.remove('hidden');
    loadPreset('default');
}

function closeAgentBuilder() {
    document.getElementById('agent-builder-modal').classList.add('hidden');
}

function loadPreset(presetName) {
    const preset = WORKFLOW_PRESETS[presetName];
    if (!preset) {
        builderNodes = [];
        builderConnections = [];
    } else {
        builderNodes = preset.nodes.map(n => ({ ...n }));
        builderConnections = preset.connections.map(c => ({ ...c }));
    }
    renderBuilderCanvas();
}

function renderBuilderCanvas() {
    const nodesContainer = document.getElementById('builder-nodes');
    const connectionsContainer = document.getElementById('builder-connections');
    
    // 清空
    nodesContainer.innerHTML = '';
    connectionsContainer.innerHTML = '';
    
    // 渲染连接线
    builderConnections.forEach(conn => {
        const fromNode = builderNodes.find(n => n.id === conn.from);
        const toNode = builderNodes.find(n => n.id === conn.to);
        if (fromNode && toNode) {
            const path = createConnectionPath(fromNode, toNode);
            connectionsContainer.appendChild(path);
        }
    });
    
    // 渲染节点
    builderNodes.forEach(node => {
        const el = createNodeElement(node);
        nodesContainer.appendChild(el);
    });
    
    // 更新计数
    document.getElementById('node-count').textContent = builderNodes.length;
    document.getElementById('connection-count').textContent = builderConnections.length;
}

function createNodeElement(node) {
    const icons = {
        intent: '🎯',
        rag: '📚',
        planner: '📋',
        optimizer: '✨',
        generator: '🎨',
        checker: '✅'
    };
    
    const div = document.createElement('div');
    div.className = 'agent-node absolute bg-white rounded-xl border-2 border-gray-200 p-3 w-36 shadow-sm hover:shadow-md';
    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    div.dataset.nodeId = node.id;
    
    div.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">${icons[node.type] || '📦'}</span>
            <span class="text-sm font-medium text-gray-900">${node.name}</span>
        </div>
        <div class="text-xs text-gray-500">${node.type}</div>
        <div class="node-port absolute -left-1.5 top-1/2 -translate-y-1/2" data-port="input"></div>
        <div class="node-port absolute -right-1.5 top-1/2 -translate-y-1/2" data-port="output"></div>
    `;
    
    // 拖拽事件
    div.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('node-port')) return;
        selectedNode = node;
        isDragging = true;
        dragOffset = {
            x: e.clientX - node.x,
            y: e.clientY - node.y
        };
        div.style.zIndex = '100';
    });
    
    // 点击选中
    div.addEventListener('click', () => {
        selectNode(node);
    });
    
    return div;
}

function createConnectionPath(fromNode, toNode) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    const x1 = fromNode.x + 140;
    const y1 = fromNode.y + 30;
    const x2 = toNode.x;
    const y2 = toNode.y + 30;
    
    const midX = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    
    path.setAttribute('d', d);
    path.setAttribute('class', 'connection-line');
    path.setAttribute('stroke-dasharray', '5,5');
    
    return path;
}

function selectNode(node) {
    selectedNode = node;
    
    // 更新属性面板
    const propsPanel = document.getElementById('node-properties');
    propsPanel.innerHTML = `
        <h4 class="text-xs font-semibold text-gray-500 uppercase mb-3">节点属性</h4>
        <div class="space-y-3">
            <div>
                <label class="block text-xs text-gray-500 mb-1">节点名称</label>
                <input type="text" value="${node.name}" onchange="updateNodeName('${node.id}', this.value)" class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">类型</label>
                <div class="text-sm font-medium text-gray-700">${node.type}</div>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">位置</label>
                <div class="text-sm text-gray-600">X: ${Math.round(node.x)}, Y: ${Math.round(node.y)}</div>
            </div>
            <button onclick="deleteBuilderNode('${node.id}')" class="w-full mt-4 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">删除节点</button>
        </div>
    `;
}

function updateNodeName(nodeId, newName) {
    const node = builderNodes.find(n => n.id === nodeId);
    if (node) {
        node.name = newName;
        renderBuilderCanvas();
    }
}

function deleteBuilderNode(nodeId) {
    builderNodes = builderNodes.filter(n => n.id !== nodeId);
    builderConnections = builderConnections.filter(c => c.from !== nodeId && c.to !== nodeId);
    selectedNode = null;
    document.getElementById('node-properties').innerHTML = '<h4 class="text-xs font-semibold text-gray-500 uppercase mb-3">节点属性</h4><div class="text-sm text-gray-400 text-center py-8">选择一个节点查看属性</div>';
    renderBuilderCanvas();
}

// 画布拖拽
document.addEventListener('mousemove', (e) => {
    if (isDragging && selectedNode) {
        const canvas = document.getElementById('builder-canvas');
        const rect = canvas.getBoundingClientRect();
        
        selectedNode.x = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, rect.width - 150));
        selectedNode.y = Math.max(0, Math.min(e.clientY - rect.top - dragOffset.y, rect.height - 80));
        
        renderBuilderCanvas();
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    if (selectedNode) {
        const el = document.querySelector(`[data-node-id="${selectedNode.id}"]`);
        if (el) el.style.zIndex = '';
    }
});

// 节点拖放
function setupDragAndDrop() {
    const templates = document.querySelectorAll('.agent-node-template');
    templates.forEach(tmpl => {
        tmpl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('nodeType', tmpl.dataset.type);
        });
    });
}

function handleNodeDragOver(e) {
    e.preventDefault();
}

function handleNodeDrop(e) {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType) return;
    
    const canvas = document.getElementById('builder-canvas');
    const rect = canvas.getBoundingClientRect();
    
    const names = {
        intent: '意图识别',
        rag: 'RAG 检索',
        planner: '任务规划',
        optimizer: '提示词优化',
        generator: '图片生成',
        checker: '质量检查'
    };
    
    const newNode = {
        id: 'n' + Date.now(),
        type: nodeType,
        name: names[nodeType] || nodeType,
        x: e.clientX - rect.left - 70,
        y: e.clientY - rect.top - 30
    };
    
    builderNodes.push(newNode);
    renderBuilderCanvas();
}

function clearWorkflow() {
    if (confirm('确定要清空画布吗？')) {
        builderNodes = [];
        builderConnections = [];
        renderBuilderCanvas();
    }
}

function testWorkflow() {
    showToast('🧪 工作流测试功能开发中...');
}

function saveWorkflow() {
    currentWorkflow = {
        name: '自定义工作流',
        nodes: builderNodes.map(n => ({ ...n })),
        connections: builderConnections.map(c => ({ ...c }))
    };
    
    try {
        localStorage.setItem('ai_studio_workflow', JSON.stringify(currentWorkflow));
        showToast('✅ 工作流已保存');
    } catch (e) {
        showToast('保存失败', 'error');
    }
}

function applyWorkflow() {
    currentWorkflow = {
        name: '自定义工作流',
        nodes: builderNodes.map(n => ({ ...n })),
        connections: builderConnections.map(c => ({ ...c }))
    };
    
    localStorage.setItem('ai_studio_workflow', JSON.stringify(currentWorkflow));
    showToast('✅ 工作流已应用');
    closeAgentBuilder();
}

// ==================== 工作流可视化 ====================
function showWorkflowVisualization() {
    const svg = document.getElementById('workflow-svg');
    const nodes = currentWorkflow?.nodes || WORKFLOW_PRESETS.default.nodes;
    const connections = currentWorkflow?.connections || WORKFLOW_PRESETS.default.connections;
    
    // 计算居中偏移
    const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
    const offsetX = (containerRect.width - 1000) / 2;
    const offsetY = 50;
    
    // 渲染连接线
    let svgContent = '';
    connections.forEach(conn => {
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        if (fromNode && toNode) {
            const x1 = fromNode.x + 140 + offsetX;
            const y1 = fromNode.y + 30 + offsetY;
            const x2 = toNode.x + offsetX;
            const y2 = toNode.y + 30 + offsetY;
            const midX = (x1 + x2) / 2;
            svgContent += `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" class="connection-line" stroke-dasharray="5,5" id="conn-${conn.from}-${conn.to}"/>`;
        }
    });
    
    // 渲染节点
    const icons = { intent: '🎯', rag: '📚', planner: '📋', optimizer: '✨', generator: '🎨', checker: '✅' };
    nodes.forEach(node => {
        const x = node.x + offsetX;
        const y = node.y + offsetY;
        svgContent += `
            <g id="vis-node-${node.id}" transform="translate(${x}, ${y})">
                <rect width="140" height="60" rx="12" fill="white" stroke="#e5e7eb" stroke-width="2"/>
                <text x="20" y="35" font-size="20">${icons[node.type] || '📦'}</text>
                <text x="45" y="35" font-size="12" fill="#374151" font-weight="500">${node.name}</text>
            </g>
        `;
    });
    
    svg.innerHTML = svgContent;
}

function hasNodeType(type) {
    const nodes = currentWorkflow?.nodes || WORKFLOW_PRESETS.default.nodes;
    return nodes.some(n => n.type === type);
}

function updateNodeStatus(type, status) {
    const nodes = currentWorkflow?.nodes || WORKFLOW_PRESETS.default.nodes;
    const node = nodes.find(n => n.type === type);
    if (!node) return;
    
    const el = document.getElementById(`vis-node-${node.id}`);
    if (!el) return;
    
    const rect = el.querySelector('rect');
    if (rect) {
        const colors = {
            running: '#3b82f6',
            completed: '#10b981',
            failed: '#ef4444'
        };
        rect.setAttribute('stroke', colors[status] || '#e5e7eb');
        rect.setAttribute('stroke-width', status === 'running' ? '3' : '2');
    }
}

// ==================== 画布内容 ====================
// 画布交互现在由 canvas-nodes.js 统一管理
let canvasImages = []; // 兼容旧代码

// 注意：zoomCanvas 和 resetCanvasView 由 canvas-nodes.js 提供
// 这里不再重复定义以避免覆盖

function addImageToCanvas(imageUrl) {
    // 使用新的画布节点系统
    if (typeof createImageNode === 'function') {
        // 计算新图片位置
        const nodeCount = (typeof CanvasNodeSystem !== 'undefined' && CanvasNodeSystem.nodes) 
            ? CanvasNodeSystem.nodes.length : 0;
        const offsetX = 100 + (nodeCount % 3) * 320;
        const offsetY = 100 + Math.floor(nodeCount / 3) * 320;
        
        createImageNode(imageUrl, 'generated.png', offsetX, offsetY);
        return;
    }
    
    // 兼容旧版本的后备代码
    const container = document.getElementById('generated-content');
    const imgId = Date.now();
    
    // 隐藏空状态提示
    const emptyHint = document.getElementById('canvas-empty-hint');
    if (emptyHint) {
        emptyHint.style.display = 'none';
    }
    
    // 计算新图片位置
    const offsetX = 100 + (canvasImages.length % 3) * 320;
    const offsetY = 100 + Math.floor(canvasImages.length / 3) * 320;
    
    // 存储图片数据
    const imgData = {
        id: imgId,
        url: imageUrl,
        x: offsetX,
        y: offsetY,
        width: 288,
        height: 288
    };
    canvasImages.push(imgData);
    
    // 创建可拖拽的图片元素
    const imgWrapper = document.createElement('div');
    imgWrapper.id = `canvas-img-${imgId}`;
    imgWrapper.className = 'canvas-image-wrapper absolute bg-white rounded-lg shadow-lg overflow-hidden cursor-move select-none';
    imgWrapper.style.left = offsetX + 'px';
    imgWrapper.style.top = offsetY + 'px';
    imgWrapper.style.zIndex = '10';
    
    imgWrapper.innerHTML = `
        <div class="canvas-image-handle" data-img-id="${imgId}">
            <img src="${imageUrl}" class="w-72 h-72 object-cover pointer-events-none" draggable="false" />
        </div>
        <div class="p-2 flex gap-1 bg-white">
            <a href="${imageUrl}" download="design-${imgId}.png" class="flex-1 text-center text-xs bg-black text-white py-1.5 rounded hover:bg-gray-800 transition">下载</a>
            <button onclick="copyToClipboard('${imageUrl}')" class="flex-1 text-xs bg-gray-100 py-1.5 rounded hover:bg-gray-200 transition">复制链接</button>
            <button onclick="removeCanvasImage(${imgId})" class="px-2 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 transition">✕</button>
        </div>
    `;
    
    container.appendChild(imgWrapper);
    generatedImages.push(imageUrl);
}

function removeCanvasImage(imgId) {
    const imgEl = document.getElementById(`canvas-img-${imgId}`);
    if (imgEl) {
        imgEl.remove();
    }
    canvasImages = canvasImages.filter(img => img.id !== imgId);
    
    // 如果没有图片了，显示空状态提示
    if (canvasImages.length === 0) {
        const emptyHint = document.getElementById('canvas-empty-hint');
        if (emptyHint) {
            emptyHint.style.display = 'block';
        }
    }
    
    showToast('图片已移除');
}

// 处理画布上传图片
function handleCanvasImageUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        Array.from(files).forEach((file, index) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // 使用新的画布节点系统
                    if (typeof createImageNode === 'function') {
                        const nodeCount = (typeof CanvasNodeSystem !== 'undefined' && CanvasNodeSystem.nodes) 
                            ? CanvasNodeSystem.nodes.length : 0;
                        const offsetX = 100 + ((nodeCount + index) % 3) * 320;
                        const offsetY = 100 + Math.floor((nodeCount + index) / 3) * 320;
                        createImageNode(e.target.result, file.name, offsetX, offsetY);
                    } else {
                        addImageToCanvas(e.target.result);
                    }
                    showToast('图片已添加到画布');
                };
                reader.readAsDataURL(file);
            }
        });
    }
    event.target.value = '';
}

// ==================== 生成历史功能 ====================
let generationHistory = [];
const GENERATION_HISTORY_KEY = 'ai_studio_generation_history';

// 生成更小的缩略图（降低内存占用，尺寸从480改为200，质量从0.82改为0.6）
async function createThumbnailImage(url) {
    return new Promise(resolve => {
        if (!url) return resolve(url);
        // 外部URL直接返回，不转base64
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return resolve(url);
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) return resolve(url);
            const maxSide = 200; // 降低缩略图尺寸以节省内存
            const scale = Math.min(1, maxSide / Math.max(width, height));
            const targetW = Math.max(1, Math.round(width * scale));
            const targetH = Math.max(1, Math.round(height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
            if (!ctx) return resolve(url);
            // 先填充白色背景，防止PNG透明区域转JPEG时颜色异常（如变紫）
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            try {
                resolve(canvas.toDataURL('image/jpeg', 0.6)); // 降低质量以节省内存
            } catch (e) {
                resolve(url);
            }
        };
        img.onerror = () => resolve(url);
        img.src = url;
    });
}

// 保持兼容性的别名
const create480pImage = createThumbnailImage;

async function addGenerationToHistory(entry) {
    if (!entry || !entry.url) return;
    const type = entry.type === 'video' ? 'video' : 'image';
    if (generationHistory.some(item => item.url === entry.url && item.type === type)) return;
    
    const url = entry.url;
    const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
    
    const item = {
        type,
        // 只有外部URL才保存原图地址，base64不保存原图（太占内存）
        url: isExternalUrl ? url : null,
        thumb: type === 'image' ? await createThumbnailImage(url) : null,
        ts: Date.now()
    };
    generationHistory.unshift(item);
    // 降低历史记录限制从200到50以节省内存
    if (generationHistory.length > 50) {
        generationHistory = generationHistory.slice(0, 50);
    }
    saveGenerationHistory();
}

function loadGenerationHistory() {
    try {
        const saved = localStorage.getItem(GENERATION_HISTORY_KEY);
        if (saved) {
            generationHistory = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('无法加载生成历史');
    }
}

function saveGenerationHistory() {
    try {
        localStorage.setItem(GENERATION_HISTORY_KEY, JSON.stringify(generationHistory));
    } catch (e) {
        console.warn('无法保存生成历史到本地存储');
    }
}

// 选择模式状态
let historySelectMode = false;
let historySelectedItems = new Set();

// 打开生成历史弹窗
function openGenerationHistory() {
    loadGenerationHistory();
    // 重置选择模式
    historySelectMode = false;
    historySelectedItems.clear();
    updateHistorySelectUI();
    renderHistoryItems();
    document.getElementById('image-history-modal').classList.remove('hidden');
}

// 渲染历史项目
function renderHistoryItems() {
    const container = document.getElementById('history-images-container');
    if (!container) return;
    
    // 过滤掉没有任何可显示内容的项目
    const validHistory = generationHistory.filter(item => item.thumb || item.url);
    
    if (!validHistory.length) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-8 col-span-3">暂无生成历史</div>';
    } else {
        // 为旧记录补充缩略图（兼容旧数据）
        validHistory.forEach(item => {
            if (item.type === 'image' && !item.thumb && item.url) {
                createThumbnailImage(item.url).then(thumb => {
                    item.thumb = thumb;
                    saveGenerationHistory();
                });
            }
        });
        container.innerHTML = validHistory.map((item, idx) => {
            const label = item.type === 'video' ? '视频' : '图片';
            const thumb = item.thumb || item.url;
            // 可查看的URL：优先原图URL，否则用缩略图
            const viewUrl = item.url || item.thumb;
            const isSelected = historySelectedItems.has(idx);
            const media = item.type === 'video'
                ? `<video src="${item.url || ''}" muted loop preload="metadata" playsinline class="w-full h-full object-cover"></video>`
                : `<img src="${thumb}" alt="生成${label}${idx + 1}" class="w-full h-full object-cover transition-transform group-hover:scale-105" onerror="this.parentElement.style.display='none'" />`;
            return `
                <div class="history-image-item relative group cursor-pointer rounded-lg overflow-hidden bg-gray-100 ${isSelected ? 'ring-2 ring-blue-500' : ''}" 
                     style="aspect-ratio: 1;" data-media-url="${encodeURIComponent(viewUrl || '')}" data-media-type="${item.type}" data-history-idx="${idx}">
                    ${media}
                    <div class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">${label}</div>
                    ${historySelectMode ? `
                        <div class="absolute top-1 right-1 w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-300'} flex items-center justify-center">
                            ${isSelected ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                        </div>
                    ` : `
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                            <span class="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">点击查看</span>
                        </div>
                    `}
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.history-image-item').forEach(item => {
            item.onclick = function(e) {
                e.stopPropagation();
                const idx = parseInt(this.dataset.historyIdx);
                if (historySelectMode) {
                    // 选择模式：切换选中状态
                    toggleHistoryItemSelection(idx);
                } else {
                    // 查看模式
                    const url = decodeURIComponent(this.dataset.mediaUrl);
                    const type = this.dataset.mediaType;
                    viewHistoryMedia(url, type);
                }
            };
        });
    }
}

// 切换选择模式
function toggleHistorySelectMode() {
    historySelectMode = !historySelectMode;
    historySelectedItems.clear();
    updateHistorySelectUI();
    renderHistoryItems();
}

// 更新选择模式UI
function updateHistorySelectUI() {
    const btn = document.getElementById('history-select-btn');
    const actions = document.getElementById('history-select-actions');
    if (btn) {
        btn.textContent = historySelectMode ? '取消选择' : '选择';
        btn.className = historySelectMode 
            ? 'px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg transition'
            : 'px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition';
    }
    if (actions) {
        actions.classList.toggle('hidden', !historySelectMode);
    }
    updateHistorySelectCount();
}

// 更新选中数量显示
function updateHistorySelectCount() {
    const countEl = document.getElementById('history-select-count');
    if (countEl) {
        countEl.textContent = `已选择 ${historySelectedItems.size} 项`;
    }
}

// 切换单个项目的选中状态
function toggleHistoryItemSelection(idx) {
    if (historySelectedItems.has(idx)) {
        historySelectedItems.delete(idx);
    } else {
        historySelectedItems.add(idx);
    }
    updateHistorySelectCount();
    renderHistoryItems();
}

// 全选
function selectAllHistory() {
    const validHistory = generationHistory.filter(item => item.thumb || item.url);
    validHistory.forEach((_, idx) => historySelectedItems.add(idx));
    updateHistorySelectCount();
    renderHistoryItems();
}

// 取消全选
function deselectAllHistory() {
    historySelectedItems.clear();
    updateHistorySelectCount();
    renderHistoryItems();
}

// 删除选中的项目
function deleteSelectedHistory() {
    if (historySelectedItems.size === 0) {
        showToast('请先选择要删除的项目', 'error');
        return;
    }
    
    // 按索引从大到小排序，避免删除时索引偏移
    const sortedIndices = Array.from(historySelectedItems).sort((a, b) => b - a);
    const validHistory = generationHistory.filter(item => item.thumb || item.url);
    
    // 找到原始数组中对应的索引并删除
    sortedIndices.forEach(validIdx => {
        const item = validHistory[validIdx];
        const originalIdx = generationHistory.indexOf(item);
        if (originalIdx !== -1) {
            generationHistory.splice(originalIdx, 1);
        }
    });
    
    saveGenerationHistory();
    historySelectedItems.clear();
    updateHistorySelectCount();
    renderHistoryItems();
    showToast(`已删除 ${sortedIndices.length} 项`);
}

// 下载选中的项目 - 使用fetch+blob确保直接下载不跳转
async function downloadSelectedHistory() {
    if (historySelectedItems.size === 0) {
        showToast('请先选择要下载的项目', 'error');
        return;
    }
    
    const validHistory = generationHistory.filter(item => item.thumb || item.url);
    const selectedIndices = Array.from(historySelectedItems);
    
    showToast(`开始下载 ${selectedIndices.length} 个文件...`);
    
    let downloadCount = 0;
    for (const idx of selectedIndices) {
        const item = validHistory[idx];
        if (!item) continue;
        
        const url = item.url || item.thumb;
        if (!url) continue;
        
        try {
            const ext = item.type === 'video' ? 'mp4' : 'png';
            const filename = `${item.type}_${Date.now()}_${downloadCount + 1}.${ext}`;
            
            // 使用fetch+blob方式下载，确保直接下载不跳转
            await downloadFileDirectly(url, filename);
            
            downloadCount++;
            // 稍微延迟以避免浏览器阻止多次下载
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error('下载失败:', err);
            // 回退到传统方式
            try {
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                downloadCount++;
            } catch (e) {
                console.error('回退下载也失败:', e);
            }
        }
    }
    
    showToast(`已下载 ${downloadCount} 个文件`);
}

// 直接下载文件（fetch+blob方式，避免跳转）
async function downloadFileDirectly(url, filename) {
    // 如果是 data URL 或 blob URL，直接创建链接下载
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
    }
    
    // 对于远程URL，使用fetch获取blob后下载
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 延迟释放blob URL
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
        // 如果fetch失败（如CORS问题），回退到直接链接方式
        console.warn('fetch下载失败，尝试直接链接:', err);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank'; // 在新窗口打开避免当前页面跳转
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// 清空所有历史
function clearAllHistory() {
    if (generationHistory.length === 0) {
        showToast('历史记录已为空');
        return;
    }
    
    if (confirm('确定要清空所有生成历史吗？此操作不可恢复。')) {
        generationHistory = [];
        saveGenerationHistory();
        historySelectedItems.clear();
        historySelectMode = false;
        updateHistorySelectUI();
        renderHistoryItems();
        showToast('已清空生成历史');
    }
}

// 关闭生成历史弹窗
function closeGenerationHistory() {
    document.getElementById('image-history-modal').classList.add('hidden');
    // 退出选择模式
    historySelectMode = false;
    historySelectedItems.clear();
}

// 全屏查看历史媒体 - 修改为返回时重新打开历史窗口
function viewHistoryMedia(url, type) {
    closeGenerationHistory();
    const mediaType = type === 'video' ? 'video' : 'image';
    // 使用新的函数，返回时重新打开历史窗口
    openChatMediaFullscreenWithCallback(url, mediaType, openGenerationHistory);
}

window.addGenerationToHistory = addGenerationToHistory;

// ==================== 保存/加载画布功能 ====================

// 保存画布到 JSON
function saveCanvasToJSON() {
    if (typeof CanvasNodeSystem === 'undefined') {
        showToast('画布系统未初始化', 'error');
        return;
    }
    
    const selectedIds = new Set();
    if (CanvasNodeSystem.selectedNodeId) {
        selectedIds.add(CanvasNodeSystem.selectedNodeId);
    }
    if (CanvasNodeSystem.selectedNodeIds && CanvasNodeSystem.selectedNodeIds.length > 0) {
        CanvasNodeSystem.selectedNodeIds.forEach(id => selectedIds.add(id));
    }
    const shouldSaveSelection = selectedIds.size > 0;
    const nodesToSave = shouldSaveSelection
        ? CanvasNodeSystem.nodes.filter(node => selectedIds.has(node.id))
        : CanvasNodeSystem.nodes;
    const connectionsToSave = shouldSaveSelection
        ? CanvasNodeSystem.connections.filter(conn => selectedIds.has(conn.from) && selectedIds.has(conn.to))
        : CanvasNodeSystem.connections;
    
    // 过滤分组：只保存包含被保存节点的分组
    const groupsToSave = shouldSaveSelection
        ? (CanvasNodeSystem.groups || []).filter(group => 
            group.nodeIds.some(id => selectedIds.has(id))
          ).map(group => ({
            ...group,
            nodeIds: group.nodeIds.filter(id => selectedIds.has(id))
          })).filter(group => group.nodeIds.length >= 2)
        : (CanvasNodeSystem.groups || []);
    
    const canvasData = {
        version: '1.4', // 升级版本号
        timestamp: new Date().toISOString(),
        nodes: nodesToSave.map(node => {
            // 基础节点数据 - 深拷贝确保不丢失任何属性
            const savedNode = JSON.parse(JSON.stringify(node));
            
            // 对于图片节点，确保保存原始尺寸
            if (node.type === 'image') {
                savedNode.origW = node.origW || node.width;
                savedNode.origH = node.origH || node.height;
                savedNode.name = node.name || 'image.png';
            }
            
            // 对于 AI 绘图节点，保存输入框中的当前值
            if (node.type === 'ai_draw') {
                const promptEl = document.getElementById(`prompt-${node.id}`);
                const ratioEl = document.getElementById(`ratio-${node.id}`);
                const resolutionEl = document.getElementById(`resolution-${node.id}`);
                
                if (promptEl) savedNode.prompt = promptEl.value || '';
                if (ratioEl) savedNode.aspectRatio = ratioEl.value || '1:1';
                if (resolutionEl) savedNode.resolution = resolutionEl.value || '1024x1024';
                savedNode.model = node.model || 'nano-banana-pro';
                savedNode.count = node.count || 1;
                
                // 确保保存 inputImages（参考图连接）
                if (node.inputImages && node.inputImages.length > 0) {
                    savedNode.inputImages = node.inputImages.map(img => ({
                        url: img.url,
                        nodeId: img.nodeId,
                        previewUrl: img.previewUrl
                    }));
                }
                
                // 保存结果图片
                savedNode.resultUrl = node.resultUrl || null;
                savedNode.resultImages = node.resultImages || [];
            }
            
            // 对于 AI 视频节点，保存输入框中的当前值
            if (node.type === 'ai_video') {
                const promptEl = document.getElementById(`vprompt-${node.id}`);
                const ratioEl = document.getElementById(`vratio-${node.id}`);
                const modelEl = document.getElementById(`vmodel-${node.id}`);
                const durationEl = document.getElementById(`vduration-${node.id}`);
                
                if (promptEl) savedNode.prompt = promptEl.value || '';
                if (ratioEl) savedNode.aspectRatio = ratioEl.value || '16:9';
                if (modelEl) {
                    savedNode.model = modelEl.value || savedNode.model || 'veo3.1';
                } else {
                    savedNode.model = node.model || 'veo3.1';
                }
                if (durationEl) {
                    savedNode.duration = Number(durationEl.value || savedNode.duration || 8);
                }
                savedNode.count = node.count || 1;
                
                // 确保保存 inputImages（参考图连接）
                if (node.inputImages && node.inputImages.length > 0) {
                    savedNode.inputImages = node.inputImages.map(img => ({
                        url: img.url,
                        nodeId: img.nodeId,
                        previewUrl: img.previewUrl
                    }));
                }
                
                // 保存结果视频
                savedNode.resultUrl = node.resultUrl || null;
                savedNode.resultVideos = node.resultVideos || [];
            }
            
            // 对于 AI TryLook 节点
            if (node.type === 'ai_trylook') {
                if (node.inputImages && node.inputImages.length > 0) {
                    savedNode.inputImages = node.inputImages.map(img => ({
                        url: img.url,
                        nodeId: img.nodeId,
                        previewUrl: img.previewUrl
                    }));
                }
            }
            
            // 对于局部迁移节点
            if (node.type === 'ai_local_transfer') {
                savedNode.prompt = node.prompt || '';
                savedNode.ltModel = node.ltModel || 'nano-banana-pro';
                savedNode.brushSize = node.brushSize || 28;
                savedNode.brushOpacity = node.brushOpacity || 0.45;
                savedNode.resultUrl = node.resultUrl || null;
                savedNode.resultImages = node.resultImages || [];
                savedNode.currentImageIndex = node.currentImageIndex || 0;
                savedNode.sourceImage = node.sourceImage || null;
                savedNode.maskDataUrl = node.maskDataUrl || null;
            }
            
            // 对于 RH 应用节点
            if (node.type === 'rh_app') {
                savedNode.rhAppId = node.rhAppId || '';
                savedNode.webappId = node.webappId || '';
                savedNode.appName = node.appName || 'RH应用';
                savedNode.workflowNodes = node.workflowNodes || [];
                savedNode.resultUrl = node.resultUrl || null;
                savedNode.resultImages = node.resultImages || [];
                savedNode.currentImageIndex = node.currentImageIndex || 0;
                if (node.inputImages && node.inputImages.length > 0) {
                    savedNode.inputImages = node.inputImages.map(img => ({
                        url: img.url,
                        nodeId: img.nodeId,
                        previewUrl: img.previewUrl
                    }));
                }
            }
            
            // 清理所有节点中的 blob: URL（导出后会失效）
            if (savedNode.url && savedNode.url.startsWith('blob:')) {
                console.warn('[保存] 节点', savedNode.id, '的 url 是 blob URL，导入后可能失效');
            }
            if (savedNode.inputImages) {
                savedNode.inputImages = savedNode.inputImages.filter(img => {
                    if (img.url && img.url.startsWith('blob:')) {
                        console.warn('[保存] 过滤掉 blob URL 参考图');
                        return false;
                    }
                    return true;
                });
            }
            
            return savedNode;
        }),
        connections: connectionsToSave,
        groups: groupsToSave,
        zoom: CanvasNodeSystem.zoom,
        offset: CanvasNodeSystem.offset
    };
    
    const jsonStr = JSON.stringify(canvasData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('画布已保存为 JSON 文件');
}

// 加载画布 JSON（合并到当前画布）
function loadCanvasFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            mergeCanvasData(data);
        } catch (err) {
            showToast('无法解析 JSON 文件: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// 处理导入画布JSON按钮
function handleCanvasJSONImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    loadCanvasFromJSON(file);
    // 清空input以允许重复选择同一文件
    event.target.value = '';
}

// 合并画布数据到当前画布
function mergeCanvasData(data) {
    if (typeof CanvasNodeSystem === 'undefined' || typeof createImageNode !== 'function') {
        showToast('画布系统未初始化', 'error');
        return;
    }
    
    if (!data.nodes || !Array.isArray(data.nodes)) {
        showToast('无效的画布数据', 'error');
        return;
    }
    
    // 计算偏移量，避免重叠
    const existingNodes = CanvasNodeSystem.nodes;
    let offsetX = 0;
    let offsetY = 0;
    if (existingNodes.length > 0) {
        const maxX = Math.max(...existingNodes.map(n => n.x + (n.width || 300)));
        offsetX = maxX + 100;
    }
    
    // 创建 ID 映射（旧ID -> 新ID）
    const idMap = {};
    let addedCount = 0;
    
    // 先创建所有节点
    data.nodes.forEach(node => {
        const newX = node.x + offsetX;
        const newY = node.y + offsetY;
        let newId = null;
        
        if (node.type === 'image') {
            if (node.url && typeof createImageNode === 'function') {
                newId = createImageNode(node.url, node.name || 'image.png', newX, newY);
                addedCount++;
            }
        } else if (node.type === 'ai_draw') {
            if (typeof createAIDrawNodeAtPos === 'function') {
                newId = createAIDrawNodeAtPos(newX, newY);
                const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
                if (newNode) {
                    newNode.prompt = node.prompt || '';
                    newNode.resultUrl = node.resultUrl || null;
                    newNode.resultImages = node.resultImages || [];
                    newNode.currentImageIndex = node.currentImageIndex || 0;
                    newNode.count = node.count || 1;
                    newNode.aspectRatio = node.aspectRatio || '1:1';
                    newNode.resolution = node.resolution || '1024x1024';
                    newNode.model = node.model || 'nano-banana-pro';
                    newNode.width = node.width || newNode.width;
                    newNode.height = node.height || newNode.height;
                    
                    // 延迟更新 DOM 元素
                    setTimeout(() => {
                        const promptEl = document.getElementById(`prompt-${newId}`);
                        const ratioEl = document.getElementById(`ratio-${newId}`);
                        const resolutionEl = document.getElementById(`resolution-${newId}`);
                        const countBtn = document.getElementById(`dcount-${newId}`);
                        
                        if (promptEl) promptEl.value = newNode.prompt;
                        if (ratioEl) ratioEl.value = newNode.aspectRatio;
                        if (resolutionEl) resolutionEl.value = newNode.resolution;
                        if (countBtn) countBtn.textContent = newNode.count + 'x';
                        
                        const nodeEl = document.getElementById(`node-${newId}`);
                        if (nodeEl && newNode.width && newNode.height) {
                            nodeEl.style.width = newNode.width + 'px';
                            nodeEl.style.height = newNode.height + 'px';
                        }
                        
                        // 恢复结果图片显示
                        const currentUrl = newNode.resultImages && newNode.resultImages.length > 0
                            ? newNode.resultImages[newNode.currentImageIndex || 0]
                            : newNode.resultUrl;
                        if (currentUrl) {
                            const previewEl = document.getElementById(`preview-${newId}`);
                            if (previewEl) {
                                const tempImg = new Image();
                                tempImg.onload = () => {
                                    previewEl.innerHTML = `<img src="${currentUrl}" class="w-full h-full object-cover"/>`;
                                };
                                tempImg.src = currentUrl;
                            }
                        }
                    }, 100);
                }
                addedCount++;
            }
        } else if (node.type === 'ai_video') {
            if (typeof createAIVideoNodeAtPos === 'function') {
                newId = createAIVideoNodeAtPos(newX, newY);
                const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
                if (newNode) {
                    newNode.prompt = node.prompt || '';
                    newNode.resultUrl = node.resultUrl || null;
                    newNode.resultVideos = node.resultVideos || [];
                    newNode.count = node.count || 1;
                    newNode.aspectRatio = node.aspectRatio || '16:9';
                    newNode.model = node.model || 'veo3.1';
                    newNode.duration = node.duration || 8;
                    newNode.width = node.width || newNode.width;
                    newNode.height = node.height || newNode.height;
                    
                    setTimeout(() => {
                        const promptEl = document.getElementById(`vprompt-${newId}`);
                        const ratioEl = document.getElementById(`vratio-${newId}`);
                        const modelEl = document.getElementById(`vmodel-${newId}`);
                        const durationEl = document.getElementById(`vduration-${newId}`);
                        const countBtn = document.getElementById(`vcount-${newId}`);
                        
                        if (promptEl) promptEl.value = newNode.prompt;
                        if (ratioEl) ratioEl.value = newNode.aspectRatio;
                        if (modelEl) modelEl.value = newNode.model;
                        if (durationEl) durationEl.value = newNode.duration;
                        if (countBtn) countBtn.textContent = newNode.count + 'x';
                    }, 100);
                }
                addedCount++;
            }
        } else if (node.type === 'ai_trylook') {
            if (typeof createAITryLookNodeAtPos === 'function') {
                newId = createAITryLookNodeAtPos(newX, newY);
                const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
                if (newNode) {
                    newNode.width = node.width || newNode.width;
                    newNode.height = node.height || newNode.height;
                }
                addedCount++;
            }
        } else if (node.type === 'ai_local_transfer') {
            if (typeof createLocalTransferNodeAtPos === 'function') {
                newId = createLocalTransferNodeAtPos(newX, newY);
                const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
                if (newNode) {
                    newNode.prompt = node.prompt || '';
                    newNode.ltModel = node.ltModel || 'nano-banana-pro';
                    newNode.brushSize = node.brushSize || 28;
                    newNode.brushOpacity = node.brushOpacity || 0.45;
                    newNode.resultUrl = node.resultUrl || null;
                    newNode.resultImages = node.resultImages || [];
                    newNode.currentImageIndex = node.currentImageIndex || 0;
                    newNode.width = node.width || newNode.width;
                    newNode.height = node.height || newNode.height;
                    // sourceImage 和 maskDataUrl 等需要图片数据，仅在有效时恢复
                    if (node.sourceImage && typeof node.sourceImage === 'string' && !node.sourceImage.startsWith('blob:')) {
                        newNode.sourceImage = node.sourceImage;
                    }
                    if (node.maskDataUrl && typeof node.maskDataUrl === 'string') {
                        newNode.maskDataUrl = node.maskDataUrl;
                    }
                }
                addedCount++;
            }
        } else if (node.type === 'rh_app') {
            if (typeof createRhAppNodeAtPos === 'function') {
                newId = createRhAppNodeAtPos(newX, newY, {
                    rhAppId: node.rhAppId || '',
                    webappId: node.webappId || '',
                    appName: node.appName || 'RH应用',
                    nodes: node.workflowNodes || []
                });
                const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
                if (newNode) {
                    newNode.resultUrl = node.resultUrl || null;
                    newNode.resultImages = node.resultImages || [];
                    newNode.currentImageIndex = node.currentImageIndex || 0;
                    newNode.width = node.width || newNode.width;
                    newNode.height = node.height || newNode.height;
                }
                addedCount++;
            }
        }
        
        if (newId) {
            idMap[node.id] = newId;
        }
    });
    
    // 恢复连接 - 直接添加到 connections 数组，不调用 addConnection（避免重复添加 inputImages）
    if (data.connections && Array.isArray(data.connections)) {
        data.connections.forEach(conn => {
            const newFromId = idMap[conn.from];
            const newToId = idMap[conn.to];
            if (newFromId && newToId) {
                const exists = CanvasNodeSystem.connections.some(c => c.from === newFromId && c.to === newToId);
                if (!exists) {
                    CanvasNodeSystem.connections.push({ from: newFromId, to: newToId });
                }
            }
        });
    }
    
    // 恢复 inputImages 并清理无效条目
    setTimeout(() => {
        data.nodes.forEach(oldNode => {
            const newId = idMap[oldNode.id];
            if (!newId) return;
            const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
            if (!newNode) return;
            
            if (oldNode.inputImages && oldNode.inputImages.length > 0) {
                // 映射旧节点ID到新节点ID，过滤掉源节点不存在的条目
                const validImages = oldNode.inputImages
                    .map(img => {
                        const newNodeId = img.nodeId ? idMap[img.nodeId] : null;
                        // 只保留源节点存在的条目
                        if (!newNodeId) return null;
                        // 过滤掉 blob: URL（导入后已失效）
                        let url = img.url;
                        if (url && url.startsWith('blob:')) {
                            // 尝试从源节点获取当前有效的 URL
                            const srcNode = CanvasNodeSystem.nodes.find(n => n.id === newNodeId);
                            if (srcNode) {
                                if (srcNode.type === 'image') {
                                    url = srcNode.url;
                                } else {
                                    url = (srcNode.resultImages && srcNode.resultImages.length > 0)
                                        ? srcNode.resultImages[srcNode.currentImageIndex || 0]
                                        : srcNode.resultUrl;
                                }
                            }
                            if (!url || url.startsWith('blob:')) return null;
                        }
                        return { url, nodeId: newNodeId, previewUrl: null };
                    })
                    .filter(Boolean);
                
                newNode.inputImages = validImages;
                
                if (newNode.type === 'ai_draw' && typeof updateAIDrawRefs === 'function') {
                    updateAIDrawRefs(newNode);
                }
                if (newNode.type === 'ai_video' && typeof updateAIVideoRefs === 'function') {
                    updateAIVideoRefs(newNode);
                }
                if (newNode.type === 'ai_trylook' && typeof updateAITryLookRefs === 'function') {
                    updateAITryLookRefs(newNode);
                }
                if (newNode.type === 'rh_app' && typeof updateRhAppRefs === 'function') {
                    updateRhAppRefs(newNode);
                }
            }
        });
        
        // 重新渲染连接线
        if (typeof renderConnections === 'function') {
            renderConnections();
        }
        if (typeof updatePortConnectionStatus === 'function') {
            updatePortConnectionStatus();
        }
    }, 300);
    
    // 恢复分组
    if (data.groups && Array.isArray(data.groups) && typeof createNodeGroup === 'function') {
        setTimeout(() => {
            data.groups.forEach(group => {
                // 映射旧节点ID到新节点ID
                const mappedNodeIds = group.nodeIds
                    .map(oldId => idMap[oldId])
                    .filter(Boolean);
                
                if (mappedNodeIds.length >= 2) {
                    const nodes = mappedNodeIds
                        .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
                        .filter(Boolean);
                    
                    if (nodes.length >= 2) {
                        const newGroupId = createNodeGroup(nodes, group.colorKey || 'blue');
                        // 恢复分组名称
                        if (newGroupId) {
                            const newGroup = CanvasNodeSystem.groups.find(g => g.id === newGroupId);
                            if (newGroup && group.name) {
                                newGroup.name = group.name;
                                // 更新UI中的名称输入框
                                const nameInput = document.querySelector(`#group-panel-${newGroupId} .group-name-input`);
                                if (nameInput) nameInput.value = group.name;
                            }
                        }
                    }
                }
            });
        }, 300);
    }
    
    showToast(`已加载 ${addedCount} 个节点到画布`);
}

// 处理画布区域的文件拖放 - 仅处理JSON文件
// 注意：图片文件的拖放由 canvas-nodes.js 的 onDrop 函数处理
function setupCanvasFileDrop() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    
    // 只添加 dragover 处理，drop 由 canvas-nodes.js 统一处理
    // canvas-nodes.js 会调用 loadCanvasFromJSON 处理 JSON 文件
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadGenerationHistory();
    setTimeout(setupCanvasFileDrop, 500);
});

// ==================== RunningHub 弹窗控制 ====================
function openRhPanel() {
    const mask = document.getElementById('rh-panel-mask');
    if (mask) mask.classList.remove('hidden');
    syncRunningHubApiKey();
}

function closeRhPanel() {
    const mask = document.getElementById('rh-panel-mask');
    if (mask) mask.classList.add('hidden');
}

window.openRhPanel = openRhPanel;
window.closeRhPanel = closeRhPanel;

