/**
 * 画布节点系统 v3 - 修复版
 */

// ==================== 动态模型配置 ====================
// 模型缓存（从积分系统后端获取）
let _imageModelsCache = null;
let _videoModelsCache = null;
let _modelsLoaded = false;

// 默认模型列表（后端加载失败时使用）
const DEFAULT_IMAGE_MODELS = [
    { model_id: 'nano-banana-pro', display_name: '🍌 Nano-banana-pro' },
    { model_id: 'nano-banana-2', display_name: '🍌 Nano-banana-2' },
    { model_id: 'gpt-image-1.5', display_name: '🎨 GPT-Image-1.5' },
    { model_id: 'midjourney', display_name: '🖼️ MidJourney' },
    { model_id: 'gemini-imagen', display_name: '✨ Gemini Imagen' }
];

const DEFAULT_VIDEO_MODELS = [
    { model_id: 'veo3.1', display_name: 'Veo 3.1' },
    { model_id: 'kling-video-o1', display_name: 'Kling O1' },
    { model_id: 'kling-video-v2-5-turbo', display_name: 'Kling 2.5 Turbo' },
    { model_id: 'kling-video-v2-6', display_name: 'Kling 2.6' },
    { model_id: 'sora-2', display_name: 'Sora 2' },
    { model_id: 'sora-2-pro', display_name: 'Sora 2 Pro' }
];

// 从积分系统加载模型列表
async function loadModelsFromPricing() {
    if (_modelsLoaded) return;
    
    try {
        // 检查是否有积分系统的加载函数
        if (typeof loadPricingConfig === 'function') {
            const pricingList = await loadPricingConfig();
            
            if (pricingList && pricingList.length > 0) {
                // 筛选图片生成模型
                _imageModelsCache = pricingList
                    .filter(p => p.feature_type === 'image' && p.enabled !== false)
                    .map(p => ({
                        model_id: p.model_id,
                        display_name: p.display_name || p.model_id,
                        points_cost: p.points_cost
                    }));
                
                // 筛选视频生成模型
                _videoModelsCache = pricingList
                    .filter(p => p.feature_type === 'video' && p.enabled !== false)
                    .map(p => ({
                        model_id: p.model_id,
                        display_name: p.display_name || p.model_id,
                        points_cost: p.points_cost
                    }));
                
                // 去重（同一个 model_id 可能有多个 param_key）
                _imageModelsCache = [...new Map(_imageModelsCache.map(m => [m.model_id, m])).values()];
                _videoModelsCache = [...new Map(_videoModelsCache.map(m => [m.model_id, m])).values()];
                
                console.log('[Canvas] 从积分系统加载模型:', 
                    _imageModelsCache.length, '个图片模型,',
                    _videoModelsCache.length, '个视频模型');
            }
        }
    } catch (e) {
        console.warn('[Canvas] 加载模型列表失败，使用默认列表:', e);
    }
    
    // 如果没有加载到，使用默认列表
    if (!_imageModelsCache || _imageModelsCache.length === 0) {
        _imageModelsCache = DEFAULT_IMAGE_MODELS;
    } else {
        // 确保默认模型始终存在（后端可能未配置）
        for (const dm of DEFAULT_IMAGE_MODELS) {
            if (!_imageModelsCache.some(m => m.model_id === dm.model_id)) {
                _imageModelsCache.push(dm);
            }
        }
    }
    if (!_videoModelsCache || _videoModelsCache.length === 0) {
        _videoModelsCache = DEFAULT_VIDEO_MODELS;
    }
    
    _modelsLoaded = true;
}

// 获取图片模型列表
function getImageModels() {
    return _imageModelsCache || DEFAULT_IMAGE_MODELS;
}

// 获取视频模型列表
function getVideoModels() {
    return _videoModelsCache || DEFAULT_VIDEO_MODELS;
}

// 生成模型选择器的 HTML options
function renderModelOptions(models, selectedModel, defaultModel) {
    return models.map(m => {
        const isSelected = m.model_id === selectedModel || (!selectedModel && m.model_id === defaultModel);
        return `<option value="${m.model_id}" ${isSelected ? 'selected' : ''}>${m.display_name}</option>`;
    }).join('');
}

// 刷新所有绘图节点的模型选择器
function refreshAllDrawModelSelectors() {
    const imageModels = getImageModels();
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === NODE_TYPES.AI_DRAW) {
            const selectEl = document.getElementById(`draw-model-${node.id}`);
            if (selectEl) {
                const currentValue = selectEl.value;
                selectEl.innerHTML = renderModelOptions(imageModels, currentValue, 'nano-banana-pro');
            }
        }
    });
}

// 刷新所有视频节点的模型选择器
function refreshAllVideoModelSelectors() {
    const videoModels = getVideoModels();
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === NODE_TYPES.AI_VIDEO) {
            const selectEl = document.getElementById(`vmodel-${node.id}`);
            if (selectEl) {
                const currentValue = selectEl.value;
                selectEl.innerHTML = renderModelOptions(videoModels, currentValue, 'veo3.1');
            }
        }
    });
}

// 刷新模型列表（可供外部调用）
async function refreshModelLists() {
    _modelsLoaded = false;
    await loadModelsFromPricing();
    refreshAllDrawModelSelectors();
    refreshAllVideoModelSelectors();
    console.log('[Canvas] 模型列表已刷新');
}

// ==================== 全局状态 ====================
const CanvasNodeSystem = {
    nodes: [],
    connections: [],
    selectedNodeId: null,
    selectedNodeIds: [], // 多选节点ID列表
    nodeIdCounter: 0,
    undoStack: [],
    undoLimit: 10,
    
    // 画布状态
    zoom: 1,
    offset: { x: 0, y: 0 },
    
    // 操作状态
    mode: null, // 'drag_canvas', 'drag_node', 'resize_node', 'connect', 'box_select'
    activeData: {},
    
    // 待连接信息
    pendingConnectionFrom: null,
    
    // 键盘状态
    spacePressed: false,
    
    // 剪贴板
    clipboard: [],
    portHideTimers: {},
    lastDragAt: 0,
    
    // 节点分组
    groups: [],
    groupIdCounter: 0
};

const NODE_TYPES = { IMAGE: 'image', AI_DRAW: 'ai_draw', AI_VIDEO: 'ai_video', AI_TRYLOOK: 'ai_trylook', AI_LOCAL_TRANSFER: 'ai_local_transfer', RH_APP: 'rh_app' };

// ==================== 性能优化：帧节流 ====================
let _rafPending = false;
let _rafCallbacks = [];

function scheduleRender(callback) {
    _rafCallbacks.push(callback);
    if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => {
            _rafPending = false;
            const callbacks = _rafCallbacks;
            _rafCallbacks = [];
            callbacks.forEach(fn => fn());
        });
    }
}

// 节流版 renderConnections，每帧最多执行一次
let _connectionsNeedRender = false;
function scheduleRenderConnections() {
    if (_connectionsNeedRender) return;
    _connectionsNeedRender = true;
    scheduleRender(() => {
        _connectionsNeedRender = false;
        renderConnections();
    });
}

let _initialized = false;
// 运行态锁：仅在当前会话真实生成中时锁定输入，避免历史状态导致无法输入
const _img2imgGenerating = new Set();

function captureCanvasState() {
    return {
        nodes: JSON.parse(JSON.stringify(CanvasNodeSystem.nodes)),
        connections: JSON.parse(JSON.stringify(CanvasNodeSystem.connections)),
        selectedNodeId: CanvasNodeSystem.selectedNodeId,
        selectedNodeIds: JSON.parse(JSON.stringify(CanvasNodeSystem.selectedNodeIds || [])),
        nodeIdCounter: CanvasNodeSystem.nodeIdCounter,
        groups: JSON.parse(JSON.stringify(CanvasNodeSystem.groups || [])),
        groupIdCounter: CanvasNodeSystem.groupIdCounter
    };
}

function pushUndoState(state) {
    if (!state) return;
    CanvasNodeSystem.undoStack.push(state);
    if (CanvasNodeSystem.undoStack.length > CanvasNodeSystem.undoLimit) {
        CanvasNodeSystem.undoStack.shift();
    }
}

function applyCanvasState(state) {
    if (!state) return;
    CanvasNodeSystem.nodes = JSON.parse(JSON.stringify(state.nodes || []));
    CanvasNodeSystem.connections = JSON.parse(JSON.stringify(state.connections || []));
    CanvasNodeSystem.selectedNodeId = state.selectedNodeId || null;
    CanvasNodeSystem.selectedNodeIds = JSON.parse(JSON.stringify(state.selectedNodeIds || []));
    CanvasNodeSystem.nodeIdCounter = state.nodeIdCounter || CanvasNodeSystem.nodeIdCounter;
    CanvasNodeSystem.groups = JSON.parse(JSON.stringify(state.groups || []));
    CanvasNodeSystem.groupIdCounter = state.groupIdCounter || CanvasNodeSystem.groupIdCounter;

    // 清理 UI
    removeMultiSelectToolbar();
    ['selection-ui', 'sel-info', 'sel-toolbar', 'sel-panel', 'text-edit-panel', 'crop-panel', 'local-transfer-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    document.querySelectorAll('.crop-overlay').forEach(el => el.remove());
    document.querySelectorAll('.local-transfer-overlay').forEach(el => el.remove());
    // 清理分组UI
    document.querySelectorAll('.node-group').forEach(el => el.remove());

    // 重新渲染节点
    const nodesLayer = document.getElementById('nodes-layer');
    if (nodesLayer) nodesLayer.innerHTML = '';
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === NODE_TYPES.IMAGE) renderImageNode(node);
        if (node.type === NODE_TYPES.AI_DRAW) renderAIDrawNode(node);
        if (node.type === NODE_TYPES.AI_VIDEO) renderAIVideoNode(node);
        if (node.type === NODE_TYPES.AI_TRYLOOK) renderAITryLookNode(node);
        if (node.type === NODE_TYPES.RH_APP && typeof renderRhAppNode === 'function') renderRhAppNode(node);
        if (node.type === NODE_TYPES.AI_LOCAL_TRANSFER) renderLocalTransferNode(node);
    });

    renderConnections();
    updatePortConnectionStatus();

    // 生成预览缩略图（仅用于显示，避免反复加载大图）
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === NODE_TYPES.IMAGE) ensureImageNodePreview(node);
        if (node.inputImages && node.inputImages.length > 0) {
            node.inputImages.forEach(entry => ensureInputImagePreview(node, entry));
        }
    });

    // 恢复分组
    if (typeof renderAllGroups === 'function') {
        renderAllGroups();
    }

    // 恢复选中状态
    if (CanvasNodeSystem.selectedNodeIds.length >= 2) {
        const nodes = CanvasNodeSystem.selectedNodeIds
            .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
            .filter(Boolean);
        showMultiSelectToolbar(nodes);
        highlightSelectedNodes(nodes);
    } else if (CanvasNodeSystem.selectedNodeId) {
        selectCanvasNode(CanvasNodeSystem.selectedNodeId);
    }
}

function undoLastAction() {
    const state = CanvasNodeSystem.undoStack.pop();
    if (!state) return;
    applyCanvasState(state);
}

async function compressReferenceImage(dataUrl, maxSide = 1024, quality = 0.82) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
    if (dataUrl.length < 600000) return dataUrl;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const targetW = Math.max(1, Math.round(img.width * scale));
            const targetH = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
        const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
        // 使用 PNG 避免 JPEG 重编码导致的色偏
        resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('参考图加载失败'));
        img.src = dataUrl;
    });
}

async function normalizeVideoReferenceImages(images) {
    const normalized = [];
    for (const img of images) {
        if (!img) continue;
        // 不做本地重编码，避免色偏；仅将 dataURL 转为 blob URL 以降低内存占用
        const normalizedUrl = normalizeCanvasImageUrl(img);
        normalized.push(normalizedUrl);
    }
    return normalized;
}

function appendSuffixToFilename(name, suffix) {
    const safe = (name || 'image.png').trim();
    const match = safe.match(/^(.*?)(\.[a-z0-9]+)$/i);
    if (!match) return safe + suffix;
    return match[1] + suffix + match[2];
}

function ensureFilenameExt(name, mimeType) {
    const safe = (name || 'image.png').trim();
    if (/\.[a-z0-9]{1,6}$/i.test(safe)) return safe;
    let ext = 'png';
    if (mimeType === 'image/jpeg') ext = 'jpg';
    if (mimeType === 'image/webp') ext = 'webp';
    return `${safe}.${ext}`;
}

const IMAGE_PREVIEW_MAX_SIDE = 320;
const REF_PREVIEW_MAX_SIDE = 120;

function createPreviewFromImageElement(img, maxSide = IMAGE_PREVIEW_MAX_SIDE) {
    if (!img || !img.width || !img.height) return null;
    if (img.width <= maxSide && img.height <= maxSide) return null;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    try {
        return canvas.toDataURL('image/png');
    } catch (err) {
        return null;
    }
}

function createPreviewFromUrl(url, maxSide = REF_PREVIEW_MAX_SIDE) {
    return new Promise(resolve => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(createPreviewFromImageElement(img, maxSide));
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function ensureImageNodePreview(node, maxSide = IMAGE_PREVIEW_MAX_SIDE) {
    if (!node || node.previewUrl || !node.url) return;
    createPreviewFromUrl(node.url, maxSide).then(preview => {
        if (!preview) return;
        if (node.previewUrl) return;
        node.previewUrl = preview;
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
            const imgEl = el.querySelector('img');
            if (imgEl) imgEl.src = preview;
        }
    });
}

function ensureInputImagePreview(node, entry, maxSide = REF_PREVIEW_MAX_SIDE) {
    if (!node || !entry || entry.previewUrl || !entry.url) return;
    createPreviewFromUrl(entry.url, maxSide).then(preview => {
        if (!preview) return;
        const targetNode = CanvasNodeSystem.nodes.find(n => n.id === node.id);
        if (!targetNode || !targetNode.inputImages) return;
        const targetEntry = targetNode.inputImages.find(img => img === entry || (img.nodeId === entry.nodeId && img.url === entry.url));
        if (!targetEntry || targetEntry.previewUrl) return;
        targetEntry.previewUrl = preview;
        if (targetNode.type === NODE_TYPES.AI_DRAW) updateAIDrawRefs(targetNode);
        if (targetNode.type === NODE_TYPES.AI_VIDEO) updateAIVideoRefs(targetNode);
        if (targetNode.type === NODE_TYPES.AI_TRYLOOK) updateAITryLookRefs(targetNode);
        if (targetNode.type === NODE_TYPES.RH_APP && typeof updateRhAppRefs === 'function') updateRhAppRefs(targetNode);
    });
}

// ==================== 内存优化：对象URL管理 ====================
const canvasObjectUrlRegistry = new Set();

function isCanvasBlobUrl(url) {
    return typeof url === 'string' && url.startsWith('blob:');
}

function isCanvasDataUrl(url) {
    return typeof url === 'string' && url.startsWith('data:');
}

function trackCanvasObjectUrl(url) {
    if (isCanvasBlobUrl(url)) canvasObjectUrlRegistry.add(url);
}

function revokeCanvasObjectUrl(url) {
    if (isCanvasBlobUrl(url)) {
        URL.revokeObjectURL(url);
        canvasObjectUrlRegistry.delete(url);
    }
}

function dataUrlToBlobLocal(dataUrl) {
    if (typeof dataURLtoBlob === 'function') return dataURLtoBlob(dataUrl);
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

function normalizeCanvasImageUrl(url) {
    if (!url) return url;
    if (isCanvasDataUrl(url)) {
        try {
            const blob = dataUrlToBlobLocal(url);
            const objectUrl = URL.createObjectURL(blob);
            trackCanvasObjectUrl(objectUrl);
            return objectUrl;
        } catch (e) {
            return url;
        }
    }
    trackCanvasObjectUrl(url);
    return url;
}

// ==================== 初始化 ====================
function initCanvasNodeSystem() {
    if (_initialized) {
        console.log('[Canvas] 已初始化，跳过');
        return;
    }
    
    const container = document.getElementById('canvas-container');
    const content = document.getElementById('canvas-content');
    
    if (!container) {
        console.error('[Canvas] 初始化失败: canvas-container 不存在');
        return;
    }
    if (!content) {
        console.error('[Canvas] 初始化失败: canvas-content 不存在');
        return;
    }
    
    _initialized = true;
    
    // 创建SVG层
    let svg = document.getElementById('connections-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'connections-svg';
        svg.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible;');
        content.appendChild(svg);
        console.log('[Canvas] 创建了 connections-svg');
    }
    
    // 创建节点层
    let nodes = document.getElementById('nodes-layer');
    if (!nodes) {
        nodes = document.createElement('div');
        nodes.id = 'nodes-layer';
        nodes.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:10;');
        content.appendChild(nodes);
        console.log('[Canvas] 创建了 nodes-layer');
    }
    
    // 设置容器可聚焦
    container.setAttribute('tabindex', '0');
    container.style.outline = 'none';
    
    // 绑定事件
    container.onwheel = onWheel;
    container.onmousedown = (e) => {
        // 点击UI控件（输入框、按钮等）时不要抢占焦点
        if (e.target.closest('#text-edit-panel') || e.target.closest('#crop-panel') || e.target.closest('#local-transfer-panel') ||
            e.target.closest('#view-angle-panel') ||
            e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
            // 不抢占焦点，直接处理
        } else {
            container.focus();
        }
        onMouseDown(e);
    };
    container.ondblclick = onDoubleClick;
    container.ondragover = e => e.preventDefault();
    container.ondrop = onDrop;
    
    document.onmousemove = onMouseMove;
    document.onmouseup = onMouseUp;
    
    // 键盘事件 - 只绑定到 window（使用捕获阶段避免重复触发）
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    
    console.log('[Canvas] ✅ 初始化完成');
    console.log('[Canvas] container:', container);
    console.log('[Canvas] content:', content);
    console.log('[Canvas] nodes-layer:', nodes);
    
    // 异步加载模型列表（不阻塞初始化）
    loadModelsFromPricing().then(() => {
        console.log('[Canvas] 模型列表加载完成');
    });
}

// ==================== 事件处理 ====================
function onWheel(e) {
    // 如果鼠标在文本输入框内，让滚轮只滚动文字，不缩放画布
    const target = e.target;
    // 只有当鼠标直接在 textarea 或 input 上时才阻止缩放
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        // 不阻止默认行为，让文本框正常滚动
        e.stopPropagation();
        return;
    }
    
    // 检查是否在可滚动的面板内（如模板列表）
    const scrollablePanel = target.closest('#templates-list-' + (CanvasNodeSystem.selectedNodeIds?.[0] || '')) ||
                           target.closest('#recent-workflows-popup') ||
                           target.closest('#favorite-workflows-popup');
    if (scrollablePanel) {
        e.stopPropagation();
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const oldZoom = CanvasNodeSystem.zoom;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    CanvasNodeSystem.zoom = Math.max(0.2, Math.min(4, oldZoom + delta));
    
    const ratio = CanvasNodeSystem.zoom / oldZoom;
    CanvasNodeSystem.offset.x = mx - (mx - CanvasNodeSystem.offset.x) * ratio;
    CanvasNodeSystem.offset.y = my - (my - CanvasNodeSystem.offset.y) * ratio;
    
    applyTransform();
}

function onMouseDown(e) {
    const container = document.getElementById('canvas-container');

    // 首先检查是否点击了选中UI中的交互元素（按钮、输入框等）
    // 如果是，直接返回让原生事件处理
    if (e.target.closest('#sel-toolbar') || e.target.closest('#sel-panel') ||
        e.target.closest('#text-edit-panel') || e.target.closest('#crop-panel') || e.target.closest('#local-transfer-panel') ||
        e.target.closest('.crop-overlay') || e.target.closest('.local-transfer-overlay') || e.target.closest('#marker-panel') ||
        e.target.closest('.lt-crop-overlay') || e.target.closest('.lt-brush-overlay') || e.target.closest('.lt-crop-toolbar') || e.target.closest('.lt-brush-toolbar') ||
        e.target.closest('button') || e.target.closest('input') ||
        e.target.closest('textarea') || e.target.closest('select')) {
        console.log('[Canvas] 点击了UI控件，不处理');
        return; // 让按钮的onclick正常触发
    }
    
    // ★★★ 标记模式拦截：如果当前处于标记模式，点击图片区域放置标记 ★★★
    if (_markerState.active && _markerState.nodeId) {
        const markerNodeEl = e.target.closest('.canvas-node');
        if (markerNodeEl && markerNodeEl.dataset.nodeId === _markerState.nodeId) {
            const nodeBody = markerNodeEl.querySelector('.node-body');
            // 确认点击在 node-body 内部（图片区域）
            if (nodeBody && (e.target === nodeBody || nodeBody.contains(e.target))) {
                // 排除标记点本身的点击
                if (!e.target.closest('.marker-pin')) {
                    e.preventDefault();
                    e.stopPropagation();
                    placeMarker(_markerState.nodeId, e);
                    return;
                }
            }
        }
    }
    
    // 检查点击目标
    const nodeEl = e.target.closest('.canvas-node');
    
    if (nodeEl) {
        const nodeId = nodeEl.dataset.nodeId;
        const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // 点击连接端口
        const port = e.target.closest('.node-port');
        if (port) {
            e.preventDefault();
            e.stopPropagation();
            selectCanvasNode(nodeId);
            CanvasNodeSystem.mode = 'connect';
            CanvasNodeSystem.activeData = { fromId: nodeId, fromPort: port.dataset.port };
            createTempLine();
            highlightPorts(nodeId);
            return;
        }
        
        // 点击缩放角
        const corner = e.target.closest('.resize-corner');
        if (corner) {
            e.preventDefault();
            e.stopPropagation();
            const undoSnapshot = captureCanvasState();
            CanvasNodeSystem.mode = 'resize_node';
            CanvasNodeSystem.activeData = {
                nodeId: nodeId,
                corner: corner.dataset.corner,
                startX: e.clientX,
                startY: e.clientY,
                startW: node.width,
                startH: node.height,
                startNodeX: node.x,
                startNodeY: node.y,
                undoSnapshot
            };
            return;
        }
        
        // 多选情况下拖拽任意已选节点，整体移动
        const hasMultiSelection = CanvasNodeSystem.selectedNodeIds && CanvasNodeSystem.selectedNodeIds.length > 1;
        if (hasMultiSelection && CanvasNodeSystem.selectedNodeIds.includes(nodeId)) {
            e.preventDefault();
            e.stopPropagation();
            const undoSnapshot = captureCanvasState();
            CanvasNodeSystem.mode = 'drag_multi';
            CanvasNodeSystem.activeData = {
                startX: e.clientX,
                startY: e.clientY,
                nodes: CanvasNodeSystem.selectedNodeIds.map(id => {
                    const n = CanvasNodeSystem.nodes.find(node => node.id === id);
                    return n ? { id: n.id, startX: n.x, startY: n.y } : null;
                }).filter(Boolean),
                undoSnapshot
            };
            return;
        }

        // 选中节点（只有在点击节点主体时才选中）
        selectCanvasNode(nodeId);
        
        // 拖拽节点
        e.preventDefault();
        e.stopPropagation();
        const undoSnapshot = captureCanvasState();
        CanvasNodeSystem.mode = 'drag_node';
        CanvasNodeSystem.activeData = {
            nodeId: nodeId,
            startX: e.clientX,
            startY: e.clientY,
            startNodeX: node.x,
            startNodeY: node.y,
            undoSnapshot
        };
        return;
    }
    
    // 点击空白区域
    // 按住 Shift 开始框选
    if (e.shiftKey && e.button === 0) {
        e.preventDefault();
        CanvasNodeSystem.mode = 'box_select';
        
        const rect = container.getBoundingClientRect();
        CanvasNodeSystem.activeData = {
            startScreenX: e.clientX,
            startScreenY: e.clientY,
            startX: (e.clientX - rect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom,
            startY: (e.clientY - rect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom
        };
        
        // 创建框选矩形
        createSelectionRect(e.clientX, e.clientY);
        return;
    }
    
    // 默认 - 拖拽画布（或按住空格）
    // 如果有功能面板（文字编辑/裁切/视角/标记）打开，保持节点选中，仅平移画布
    const hasActivePanel = document.getElementById('text-edit-panel') ||
                           document.getElementById('crop-panel') ||
                           document.getElementById('local-transfer-panel') ||
                           document.getElementById('view-angle-panel') ||
                           document.getElementById('marker-panel');
    if (!hasActivePanel) {
        deselectAllNodes();
        clearMultiSelection();
    }
    
    // 关闭所有弹出的面板（提示词模板库、最近使用、收藏等）
    closeAllPopups();
    
    e.preventDefault();
    CanvasNodeSystem.mode = 'drag_canvas';
    CanvasNodeSystem.activeData = {
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: CanvasNodeSystem.offset.x,
        startOffsetY: CanvasNodeSystem.offset.y
    };
    container.style.cursor = 'grabbing';
}

// 关闭所有弹出面板
function closeAllPopups() {
    // 关闭提示词模板面板（绘图节点）
    document.querySelectorAll('[id^="prompt-templates-panel-"]').forEach(p => p.remove());
    // 关闭视频提示词模板面板
    document.querySelectorAll('[id^="video-templates-panel-"]').forEach(p => p.remove());
    // 关闭最近使用工作流弹窗
    const recentPopup = document.getElementById('recent-workflows-popup');
    if (recentPopup) recentPopup.remove();
    // 关闭收藏工作流弹窗
    const favoritePopup = document.getElementById('favorite-workflows-popup');
    if (favoritePopup) favoritePopup.remove();
    // 移除外部点击监听器
    document.removeEventListener('click', closeRecentOnOutsideClick);
    document.removeEventListener('click', closeFavoriteOnOutsideClick);
}

function onMouseMove(e) {
    if (!CanvasNodeSystem.mode) return;
    
    const data = CanvasNodeSystem.activeData;
    const zoom = CanvasNodeSystem.zoom;
    
    if (CanvasNodeSystem.mode === 'drag_canvas') {
        CanvasNodeSystem.offset.x = data.startOffsetX + (e.clientX - data.startX);
        CanvasNodeSystem.offset.y = data.startOffsetY + (e.clientY - data.startY);
        applyTransform();
    }
    
    if (CanvasNodeSystem.mode === 'drag_node') {
        const node = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
        if (node) {
            let newX = data.startNodeX + (e.clientX - data.startX) / zoom;
            let newY = data.startNodeY + (e.clientY - data.startY) / zoom;
            
            // 对齐检测和吸附
            const snapResult = checkAlignment(node, newX, newY);
            node.x = snapResult.x;
            node.y = snapResult.y;
            
            // 显示对齐线
            showAlignmentGuides(snapResult.guides);
            
            const el = document.getElementById(`node-${node.id}`);
            if (el) {
                el.style.left = node.x + 'px';
                el.style.top = node.y + 'px';
            }
            scheduleRenderConnections();
            updateSelectionUIPosition(node);
        }
    }

    if (CanvasNodeSystem.mode === 'drag_multi') {
        const deltaX = (e.clientX - data.startX) / zoom;
        const deltaY = (e.clientY - data.startY) / zoom;
        data.nodes.forEach(item => {
            const node = CanvasNodeSystem.nodes.find(n => n.id === item.id);
            if (!node) return;
            node.x = item.startX + deltaX;
            node.y = item.startY + deltaY;
            const el = document.getElementById(`node-${node.id}`);
            if (el) {
                el.style.left = node.x + 'px';
                el.style.top = node.y + 'px';
            }
        });
        scheduleRenderConnections();
        if (CanvasNodeSystem.selectedNodeIds.length >= 2) {
            const nodes = CanvasNodeSystem.selectedNodeIds
                .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
                .filter(Boolean);
            showMultiSelectToolbar(nodes);
            highlightSelectedNodes(nodes);
        }
    }
    
    if (CanvasNodeSystem.mode === 'resize_node') {
        const node = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
        if (node) {
            const dx = (e.clientX - data.startX) / zoom;
            const dy = (e.clientY - data.startY) / zoom;
            
            if (node.type === NODE_TYPES.IMAGE) {
                // 图片节点保持比例缩放
            const aspect = data.startW / data.startH;
            
            let newW = data.startW, newH = data.startH;
            let newX = data.startNodeX, newY = data.startNodeY;
            
            if (data.corner === 'se') {
                newW = Math.max(80, data.startW + dx);
                newH = newW / aspect;
            } else if (data.corner === 'sw') {
                newW = Math.max(80, data.startW - dx);
                newH = newW / aspect;
                newX = data.startNodeX + data.startW - newW;
            } else if (data.corner === 'ne') {
                newW = Math.max(80, data.startW + dx);
                newH = newW / aspect;
                newY = data.startNodeY + data.startH - newH;
            } else if (data.corner === 'nw') {
                newW = Math.max(80, data.startW - dx);
                newH = newW / aspect;
                newX = data.startNodeX + data.startW - newW;
                newY = data.startNodeY + data.startH - newH;
            }
            
            node.width = newW;
            node.height = newH;
            node.x = newX;
            node.y = newY;
            
            updateImageNodeDisplay(node);
            } else if (node.type === NODE_TYPES.AI_DRAW || node.type === NODE_TYPES.AI_VIDEO || node.type === NODE_TYPES.AI_TRYLOOK || node.type === NODE_TYPES.RH_APP) {
                // AI节点的缩放（保持最小尺寸）
                const minWidth = 300;
                const minHeight = 280;
                
                let newW = Math.max(minWidth, data.startW + dx);
                let newH = Math.max(minHeight, data.startH + (dx * 0.75)); // 保持一定比例
                
                node.width = newW;
                node.height = newH;
                
                updateAINodeDisplay(node);
            }
            
            scheduleRenderConnections();
        }
    }
    
    if (CanvasNodeSystem.mode === 'connect') {
        updateTempLine(e);
    }
    
    if (CanvasNodeSystem.mode === 'box_select') {
        updateSelectionRect(e);
    }
}

function onMouseUp(e) {
    const container = document.getElementById('canvas-container');
    if (container) container.style.cursor = '';
    
    // 清除对齐线
    clearAlignmentGuides();
    
    if (CanvasNodeSystem.mode === 'connect') {
        const fromId = CanvasNodeSystem.activeData.fromId;
        const fromPort = CanvasNodeSystem.activeData.fromPort;
        
        // 检查是否连接到目标端口
        const targetPort = e.target.closest('.node-port, .connect-port, .floating-port');
        if (targetPort && (targetPort.classList.contains('can-connect-target') || targetPort.classList.contains('can-connect'))) {
            // 优先从端口的 data-node-id 获取节点ID
            let toId = targetPort.dataset.nodeId;
            if (!toId) {
                const targetNode = targetPort.closest('.canvas-node');
                if (targetNode) toId = targetNode.dataset.nodeId;
            }
            if (toId && fromId !== toId) {
                if (fromPort === 'left') {
                    // 从左侧端口（输入端口）开始拖拽 - 反向连接
                    // toId 是源节点，fromId 是目标节点
                    addConnection(toId, fromId);
                } else {
                    // 从右侧端口（输出端口）开始拖拽 - 正常连接
                    addConnection(fromId, toId);
                }
            }
        } else {
            // 没有连接到目标端口 - 检查是否在空白画布上
            const clickedNode = e.target.closest('.canvas-node');
            const clickedUI = e.target.closest('#add-node-menu, #sel-toolbar, #sel-panel, button');
            
            if (!clickedNode && !clickedUI) {
                // 在空白画布上松开 - 弹出添加节点菜单并自动连接
                const rect = container.getBoundingClientRect();
                const canvasX = (e.clientX - rect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
                const canvasY = (e.clientY - rect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
                
                // 显示添加节点菜单，带有自动连接信息
                showAddNodeMenuWithConnection(e.clientX, e.clientY, canvasX, canvasY, fromId, fromPort);
            }
        }
        removeTempLine();
        unhighlightPorts();
    }
    
    if (CanvasNodeSystem.mode === 'box_select') {
        finishBoxSelect(e);
    }

    if (CanvasNodeSystem.mode === 'drag_node') {
        const data = CanvasNodeSystem.activeData;
        const node = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
        if (node && data.undoSnapshot) {
            const moved = node.x !== data.startNodeX || node.y !== data.startNodeY;
            if (moved) pushUndoState(data.undoSnapshot);
            if (moved) CanvasNodeSystem.lastDragAt = Date.now();
            // 更新分组包围盒
            if (moved && typeof updateGroupsForNode === 'function') {
                updateGroupsForNode(data.nodeId);
            }
        }
    }

    if (CanvasNodeSystem.mode === 'resize_node') {
        const data = CanvasNodeSystem.activeData;
        const node = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
        if (node && data.undoSnapshot) {
            const resized = node.width !== data.startW || node.height !== data.startH ||
                node.x !== data.startNodeX || node.y !== data.startNodeY;
            if (resized) pushUndoState(data.undoSnapshot);
            // 更新分组包围盒
            if (resized && typeof updateGroupsForNode === 'function') {
                updateGroupsForNode(data.nodeId);
            }
        }
    }

    if (CanvasNodeSystem.mode === 'drag_multi') {
        const data = CanvasNodeSystem.activeData;
        if (data && data.undoSnapshot) {
            const moved = data.nodes.some(item => {
                const node = CanvasNodeSystem.nodes.find(n => n.id === item.id);
                if (!node) return false;
                return node.x !== item.startX || node.y !== item.startY;
            });
            if (moved) pushUndoState(data.undoSnapshot);
            if (moved) CanvasNodeSystem.lastDragAt = Date.now();
            // 更新所有被拖拽节点的分组包围盒
            if (moved && typeof updateGroupsForNode === 'function') {
                data.nodes.forEach(item => updateGroupsForNode(item.id));
            }
        }
    }
    
    CanvasNodeSystem.mode = null;
    CanvasNodeSystem.activeData = {};
}

function onDoubleClick(e) {
    if (e.target.closest('.canvas-node')) return;
    
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const y = (e.clientY - rect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    
    showAddNodeMenu(e.clientX, e.clientY, x, y);
}

// 键盘按下事件
function onKeyDown(e) {
    // 检查是否在画布视图中
    const chatCanvasView = document.getElementById('chat-canvas-view');
    if (!chatCanvasView) return;
    
    // 检查画布视图是否可见（检查是否有hidden类）
    if (chatCanvasView.classList.contains('hidden')) return;
    
    // 检查焦点是否在文本输入元素中
    const activeEl = document.activeElement;
    const isTextInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable === true
    );
    
    // Ctrl+Z 撤回（最多10步）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (isTextInput) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        undoLastAction();
        return;
    }

    // Delete 键删除选中的节点
    if (e.key === 'Delete' || e.key === 'Backspace') {
        // 如果焦点在文本输入框中，不处理
        if (isTextInput) {
            return;
        }
        
        // 检查是否有选中的节点
        const hasSelection = CanvasNodeSystem.selectedNodeId || 
            (CanvasNodeSystem.selectedNodeIds && CanvasNodeSystem.selectedNodeIds.length > 0);
        
        if (!hasSelection) {
            console.log('[Canvas] No selection, ignoring delete key');
            return;
        }
        
        // 阻止默认行为
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[Canvas] Delete key pressed, deleting...');
        
        // 执行删除
        if (CanvasNodeSystem.selectedNodeId) {
            const nodeIdToDelete = CanvasNodeSystem.selectedNodeId;
            console.log('[Canvas] Deleting single node:', nodeIdToDelete);
            deleteNode(nodeIdToDelete);
        } else if (CanvasNodeSystem.selectedNodeIds && CanvasNodeSystem.selectedNodeIds.length > 0) {
            const ids = [...CanvasNodeSystem.selectedNodeIds];
            console.log('[Canvas] Deleting multiple nodes:', ids);
            clearMultiSelection();
            ids.forEach(id => deleteNode(id));
        }
        return;
    }
    
    // 其他快捷键需要检查是否在输入框中
    if (isTextInput) {
        return;
    }
    
    // Ctrl+C 复制节点
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        copySelectedNodes();
        return;
    }
    
    // Ctrl+V 粘贴节点
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteNodes();
        return;
    }
    
    // 空格键 - 准备拖拽画布
    if (e.code === 'Space' && !CanvasNodeSystem.spacePressed) {
        e.preventDefault();
        CanvasNodeSystem.spacePressed = true;
        const container = document.getElementById('canvas-container');
        if (container) container.style.cursor = 'grab';
    }
}

// 键盘释放事件
function onKeyUp(e) {
    if (e.code === 'Space') {
        CanvasNodeSystem.spacePressed = false;
        const container = document.getElementById('canvas-container');
        if (container && CanvasNodeSystem.mode !== 'drag_canvas') {
            container.style.cursor = '';
        }
    }
}

// 复制选中的节点
function copySelectedNodes() {
    const nodesToCopy = [];
    
    if (CanvasNodeSystem.selectedNodeId) {
        const node = CanvasNodeSystem.nodes.find(n => n.id === CanvasNodeSystem.selectedNodeId);
        if (node) nodesToCopy.push(node);
    } else if (CanvasNodeSystem.selectedNodeIds.length > 0) {
        CanvasNodeSystem.selectedNodeIds.forEach(id => {
            const node = CanvasNodeSystem.nodes.find(n => n.id === id);
            if (node) nodesToCopy.push(node);
        });
    }
    
    if (nodesToCopy.length > 0) {
        const selectedIds = new Set(nodesToCopy.map(n => n.id));
        const connectionsToCopy = CanvasNodeSystem.connections.filter(
            conn => selectedIds.has(conn.from) && selectedIds.has(conn.to)
        );
        let minX = Infinity;
        let minY = Infinity;
        nodesToCopy.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
        });
        CanvasNodeSystem.clipboard = {
            nodes: nodesToCopy.map(n => {
                const base = {
                    id: n.id,
                    type: n.type,
                    x: n.x,
                    y: n.y,
                    width: n.width,
                    height: n.height
                };
                if (n.type === NODE_TYPES.IMAGE) {
                    return {
                        ...base,
                        name: n.name,
                        url: n.url,
                        origW: n.origW,
                        origH: n.origH
                    };
                }
                if (n.type === NODE_TYPES.AI_DRAW) {
                    return {
                        ...base,
                        prompt: n.prompt || '',
                        model: n.model || 'nano-banana-pro',
                        aspectRatio: n.aspectRatio || '1:1',
                        resolution: n.resolution || '1024x1024',
                        count: n.count || 1,
                        resultUrl: n.resultUrl || null,
                        resultImages: n.resultImages ? [...n.resultImages] : [],
                        currentImageIndex: n.currentImageIndex || 0
                    };
                }
                if (n.type === NODE_TYPES.AI_VIDEO) {
                    return {
                        ...base,
                        prompt: n.prompt || '',
                        model: n.model || 'veo3.1',
                        aspectRatio: n.aspectRatio || '16:9',
                        count: n.count || 1,
                        resultUrl: n.resultUrl || null
                    };
                }
                return null;
            }).filter(Boolean),
            connections: connectionsToCopy.map(conn => ({ ...conn })),
            bounds: { minX, minY }
        };
        if (typeof showToast === 'function') showToast(`已复制 ${nodesToCopy.length} 个节点`);
    }
}

// 粘贴节点
function pasteNodes() {
    if (!CanvasNodeSystem.clipboard || (Array.isArray(CanvasNodeSystem.clipboard) && CanvasNodeSystem.clipboard.length === 0)) {
        if (typeof showToast === 'function') showToast('剪贴板为空', 'error');
        return;
    }

    // 兼容旧剪贴板格式（数组）
    if (Array.isArray(CanvasNodeSystem.clipboard)) {
        const offset = 30;
        const newIds = [];
        CanvasNodeSystem.clipboard.forEach((data, index) => {
            const lastNode = CanvasNodeSystem.nodes[CanvasNodeSystem.nodes.length - 1];
            const x = lastNode ? lastNode.x + offset * (index + 1) : 100 + offset * index;
            const y = lastNode ? lastNode.y + offset * (index + 1) : 100 + offset * index;
            if (data.type === NODE_TYPES.IMAGE) {
                const newId = createImageNodeFromData(
                    data.url,
                    appendSuffixToFilename(data.name || 'image.png', '_copy'),
                    x,
                    y,
                    data.width,
                    data.height,
                    data.origW,
                    data.origH
                );
                if (newId) newIds.push(newId);
            }
            if (data.type === NODE_TYPES.AI_DRAW) {
                const newId = createAIDrawNodeFromData(data, x, y);
                if (newId) newIds.push(newId);
            }
            if (data.type === NODE_TYPES.AI_VIDEO) {
                const newId = createAIVideoNodeFromData(data, x, y);
                if (newId) newIds.push(newId);
            }
        });
        selectPastedNodes(newIds);
        if (typeof showToast === 'function') showToast(`已粘贴 ${CanvasNodeSystem.clipboard.length} 个节点`);
        return;
    }

    const clipboard = CanvasNodeSystem.clipboard;
    const offset = 30;
    const lastNode = CanvasNodeSystem.nodes[CanvasNodeSystem.nodes.length - 1];
    const baseX = lastNode ? lastNode.x + offset : 100;
    const baseY = lastNode ? lastNode.y + offset : 100;
    const idMap = {};

    const newIds = [];
    clipboard.nodes.forEach((data, index) => {
        const x = baseX + (data.x - clipboard.bounds.minX);
        const y = baseY + (data.y - clipboard.bounds.minY);
        let newId = null;
        if (data.type === NODE_TYPES.IMAGE) {
            newId = createImageNodeFromData(
                data.url,
                appendSuffixToFilename(data.name || 'image.png', '_copy'),
                x,
                y,
                data.width,
                data.height,
                data.origW,
                data.origH
            );
        }
        if (data.type === NODE_TYPES.AI_DRAW) {
            newId = createAIDrawNodeFromData(data, x, y);
        }
        if (data.type === NODE_TYPES.AI_VIDEO) {
            newId = createAIVideoNodeFromData(data, x, y);
        }
        if (newId) {
            idMap[data.id] = newId;
            newIds.push(newId);
        }
    });

    // 还原连线
    clipboard.connections.forEach(conn => {
        const fromId = idMap[conn.from];
        const toId = idMap[conn.to];
        if (fromId && toId) addConnection(fromId, toId);
    });

    selectPastedNodes(newIds);
    if (typeof showToast === 'function') showToast(`已粘贴 ${clipboard.nodes.length} 个节点`);
}

function selectPastedNodes(newIds) {
    const ids = (newIds || []).filter(Boolean);
    if (ids.length === 0) return;
    clearMultiSelection();
    deselectAllNodes();
    CanvasNodeSystem.selectedNodeId = null;
    CanvasNodeSystem.selectedNodeIds = ids;
    if (ids.length === 1) {
        selectCanvasNode(ids[0]);
        return;
    }
    const nodes = ids.map(id => CanvasNodeSystem.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length >= 2) {
        showMultiSelectToolbar(nodes);
        highlightSelectedNodes(nodes);
    }
}

function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (!files.length) return;
    
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const y = (e.clientY - rect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    
    Array.from(files).forEach((file, i) => {
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
            // 加载 JSON 画布文件
            if (typeof loadCanvasFromJSON === 'function') {
                loadCanvasFromJSON(file);
            }
        } else if (file.type.startsWith('image/')) {
            const objectUrl = URL.createObjectURL(file);
            trackCanvasObjectUrl(objectUrl);
            createImageNode(objectUrl, file.name, x + i * 30, y + i * 30);
            if (typeof showToast === 'function') showToast('图片已添加到画布');
        }
    });
}

// ==================== 画布变换 ====================
function applyTransform() {
    const content = document.getElementById('canvas-content');
    if (content) {
        content.style.transform = `translate(${CanvasNodeSystem.offset.x}px, ${CanvasNodeSystem.offset.y}px) scale(${CanvasNodeSystem.zoom})`;
    }
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(CanvasNodeSystem.zoom * 100) + '%';
}

function zoomCanvas(delta) {
    CanvasNodeSystem.zoom = Math.max(0.2, Math.min(4, CanvasNodeSystem.zoom + delta));
    applyTransform();
}

function resetCanvasView() {
    CanvasNodeSystem.zoom = 1;
    CanvasNodeSystem.offset = { x: 0, y: 0 };
    applyTransform();
}

// ==================== 添加节点菜单 ====================
function showAddNodeMenu(screenX, screenY, canvasX, canvasY) {
    closeAddNodeMenu();
    
    const menu = document.createElement('div');
    menu.id = 'add-node-menu';
    menu.className = 'fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-2 z-[100]';
    menu.style.cssText = `left:${screenX}px;top:${screenY}px;`;
    
    menu.innerHTML = `
        <div class="text-xs text-gray-400 px-3 py-1.5">添加节点</div>
        <button onclick="createImageNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-lg">🖼️</div>
            <div><div class="text-sm font-medium">图片节点</div><div class="text-xs text-gray-500">上传图片</div></div>
        </button>
        <button onclick="createAIDrawNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center text-lg">🎨</div>
            <div><div class="text-sm font-medium">AI 绘图</div><div class="text-xs text-gray-500">文/图生图</div></div>
        </button>
        <button onclick="createAIVideoNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center text-lg">🎬</div>
            <div><div class="text-sm font-medium">AI 视频</div><div class="text-xs text-gray-500">文/图生视频</div></div>
        </button>
        <button onclick="createAITryLookNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-lg text-white font-bold text-xs">AI</div>
            <div><div class="text-sm font-medium">工作流节点</div><div class="text-xs text-gray-500">AITryLook工作流</div></div>
        </button>
        <button onclick="createLocalTransferNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center text-lg">✂️</div>
            <div><div class="text-sm font-medium">局部迁移</div><div class="text-xs text-gray-500">局部区域风格迁移</div></div>
        </button>
        <button onclick="createRhAppNodeAtPos(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center text-xs text-white font-bold">RH</div>
            <div><div class="text-sm font-medium">RH应用</div><div class="text-xs text-gray-500">RunningHub 应用</div></div>
        </button>
    `;
    
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenuOnOutside), 50);
}

function closeAddNodeMenu() {
    const m = document.getElementById('add-node-menu');
    if (m) m.remove();
    document.removeEventListener('click', closeMenuOnOutside);
    // 清除待连接信息
    CanvasNodeSystem.pendingConnectionFrom = null;
}

function closeMenuOnOutside(e) {
    const m = document.getElementById('add-node-menu');
    if (m && !m.contains(e.target)) closeAddNodeMenu();
}

// 显示添加节点菜单（带自动连接功能）
function showAddNodeMenuWithConnection(screenX, screenY, canvasX, canvasY, fromNodeId, fromPort) {
    closeAddNodeMenu();
    
    // 保存待连接的源节点ID
    CanvasNodeSystem.pendingConnectionFrom = { nodeId: fromNodeId, fromPort };
    
    const menu = document.createElement('div');
    menu.id = 'add-node-menu';
    menu.className = 'fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-2 z-[100]';
    menu.style.cssText = `left:${screenX}px;top:${screenY}px;`;
    
    menu.innerHTML = `
        <div class="text-xs text-gray-400 px-3 py-1.5 flex items-center gap-2">
            <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            添加节点并连接
        </div>
        <button onclick="createImageNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-lg">🖼️</div>
            <div><div class="text-sm font-medium">图片节点</div><div class="text-xs text-gray-500">上传图片</div></div>
        </button>
        <button onclick="createAIDrawNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center text-lg">🎨</div>
            <div><div class="text-sm font-medium">AI 绘图</div><div class="text-xs text-gray-500">文/图生图 · 自动连接</div></div>
        </button>
        <button onclick="createAIVideoNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-pink-100 rounded-lg flex items-center justify-center text-lg">🎬</div>
            <div><div class="text-sm font-medium">AI 视频</div><div class="text-xs text-gray-500">文/图生视频 · 自动连接</div></div>
        </button>
        <button onclick="createAITryLookNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center text-lg text-white font-bold text-xs">AI</div>
            <div><div class="text-sm font-medium">工作流节点</div><div class="text-xs text-gray-500">AITryLook工作流 · 自动连接</div></div>
        </button>
        <button onclick="createLocalTransferNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-lg text-white">✨</div>
            <div><div class="text-sm font-medium">局部迁移</div><div class="text-xs text-gray-500">精准局部编辑 · 自动连接</div></div>
        </button>
        <button onclick="createRhAppNodeAtPosWithConnection(${canvasX},${canvasY});closeAddNodeMenu();" class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left">
            <div class="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center text-xs text-white font-bold">RH</div>
            <div><div class="text-sm font-medium">RH应用</div><div class="text-xs text-gray-500">RunningHub 应用 · 自动连接</div></div>
        </button>
    `;

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenuOnOutside), 50);
}

// 创建图片节点并自动连接（仅上传文件）
function createImageNodeAtPosWithConnection(x, y) {
    const pending = CanvasNodeSystem.pendingConnectionFrom || {};
    const fromId = pending.nodeId;
    const fromPort = pending.fromPort;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        Array.from(e.target.files).forEach((f, i) => {
            const objectUrl = URL.createObjectURL(f);
            trackCanvasObjectUrl(objectUrl);
            const newId = createImageNode(objectUrl, f.name, x + i * 30, y + i * 30);
            if (fromId && fromPort === 'left') {
                setTimeout(() => addConnection(newId, fromId), 100);
            }
        });
    };
    input.click();
}

// 创建AI绘图节点并自动连接
function createAIDrawNodeAtPosWithConnection(x, y) {
    const pending = CanvasNodeSystem.pendingConnectionFrom || {};
    const fromId = pending.nodeId;
    const fromPort = pending.fromPort;
    const newId = createAIDrawNodeAtPos(x, y);
    
    // 如果有源节点，自动创建连接
    if (fromId && newId) {
        // 延迟执行确保节点已创建
        setTimeout(() => {
            if (fromPort === 'left') {
                addConnection(newId, fromId);
            } else {
                addConnection(fromId, newId);
            }
        }, 100);
    }
}

// 创建AI视频节点并自动连接
function createAIVideoNodeAtPosWithConnection(x, y) {
    const pending = CanvasNodeSystem.pendingConnectionFrom || {};
    const fromId = pending.nodeId;
    const fromPort = pending.fromPort;
    const newId = createAIVideoNodeAtPos(x, y);
    
    // 如果有源节点，自动创建连接
    if (fromId && newId) {
        // 延迟执行确保节点已创建
        setTimeout(() => {
            if (fromPort === 'left') {
                addConnection(newId, fromId);
            } else {
                addConnection(fromId, newId);
            }
        }, 100);
    }
}

// 创建局部迁移节点并自动连接
function createLocalTransferNodeAtPosWithConnection(x, y) {
    const pending = CanvasNodeSystem.pendingConnectionFrom || {};
    const fromId = pending.nodeId;
    const fromPort = pending.fromPort;
    const newId = createLocalTransferNodeAtPos(x, y);

    if (fromId && newId) {
        setTimeout(() => {
            if (fromPort === 'left') {
                addConnectionToLocalTransfer(newId, fromId, 'source');
            } else {
                addConnectionToLocalTransfer(fromId, newId, 'source');
            }
        }, 100);
    }
}

// ==================== 创建图片节点 ====================
function createImageNode(url, name = 'image.png', x = 100, y = 100) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    console.log('[Canvas] 创建图片节点, id:', id);
    const normalizedUrl = normalizeCanvasImageUrl(url);
    
    // 先创建占位节点显示加载动画
    const placeholderNode = {
        id, type: NODE_TYPES.IMAGE, name, url: '', x, y,
        width: 200, height: 200,
        origW: 200, origH: 200,
        isLoading: true
    };
    
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(placeholderNode);
    renderImageNodeWithLoading(placeholderNode);
    hideEmptyHint();
    
    const img = new Image();
    img.onload = () => {
        console.log('[Canvas] 图片加载完成:', name);
        try {
            let w = img.width, h = img.height;
            const maxSize = 300;
            if (w > maxSize || h > maxSize) {
                const r = Math.min(maxSize / w, maxSize / h);
                w *= r; h *= r;
            }
            
            // 更新节点数据
            const node = CanvasNodeSystem.nodes.find(n => n.id === id);
            if (node) {
                const previewUrl = createPreviewFromImageElement(img, IMAGE_PREVIEW_MAX_SIDE);
                node.url = normalizedUrl;
                node.previewUrl = previewUrl || null;
                node.width = w;
                node.height = h;
                node.origW = img.width;
                node.origH = img.height;
                node.isLoading = false;
                
                // 重新渲染节点（移除加载动画）
                const el = document.getElementById(`node-${id}`);
                if (el) el.remove();
                renderImageNode(node);
                
                console.log('[Canvas] 节点数据:', node.type, node.width, 'x', node.height);
            }
            
            // 延迟一帧后选中，确保DOM已更新
            requestAnimationFrame(() => {
                console.log('[Canvas] 准备选中节点:', id);
                try {
                    selectCanvasNode(id);
                } catch (e) {
                    console.error('[Canvas] selectCanvasNode 错误:', e);
                }
            });
        } catch (e) {
            console.error('[Canvas] 创建节点错误:', e);
        }
    };
    img.onerror = (e) => {
        console.error('[Canvas] 图片加载失败:', e);
        revokeCanvasObjectUrl(normalizedUrl);
        // 移除占位节点
        const idx = CanvasNodeSystem.nodes.findIndex(n => n.id === id);
        if (idx > -1) CanvasNodeSystem.nodes.splice(idx, 1);
        const el = document.getElementById(`node-${id}`);
        if (el) el.remove();
        if (typeof showToast === 'function') showToast('图片加载失败', 'error');
    };
    img.src = normalizedUrl;
    return id;
}

// 渲染带加载动画的图片节点
function renderImageNodeWithLoading(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node image-node';
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    
    el.style.position = 'absolute';
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = node.width + 'px';
    el.style.height = node.height + 'px';
    
    el.innerHTML = `
        <div class="node-body" style="width:100%;height:100%;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);overflow:hidden;cursor:move;position:relative;">
            <div class="flex items-center justify-center h-full bg-gray-50">
                <div class="text-gray-300 text-4xl">🖼️</div>
            </div>
            <div class="generating-overlay">
                <div class="generating-text">🖼️ 图片加载中...</div>
                <div class="generating-bar"></div>
            </div>
        </div>
    `;
    
    container.appendChild(el);
}

function createImageNodeAtPos(x, y) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        Array.from(e.target.files).forEach((f, i) => {
            const objectUrl = URL.createObjectURL(f);
            trackCanvasObjectUrl(objectUrl);
            createImageNode(objectUrl, f.name, x + i * 30, y + i * 30);
        });
    };
    input.click();
}

function promptReplaceImage(nodeId) {
    if (CanvasNodeSystem.lastDragAt && Date.now() - CanvasNodeSystem.lastDragAt < 200) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const objectUrl = URL.createObjectURL(file);
        trackCanvasObjectUrl(objectUrl);
        replaceImageNode(nodeId, objectUrl, file.name);
    };
    input.click();
}

function renderImageNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) {
        console.error('[Canvas] nodes-layer not found');
        return;
    }

    const displayUrl = (_hdPreviewEnabled ? node.url : node.previewUrl) || node.url;
    
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node image-node';
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    
    // 关键：必须设置 position, left, top, width, height 才能让子元素正确定位
    el.style.position = 'absolute';
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = node.width + 'px';
    el.style.height = node.height + 'px';
    
    el.innerHTML = `
        <div class="node-body" style="width:100%;height:100%;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);overflow:hidden;cursor:move;position:relative;">
            <img src="${displayUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" draggable="false"/>
            <div class="replace-overlay">
                <button class="replace-overlay-btn" onclick="event.stopPropagation();promptReplaceImage('${node.id}')" onmousedown="event.stopPropagation()">更换图片</button>
            </div>
            <div class="node-meta-overlay">
                <span class="node-meta-name">${node.name || '图片'}</span>
                <span class="node-meta-size">${node.origW||Math.round(node.width)} × ${node.origH||Math.round(node.height)}</span>
            </div>
        </div>
        <!-- 悬浮的"+"按钮，完全脱离节点 -->
        <div class="node-port connect-port floating-port" data-port="right" data-node-id="${node.id}" style="position:absolute;right:-36px;top:50%;transform:translateY(-50%);width:28px;height:28px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(34,211,238,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
    `;
    
    // 支持拖拽图片替换
    el.addEventListener('dragover', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.type.startsWith('image/')) return;
        const objectUrl = URL.createObjectURL(file);
        trackCanvasObjectUrl(objectUrl);
        replaceImageNode(node.id, objectUrl, file.name);
    });
    
    // 悬浮时显示端口
    el.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
    el.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    el.querySelectorAll('.floating-port').forEach(port => {
        port.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
        port.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    });
    
    container.appendChild(el);
    console.log('[Canvas] Image node rendered:', node.id, 'size:', node.width, 'x', node.height);
    
    // 如果该节点已有标记，重新渲染标记点
    if (typeof _markerState !== 'undefined' && _markerState.markers[node.id]) {
        _markerState.markers[node.id].forEach(m => renderMarkerPin(node.id, m));
    }
}

function updateImageNodeDisplay(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (!el) return;
    
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.style.width = node.width + 'px';
    el.style.height = node.height + 'px';
    const sizeEl = el.querySelector('.node-meta-size');
    if (sizeEl) {
        sizeEl.textContent = `${node.origW||Math.round(node.width)} × ${node.origH||Math.round(node.height)}`;
    }
    
    // 更新选中UI
    if (CanvasNodeSystem.selectedNodeId === node.id) {
        updateSelectionUIPosition(node);
        updateSelectionUISize(node);
    }
}

// 更新AI节点的显示（用于缩放）
function updateAINodeDisplay(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (!el) return;
    
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    
    // 更新节点主体
    const nodeBody = el.querySelector('.node-body');
    if (nodeBody) {
        nodeBody.style.width = node.width + 'px';
        nodeBody.style.height = node.height + 'px';
    }
    
    // 更新预览区域高度（全幅展示）
    const previewId = node.type === NODE_TYPES.AI_VIDEO ? `vpreview-${node.id}` : `preview-${node.id}`;
    const previewEl = document.getElementById(previewId) || document.getElementById(`preview-rh-${node.id}`);
    if (previewEl) {
        previewEl.style.height = node.height + 'px';
    }

    // 更新悬浮端口位置（跟随高度）
    el.querySelectorAll('.floating-port').forEach(port => {
        port.style.top = (node.height / 2) + 'px';
    });
    
    // 更新输入面板宽度
    const inputPanel = document.getElementById(`input-panel-${node.id}`) || document.getElementById(`input-panel-rh-${node.id}`);
    if (inputPanel) {
        const panelWidth = Math.max(node.width, node.type === NODE_TYPES.AI_VIDEO ? 460 : 560);
        inputPanel.style.top = (node.height + 12) + 'px';
        inputPanel.style.width = panelWidth + 'px';
        inputPanel.style.left = '50%';
        inputPanel.style.transform = 'translateX(-50%)';
    }
}

// ==================== 创建AI绘图节点 ====================
function createAIDrawNodeAtPos(x, y) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    
    const node = {
        id, type: NODE_TYPES.AI_DRAW, x, y,
        width: 400, height: 450,
        inputImages: [], prompt: '', model: 'nano-banana-pro',
        aspectRatio: 'auto',
        resolution: '1024x1024',
        resultUrl: null
    };
    
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderAIDrawNode(node);
    hideEmptyHint();
    return id;
}

function renderAIDrawNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    
    // 初始化数量和结果数组（如果没有）
    if (!node.count) node.count = 1;
    if (!node.resultImages) node.resultImages = [];
    if (!node.currentImageIndex) node.currentImageIndex = 0;
    if (!node.aspectRatio) node.aspectRatio = 'auto';
    
    // 调参框宽度加宽（任务6：加宽到560）
    const panelWidth = Math.max(node.width, 560);
    
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node ai-draw-node absolute';
    el.style.cssText = `left:${node.x}px;top:${node.y}px;`;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    
    // 判断是否有生成结果
    const hasResult = node.resultUrl || (node.resultImages && node.resultImages.length > 0);
    const currentImageUrl = node.resultImages && node.resultImages.length > 0 
        ? node.resultImages[node.currentImageIndex || 0] 
        : node.resultUrl;
    const imageCount = node.resultImages ? node.resultImages.length : 0;
    
    el.innerHTML = `
        <!-- 展示区域（简洁全幅） -->
        <div class="node-body rounded-2xl overflow-hidden shadow-lg" style="width:${node.width}px;height:${node.height}px;background:transparent;border:none;position:relative;">
            <div class="absolute top-2 left-2 text-xs text-white drop-shadow" style="z-index:20;text-shadow:0 0 1px #000, 0 0 2px #000;">AI绘图</div>
            <!-- 多图数量按钮（有多张图时显示） -->
            <button id="multi-img-btn-${node.id}" onclick="event.stopPropagation();showImagePicker('${node.id}')" 
                class="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition ${imageCount > 0 ? '' : 'hidden'}" title="查看所有生成图片" style="z-index:20;">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                <span id="img-count-${node.id}">${imageCount}</span>
            </button>
            <!-- 图片预览区域 -->
            <div class="relative bg-gray-50 overflow-hidden" style="height:${node.height}px;" id="preview-${node.id}">
                ${currentImageUrl ? `<img src="${currentImageUrl}" class="w-full h-full object-cover"/>` : `
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="text-gray-400 text-sm text-center">
                        <div class="text-4xl mb-2 opacity-40">🖼️</div>
                        <div class="text-gray-400">生成结果将显示在这里</div>
                    </div>
                </div>`}
            </div>
            
            <!-- 缩放角 -->
            <div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:35;"></div>
        </div>
        
        <!-- 左侧悬浮输入端口（分离式，永远在最上层） -->
        <div class="node-port can-connect-target connect-port floating-port" data-port="left" data-node-id="${node.id}" style="position:absolute;left:-36px;top:${node.height / 2}px;transform:translateY(-50%);width:28px;height:28px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(34,211,238,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <!-- AI绘图节点不需要右侧输出端口，防止偏色问题 -->
        
        <!-- 顶部工具栏（参考图片节点设计，默认隐藏，选中后显示） -->
        <div id="toolbar-panel-${node.id}" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">
            <button onclick="event.stopPropagation();aiDrawUpscale('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="放大至4K">
                <span style="font-weight:700;color:#0891b2;">4K</span> 放大
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();aiDrawRemoveBg('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="去除背景">
                ⊘ 去背景
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();aiDrawFullscreen('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="全屏查看">
                ⛶ 全屏
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();aiDrawDownload('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="下载图片">
                ↓ 下载
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();aiDrawSendToCanvas('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#06b6d4;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;font-weight:600;" onmouseover="this.style.background='#ecfeff'" onmouseout="this.style.background='none'" title="发送到画布">
                📤 发送
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="console.log('[Canvas] 删除按钮被点击, nodeId:', '${node.id}');event.stopPropagation();window.deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'" title="删除节点">
                <svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                删除
            </button>
        </div>
        
        <!-- 输入控制区域（分离式，默认隐藏，选中后显示） -->
        <div id="input-panel-${node.id}" class="ai-input-panel rounded-xl overflow-hidden shadow-lg" style="position:absolute;left:50%;top:${node.height + 12}px;transform:translateX(-50%);width:${panelWidth}px;background:white;border:1px solid #e5e7eb;display:none;">
            <div class="p-3">
                <!-- 参考图片区域 -->
                <div class="flex items-center gap-2 mb-2">
                    <div class="flex gap-2 flex-wrap flex-1 min-h-[36px] p-2 bg-gray-50 rounded-lg border border-gray-200" id="refs-${node.id}"></div>
                    <!-- 模板操作按钮 -->
                    <button onclick="event.stopPropagation();saveAsPromptTemplate('${node.id}')" class="px-2 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-md text-xs font-medium transition flex items-center gap-1 border border-green-200 whitespace-nowrap" title="保存当前提示词为模板">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        存为模板
                    </button>
                    <button onclick="event.stopPropagation();togglePromptTemplates('${node.id}')" class="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-md text-xs font-medium transition flex items-center gap-1 border border-amber-200 whitespace-nowrap" title="打开提示词模板库">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        模板库
                    </button>
                </div>
                
                <!-- 输入框区域 -->
                <div class="relative mb-2">
                    <textarea id="prompt-${node.id}" class="w-full p-2.5 pr-8 bg-gray-50 text-gray-700 text-sm resize-none outline-none placeholder-gray-400 rounded-lg border border-gray-200 focus:border-blue-400 transition" rows="2" placeholder="输入图片描述..." style="overflow-y:auto;">${node.prompt || ''}</textarea>
                    <!-- 展开/收起按钮 -->
                    <button onclick="event.stopPropagation();togglePromptExpand('${node.id}')" class="absolute right-1.5 bottom-1.5 w-5 h-5 bg-white/80 hover:bg-gray-200 rounded flex items-center justify-center transition" title="展开/收起">
                        <svg id="expand-icon-${node.id}" class="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7"/></svg>
                    </button>
                </div>
                
                <!-- 参数控制行 -->
                <div class="flex items-center gap-2 mt-2 flex-wrap">
                    <select id="draw-model-${node.id}" onchange="updateAIDrawModel('${node.id}', this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        ${renderModelOptions(getImageModels(), node.model, 'nano-banana-pro')}
                    </select>
                    <!-- MidJourney说明：有参考图时用mj_fast_blend，无参考图时用mj_fast_imagine -->
                    <select id="ratio-${node.id}" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        <option value="auto" ${node.aspectRatio === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="1:1" ${node.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option>
                        <option value="16:9" ${node.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option>
                        <option value="9:16" ${node.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option>
                        <option value="4:3" ${node.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option>
                        <option value="3:4" ${node.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option>
                        <option value="21:9" ${node.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option>
                        <option value="3:2" ${node.aspectRatio === '3:2' ? 'selected' : ''}>3:2</option>
                        <option value="2:3" ${node.aspectRatio === '2:3' ? 'selected' : ''}>2:3</option>
                        <option value="4:1" ${node.aspectRatio === '4:1' ? 'selected' : ''}>4:1</option>
                        <option value="1:4" ${node.aspectRatio === '1:4' ? 'selected' : ''}>1:4</option>
                        <option value="8:1" ${node.aspectRatio === '8:1' ? 'selected' : ''}>8:1</option>
                        <option value="1:8" ${node.aspectRatio === '1:8' ? 'selected' : ''}>1:8</option>
                    </select>
                    <select id="resolution-${node.id}" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        <option value="1024x1024" ${node.resolution === '1024x1024' ? 'selected' : ''}>1K</option>
                        <option value="2048x2048" ${node.resolution === '2048x2048' ? 'selected' : ''}>2K</option>
                        <option value="4096x4096" ${node.resolution === '4096x4096' ? 'selected' : ''}>4K</option>
                    </select>
                    <button onclick="toggleDrawCount('${node.id}')" id="dcount-${node.id}" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 text-xs cursor-pointer hover:bg-gray-100 transition">
                        ${node.count}x
                    </button>
                    <div class="flex-1"></div>
                    <button onclick="runAIDraw('${node.id}')" class="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-xs font-medium hover:opacity-90 transition flex items-center gap-1.5 shadow-sm">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                        生成
                    </button>
                </div>
            </div>
        </div>
    `;
    
    el.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
    el.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    el.querySelectorAll('.floating-port').forEach(port => {
        port.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
        port.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    });
    container.appendChild(el);
    updateAIDrawRefs(node);
}

// 切换绘图数量 1x -> 2x -> 3x -> 4x -> 1x
function toggleDrawCount(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    node.count = node.count >= 4 ? 1 : node.count + 1;
    
    const btn = document.getElementById(`dcount-${nodeId}`);
    if (btn) btn.textContent = node.count + 'x';
}

// 展开/收起提示词输入框
function togglePromptExpand(nodeId) {
    const textarea = document.getElementById(`prompt-${nodeId}`);
    const icon = document.getElementById(`expand-icon-${nodeId}`);
    if (!textarea) return;
    
    const isExpanded = textarea.dataset.expanded === 'true';
    
    if (isExpanded) {
        // 收起
        textarea.style.height = '';
        textarea.rows = 2;
        textarea.dataset.expanded = 'false';
        if (icon) icon.innerHTML = '<path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7"/>';
    } else {
        // 展开
        textarea.rows = 8;
        textarea.style.height = 'auto';
        textarea.dataset.expanded = 'true';
        if (icon) icon.innerHTML = '<path d="M9 9l-6 6m0-6v6h6M15 15l6-6m0 6v-6h-6"/>';
    }
}

// 视频节点 - 展开/收起提示词输入框
function toggleVideoPromptExpand(nodeId) {
    const textarea = document.getElementById(`vprompt-${nodeId}`);
    const icon = document.getElementById(`vexpand-icon-${nodeId}`);
    if (!textarea) return;
    
    const isExpanded = textarea.dataset.expanded === 'true';
    
    if (isExpanded) {
        // 收起
        textarea.style.height = '';
        textarea.rows = 2;
        textarea.dataset.expanded = 'false';
        if (icon) icon.innerHTML = '<path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7"/>';
    } else {
        // 展开
        textarea.rows = 8;
        textarea.style.height = 'auto';
        textarea.dataset.expanded = 'true';
        if (icon) icon.innerHTML = '<path d="M9 9l-6 6m0-6v6h6M15 15l6-6m0 6v-6h-6"/>';
    }
}

// ==================== 提示词模板功能 ====================
const PROMPT_TEMPLATES_KEY = 'ai_draw_prompt_templates_v2';

// 加载模板（新格式：{name, content}对象数组）
function loadPromptTemplates() {
    try {
        const saved = localStorage.getItem(PROMPT_TEMPLATES_KEY);
        if (!saved) {
            // 尝试迁移旧格式数据
            const oldSaved = localStorage.getItem('ai_draw_prompt_templates');
            if (oldSaved) {
                const oldTemplates = JSON.parse(oldSaved);
                const migrated = oldTemplates.map((content, i) => ({
                    name: `模板${i + 1}`,
                    content: content
                }));
                savePromptTemplates(migrated);
                return migrated;
            }
            return [];
        }
        return JSON.parse(saved);
    } catch (e) {
        return [];
    }
}

function savePromptTemplates(templates) {
    try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
    } catch (e) {
        console.warn('无法保存提示词模板');
    }
}

// 当前搜索关键词
let templateSearchKeyword = '';

// 显示/隐藏提示词模板面板（模板库）
function togglePromptTemplates(nodeId) {
    const existingPanel = document.getElementById(`prompt-templates-panel-${nodeId}`);
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    // 关闭其他面板
    document.querySelectorAll('[id^="prompt-templates-panel-"]').forEach(p => p.remove());
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    templateSearchKeyword = '';
    const templates = loadPromptTemplates();
    
    const panel = document.createElement('div');
    panel.id = `prompt-templates-panel-${nodeId}`;
    panel.className = 'absolute bg-white rounded-xl shadow-2xl border border-gray-200 z-[200]';
    panel.style.cssText = `left:${node.width + 20}px;top:0;width:280px;max-height:400px;overflow:hidden;display:flex;flex-direction:column;`;
    panel.onclick = e => e.stopPropagation();
    
    panel.innerHTML = `
        <div class="flex items-center justify-between p-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <h4 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                提示词模板库
            </h4>
            <button onclick="closePromptTemplates('${nodeId}')" class="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-2 border-b border-gray-100">
            <div class="flex gap-2">
                <input type="text" id="template-search-input-${nodeId}" placeholder="搜索模板名称..." class="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-amber-400" oninput="searchPromptTemplates('${nodeId}', this.value)" />
                <button onclick="confirmTemplateSearch('${nodeId}')" class="px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition" title="确认搜索">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                </button>
            </div>
        </div>
        <div id="templates-list-${nodeId}" class="flex-1 overflow-y-auto p-2 space-y-1" style="max-height:280px;">
            ${renderTemplatesList(nodeId, templates)}
        </div>
    `;
    
    nodeEl.appendChild(panel);
}

// 搜索模板
function searchPromptTemplates(nodeId, keyword) {
    templateSearchKeyword = keyword.trim().toLowerCase();
    const templates = loadPromptTemplates();
    const filtered = templateSearchKeyword ? 
        templates.filter(t => t.name.toLowerCase().includes(templateSearchKeyword)) : 
        templates;
    
    const list = document.getElementById(`templates-list-${nodeId}`);
    if (list) list.innerHTML = renderTemplatesList(nodeId, filtered);
}

// 确认搜索
function confirmTemplateSearch(nodeId) {
    const input = document.getElementById(`template-search-input-${nodeId}`);
    if (input) {
        searchPromptTemplates(nodeId, input.value);
        if (typeof showToast === 'function') showToast('搜索完成');
    }
}

// 渲染模板列表（只显示名称）
function renderTemplatesList(nodeId, templates) {
    if (!templates || templates.length === 0) {
        return `<div class="text-center text-gray-400 text-xs py-6">
            ${templateSearchKeyword ? '未找到匹配的模板' : '暂无保存的模板'}
        </div>`;
    }
    
    return templates.map((tpl, idx) => {
        // 获取在完整列表中的真实索引
        const allTemplates = loadPromptTemplates();
        const realIdx = allTemplates.findIndex(t => t.name === tpl.name && t.content === tpl.content);
        
        return `
        <div class="group flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-amber-50 rounded-lg transition cursor-pointer border border-transparent hover:border-amber-200" onclick="usePromptTemplate('${nodeId}', ${realIdx})">
            <svg class="w-4 h-4 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <div class="flex-1 text-xs text-gray-700 font-medium truncate">${escapeHtmlForTemplate(tpl.name)}</div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onclick="event.stopPropagation();editPromptTemplateName('${nodeId}', ${realIdx})" class="p-1 text-gray-400 hover:text-blue-500 rounded" title="编辑模板名称">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick="event.stopPropagation();deletePromptTemplate('${nodeId}', ${realIdx})" class="p-1 text-gray-400 hover:text-red-500 rounded" title="删除">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>
    `}).join('');
}

function escapeHtmlForTemplate(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function closePromptTemplates(nodeId) {
    const panel = document.getElementById(`prompt-templates-panel-${nodeId}`);
    if (panel) panel.remove();
}

// 存为模板 - 打开命名弹窗
function saveAsPromptTemplate(nodeId) {
    const textarea = document.getElementById(`prompt-${nodeId}`);
    if (!textarea || !textarea.value.trim()) {
        if (typeof showToast === 'function') showToast('请先输入提示词内容', 'error');
        return;
    }
    
    const content = textarea.value.trim();
    
    // 打开模板库面板并显示命名输入
    togglePromptTemplates(nodeId);
    
    // 在面板顶部显示命名区域
    setTimeout(() => {
        const panel = document.getElementById(`prompt-templates-panel-${nodeId}`);
        if (!panel) return;
        
        // 插入命名输入区域
        const saveArea = document.createElement('div');
        saveArea.id = `save-template-area-${nodeId}`;
        saveArea.className = 'p-3 bg-green-50 border-b border-green-100';
        saveArea.innerHTML = `
            <div class="text-xs text-green-700 mb-2 font-medium">保存当前提示词为模板：</div>
            <div class="flex gap-2">
                <input type="text" id="new-template-name-${nodeId}" placeholder="输入模板名称..." class="flex-1 px-2 py-1.5 text-xs border border-green-300 rounded-lg outline-none focus:border-green-500 bg-white" autofocus />
                <button onclick="confirmSaveTemplate('${nodeId}')" class="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition">保存</button>
                <button onclick="cancelSaveTemplate('${nodeId}')" class="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs rounded-lg transition">取消</button>
            </div>
        `;
        
        // 存储待保存的内容
        saveArea.dataset.content = content;
        
        // 插入到搜索区域之后
        const searchArea = panel.querySelector('.p-2.border-b');
        if (searchArea) {
            searchArea.after(saveArea);
        }
        
        // 聚焦到输入框
        const nameInput = document.getElementById(`new-template-name-${nodeId}`);
        if (nameInput) nameInput.focus();
    }, 100);
}

// 确认保存模板
function confirmSaveTemplate(nodeId) {
    const nameInput = document.getElementById(`new-template-name-${nodeId}`);
    const saveArea = document.getElementById(`save-template-area-${nodeId}`);
    
    if (!nameInput || !nameInput.value.trim()) {
        if (typeof showToast === 'function') showToast('请输入模板名称', 'error');
        return;
    }
    
    const name = nameInput.value.trim();
    const content = saveArea?.dataset.content || '';
    
    if (!content) {
        if (typeof showToast === 'function') showToast('模板内容为空', 'error');
        return;
    }
    
    const templates = loadPromptTemplates();
    templates.unshift({ name, content });
    savePromptTemplates(templates);
    
    // 移除保存区域
    if (saveArea) saveArea.remove();
    
    // 刷新列表
    const list = document.getElementById(`templates-list-${nodeId}`);
    if (list) list.innerHTML = renderTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板已保存');
}

// 取消保存模板
function cancelSaveTemplate(nodeId) {
    const saveArea = document.getElementById(`save-template-area-${nodeId}`);
    if (saveArea) saveArea.remove();
}

// 使用模板（点击后将提示词显示到输入框）
function usePromptTemplate(nodeId, idx) {
    const templates = loadPromptTemplates();
    if (!templates[idx]) return;
    
    const textarea = document.getElementById(`prompt-${nodeId}`);
    if (textarea) {
        textarea.value = templates[idx].content;
        // 触发输入事件以更新节点数据
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    closePromptTemplates(nodeId);
    if (typeof showToast === 'function') showToast(`已应用模板: ${templates[idx].name}`);
}

// 编辑模板名称
function editPromptTemplateName(nodeId, idx) {
    const templates = loadPromptTemplates();
    if (!templates[idx]) return;
    
    const newName = prompt('编辑模板名称:', templates[idx].name);
    if (newName === null) return; // 取消
    
    if (!newName.trim()) {
        if (typeof showToast === 'function') showToast('名称不能为空', 'error');
        return;
    }
    
    templates[idx].name = newName.trim();
    savePromptTemplates(templates);
    
    // 刷新列表
    const list = document.getElementById(`templates-list-${nodeId}`);
    if (list) list.innerHTML = renderTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板名称已更新');
}

// 保留editPromptTemplate以兼容旧代码，但重定向到新函数
function editPromptTemplate(nodeId, idx) {
    editPromptTemplateName(nodeId, idx);
}

function deletePromptTemplate(nodeId, idx) {
    const templates = loadPromptTemplates();
    if (!templates[idx]) return;
    
    const templateName = templates[idx].name || '该模板';
    if (!confirm(`确定要删除"${templateName}"吗？`)) return;
    
    templates.splice(idx, 1);
    savePromptTemplates(templates);
    
    const list = document.getElementById(`templates-list-${nodeId}`);
    if (list) list.innerHTML = renderTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板已删除');
}

// ==================== 视频节点提示词模板功能 ====================
const VIDEO_PROMPT_TEMPLATES_KEY = 'ai_video_prompt_templates_v2';

function loadVideoPromptTemplates() {
    try {
        const saved = localStorage.getItem(VIDEO_PROMPT_TEMPLATES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function saveVideoPromptTemplates(templates) {
    try {
        localStorage.setItem(VIDEO_PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
    } catch (e) {
        console.warn('无法保存视频提示词模板');
    }
}

let videoTemplateSearchKeyword = '';

// 显示/隐藏视频提示词模板面板
function toggleVideoPromptTemplates(nodeId) {
    const existingPanel = document.getElementById(`video-templates-panel-${nodeId}`);
    if (existingPanel) {
        existingPanel.remove();
        return;
    }
    
    // 关闭其他面板
    document.querySelectorAll('[id^="video-templates-panel-"]').forEach(p => p.remove());
    document.querySelectorAll('[id^="prompt-templates-panel-"]').forEach(p => p.remove());
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    videoTemplateSearchKeyword = '';
    const templates = loadVideoPromptTemplates();
    
    const panel = document.createElement('div');
    panel.id = `video-templates-panel-${nodeId}`;
    panel.className = 'absolute bg-white rounded-xl shadow-2xl border border-gray-200 z-[200]';
    panel.style.cssText = `left:${node.width + 20}px;top:0;width:280px;max-height:400px;overflow:hidden;display:flex;flex-direction:column;`;
    panel.onclick = e => e.stopPropagation();
    
    panel.innerHTML = `
        <div class="flex items-center justify-between p-3 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-blue-50">
            <h4 class="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <svg class="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                视频提示词模板库
            </h4>
            <button onclick="closeVideoPromptTemplates('${nodeId}')" class="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-2 border-b border-gray-100">
            <div class="flex gap-2">
                <input type="text" id="video-template-search-input-${nodeId}" placeholder="搜索模板名称..." class="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-cyan-400" oninput="searchVideoPromptTemplates('${nodeId}', this.value)" />
                <button onclick="confirmVideoTemplateSearch('${nodeId}')" class="px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition" title="确认搜索">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                </button>
            </div>
        </div>
        <div id="video-templates-list-${nodeId}" class="flex-1 overflow-y-auto p-2 space-y-1" style="max-height:280px;">
            ${renderVideoTemplatesList(nodeId, templates)}
        </div>
    `;
    
    nodeEl.appendChild(panel);
}

function searchVideoPromptTemplates(nodeId, keyword) {
    videoTemplateSearchKeyword = keyword.trim().toLowerCase();
    const templates = loadVideoPromptTemplates();
    const filtered = videoTemplateSearchKeyword ? 
        templates.filter(t => t.name.toLowerCase().includes(videoTemplateSearchKeyword)) : 
        templates;
    
    const list = document.getElementById(`video-templates-list-${nodeId}`);
    if (list) list.innerHTML = renderVideoTemplatesList(nodeId, filtered);
}

function confirmVideoTemplateSearch(nodeId) {
    const input = document.getElementById(`video-template-search-input-${nodeId}`);
    if (input) {
        searchVideoPromptTemplates(nodeId, input.value);
        if (typeof showToast === 'function') showToast('搜索完成');
    }
}

function renderVideoTemplatesList(nodeId, templates) {
    if (!templates || templates.length === 0) {
        return `<div class="text-center text-gray-400 text-xs py-6">
            ${videoTemplateSearchKeyword ? '未找到匹配的模板' : '暂无保存的模板'}
        </div>`;
    }
    
    return templates.map((tpl, idx) => {
        const allTemplates = loadVideoPromptTemplates();
        const realIdx = allTemplates.findIndex(t => t.name === tpl.name && t.content === tpl.content);
        
        return `
        <div class="group flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-cyan-50 rounded-lg transition cursor-pointer border border-transparent hover:border-cyan-200" onclick="useVideoPromptTemplate('${nodeId}', ${realIdx})">
            <svg class="w-4 h-4 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <div class="flex-1 text-xs text-gray-700 font-medium truncate">${escapeHtmlForTemplate(tpl.name)}</div>
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onclick="event.stopPropagation();editVideoPromptTemplateName('${nodeId}', ${realIdx})" class="p-1 text-gray-400 hover:text-blue-500 rounded" title="编辑模板名称">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick="event.stopPropagation();deleteVideoPromptTemplate('${nodeId}', ${realIdx})" class="p-1 text-gray-400 hover:text-red-500 rounded" title="删除">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>
    `}).join('');
}

function closeVideoPromptTemplates(nodeId) {
    const panel = document.getElementById(`video-templates-panel-${nodeId}`);
    if (panel) panel.remove();
}

// 存为视频模板
function saveAsVideoPromptTemplate(nodeId) {
    const textarea = document.getElementById(`vprompt-${nodeId}`);
    if (!textarea || !textarea.value.trim()) {
        if (typeof showToast === 'function') showToast('请先输入提示词内容', 'error');
        return;
    }
    
    const content = textarea.value.trim();
    
    // 打开模板库面板并显示命名输入
    toggleVideoPromptTemplates(nodeId);
    
    setTimeout(() => {
        const panel = document.getElementById(`video-templates-panel-${nodeId}`);
        if (!panel) return;
        
        const saveArea = document.createElement('div');
        saveArea.id = `save-video-template-area-${nodeId}`;
        saveArea.className = 'p-3 bg-green-50 border-b border-green-100';
        saveArea.innerHTML = `
            <div class="text-xs text-green-700 mb-2 font-medium">保存当前提示词为模板：</div>
            <div class="flex gap-2">
                <input type="text" id="new-video-template-name-${nodeId}" placeholder="输入模板名称..." class="flex-1 px-2 py-1.5 text-xs border border-green-300 rounded-lg outline-none focus:border-green-500 bg-white" autofocus />
                <button onclick="confirmSaveVideoTemplate('${nodeId}')" class="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition">保存</button>
                <button onclick="cancelSaveVideoTemplate('${nodeId}')" class="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs rounded-lg transition">取消</button>
            </div>
        `;
        
        saveArea.dataset.content = content;
        
        const searchArea = panel.querySelector('.p-2.border-b');
        if (searchArea) {
            searchArea.after(saveArea);
        }
        
        const nameInput = document.getElementById(`new-video-template-name-${nodeId}`);
        if (nameInput) nameInput.focus();
    }, 100);
}

function confirmSaveVideoTemplate(nodeId) {
    const nameInput = document.getElementById(`new-video-template-name-${nodeId}`);
    const saveArea = document.getElementById(`save-video-template-area-${nodeId}`);
    
    if (!nameInput || !nameInput.value.trim()) {
        if (typeof showToast === 'function') showToast('请输入模板名称', 'error');
        return;
    }
    
    const name = nameInput.value.trim();
    const content = saveArea?.dataset.content || '';
    
    if (!content) {
        if (typeof showToast === 'function') showToast('模板内容为空', 'error');
        return;
    }
    
    const templates = loadVideoPromptTemplates();
    templates.unshift({ name, content });
    saveVideoPromptTemplates(templates);
    
    if (saveArea) saveArea.remove();
    
    const list = document.getElementById(`video-templates-list-${nodeId}`);
    if (list) list.innerHTML = renderVideoTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板已保存');
}

function cancelSaveVideoTemplate(nodeId) {
    const saveArea = document.getElementById(`save-video-template-area-${nodeId}`);
    if (saveArea) saveArea.remove();
}

function useVideoPromptTemplate(nodeId, idx) {
    const templates = loadVideoPromptTemplates();
    if (!templates[idx]) return;
    
    const textarea = document.getElementById(`vprompt-${nodeId}`);
    if (textarea) {
        textarea.value = templates[idx].content;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    closeVideoPromptTemplates(nodeId);
    if (typeof showToast === 'function') showToast(`已应用模板: ${templates[idx].name}`);
}

function editVideoPromptTemplateName(nodeId, idx) {
    const templates = loadVideoPromptTemplates();
    if (!templates[idx]) return;
    
    const newName = prompt('编辑模板名称:', templates[idx].name);
    if (newName === null) return;
    
    if (!newName.trim()) {
        if (typeof showToast === 'function') showToast('名称不能为空', 'error');
        return;
    }
    
    templates[idx].name = newName.trim();
    saveVideoPromptTemplates(templates);
    
    const list = document.getElementById(`video-templates-list-${nodeId}`);
    if (list) list.innerHTML = renderVideoTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板名称已更新');
}

function deleteVideoPromptTemplate(nodeId, idx) {
    const templates = loadVideoPromptTemplates();
    if (!templates[idx]) return;
    
    const templateName = templates[idx].name || '该模板';
    if (!confirm(`确定要删除"${templateName}"吗？`)) return;
    
    templates.splice(idx, 1);
    saveVideoPromptTemplates(templates);
    
    const list = document.getElementById(`video-templates-list-${nodeId}`);
    if (list) list.innerHTML = renderVideoTemplatesList(nodeId, templates);
    
    if (typeof showToast === 'function') showToast('模板已删除');
}

function updateAIDrawRefs(node) {
    const el = document.getElementById(`refs-${node.id}`);
    if (!el) return;
    
    if (node.inputImages.length === 0) {
        el.innerHTML = `
            <div class="flex items-center gap-2 text-xs text-gray-400">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>从左侧连接图片节点添加参考图</span>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="flex items-center gap-2 mr-2 text-xs text-gray-500">
                <span>参考图:</span>
                <span class="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px]">${node.inputImages.length}</span>
                <span class="text-[10px] text-gray-400">拖拽排序</span>
            </div>
            ${node.inputImages.map((img, i) => {
                const displayUrl = img.previewUrl || img.url;
                return `
                <div class="relative group" data-ref-idx="${i}" style="touch-action:none;cursor:move;" onpointerdown="handleAIDrawRefPointerDown(event,'${node.id}',${i})">
                    <img src="${displayUrl}" class="w-10 h-10 rounded-lg object-cover border-2 border-gray-200 hover:border-blue-400 transition" draggable="false" onclick="event.stopPropagation();openChatMediaFullscreen('${img.url}','image')"/>
                    <span class="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] rounded-full flex items-center justify-center font-medium shadow">图${i+1}</span>
                    <button onclick="event.stopPropagation();removeAIDrawRef('${node.id}','${img.nodeId}')" class="absolute -top-1 -left-1 w-4 h-4 bg-black/70 text-white text-[10px] rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center">×</button>
                </div>
            `;
            }).join('')}`;
    }
}

function removeAIDrawRef(nodeId, fromId) {
    if (fromId && typeof deleteConnection === 'function') {
        deleteConnection(fromId, nodeId);
        return;
    }
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.inputImages = node.inputImages.filter(img => img.nodeId !== fromId);
    updateAIDrawRefs(node);
}

// 使用 Pointer 事件实现拖拽排序（兼容打包环境）
function handleAIDrawRefPointerDown(e, nodeId, index) {
    e.stopPropagation();
    e.preventDefault();
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const target = e.currentTarget;
    const refsContainer = target.parentElement;
    const allRefs = Array.from(refsContainer.querySelectorAll('[data-ref-idx]'));
    
    // 记录拖拽状态
    CanvasNodeSystem.draggingRef = {
        nodeId,
        index,
        startX: e.clientX,
        startY: e.clientY,
        element: target,
        clone: null
    };
    
    // 创建拖拽克隆元素
    const rect = target.getBoundingClientRect();
    const clone = target.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.zIndex = '10000';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.9';
    clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    clone.style.transform = 'scale(1.05)';
    document.body.appendChild(clone);
    CanvasNodeSystem.draggingRef.clone = clone;
    
    // 原元素半透明
    target.style.opacity = '0.3';
    
    // 添加移动和释放事件
    document.addEventListener('pointermove', handleAIDrawRefPointerMove);
    document.addEventListener('pointerup', handleAIDrawRefPointerUp);
}

function handleAIDrawRefPointerMove(e) {
    const drag = CanvasNodeSystem.draggingRef;
    if (!drag || !drag.clone) return;
    
    // 更新克隆元素位置
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const rect = drag.element.getBoundingClientRect();
    drag.clone.style.left = (rect.left + dx) + 'px';
    drag.clone.style.top = (rect.top + dy) + 'px';
    
    // 检测悬浮在哪个元素上
    const refsContainer = drag.element.parentElement;
    const allRefs = Array.from(refsContainer.querySelectorAll('[data-ref-idx]'));
    
    allRefs.forEach((ref, i) => {
        if (ref === drag.element) return;
        const refRect = ref.getBoundingClientRect();
        const centerX = refRect.left + refRect.width / 2;
        const centerY = refRect.top + refRect.height / 2;
        
        // 检查鼠标是否在这个元素范围内
        if (e.clientX > refRect.left && e.clientX < refRect.right &&
            e.clientY > refRect.top && e.clientY < refRect.bottom) {
            ref.style.transform = 'scale(0.9)';
            ref.style.opacity = '0.6';
            drag.hoverIndex = parseInt(ref.dataset.refIdx);
        } else {
            ref.style.transform = '';
            ref.style.opacity = '';
        }
    });
}

function handleAIDrawRefPointerUp(e) {
    const drag = CanvasNodeSystem.draggingRef;
    if (!drag) return;
    
    // 清理事件
    document.removeEventListener('pointermove', handleAIDrawRefPointerMove);
    document.removeEventListener('pointerup', handleAIDrawRefPointerUp);
    
    // 恢复原元素样式
    if (drag.element) {
        drag.element.style.opacity = '';
    }
    
    // 移除克隆元素
    if (drag.clone) {
        drag.clone.remove();
    }
    
    // 恢复所有元素样式
    const node = CanvasNodeSystem.nodes.find(n => n.id === drag.nodeId);
    if (node) {
        const refsContainer = drag.element?.parentElement;
        if (refsContainer) {
            refsContainer.querySelectorAll('[data-ref-idx]').forEach(ref => {
                ref.style.transform = '';
                ref.style.opacity = '';
            });
        }
        
        // 执行排序
        if (drag.hoverIndex !== undefined && drag.hoverIndex !== drag.index) {
            const [moved] = node.inputImages.splice(drag.index, 1);
            node.inputImages.splice(drag.hoverIndex, 0, moved);
            updateAIDrawRefs(node);
        }
    }
    
    CanvasNodeSystem.draggingRef = null;
}

// 保留旧的函数名兼容（以防有其他地方调用）
function handleAIDrawRefDragStart(e, nodeId, index) {
    handleAIDrawRefPointerDown(e, nodeId, index);
}
function handleAIDrawRefDragOver(e) {
    e.stopPropagation();
    e.preventDefault();
}
function handleAIDrawRefDrop(e, nodeId, targetIndex) {
    e.stopPropagation();
    e.preventDefault();
}
function handleAIDrawRefDragEnd() {
    // 清理
}

// ==================== 创建AI视频节点 ====================
function createAIVideoNodeAtPos(x, y) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    
    const node = {
        id, type: NODE_TYPES.AI_VIDEO, x, y,
        width: 400, height: 470,
        inputImages: [], prompt: '', mode: 'text2video',
        model: 'veo3.1', // 内部使用veo3.1
        duration: 8,
        count: 1, resultUrl: null,
        resultVideos: [], currentVideoIndex: 0,
        aspectRatio: 'auto'
    };
    
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderAIVideoNode(node);
    hideEmptyHint();
    return id;
}

function renderAIVideoNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    
    // 初始化数量（如果没有）
    if (!node.count) node.count = 1;
    if (!node.duration) node.duration = 8;
    if (!node.aspectRatio) node.aspectRatio = 'auto';
    
    // 调参框宽度
    const panelWidth = Math.max(node.width, 460);
    applyVideoNodeAspect(node.id, node.videoAspect || (node.aspectRatio === 'auto' ? null : parseAspectRatioValue(node.aspectRatio)));
    
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node ai-video-node absolute';
    el.style.cssText = `left:${node.x}px;top:${node.y}px;`;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    
    const modeLabel = getModeLabel(node.inputImages.length);
    const durationOptions = getVideoDurationOptions(node.model, node.duration);
    if (!durationOptions.includes(Number(node.duration))) {
        node.duration = durationOptions[0];
    }
    const hasResult = !!node.resultUrl;
    
    el.innerHTML = `
        <!-- 展示区域（简洁全幅） -->
        <div class="node-body rounded-2xl overflow-hidden shadow-lg" style="width:${node.width}px;height:${node.height}px;background:transparent;border:none;position:relative;">
            <div class="absolute top-2 left-2 text-xs text-white/90 drop-shadow" style="z-index:20;">AI视频</div>
            <button id="multi-video-btn-${node.id}" onclick="event.stopPropagation();showVideoPicker('${node.id}')" 
                class="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition ${node.resultVideos && node.resultVideos.length > 0 ? '' : 'hidden'}" title="查看所有生成视频" style="z-index:20;">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                <span id="video-count-${node.id}">${node.resultVideos ? node.resultVideos.length : 0}</span>
            </button>
            <div class="relative bg-gray-50" style="height:${node.height}px;" id="vpreview-${node.id}">
                ${node.resultUrl ? `<video src="${node.resultUrl}" class="w-full h-full object-contain" controls onloadedmetadata="handleVideoLoaded('${node.id}', this)"></video>` : `
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="text-gray-400 text-sm text-center">
                        <div class="text-4xl mb-2 opacity-40">🎥</div>
                        <div class="text-gray-400">生成结果将显示在这里</div>
                    </div>
                </div>`}
            </div>
            
            <!-- 缩放角 -->
            <div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:35;"></div>
        </div>
        
        <!-- 左侧悬浮输入端口（分离式，永远在最上层） -->
        <div class="node-port can-connect-target connect-port floating-port" data-port="left" data-node-id="${node.id}" style="position:absolute;left:-36px;top:${node.height / 2}px;transform:translateY(-50%);width:28px;height:28px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(34,211,238,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <!-- AI视频节点不需要右侧输出端口，防止偏色问题 -->
        
        <!-- 顶部工具栏（参考图片节点设计，默认隐藏，选中后显示） -->
        <div id="toolbar-panel-${node.id}" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">
            <button onclick="event.stopPropagation();fullscreenVideo('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="全屏播放">
                ⛶ 全屏
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();aiVideoSendToCanvas('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#06b6d4;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;font-weight:600;" onmouseover="this.style.background='#ecfeff'" onmouseout="this.style.background='none'" title="发送到画布">
                📤 发送
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();downloadVideo('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="下载视频">
                ↓ 下载
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="console.log('[Canvas] 删除按钮被点击, nodeId:', '${node.id}');event.stopPropagation();window.deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'" title="删除节点">
                <svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                删除
            </button>
        </div>
        
        <!-- 输入控制区域（分离式，默认隐藏，选中后显示） -->
        <div id="input-panel-${node.id}" class="ai-input-panel rounded-xl overflow-hidden shadow-lg" style="position:absolute;left:50%;top:${node.height + 12}px;transform:translateX(-50%);width:${panelWidth}px;background:white;border:1px solid #e5e7eb;display:none;">
            <div class="p-3">
                <!-- 模式选择 -->
                <div class="mb-2">
                    <span class="px-2.5 py-1 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-md text-cyan-600 text-xs font-medium" id="vmode-${node.id}">${modeLabel}</span>
                </div>
                
                <!-- 参考图片区域 -->
                <div class="flex items-center gap-2 mb-2">
                    <div class="flex gap-2 flex-wrap flex-1 min-h-[36px] p-2 bg-gray-50 rounded-lg border border-gray-200" id="vrefs-${node.id}"></div>
                    <!-- 模板操作按钮 -->
                    <button onclick="event.stopPropagation();saveAsVideoPromptTemplate('${node.id}')" class="px-2 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-md text-xs font-medium transition flex items-center gap-1 border border-green-200 whitespace-nowrap" title="保存当前提示词为模板">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        存为模板
                    </button>
                    <button onclick="event.stopPropagation();toggleVideoPromptTemplates('${node.id}')" class="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-md text-xs font-medium transition flex items-center gap-1 border border-amber-200 whitespace-nowrap" title="打开提示词模板库">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        模板库
                    </button>
                </div>
                
                <!-- 输入框区域 -->
                <div class="relative mb-2">
                    <textarea id="vprompt-${node.id}" class="w-full p-2.5 pr-8 bg-gray-50 text-gray-700 text-sm resize-none outline-none placeholder-gray-400 rounded-lg border border-gray-200 focus:border-blue-400 transition" rows="2" placeholder="描述你想要生成的视频内容..." style="overflow-y:auto;">${node.prompt || ''}</textarea>
                    <!-- 展开/收起按钮 -->
                    <button onclick="event.stopPropagation();toggleVideoPromptExpand('${node.id}')" class="absolute right-1.5 bottom-1.5 w-5 h-5 bg-white/80 hover:bg-gray-200 rounded flex items-center justify-center transition" title="展开/收起">
                        <svg id="vexpand-icon-${node.id}" class="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7"/></svg>
                    </button>
                </div>
                
                <!-- 参数控制行 -->
                <div class="flex items-center gap-2 mt-2 flex-wrap">
                <select id="vmodel-${node.id}" onchange="updateAIVideoModel('${node.id}', this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                    ${renderModelOptions(getVideoModels(), node.model, 'veo3.1')}
                </select>
                    <select id="vratio-${node.id}" onchange="updateAIVideoRatio('${node.id}', this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        <option value="auto" ${node.aspectRatio === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="16:9" ${node.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option>
                        <option value="9:16" ${node.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option>
                        <option value="1:1" ${node.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option>
                        <option value="4:3" ${node.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option>
                        <option value="3:4" ${node.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option>
                        <option value="21:9" ${node.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option>
                    </select>
                <select id="vduration-${node.id}" onchange="updateAIVideoDuration('${node.id}', this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300" ${durationOptions.length === 1 ? 'disabled' : ''}>
                    ${durationOptions.map(option => `<option value="${option}" ${String(option) === String(node.duration) ? 'selected' : ''}>${option}秒</option>`).join('')}
                </select>
                    <button onclick="toggleVideoCount('${node.id}')" id="vcount-${node.id}" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 text-xs cursor-pointer hover:bg-gray-100 transition">
                        ${node.count}x
                    </button>
                    <div class="flex-1"></div>
                    <button onclick="runAIVideo('${node.id}')" class="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-xs font-medium hover:opacity-90 transition flex items-center gap-1.5 shadow-sm">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                        生成
                    </button>
                </div>
            </div>
        </div>
    `;
    
    el.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
    el.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    el.querySelectorAll('.floating-port').forEach(port => {
        port.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
        port.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    });
    container.appendChild(el);
    updateAIVideoRefs(node);
}

// 切换视频数量 1x -> 2x -> 3x -> 4x -> 1x
function toggleVideoCount(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    node.count = node.count >= 4 ? 1 : node.count + 1;
    
    const btn = document.getElementById(`vcount-${nodeId}`);
    if (btn) btn.textContent = node.count + 'x';
}

function getModeLabel(count) {
    if (count === 0) return '文生视频';
    if (count === 1) return '首帧生视频';
    if (count === 2) return '首尾帧';
    return '图片参考';
}

function isKlingVideoModel(model) {
    return model && model.startsWith('kling');
}

function isSoraVideoModel(model) {
    return model && model.startsWith('sora');
}

function getVideoDurationOptions(model, currentDuration) {
    if (isKlingVideoModel(model)) {
        const baseOptions = [5, 10];
        if (!baseOptions.includes(currentDuration)) return baseOptions;
        return baseOptions;
    }
    if (isSoraVideoModel(model)) {
        // Sora 2 支持 10s, 15s；sora-2-pro 额外支持 25s
        const isPro = model && String(model).toLowerCase().includes('pro');
        const baseOptions = isPro ? [10, 15, 25] : [10, 15];
        if (!baseOptions.includes(currentDuration)) return baseOptions;
        return baseOptions;
    }
    // veo3.1 默认
    return [8];
}

function parseAspectRatioValue(ratioText) {
    if (!ratioText) return 1;
    const parts = String(ratioText).split(':').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        return parts[0] / parts[1];
    }
    return 1;
}

function resolveAutoAspectRatioLabel(node, fallbackLabel) {
    const fallback = fallbackLabel || '1:1';
    if (!node) return fallback;
    
    const pickClosest = (source) => {
        if (!source) return null;
        const width = source.origW || source.width;
        const height = source.origH || source.height;
        if (!width || !height) return null;
        return getClosestAspectRatio(width, height);
    };
    
    if (node.type === NODE_TYPES.IMAGE) {
        return pickClosest(node) || fallback;
    }
    
    if (node.inputImages && node.inputImages.length > 0) {
        for (const img of node.inputImages) {
            if (!img.nodeId) continue;
            const source = CanvasNodeSystem.nodes.find(n => n.id === img.nodeId);
            const ratio = pickClosest(source);
            if (ratio) return ratio;
        }
    }
    
    return fallback;
}

function applyVideoNodeAspect(nodeId, ratioValue) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const ratioLabel = node.aspectRatio === 'auto'
        ? resolveAutoAspectRatioLabel(node, '16:9')
        : node.aspectRatio;
    const ratio = ratioValue || parseAspectRatioValue(ratioLabel);
    if (!ratio || !Number.isFinite(ratio)) return;
    const newHeight = Math.max(220, Math.round(node.width / ratio));
    node.height = newHeight;
    updateAINodeDisplay(node);
}

function handleVideoLoaded(nodeId, videoEl) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
    const ratio = videoEl.videoWidth / videoEl.videoHeight;
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.videoAspect = ratio;
    applyVideoNodeAspect(nodeId, ratio);
}

function updateAIVideoRatio(nodeId, ratio) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.aspectRatio = ratio || node.aspectRatio || 'auto';
    const effectiveRatio = node.aspectRatio === 'auto'
        ? resolveAutoAspectRatioLabel(node, '16:9')
        : node.aspectRatio;
    applyVideoNodeAspect(nodeId, parseAspectRatioValue(effectiveRatio));
}

// 更新AI绘图模型
function updateAIDrawModel(nodeId, model) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.model = model;
    console.log(`[AI绘图] 模型已切换为: ${model}`);
}

function getVideoRatioOptions(model) {
    if (isKlingVideoModel(model)) {
        return ['16:9', '9:16', '1:1'];
    }
    if (isSoraVideoModel(model)) {
        return ['16:9', '9:16'];
    }
    return ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
}

function updateAIVideoModel(nodeId, model) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.model = model;
    const durationOptions = getVideoDurationOptions(node.model, node.duration);
    if (!durationOptions.includes(Number(node.duration))) {
        node.duration = durationOptions[0];
    }
    const durationEl = document.getElementById(`vduration-${nodeId}`);
    if (durationEl) {
        durationEl.innerHTML = durationOptions
            .map(option => `<option value="${option}" ${String(option) === String(node.duration) ? 'selected' : ''}>${option}秒</option>`)
            .join('');
        durationEl.disabled = durationOptions.length === 1;
    }
    // 更新比例下拉框
    const ratioOptions = getVideoRatioOptions(model);
    if (!ratioOptions.includes(node.aspectRatio)) {
        node.aspectRatio = ratioOptions[0];
    }
    const ratioEl = document.getElementById(`vratio-${nodeId}`);
    if (ratioEl) {
        const labels = { 'auto': 'Auto' };
        ratioEl.innerHTML = ratioOptions
            .map(r => `<option value="${r}" ${r === node.aspectRatio ? 'selected' : ''}>${labels[r] || r}</option>`)
            .join('');
    }
}

function updateAIVideoDuration(nodeId, duration) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.duration = Number(duration) || node.duration || 8;
}

function updateAIVideoRefs(node) {
    const el = document.getElementById(`vrefs-${node.id}`);
    const mode = document.getElementById(`vmode-${node.id}`);
    if (el) {
        if (node.inputImages.length === 0) {
            el.innerHTML = `
                <div class="flex items-center gap-2 text-xs text-gray-400">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span>从左侧连接图片节点添加参考图</span>
                </div>`;
        } else {
            el.innerHTML = `
                <div class="flex items-center gap-1 mr-2 text-xs text-gray-500">
                    <span>参考图:</span>
                </div>
                ${node.inputImages.map((img, i) => {
                    const displayUrl = img.previewUrl || img.url;
                    return `
                    <div class="relative group">
                        <img src="${displayUrl}" class="w-10 h-10 rounded-lg object-cover border-2 border-gray-200 hover:border-pink-400 transition"/>
                        <span class="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 text-white text-[9px] rounded-full flex items-center justify-center font-medium shadow">图${i+1}</span>
                    </div>
                `;
                }).join('')}`;
        }
    }
    if (mode) mode.textContent = getModeLabel(node.inputImages.length);
    if (node.aspectRatio === 'auto') applyVideoNodeAspect(node.id);
}

// ==================== 选中节点 ====================
function selectCanvasNode(nodeId) {
    console.log('[Canvas] ====== selectCanvasNode 开始 ======');
    console.log('[Canvas] nodeId:', nodeId);
    
    try {
        deselectAllNodes();
        CanvasNodeSystem.selectedNodeId = nodeId;
        
        const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
        console.log('[Canvas] 找到节点:', node ? '是' : '否');
        
        const elId = `node-${nodeId}`;
        const el = document.getElementById(elId);
        console.log('[Canvas] 找到元素:', el ? '是' : '否', 'ID:', elId);
        
        if (!node) {
            console.error('[Canvas] 节点不存在:', nodeId);
            return;
        }
        if (!el) {
            console.error('[Canvas] 元素不存在:', elId);
            return;
        }
        
        el.classList.add('selected');
        el.classList.add('node-active');
        console.log('[Canvas] 节点类型:', node.type);
        console.log('[Canvas] NODE_TYPES.IMAGE:', NODE_TYPES.IMAGE);
        console.log('[Canvas] 类型匹配:', node.type === NODE_TYPES.IMAGE);
        
        // 只对图片节点显示完整选中UI
        if (node.type === NODE_TYPES.IMAGE) {
            console.log('[Canvas] 开始创建选中UI...');
            createSelectionUI(node, el);
            // 如果此节点已有标记，重新渲染标记点
            const existingMarkers = _markerState.markers[nodeId];
            if (existingMarkers && existingMarkers.length > 0) {
                existingMarkers.forEach(m => renderMarkerPin(nodeId, m));
            }
            console.log('[Canvas] 选中UI创建完成');
        }
        
        // 对AI绘图、AI视频和AITryLook节点显示分离式面板
        if (node.type === NODE_TYPES.AI_DRAW || node.type === NODE_TYPES.AI_VIDEO || node.type === NODE_TYPES.AI_TRYLOOK || node.type === NODE_TYPES.RH_APP) {
            // 显示顶部工具栏
            const toolbarPanel = document.getElementById(`toolbar-panel-${nodeId}`) || document.getElementById(`toolbar-panel-rh-${nodeId}`);
            if (toolbarPanel) {
                toolbarPanel.style.display = 'flex';
                toolbarPanel.style.animation = 'slideDown 0.2s ease';
            }
            // 显示底部输入面板
            const inputPanel = document.getElementById(`input-panel-${nodeId}`) || document.getElementById(`input-panel-rh-${nodeId}`);
            if (inputPanel) {
                inputPanel.style.display = 'block';
                inputPanel.style.animation = 'slideUp 0.2s ease';
            }
        }
    } catch (e) {
        console.error('[Canvas] selectNode 发生错误:', e);
        console.error(e.stack);
    }
    
    console.log('[Canvas] ====== selectNode 结束 ======');
}

function deselectAllNodes() {
    // 退出标记模式（如果正在标记中）
    if (_markerState.active) {
        exitMarkerMode();
    }
    // 关闭气泡框
    hideCapsulePopup();
    
    CanvasNodeSystem.selectedNodeId = null;
    document.querySelectorAll('.canvas-node.selected').forEach(el => {
        el.classList.remove('selected');
        el.classList.remove('node-active');
        el.classList.remove('marking-mode');
    });
    
    // 移除所有选中UI元素（包含标记面板）
    ['selection-ui', 'sel-info', 'sel-toolbar', 'sel-panel', 'text-edit-panel', 'crop-panel', 'local-transfer-panel', 'view-angle-panel', 'marker-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    document.querySelectorAll('.crop-overlay').forEach(el => el.remove());
    document.querySelectorAll('.local-transfer-overlay').forEach(el => el.remove());
    
    // 隐藏所有AI节点的分离式面板
    document.querySelectorAll('.ai-input-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    document.querySelectorAll('.ai-toolbar-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // 隐藏图片选择器
    hideImagePicker();
}

function createSelectionUI(node, nodeEl) {
    console.log('[Canvas] ========== createSelectionUI 开始 ==========');
    
    try {
        console.log('[Canvas] 节点ID:', node.id);
        console.log('[Canvas] 节点尺寸:', node.width, 'x', node.height);
        
        const resText = `${node.origW||Math.round(node.width)} × ${node.origH||Math.round(node.height)}`;
    
    // ========== 1. 选中边框 + 四角缩放点 ==========
    const ui = document.createElement('div');
    ui.id = 'selection-ui';
    ui.style.cssText = 'position:absolute;left:-4px;top:-4px;right:-4px;bottom:-4px;pointer-events:none;z-index:50;';
    
    // 青色边框
    ui.innerHTML = `
        <div style="position:absolute;inset:0;border:3px solid #22d3ee;border-radius:10px;"></div>
        <div class="resize-corner" data-corner="nw" style="position:absolute;left:-8px;top:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:nw-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);"></div>
        <div class="resize-corner" data-corner="ne" style="position:absolute;right:-8px;top:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:ne-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);"></div>
        <div class="resize-corner" data-corner="sw" style="position:absolute;left:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:sw-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);"></div>
        <div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #22d3ee;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);"></div>
    `;
    nodeEl.appendChild(ui);
    console.log('[Canvas] 边框已添加');
    
    // ========== 2. 顶部工具栏（在图片上方，紧贴边框）- 添加删除按钮 ==========
    const toolbar = document.createElement('div');
    toolbar.id = 'sel-toolbar';
    toolbar.style.cssText = 'position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:flex;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;';
    
    toolbar.innerHTML = `
        <button onclick="event.stopPropagation();actionUpscale('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            <span style="font-weight:700;color:#0891b2;">4K</span> 放大
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();actionRemoveBg('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            ⊘ 去背景
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();reversePromptFromImage('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            🔍 反推
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();actionFullscreen('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            ⛶ 全屏
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();actionDownload('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            ↓ 下载
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();toggleCropPanel('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            ✂ 裁切
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();toggleLocalTransferPanel('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            🖌 局部迁移
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();toggleTextEditPanel('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            ✎ 文字编辑
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="event.stopPropagation();toggleViewAnglePanel('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="视角参考">
            <svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            视角
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button id="marker-btn-${node.id}" onclick="event.stopPropagation();toggleMarkerMode('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="if(!this.classList.contains('marker-active'))this.style.background='#f3f4f6'" onmouseout="if(!this.classList.contains('marker-active'))this.style.background='none'" title="点击标记">
            📌 标记
        </button>
        <div style="width:1px;height:18px;background:#e5e7eb;"></div>
        <button onclick="console.log('[Canvas] 删除按钮被点击, nodeId:', '${node.id}');event.stopPropagation();window.deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">
            <svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            删除
        </button>
    `;
    nodeEl.appendChild(toolbar);
    console.log('[Canvas] 工具栏已添加');
    
    // ========== 3. 底部输入面板（两层居中设计，白色主题）==========
    const panelWidth = Math.max(node.width, 520);
    const panel = document.createElement('div');
    panel.id = 'sel-panel';
    panel.style.cssText = `position:absolute;left:50%;top:${node.height + 12}px;transform:translateX(-50%);width:${panelWidth}px;background:white;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);border:1px solid #e5e7eb;z-index:100;pointer-events:auto;`;
    
    panel.innerHTML = `
        <div style="padding:12px;" onclick="event.stopPropagation()">
            <!-- 第一层：输入框包装器（胶囊 + 文本输入 内联） -->
            <div id="edit-prompt-wrapper-${node.id}" style="display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:2px;min-height:42px;padding:6px 10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;cursor:text;transition:border-color 0.2s,box-shadow 0.2s;margin-bottom:10px;" onclick="event.stopPropagation();window.focusMarkerInputByClick('${node.id}', event)" onfocusin="this.style.borderColor='#93c5fd';this.style.boxShadow='0 0 0 3px rgba(59,130,246,0.1)'" onfocusout="this.style.borderColor='#e5e7eb';this.style.boxShadow='none'">
                <input type="text" class="marker-inline-input" data-slot-index="0" id="edit-prompt-${node.id}" onclick="event.stopPropagation()" style="flex:1 1 220px;min-width:220px;padding:4px 2px;background:transparent;color:#374151;font-size:13px;border:none;outline:none;font-family:inherit;" placeholder="在此输入修改描述..." />
            </div>
            
            <!-- 第二层：编辑参数层（居中） -->
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;font-size:11px;">
                    <span>🍌</span>
                    <span style="color:#6b7280;">Nano-banana-pro</span>
                </div>
                <select id="ratio-${node.id}" onclick="event.stopPropagation()" style="padding:6px 10px;background:#f9fafb;color:#6b7280;border-radius:6px;border:1px solid #e5e7eb;outline:none;font-size:11px;cursor:pointer;">
                    <option value="auto">Auto</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="21:9">21:9</option>
                    <option value="3:2">3:2</option>
                    <option value="2:3">2:3</option>
                </select>
                <select id="resolution-${node.id}" onclick="event.stopPropagation()" style="padding:6px 10px;background:#f9fafb;color:#6b7280;border-radius:6px;border:1px solid #e5e7eb;outline:none;font-size:11px;cursor:pointer;">
                    <option value="1024x1024">1K</option>
                    <option value="2048x2048">2K</option>
                    <option value="4096x4096">4K</option>
                </select>
                <button onclick="event.stopPropagation();actionImg2Img('${node.id}')" style="display:flex;align-items:center;gap:5px;padding:8px 18px;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 4px 10px rgba(6,182,212,0.3);transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    ↑ 生成
                </button>
            </div>
        </div>
    `;
    nodeEl.appendChild(panel);
    console.log('[Canvas] 底部面板已添加');

    const promptEl = panel.querySelector(`#edit-prompt-${node.id}`);
    const ratioEl = panel.querySelector(`#ratio-${node.id}`);
    const resolutionEl = panel.querySelector(`#resolution-${node.id}`);
    const hasMarkers = !!(_markerState.markers[node.id] && _markerState.markers[node.id].length);
    // 有标记时不回填自动拼接后的历史提示词，避免输入框出现“自动生成整句”
    if (promptEl && node.img2imgPrompt && !hasMarkers) promptEl.value = node.img2imgPrompt;
    node.img2imgRatio = node.img2imgRatio || 'auto';
    if (ratioEl) ratioEl.value = node.img2imgRatio;
    if (resolutionEl && node.img2imgResolution) resolutionEl.value = node.img2imgResolution;
    // 只依据运行态锁定，避免 node 上残留的历史锁状态导致输入框无法编辑
    setImageEditLock(node.id, _img2imgGenerating.has(node.id));
    
    // 如果已有标记，渲染胶囊标签
    renderMarkerCapsules(node.id);
    
    console.log('[Canvas] ========== createSelectionUI 完成 ==========');
    
    } catch (e) {
        console.error('[Canvas] createSelectionUI 错误:', e);
        console.error(e.stack);
    }
}

// ==================== 图片文字编辑 ====================
function toggleTextEditPanel(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const existing = document.getElementById('text-edit-panel');
    if (existing) {
        if (existing.dataset.nodeId === nodeId) {
            existing.remove();
            return;
        }
        existing.remove();
    }
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    const panel = document.createElement('div');
    panel.id = 'text-edit-panel';
    panel.className = 'text-edit-panel';
    panel.dataset.nodeId = nodeId;
    panel.style.userSelect = 'text';
    panel.onclick = (e) => e.stopPropagation();
    panel.onmousedown = (e) => e.stopPropagation();
    
    panel.innerHTML = `
        <div class="panel-header" onclick="event.stopPropagation()">
            <span>编辑文字</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <button onclick="event.stopPropagation();recognizeTextForNode('${nodeId}', true)" style="font-size:11px;color:#2563eb;background:none;border:none;cursor:pointer;">重新识别</button>
                <button onclick="event.stopPropagation();document.getElementById('text-edit-panel')?.remove()" style="width:22px;height:22px;border-radius:6px;border:none;background:#f3f4f6;color:#6b7280;cursor:pointer;">×</button>
            </div>
        </div>
        <div class="panel-body"></div>
        <div class="panel-footer">
            <div style="display:flex;align-items:center;gap:6px;flex:1;">
                <span style="font-size:11px;color:#6b7280;">画质</span>
                <select id="text-edit-resolution" onchange="event.stopPropagation();setTextEditResolution('${nodeId}', this.value)" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;color:#6b7280;cursor:pointer;">
                    <option value="1024x1024">1K</option>
                    <option value="2048x2048">2K</option>
                    <option value="4096x4096">4K</option>
                </select>
            </div>
            <button onclick="event.stopPropagation();document.getElementById('text-edit-panel')?.remove()" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;">取消</button>
            <button id="apply-text-edits-btn" onclick="event.stopPropagation();applyTextEdits('${nodeId}')" style="flex:1;padding:8px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:white;font-size:12px;font-weight:600;cursor:pointer;">应用修改</button>
        </div>
    `;
    
    nodeEl.appendChild(panel);
    renderTextEditInputs(nodeId);
    initTextEditResolution(nodeId);
    
    if (node.textEditLoading) {
        // OCR 正在进行中（上次面板被关闭时仍在识别）
        // 显示加载状态，等待进行中的请求完成后自动渲染
        const body = panel.querySelector('.panel-body');
        if (body && (!node.textElements || !node.textElements.length)) {
            body.innerHTML = `<div style="font-size:12px;color:#6b7280;">识别中...</div>`;
        }
        setTextEditPanelLoading(true);
    } else if (!node.textElements || node.textElements.length === 0) {
        recognizeTextForNode(nodeId);
    }
}

// ==================== 视角参考面板 ====================
function toggleViewAnglePanel(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const existing = document.getElementById('view-angle-panel');
    if (existing) {
        if (existing.dataset.nodeId === nodeId) {
            existing.remove();
            return;
        }
        existing.remove();
    }
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    // 初始化节点的视角数据
    if (!node.viewAngle) {
        node.viewAngle = { rotate: 0, tilt: 0, zoom: 0, wideAngle: false };
    }
    
    const panel = document.createElement('div');
    panel.id = 'view-angle-panel';
    panel.className = 'view-angle-panel';
    panel.dataset.nodeId = nodeId;
    panel.onclick = (e) => e.stopPropagation();
    panel.onmousedown = (e) => e.stopPropagation();
    
    panel.style.cssText = `
        position: absolute;
        right: -340px;
        top: 50%;
        transform: translateY(-50%);
        width: 320px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        z-index: 200;
        pointer-events: auto;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:13px;font-weight:500;color:#1f2937;">拖拽方块调整角度</span>
            <button onclick="event.stopPropagation();closeViewAnglePanel()" style="width:22px;height:22px;border-radius:6px;border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.color='#374151';this.style.background='#f3f4f6'" onmouseout="this.style.color='#9ca3af';this.style.background='transparent'">×</button>
        </div>
        
        <div style="display:flex;padding:12px;gap:12px;">
            <!-- 左侧3D预览区域 -->
            <div style="flex:0 0 130px;display:flex;flex-direction:column;gap:6px;">
                <div id="view-angle-preview-${nodeId}" style="width:130px;height:130px;background:#374151;border-radius:8px;display:flex;align-items:center;justify-content:center;perspective:350px;overflow:hidden;cursor:grab;position:relative;" onmousedown="startViewAngleDrag(event,'${nodeId}')">
                    <!-- 3D立方体 -->
                    <div id="view-angle-cube-${nodeId}" style="width:50px;height:50px;position:relative;transform-style:preserve-3d;transform:rotateX(0deg) rotateY(0deg);transition:transform 0.1s ease-out;">
                        <!-- 前面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(55,65,81,0.95);border:1px solid #4b5563;transform:translateZ(25px);display:flex;align-items:center;justify-content:center;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8.5 8.5l7 7M8.5 15.5l7-7"/></svg>
                        </div>
                        <!-- 后面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(31,41,55,0.95);border:1px solid #4b5563;transform:rotateY(180deg) translateZ(25px);"></div>
                        <!-- 右面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(45,55,72,0.95);border:1px solid #4b5563;transform:rotateY(90deg) translateZ(25px);"></div>
                        <!-- 左面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(45,55,72,0.95);border:1px solid #4b5563;transform:rotateY(-90deg) translateZ(25px);"></div>
                        <!-- 上面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(75,85,99,0.95);border:1px solid #4b5563;transform:rotateX(90deg) translateZ(25px);"></div>
                        <!-- 下面 -->
                        <div style="position:absolute;width:50px;height:50px;background:rgba(17,24,39,0.95);border:1px solid #4b5563;transform:rotateX(-90deg) translateZ(25px);"></div>
                    </div>
                    <!-- 透视参考线 -->
                    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.25;">
                        <line x1="65" y1="65" x2="0" y2="130" stroke="#0891b2" stroke-width="0.5"/>
                        <line x1="65" y1="65" x2="130" y2="130" stroke="#0891b2" stroke-width="0.5"/>
                        <line x1="65" y1="65" x2="0" y2="0" stroke="#0891b2" stroke-width="0.5"/>
                        <line x1="65" y1="65" x2="130" y2="0" stroke="#0891b2" stroke-width="0.5"/>
                    </svg>
                </div>
                <button onclick="event.stopPropagation();resetViewAngle('${nodeId}')" style="display:flex;align-items:center;gap:5px;padding:6px;background:transparent;border:none;color:#6b7280;font-size:11px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background='#f3f4f6';this.style.color='#0891b2'" onmouseout="this.style.background='transparent';this.style.color='#6b7280'">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    重置
                </button>
            </div>
            
            <!-- 右侧控制滑杆 -->
            <div style="flex:1;display:flex;flex-direction:column;gap:12px;padding-top:4px;min-width:0;">
                <!-- 旋转 -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:50px;font-size:12px;color:#6b7280;flex-shrink:0;">旋转</span>
                    <input type="range" id="view-rotate-${nodeId}" min="-180" max="180" value="${node.viewAngle.rotate}" oninput="updateViewAngleFromSlider('${nodeId}')" style="flex:1;min-width:0;height:4px;-webkit-appearance:none;background:#e5e7eb;border-radius:2px;cursor:pointer;" />
                    <span id="view-rotate-val-${nodeId}" style="width:36px;text-align:right;font-size:11px;color:#1f2937;font-family:monospace;flex-shrink:0;">${node.viewAngle.rotate}°</span>
                </div>
                
                <!-- 倾斜 -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:50px;font-size:12px;color:#6b7280;flex-shrink:0;">倾斜</span>
                    <input type="range" id="view-tilt-${nodeId}" min="-90" max="90" value="${node.viewAngle.tilt}" oninput="updateViewAngleFromSlider('${nodeId}')" style="flex:1;min-width:0;height:4px;-webkit-appearance:none;background:#e5e7eb;border-radius:2px;cursor:pointer;" />
                    <span id="view-tilt-val-${nodeId}" style="width:36px;text-align:right;font-size:11px;color:#1f2937;font-family:monospace;flex-shrink:0;">${node.viewAngle.tilt}°</span>
                </div>
                
                <!-- 缩放 -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:50px;font-size:12px;color:#6b7280;flex-shrink:0;">缩放</span>
                    <input type="range" id="view-zoom-${nodeId}" min="-50" max="50" value="${node.viewAngle.zoom}" oninput="updateViewAngleFromSlider('${nodeId}')" style="flex:1;min-width:0;height:4px;-webkit-appearance:none;background:#e5e7eb;border-radius:2px;cursor:pointer;" />
                    <span id="view-zoom-val-${nodeId}" style="width:36px;text-align:right;font-size:11px;color:#1f2937;font-family:monospace;flex-shrink:0;">${node.viewAngle.zoom}</span>
                </div>
                
                <!-- 广角镜头 -->
                <div style="display:flex;align-items:center;gap:8px;margin-top:2px;">
                    <span style="font-size:12px;color:#6b7280;flex-shrink:0;">广角镜头</span>
                    <div style="flex:1;"></div>
                    <label style="position:relative;width:40px;height:22px;cursor:pointer;flex-shrink:0;">
                        <input type="checkbox" id="view-wide-${nodeId}" ${node.viewAngle.wideAngle ? 'checked' : ''} onchange="updateViewAngleFromSlider('${nodeId}')" style="opacity:0;width:0;height:0;" />
                        <span style="position:absolute;inset:0;background:${node.viewAngle.wideAngle ? '#0891b2' : '#d1d5db'};border-radius:11px;transition:background 0.2s;"></span>
                        <span style="position:absolute;top:2px;left:${node.viewAngle.wideAngle ? '20px' : '2px'};width:18px;height:18px;background:white;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                    </label>
                </div>
            </div>
        </div>
    `;
    
    nodeEl.appendChild(panel);
    
    // 添加滑杆样式
    addViewAngleSliderStyles();
}

// 关闭视角面板
function closeViewAnglePanel() {
    const panel = document.getElementById('view-angle-panel');
    if (panel) panel.remove();
}

// 检查视角面板是否打开并获取视角信息
function getActiveViewAnglePrompt() {
    const panel = document.getElementById('view-angle-panel');
    if (!panel) return null;
    
    const nodeId = panel.dataset.nodeId;
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.viewAngle) return null;
    
    const { rotate, tilt, zoom, wideAngle } = node.viewAngle;
    
    // 如果所有值都是0且广角关闭，不添加视角信息
    if (rotate === 0 && tilt === 0 && zoom === 0 && !wideAngle) return null;
    
    // 构建视角描述
    let angleDesc = [];
    
    // 旋转描述
    if (rotate !== 0) {
        if (rotate < -90) angleDesc.push('back view');
        else if (rotate < -45) angleDesc.push('three-quarter back view from left');
        else if (rotate < -15) angleDesc.push('side view from left');
        else if (rotate < 0) angleDesc.push('slightly turned left');
        else if (rotate > 90) angleDesc.push('back view');
        else if (rotate > 45) angleDesc.push('three-quarter back view from right');
        else if (rotate > 15) angleDesc.push('side view from right');
        else angleDesc.push('slightly turned right');
    }
    
    // 倾斜描述
    if (tilt !== 0) {
        if (tilt < -45) angleDesc.push('extreme low angle shot');
        else if (tilt < -20) angleDesc.push('low angle shot');
        else if (tilt < 0) angleDesc.push('slight low angle');
        else if (tilt > 45) angleDesc.push('birds eye view');
        else if (tilt > 20) angleDesc.push('high angle shot');
        else angleDesc.push('slight high angle');
    }
    
    // 缩放描述
    if (zoom !== 0) {
        if (zoom < -25) angleDesc.push('extreme close-up');
        else if (zoom < 0) angleDesc.push('close-up');
        else if (zoom > 25) angleDesc.push('wide shot');
        else angleDesc.push('medium shot');
    }
    
    // 广角描述
    if (wideAngle) {
        angleDesc.push('wide angle lens, dramatic perspective');
    }
    
    if (angleDesc.length === 0) return null;
    
    return 'camera angle changed, ' + angleDesc.join(', ');
}

// 滑杆样式注入
function addViewAngleSliderStyles() {
    if (document.getElementById('view-angle-slider-styles')) return;
    const style = document.createElement('style');
    style.id = 'view-angle-slider-styles';
    style.textContent = `
        #view-angle-panel input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            background: #0891b2;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 1px 4px rgba(8,145,178,0.4);
        }
        #view-angle-panel input[type="range"]::-moz-range-thumb {
            width: 12px;
            height: 12px;
            background: #0891b2;
            border-radius: 50%;
            cursor: pointer;
            border: none;
            box-shadow: 0 1px 4px rgba(8,145,178,0.4);
        }
        #view-angle-panel label input[type="checkbox"]:checked + span {
            background: #0891b2 !important;
        }
        #view-angle-panel label input[type="checkbox"]:checked + span + span {
            left: 20px !important;
        }
    `;
    document.head.appendChild(style);
}

// 从滑杆更新视角
function updateViewAngleFromSlider(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const rotateEl = document.getElementById(`view-rotate-${nodeId}`);
    const tiltEl = document.getElementById(`view-tilt-${nodeId}`);
    const zoomEl = document.getElementById(`view-zoom-${nodeId}`);
    const wideEl = document.getElementById(`view-wide-${nodeId}`);
    
    if (rotateEl) node.viewAngle.rotate = parseInt(rotateEl.value);
    if (tiltEl) node.viewAngle.tilt = parseInt(tiltEl.value);
    if (zoomEl) node.viewAngle.zoom = parseInt(zoomEl.value);
    if (wideEl) node.viewAngle.wideAngle = wideEl.checked;
    
    updateViewAngleDisplay(nodeId);
}

// 更新视角显示
function updateViewAngleDisplay(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.viewAngle) return;
    
    const { rotate, tilt, zoom, wideAngle } = node.viewAngle;
    
    // 更新数值显示（白色字体已在HTML中设置为#1f2937深灰色）
    const rotateVal = document.getElementById(`view-rotate-val-${nodeId}`);
    const tiltVal = document.getElementById(`view-tilt-val-${nodeId}`);
    const zoomVal = document.getElementById(`view-zoom-val-${nodeId}`);
    
    if (rotateVal) rotateVal.textContent = `${rotate}°`;
    if (tiltVal) tiltVal.textContent = `${tilt}°`;
    if (zoomVal) zoomVal.textContent = zoom;
    
    // 更新3D立方体
    const cube = document.getElementById(`view-angle-cube-${nodeId}`);
    if (cube) {
        const perspective = wideAngle ? 200 : 400;
        const scale = 1 + zoom / 100;
        cube.parentElement.style.perspective = `${perspective}px`;
        cube.style.transform = `rotateX(${-tilt}deg) rotateY(${rotate}deg) scale(${scale})`;
    }
    
    // 更新广角开关视觉状态
    const wideEl = document.getElementById(`view-wide-${nodeId}`);
    if (wideEl) {
        const toggleBg = wideEl.nextElementSibling;
        const toggleDot = toggleBg?.nextElementSibling;
        if (toggleBg) toggleBg.style.background = wideAngle ? '#0891b2' : '#d1d5db';
        if (toggleDot) toggleDot.style.left = wideAngle ? '20px' : '2px';
    }
}

// 重置视角
function resetViewAngle(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    node.viewAngle = { rotate: 0, tilt: 0, zoom: 0, wideAngle: false };
    
    // 更新滑杆位置
    const rotateEl = document.getElementById(`view-rotate-${nodeId}`);
    const tiltEl = document.getElementById(`view-tilt-${nodeId}`);
    const zoomEl = document.getElementById(`view-zoom-${nodeId}`);
    const wideEl = document.getElementById(`view-wide-${nodeId}`);
    
    if (rotateEl) rotateEl.value = 0;
    if (tiltEl) tiltEl.value = 0;
    if (zoomEl) zoomEl.value = 0;
    if (wideEl) wideEl.checked = false;
    
    updateViewAngleDisplay(nodeId);
}

// 拖拽3D预览区域
let viewAngleDragState = null;

function startViewAngleDrag(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    viewAngleDragState = {
        nodeId: nodeId,
        startX: event.clientX,
        startY: event.clientY,
        startRotate: node.viewAngle.rotate,
        startTilt: node.viewAngle.tilt
    };
    
    const preview = document.getElementById(`view-angle-preview-${nodeId}`);
    if (preview) preview.style.cursor = 'grabbing';
    
    // 拖拽期间禁用图片节点的hover效果
    document.body.classList.add('view-angle-dragging');
    
    document.addEventListener('mousemove', handleViewAngleDrag);
    document.addEventListener('mouseup', endViewAngleDrag);
}

function handleViewAngleDrag(event) {
    if (!viewAngleDragState) return;
    
    const { nodeId, startX, startY, startRotate, startTilt } = viewAngleDragState;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 灵敏度调整
    const sensitivity = 0.8;
    let newRotate = startRotate + deltaX * sensitivity;
    let newTilt = startTilt + deltaY * sensitivity;
    
    // 限制范围
    newRotate = Math.max(-180, Math.min(180, newRotate));
    newTilt = Math.max(-90, Math.min(90, newTilt));
    
    node.viewAngle.rotate = Math.round(newRotate);
    node.viewAngle.tilt = Math.round(newTilt);
    
    // 更新滑杆位置
    const rotateEl = document.getElementById(`view-rotate-${nodeId}`);
    const tiltEl = document.getElementById(`view-tilt-${nodeId}`);
    if (rotateEl) rotateEl.value = node.viewAngle.rotate;
    if (tiltEl) tiltEl.value = node.viewAngle.tilt;
    
    updateViewAngleDisplay(nodeId);
}

function endViewAngleDrag() {
    if (viewAngleDragState) {
        const preview = document.getElementById(`view-angle-preview-${viewAngleDragState.nodeId}`);
        if (preview) preview.style.cursor = 'grab';
    }
    viewAngleDragState = null;
    
    // 恢复图片节点的hover效果
    document.body.classList.remove('view-angle-dragging');
    
    document.removeEventListener('mousemove', handleViewAngleDrag);
    document.removeEventListener('mouseup', endViewAngleDrag);
}

function renderTextEditInputs(nodeId) {
    const panel = document.getElementById('text-edit-panel');
    if (!panel || panel.dataset.nodeId !== nodeId) return;
    const body = panel.querySelector('.panel-body');
    if (!body) return;
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const texts = node?.textElements || [];
    body.innerHTML = '';
    
    if (!texts.length) {
        body.innerHTML = `<div style="font-size:12px;color:#9ca3af;">暂无识别结果</div>`;
        return;
    }
    
    // 字号映射
    const fontSizeMap = { small: '11px', medium: '12px', large: '13px', xlarge: '14px' };
    const fontSizeLabelMap = { small: '小', medium: '中', large: '大', xlarge: '特大' };
    
    texts.forEach((item, index) => {
        // 兼容旧数据（纯字符串）
        const text = typeof item === 'string' ? item : (item.text || '');
        const style = (typeof item === 'object' && item.style) ? item.style : {};
        
        const row = document.createElement('div');
        row.className = 'text-edit-row';
        
        // 行号标签
        const lineLabel = document.createElement('div');
        lineLabel.className = 'text-edit-line-label';
        lineLabel.textContent = `${index + 1}`;
        
        // 输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.value = text;
        input.dataset.index = index;
        input.style.fontWeight = style.bold ? '700' : '400';
        input.style.fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
        input.style.fontSize = fontSizeMap[style.fontSize] || '12px';
        
        // 样式预览条
        const styleBadges = document.createElement('div');
        styleBadges.className = 'text-edit-style-badges';
        
        // 颜色指示
        if (style.color) {
            const colorBadge = document.createElement('span');
            colorBadge.className = 'style-badge color-badge';
            colorBadge.innerHTML = `<span class="color-dot" style="background:${style.color};"></span>${style.color}`;
            colorBadge.title = `颜色: ${style.color}`;
            styleBadges.appendChild(colorBadge);
        }
        
        // 粗细标签
        if (style.bold) {
            const boldBadge = document.createElement('span');
            boldBadge.className = 'style-badge bold-badge';
            boldBadge.textContent = 'B';
            boldBadge.title = '粗体';
            styleBadges.appendChild(boldBadge);
        }
        
        // 字号标签
        if (style.fontSize && style.fontSize !== 'medium') {
            const sizeBadge = document.createElement('span');
            sizeBadge.className = 'style-badge size-badge';
            sizeBadge.textContent = fontSizeLabelMap[style.fontSize] || style.fontSize;
            sizeBadge.title = `字号: ${fontSizeLabelMap[style.fontSize] || style.fontSize}`;
            styleBadges.appendChild(sizeBadge);
        }
        
        // 斜体标签
        if (style.fontStyle === 'italic') {
            const italicBadge = document.createElement('span');
            italicBadge.className = 'style-badge italic-badge';
            italicBadge.textContent = 'I';
            italicBadge.title = '斜体';
            styleBadges.appendChild(italicBadge);
        }
        
        // 对齐方式
        if (style.align && style.align !== 'left') {
            const alignBadge = document.createElement('span');
            alignBadge.className = 'style-badge align-badge';
            alignBadge.textContent = style.align === 'center' ? '居中' : '居右';
            alignBadge.title = `对齐: ${style.align}`;
            styleBadges.appendChild(alignBadge);
        }
        
        row.appendChild(lineLabel);
        row.appendChild(input);
        if (styleBadges.children.length > 0) {
            row.appendChild(styleBadges);
        }
        body.appendChild(row);
    });
}

async function recognizeTextForNode(nodeId, force = false) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;
    
    // 防重入：如果正在加载中，不重复发起请求
    // 但添加超时保护：如果超过60秒仍在loading，允许重试
    if (node.textEditLoading) {
        const elapsed = node._ocrStartTime ? (Date.now() - node._ocrStartTime) : 0;
        if (elapsed < 60000) {
            console.log('[OCR] 识别正在进行中，跳过重复请求');
            return;
        }
        console.warn('[OCR] 识别超时，重置状态并重试');
        node.textEditLoading = false;
    }
    if (!force && node.textElements && node.textElements.length) return;
    
    node.textEditLoading = true;
    node._ocrStartTime = Date.now();
    
    // 生成本次请求的唯一ID，用于防止旧请求覆盖新请求
    const requestId = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    node._ocrRequestId = requestId;
    
    const panel = document.getElementById('text-edit-panel');
    if (panel && panel.dataset.nodeId === nodeId) {
        const body = panel.querySelector('.panel-body');
        if (body) body.innerHTML = `<div style="font-size:12px;color:#6b7280;">识别中...</div>`;
    }
    setTextEditPanelLoading(true);
    
    try {
        if (typeof extractTextFromImage !== 'function') {
            throw new Error('OCR 接口不可用');
        }
        const texts = await extractTextFromImage(node.url);
        
        // 检查：如果在等待期间又发起了新请求，放弃本次结果
        if (node._ocrRequestId !== requestId) {
            console.log('[OCR] 请求已被新请求取代，忽略本次结果');
            return;
        }
        
        // texts 格式: [{text, style: {color, bold, fontSize, fontStyle, align}}]
        node.textElements = texts;
        node.textEdits = texts.map(t => ({ ...t }));
        renderTextEditInputs(nodeId);
        if (typeof showToast === 'function') showToast(`文字识别完成，共${texts.length}行`);
    } catch (err) {
        // 如果是被取代的请求，静默忽略
        if (node._ocrRequestId !== requestId) return;
        if (typeof showToast === 'function') showToast('识别失败: ' + err.message, 'error');
        renderTextEditInputs(nodeId);
    } finally {
        // 只有当前请求才能清除loading状态
        if (node._ocrRequestId === requestId) {
            node.textEditLoading = false;
            node._ocrStartTime = null;
            setTextEditPanelLoading(false);
        }
    }
}

function setTextEditPanelLoading(loading) {
    const panel = document.getElementById('text-edit-panel');
    if (!panel) return;
    const applyBtn = panel.querySelector('#apply-text-edits-btn');
    const resolutionEl = panel.querySelector('#text-edit-resolution');
    if (applyBtn) {
        applyBtn.disabled = loading;
        applyBtn.style.opacity = loading ? '0.6' : '1';
        applyBtn.style.cursor = loading ? 'not-allowed' : 'pointer';
        applyBtn.textContent = loading ? '处理中...' : '应用修改';
    }
    if (resolutionEl) {
        resolutionEl.disabled = loading;
        resolutionEl.style.cursor = loading ? 'not-allowed' : 'pointer';
        resolutionEl.style.background = loading ? '#f3f4f6' : '#f9fafb';
    }
}

function initTextEditResolution(nodeId) {
    const panel = document.getElementById('text-edit-panel');
    if (!panel || panel.dataset.nodeId !== nodeId) return;
    const resolutionEl = panel.querySelector('#text-edit-resolution');
    if (!resolutionEl) return;
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const baseResolution = getResolutionFromSize(node?.origW || node?.width, node?.origH || node?.height);
    const defaultResolution = baseResolution === '1024x1024' ? '2048x2048' : baseResolution;
    const value = node?.textEditResolution || defaultResolution;
    resolutionEl.value = value;
    if (node) node.textEditResolution = value;
}

function setTextEditResolution(nodeId, value) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.textEditResolution = value;
}

function getTextEditResolution(nodeId) {
    const panel = document.getElementById('text-edit-panel');
    const resolutionEl = panel?.querySelector('#text-edit-resolution');
    const value = resolutionEl?.value;
    if (value) {
        setTextEditResolution(nodeId, value);
        return value;
    }
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    return node?.textEditResolution || null;
}

// ==================== 图片裁切 ====================
function toggleCropPanel(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const existing = document.getElementById('crop-panel');
    if (existing) {
        if (existing.dataset.nodeId === nodeId) {
            removeCropOverlay(nodeId);
            existing.remove();
            return;
        }
        existing.remove();
        removeCropOverlay(nodeId);
    }
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    const panel = document.createElement('div');
    panel.id = 'crop-panel';
    panel.dataset.nodeId = nodeId;
    panel.style.cssText = 'position:absolute;left:calc(100% + 12px);top:0;width:220px;background:white;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);border:1px solid #e5e7eb;z-index:120;display:flex;flex-direction:column;overflow:visible;animation:fadeIn 0.15s ease;pointer-events:auto;';
    panel.onclick = (e) => e.stopPropagation();
    
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#111827;background:#f9fafb;">
            <span>裁切调节</span>
            <button onclick="event.stopPropagation();document.getElementById('crop-panel')?.remove();removeCropOverlay('${nodeId}')" style="width:22px;height:22px;border-radius:6px;border:none;background:#f3f4f6;color:#6b7280;cursor:pointer;">×</button>
        </div>
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;color:#6b7280;">比例</span>
                <button id="crop-ratio-btn" onclick="event.stopPropagation();toggleCropRatioMenu('${nodeId}')" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;color:#374151;cursor:pointer;text-align:left;">原始</button>
                <div style="position:relative;">
                    <div id="crop-ratio-menu" style="position:absolute;top:32px;right:0;min-width:120px;max-height:160px;overflow-y:auto;overscroll-behavior:contain;background:white;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:6px;display:none;z-index:200;">
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','original')">原始</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','1:1')">1:1</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','4:3')">4:3</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','3:4')">3:4</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','16:9')">16:9</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','9:16')">9:16</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','2:3')">2:3</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','3:2')">3:2</div>
                        <div class="crop-ratio-item" onclick="event.stopPropagation();setCropPreset('${nodeId}','21:9')">21:9</div>
                    </div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:11px;color:#6b7280;">宽</span>
                <input id="crop-width-${nodeId}" type="number" min="1" style="width:64px;padding:6px 6px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;color:#374151;" />
                <button id="crop-lock-${nodeId}" onclick="event.stopPropagation();toggleCropLock('${nodeId}')" style="width:28px;height:28px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:13px;color:#6b7280;cursor:pointer;">🔗</button>
                <span style="font-size:11px;color:#6b7280;">高</span>
                <input id="crop-height-${nodeId}" type="number" min="1" style="width:64px;padding:6px 6px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;color:#374151;" />
            </div>
            <div style="font-size:10px;color:#9ca3af;">单位为像素，可直接输入调整裁切框尺寸</div>
        </div>
        <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #f1f5f9;background:#fff;">
            <button onclick="event.stopPropagation();document.getElementById('crop-panel')?.remove();removeCropOverlay('${nodeId}')" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;">取消</button>
            <button id="apply-crop-btn" onclick="event.stopPropagation();applyCrop('${nodeId}')" style="flex:1;padding:8px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:white;font-size:12px;font-weight:600;cursor:pointer;">确定裁切</button>
        </div>
    `;
    
    panel.querySelectorAll('.crop-ratio-item').forEach(item => {
        item.style.cssText = 'padding:6px 8px;border-radius:8px;font-size:11px;color:#374151;cursor:pointer;';
        item.onmouseover = () => item.style.background = '#f3f4f6';
        item.onmouseout = () => item.style.background = 'white';
    });
    
    nodeEl.appendChild(panel);
    initCropOverlay(nodeId);
    bindCropSizeInputs(nodeId);
    syncCropPanelState(nodeId);
}

function initCropOverlay(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!node || !nodeEl) return;
    
    removeCropOverlay(nodeId);
    nodeEl.classList.add('crop-mode');
    
    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay';
    overlay.dataset.nodeId = nodeId;
    overlay.style.cssText = 'position:absolute;inset:0;z-index:80;pointer-events:auto;overflow:hidden;';
    
    const rect = document.createElement('div');
    rect.className = 'crop-rect';
    rect.style.cssText = 'position:absolute;border:2px solid #22d3ee;border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,0.1);cursor:move;';
    
    const grid = document.createElement('div');
    grid.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    grid.innerHTML = `
        <div style="position:absolute;left:33.33%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.6);"></div>
        <div style="position:absolute;left:66.66%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.6);"></div>
        <div style="position:absolute;top:33.33%;left:0;right:0;height:1px;background:rgba(255,255,255,0.6);"></div>
        <div style="position:absolute;top:66.66%;left:0;right:0;height:1px;background:rgba(255,255,255,0.6);"></div>
    `;
    rect.appendChild(grid);
    
    ['nw','ne','sw','se'].forEach(corner => {
        const handle = document.createElement('div');
        handle.className = 'crop-handle';
        handle.dataset.corner = corner;
        handle.style.cssText = 'position:absolute;width:14px;height:14px;background:white;border:2px solid #22d3ee;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        if (corner.includes('n')) handle.style.top = '0';
        if (corner.includes('s')) handle.style.bottom = '0';
        if (corner.includes('w')) handle.style.left = '0';
        if (corner.includes('e')) handle.style.right = '0';
        if (corner === 'nw') handle.style.transform = 'translate(50%, 50%)';
        if (corner === 'ne') handle.style.transform = 'translate(-50%, 50%)';
        if (corner === 'sw') handle.style.transform = 'translate(50%, -50%)';
        if (corner === 'se') handle.style.transform = 'translate(-50%, -50%)';
        handle.style.cursor = `${corner}-resize`;
        rect.appendChild(handle);
    });
    
    overlay.appendChild(rect);
    nodeEl.appendChild(overlay);
    
    const defaultRect = getDefaultCropRect(node);
    node.cropRect = node.cropRect || defaultRect;
    if (node.cropRatioLocked === undefined) {
        node.cropRatioLocked = false;
    }
    updateCropRectUI(nodeId);
    bindCropDragEvents(nodeId);
}

function removeCropOverlay(nodeId) {
    document.querySelectorAll(`.crop-overlay[data-node-id="${nodeId}"]`).forEach(el => el.remove());
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (nodeEl) nodeEl.classList.remove('crop-mode');
}

function getDefaultCropRect(node) {
    const margin = 0.1;
    const w = Math.max(40, Math.round(node.width * (1 - margin * 2)));
    const h = Math.max(40, Math.round(node.height * (1 - margin * 2)));
    return {
        x: Math.round(node.width * margin),
        y: Math.round(node.height * margin),
        width: w,
        height: h
    };
}

function bindCropDragEvents(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    const overlay = nodeEl?.querySelector('.crop-overlay');
    const rectEl = overlay?.querySelector('.crop-rect');
    if (!node || !overlay || !rectEl) return;
    
    let dragMode = null;
    let start = null;
    const getRatio = () => (node.cropRatioLocked ? node.cropRatio : null);
    
    const onMouseDown = (e) => {
        e.stopPropagation();
        const corner = e.target.closest('.crop-handle')?.dataset.corner;
        const nodeRect = nodeEl.getBoundingClientRect();
        const scaleX = nodeRect.width / node.width;
        const scaleY = nodeRect.height / node.height;
        const startX = (e.clientX - nodeRect.left) / scaleX;
        const startY = (e.clientY - nodeRect.top) / scaleY;
        start = { x: startX, y: startY, rect: { ...node.cropRect } };
        dragMode = corner ? `resize-${corner}` : 'move';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = (e) => {
        if (!start) return;
        const nodeRect = nodeEl.getBoundingClientRect();
        const scaleX = nodeRect.width / node.width;
        const scaleY = nodeRect.height / node.height;
        const currentX = (e.clientX - nodeRect.left) / scaleX;
        const currentY = (e.clientY - nodeRect.top) / scaleY;
        const dx = currentX - start.x;
        const dy = currentY - start.y;
        let { x, y, width, height } = start.rect;
        
        if (dragMode === 'move') {
            x += dx;
            y += dy;
        } else if (dragMode?.startsWith('resize')) {
            const corner = dragMode.replace('resize-', '');
            if (corner.includes('n')) {
                y += dy;
                height -= dy;
            }
            if (corner.includes('s')) {
                height += dy;
            }
            if (corner.includes('w')) {
                x += dx;
                width -= dx;
            }
            if (corner.includes('e')) {
                width += dx;
            }
            
            const ratio = getRatio();
            if (ratio && ratio > 0) {
                if (corner.includes('n') || corner.includes('s')) {
                    width = height * ratio;
                } else {
                    height = width / ratio;
                }
            }
        }
        
        const minSize = 20;
        width = Math.max(minSize, width);
        height = Math.max(minSize, height);
        
        x = Math.max(0, Math.min(node.width - minSize, x));
        y = Math.max(0, Math.min(node.height - minSize, y));
        
        width = Math.max(minSize, Math.min(width, node.width - x));
        height = Math.max(minSize, Math.min(height, node.height - y));
        
        node.cropRect = { x, y, width, height };
        updateCropRectUI(nodeId);
    };
    
    const onMouseUp = () => {
        start = null;
        dragMode = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    
    rectEl.onmousedown = onMouseDown;
    rectEl.querySelectorAll('.crop-handle').forEach(handle => {
        handle.onmousedown = onMouseDown;
    });
}

function updateCropRectUI(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    const rectEl = nodeEl?.querySelector('.crop-rect');
    if (!node || !rectEl) return;
    const { x, y, width, height } = node.cropRect;
    rectEl.style.left = `${x}px`;
    rectEl.style.top = `${y}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
    updateCropSizeInputs(nodeId);
}

function syncCropPanelState(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const panel = document.getElementById('crop-panel');
    if (!node || !panel || panel.dataset.nodeId !== nodeId) return;
    const ratioBtn = panel.querySelector('#crop-ratio-btn');
    const lockBtn = panel.querySelector(`#crop-lock-${nodeId}`);
    if (lockBtn) lockBtn.textContent = node.cropRatioLocked ? '🔗' : '📎';
    if (ratioBtn) ratioBtn.textContent = node.cropRatioLocked ? (node.cropRatioLabel || '原始') : '自定义';
}

function bindCropSizeInputs(nodeId) {
    const widthInput = document.getElementById(`crop-width-${nodeId}`);
    const heightInput = document.getElementById(`crop-height-${nodeId}`);
    if (!widthInput || !heightInput) return;
    updateCropSizeInputs(nodeId);
    
    const onChange = (source = 'width') => {
        const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
        if (!node) return;
        let w = Math.max(1, parseInt(widthInput.value, 10) || 1);
        let h = Math.max(1, parseInt(heightInput.value, 10) || 1);
        if (node.cropRatioLocked && node.cropRatio) {
            if (source === 'width') {
                h = Math.max(1, Math.round(w / node.cropRatio));
                heightInput.value = h;
            } else {
                w = Math.max(1, Math.round(h * node.cropRatio));
                widthInput.value = w;
            }
        }
        const displayW = Math.round((w / (node.origW || node.width)) * node.width);
        const displayH = Math.round((h / (node.origH || node.height)) * node.height);
        const centerX = node.cropRect.x + node.cropRect.width / 2;
        const centerY = node.cropRect.y + node.cropRect.height / 2;
        const newW = Math.max(20, Math.min(node.width, displayW));
        const newH = Math.max(20, Math.min(node.height, displayH));
        let x = centerX - newW / 2;
        let y = centerY - newH / 2;
        x = Math.max(0, Math.min(node.width - newW, x));
        y = Math.max(0, Math.min(node.height - newH, y));
        node.cropRect = { x, y, width: newW, height: newH };
        updateCropRectUI(nodeId);
    };
    
    widthInput.onchange = () => onChange('width');
    heightInput.onchange = () => onChange('height');
    widthInput.onblur = () => onChange('width');
    heightInput.onblur = () => onChange('height');
}

function updateCropSizeInputs(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const widthInput = document.getElementById(`crop-width-${nodeId}`);
    const heightInput = document.getElementById(`crop-height-${nodeId}`);
    if (!node || !widthInput || !heightInput) return;
    const { width, height } = node.cropRect || getDefaultCropRect(node);
    const actualW = Math.max(1, Math.round((width / node.width) * (node.origW || node.width)));
    const actualH = Math.max(1, Math.round((height / node.height) * (node.origH || node.height)));
    widthInput.value = actualW;
    heightInput.value = actualH;
}

function setCropPreset(nodeId, ratioText) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const panel = document.getElementById('crop-panel');
    const ratioBtn = panel?.querySelector('#crop-ratio-btn');
    const menu = panel?.querySelector('#crop-ratio-menu');
    if (menu) menu.style.display = 'none';
    
    let targetRatio = null;
    if (ratioText === 'original') {
        targetRatio = (node.origW || node.width) / (node.origH || node.height);
    } else {
        const [rw, rh] = ratioText.split(':').map(Number);
        if (!rw || !rh) return;
        targetRatio = rw / rh;
    }
    
    node.cropRatio = targetRatio;
    node.cropRatioLocked = true;
    node.cropRatioLabel = ratioText === 'original' ? '原始' : ratioText;
    const lockBtn = document.getElementById(`crop-lock-${nodeId}`);
    if (lockBtn) lockBtn.textContent = '🔗';
    if (ratioBtn) ratioBtn.textContent = ratioText === 'original' ? '原始' : ratioText;
    
    const maxW = node.width;
    const maxH = node.height;
    let width = maxW;
    let height = Math.round(width / targetRatio);
    if (height > maxH) {
        height = maxH;
        width = Math.round(height * targetRatio);
    }
    const x = Math.round((maxW - width) / 2);
    const y = Math.round((maxH - height) / 2);
    node.cropRect = { x, y, width, height };
    updateCropRectUI(nodeId);
}

function toggleCropRatioMenu(nodeId) {
    const panel = document.getElementById('crop-panel');
    if (!panel || panel.dataset.nodeId !== nodeId) return;
    const menu = panel.querySelector('#crop-ratio-menu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
    if (!menu.dataset.wheelBound) {
        menu.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        menu.dataset.wheelBound = '1';
    }
    document.addEventListener('click', handleCropMenuOutsideClick);
}

function handleCropMenuOutsideClick(e) {
    const menu = document.getElementById('crop-ratio-menu');
    if (!menu) return;
    if (!menu.contains(e.target) && !e.target.closest('#crop-ratio-btn')) {
        menu.style.display = 'none';
        document.removeEventListener('click', handleCropMenuOutsideClick);
    }
}

function toggleCropLock(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.cropRatioLocked = !node.cropRatioLocked;
    if (!node.cropRatioLocked) {
        node.cropRatio = null;
        node.cropRatioLabel = null;
    } else if (!node.cropRatio) {
        node.cropRatio = (node.cropRect.width || 1) / (node.cropRect.height || 1);
        node.cropRatioLabel = '自定义';
    }
    const lockBtn = document.getElementById(`crop-lock-${nodeId}`);
    if (lockBtn) lockBtn.textContent = node.cropRatioLocked ? '🔗' : '📎';
    const panel = document.getElementById('crop-panel');
    const ratioBtn = panel?.querySelector('#crop-ratio-btn');
    if (ratioBtn) ratioBtn.textContent = node.cropRatioLocked ? (node.cropRatioLabel || '自定义') : '自定义';
}

async function applyCrop(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;
    
    const { x, y, width, height } = node.cropRect || getDefaultCropRect(node);
    const srcW = node.origW || node.width;
    const srcH = node.origH || node.height;
    const sx = Math.round((x / node.width) * srcW);
    const sy = Math.round((y / node.height) * srcH);
    const sWidth = Math.round((width / node.width) * srcW);
    const sHeight = Math.round((height / node.height) * srcH);
    
    try {
        showImageNodeLoading(nodeId, '正在裁切...');
        const blob = await fetchImageAsBlob(node.url);
        const img = await loadImageFromBlob(blob);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, sWidth);
        canvas.height = Math.max(1, sHeight);
        const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        createImageNode(dataUrl, node.name ? `crop-${node.name}` : 'crop.png', node.x + node.width + 50, node.y);
        if (typeof showToast === 'function') showToast('裁切完成（已生成新图片）');
    } catch (err) {
        if (typeof showToast === 'function') showToast('裁切失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
        document.getElementById('crop-panel')?.remove();
        removeCropOverlay(nodeId);
    }
}

async function fetchImageAsBlob(url) {
    if (url.startsWith('data:') && typeof dataURLtoBlob === 'function') {
        return dataURLtoBlob(url);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
}

function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(img);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(objectUrl);
            reject(e);
        };
        img.src = objectUrl;
    });
}

// ==================== 局部迁移（黑色画笔 + 透明度 + 裁切） ====================
function getDefaultLocalTransferState(node) {
    return {
        brushSize: 28,
        brushOpacity: 0.45,
        eraseMode: false,
        cropRect: getDefaultCropRect(node),
        keepSizeMode: 'source'
    };
}

function ensureLocalTransferState(node) {
    if (!node) return null;
    if (!node.localTransfer) {
        node.localTransfer = getDefaultLocalTransferState(node);
    }
    if (!node.localTransfer.cropRect) {
        node.localTransfer.cropRect = getDefaultCropRect(node);
    }
    if (!node.localTransfer.undoStack) node.localTransfer.undoStack = [];
    return node.localTransfer;
}

function cleanupLocalTransferArtifacts(nodeId) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    nodeEl.classList.remove('local-transfer-mode');
    const overlay = nodeEl.querySelector('.local-transfer-overlay');
    if (overlay) overlay.remove();
}

function removeLocalTransferPanelAndOverlay(nodeId) {
    document.getElementById('local-transfer-panel')?.remove();
    cleanupLocalTransferArtifacts(nodeId);
}

function toggleLocalTransferPanel(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const existing = document.getElementById('local-transfer-panel');
    if (existing) {
        if (existing.dataset.nodeId === nodeId) {
            removeLocalTransferPanelAndOverlay(nodeId);
            return;
        }
        const prevNodeId = existing.dataset.nodeId;
        existing.remove();
        if (prevNodeId) cleanupLocalTransferArtifacts(prevNodeId);
    }
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    const state = ensureLocalTransferState(node);
    const panel = document.createElement('div');
    panel.id = 'local-transfer-panel';
    panel.dataset.nodeId = nodeId;
    panel.style.cssText = 'position:absolute;left:calc(100% + 12px);top:0;width:248px;background:white;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);border:1px solid #e5e7eb;z-index:120;display:flex;flex-direction:column;overflow:visible;animation:fadeIn 0.15s ease;pointer-events:auto;';
    panel.onclick = (e) => e.stopPropagation();
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;color:#111827;background:#f9fafb;">
            <span>局部迁移</span>
            <button onclick="event.stopPropagation();removeLocalTransferPanelAndOverlay('${nodeId}')" style="width:22px;height:22px;border-radius:6px;border:none;background:#f3f4f6;color:#6b7280;cursor:pointer;">×</button>
        </div>
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                <span style="font-size:11px;color:#6b7280;">画笔大小</span>
                <input id="lt-brush-size-${nodeId}" type="range" min="6" max="120" step="1" value="${state.brushSize}" style="flex:1;" />
                <span id="lt-brush-size-val-${nodeId}" style="width:30px;text-align:right;font-size:11px;color:#374151;">${state.brushSize}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                <span style="font-size:11px;color:#6b7280;">透明度</span>
                <input id="lt-brush-opacity-${nodeId}" type="range" min="0.1" max="1" step="0.05" value="${state.brushOpacity}" style="flex:1;" />
                <span id="lt-brush-opacity-val-${nodeId}" style="width:36px;text-align:right;font-size:11px;color:#374151;">${Math.round(state.brushOpacity * 100)}%</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <button id="lt-paint-btn-${nodeId}" onclick="event.stopPropagation();setLocalTransferEraseMode('${nodeId}', false)" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:${state.eraseMode ? '#f9fafb' : '#111827'};color:${state.eraseMode ? '#374151' : '#fff'};font-size:11px;cursor:pointer;">涂抹</button>
                <button id="lt-erase-btn-${nodeId}" onclick="event.stopPropagation();setLocalTransferEraseMode('${nodeId}', true)" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:${state.eraseMode ? '#111827' : '#f9fafb'};color:${state.eraseMode ? '#fff' : '#374151'};font-size:11px;cursor:pointer;">擦除</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <button onclick="event.stopPropagation();undoLocalTransferStroke('${nodeId}')" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;cursor:pointer;">撤销</button>
                <button onclick="event.stopPropagation();clearLocalTransferMask('${nodeId}')" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;cursor:pointer;">清空</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                <span style="font-size:11px;color:#6b7280;">迁移裁切</span>
                <button id="lt-crop-toggle-${nodeId}" onclick="event.stopPropagation();toggleLocalTransferCropMode('${nodeId}')" style="padding:6px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:11px;color:#374151;cursor:pointer;">开启</button>
            </div>
            <div style="font-size:10px;color:#9ca3af;">画笔固定黑色，透明度降低后可显示更多底图细节；本期不启用羽化。</div>
        </div>
        <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #f1f5f9;background:#fff;">
            <button onclick="event.stopPropagation();removeLocalTransferPanelAndOverlay('${nodeId}')" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;">取消</button>
            <button id="apply-local-transfer-btn-${nodeId}" onclick="event.stopPropagation();applyLocalTransfer('${nodeId}')" style="flex:1;padding:8px 10px;border-radius:8px;border:none;background:linear-gradient(135deg,#111827,#374151);color:white;font-size:12px;font-weight:600;cursor:pointer;">执行迁移</button>
        </div>
    `;
    nodeEl.appendChild(panel);
    initLocalTransferOverlay(nodeId);
    bindLocalTransferPanel(nodeId);
}

function initLocalTransferOverlay(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!node || !nodeEl) return;
    const state = ensureLocalTransferState(node);
    cleanupLocalTransferArtifacts(nodeId);
    nodeEl.classList.add('local-transfer-mode');
    const overlay = document.createElement('div');
    overlay.className = 'local-transfer-overlay';
    overlay.dataset.nodeId = nodeId;
    overlay.style.cssText = 'position:absolute;inset:0;z-index:85;pointer-events:auto;overflow:hidden;';
    const maskCanvas = document.createElement('canvas');
    maskCanvas.className = 'local-transfer-mask';
    maskCanvas.width = Math.max(1, Math.round(node.width));
    maskCanvas.height = Math.max(1, Math.round(node.height));
    maskCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;';
    const cropRect = document.createElement('div');
    cropRect.className = 'local-transfer-crop-rect';
    cropRect.style.cssText = 'position:absolute;border:2px dashed #22d3ee;border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,0.1);display:none;cursor:move;';
    ['nw', 'ne', 'sw', 'se'].forEach(corner => {
        const handle = document.createElement('div');
        handle.className = 'local-transfer-crop-handle';
        handle.dataset.corner = corner;
        handle.style.cssText = 'position:absolute;width:12px;height:12px;background:white;border:2px solid #22d3ee;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        if (corner.includes('n')) handle.style.top = '0';
        if (corner.includes('s')) handle.style.bottom = '0';
        if (corner.includes('w')) handle.style.left = '0';
        if (corner.includes('e')) handle.style.right = '0';
        if (corner === 'nw') handle.style.transform = 'translate(50%, 50%)';
        if (corner === 'ne') handle.style.transform = 'translate(-50%, 50%)';
        if (corner === 'sw') handle.style.transform = 'translate(50%, -50%)';
        if (corner === 'se') handle.style.transform = 'translate(-50%, -50%)';
        handle.style.cursor = `${corner}-resize`;
        cropRect.appendChild(handle);
    });
    overlay.appendChild(maskCanvas);
    overlay.appendChild(cropRect);
    // 添加画笔光标预览
    const brushCursor = document.createElement('div');
    brushCursor.className = 'local-transfer-brush-cursor';
    brushCursor.style.cssText = `position:absolute;width:${state.brushSize}px;height:${state.brushSize}px;border:2px solid #22d3ee;border-radius:50%;pointer-events:none;display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,0.3);`;
    overlay.appendChild(brushCursor);
    nodeEl.appendChild(overlay);
    state.cropMode = !!state.cropMode;
    if (!state.maskDataUrl) {
        const ctx = maskCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    } else {
        restoreLocalTransferMask(nodeId);
    }
    bindLocalTransferDrawEvents(nodeId);
    bindLocalTransferCropEvents(nodeId);
    updateLocalTransferCropUI(nodeId);
}

function restoreLocalTransferMask(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!node || !maskCanvas || !node.localTransfer?.maskDataUrl) return;
    const img = new Image();
    img.onload = () => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
    };
    img.src = node.localTransfer.maskDataUrl;
}

function bindLocalTransferPanel(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const state = ensureLocalTransferState(node);
    const sizeEl = document.getElementById(`lt-brush-size-${nodeId}`);
    const sizeValEl = document.getElementById(`lt-brush-size-val-${nodeId}`);
    const opacityEl = document.getElementById(`lt-brush-opacity-${nodeId}`);
    const opacityValEl = document.getElementById(`lt-brush-opacity-val-${nodeId}`);
    if (sizeEl) {
        const onSize = () => {
            const value = Math.max(1, parseInt(sizeEl.value, 10) || 1);
            state.brushSize = value;
            if (sizeValEl) sizeValEl.textContent = String(value);
            // 更新画笔光标大小
            updateBrushCursorSize(nodeId, value);
        };
        sizeEl.oninput = onSize;
        sizeEl.onchange = onSize;
    }
    if (opacityEl) {
        const onOpacity = () => {
            const value = Math.max(0.1, Math.min(1, parseFloat(opacityEl.value) || 0.45));
            state.brushOpacity = value;
            if (opacityValEl) opacityValEl.textContent = `${Math.round(value * 100)}%`;
            // 实时更新蒙版显示透明度
            updateMaskDisplayOpacity(nodeId, value);
        };
        opacityEl.oninput = onOpacity;
        opacityEl.onchange = onOpacity;
    }
}

// 更新蒙版显示透明度（实时预览）
function updateMaskDisplayOpacity(nodeId, opacity) {
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (maskCanvas) {
        maskCanvas.style.opacity = opacity;
    }
}

// 更新画笔光标大小
function updateBrushCursorSize(nodeId, size) {
    const cursor = document.querySelector(`#node-${nodeId} .local-transfer-brush-cursor`);
    if (cursor) {
        cursor.style.width = size + 'px';
        cursor.style.height = size + 'px';
    }
}

function pushLocalTransferUndo(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!node || !maskCanvas) return;
    const state = ensureLocalTransferState(node);
    state.undoStack = state.undoStack || [];
    state.undoStack.push(maskCanvas.toDataURL('image/png'));
    if (state.undoStack.length > 30) state.undoStack.shift();
}

function saveLocalTransferMaskSnapshot(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!node || !maskCanvas) return;
    const state = ensureLocalTransferState(node);
    state.maskDataUrl = maskCanvas.toDataURL('image/png');
}

function bindLocalTransferDrawEvents(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    const brushCursor = document.querySelector(`#node-${nodeId} .local-transfer-brush-cursor`);
    if (!node || !maskCanvas) return;
    const state = ensureLocalTransferState(node);
    let drawing = false;
    const getLocalPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * maskCanvas.width;
        const y = ((e.clientY - rect.top) / rect.height) * maskCanvas.height;
        return { x, y };
    };
    const getScreenPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const drawPoint = (x, y) => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = state.eraseMode ? 'destination-out' : 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = state.eraseMode ? 1 : (state.brushOpacity || 0.45);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, state.brushSize || 1) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
    const drawLine = (from, to) => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = state.eraseMode ? 'destination-out' : 'source-over';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = state.eraseMode ? 1 : (state.brushOpacity || 0.45);
        ctx.lineWidth = Math.max(1, state.brushSize || 1);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    };
    // 更新画笔光标位置
    const updateCursor = (e) => {
        if (!brushCursor || state.cropMode) return;
        const screenPos = getScreenPos(e);
        const rect = maskCanvas.getBoundingClientRect();
        const scaleX = rect.width / maskCanvas.width;
        const cursorSize = (state.brushSize || 28) * scaleX;
        brushCursor.style.width = cursorSize + 'px';
        brushCursor.style.height = cursorSize + 'px';
        brushCursor.style.left = screenPos.x + 'px';
        brushCursor.style.top = screenPos.y + 'px';
        brushCursor.style.display = 'block';
    };
    let prev = null;
    maskCanvas.onmousedown = (e) => {
        if (state.cropMode) return;
        e.stopPropagation();
        e.preventDefault();
        drawing = true;
        pushLocalTransferUndo(nodeId);
        const pos = getLocalPos(e);
        drawPoint(pos.x, pos.y);
        prev = pos;
    };
    maskCanvas.onmousemove = (e) => {
        updateCursor(e);
        if (!drawing || state.cropMode) return;
        e.stopPropagation();
        const pos = getLocalPos(e);
        if (prev) drawLine(prev, pos);
        prev = pos;
    };
    maskCanvas.onmouseenter = (e) => {
        if (brushCursor && !state.cropMode) {
            brushCursor.style.display = 'block';
            updateCursor(e);
        }
    };
    maskCanvas.onmouseleave = () => {
        if (brushCursor) brushCursor.style.display = 'none';
    };
    const onFinish = () => {
        if (!drawing) return;
        drawing = false;
        prev = null;
        saveLocalTransferMaskSnapshot(nodeId);
    };
    if (maskCanvas._localTransferMouseUpHandler) {
        document.removeEventListener('mouseup', maskCanvas._localTransferMouseUpHandler);
    }
    maskCanvas._localTransferMouseUpHandler = onFinish;
    document.addEventListener('mouseup', onFinish);
}

function setLocalTransferEraseMode(nodeId, eraseMode) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const state = ensureLocalTransferState(node);
    state.eraseMode = !!eraseMode;
    const paintBtn = document.getElementById(`lt-paint-btn-${nodeId}`);
    const eraseBtn = document.getElementById(`lt-erase-btn-${nodeId}`);
    if (paintBtn) {
        paintBtn.style.background = state.eraseMode ? '#f9fafb' : '#111827';
        paintBtn.style.color = state.eraseMode ? '#374151' : '#fff';
    }
    if (eraseBtn) {
        eraseBtn.style.background = state.eraseMode ? '#111827' : '#f9fafb';
        eraseBtn.style.color = state.eraseMode ? '#fff' : '#374151';
    }
}

function undoLocalTransferStroke(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!node || !maskCanvas) return;
    const state = ensureLocalTransferState(node);
    const last = (state.undoStack || []).pop();
    if (!last) return;
    const img = new Image();
    img.onload = () => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
        saveLocalTransferMaskSnapshot(nodeId);
    };
    img.src = last;
}

function clearLocalTransferMask(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!node || !maskCanvas) return;
    pushLocalTransferUndo(nodeId);
    const ctx = maskCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    const state = ensureLocalTransferState(node);
    state.maskDataUrl = maskCanvas.toDataURL('image/png');
}

function toggleLocalTransferCropMode(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const state = ensureLocalTransferState(node);
    state.cropMode = !state.cropMode;
    updateLocalTransferCropUI(nodeId);
}

function updateLocalTransferCropUI(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!node || !nodeEl) return;
    const state = ensureLocalTransferState(node);
    const btn = document.getElementById(`lt-crop-toggle-${nodeId}`);
    const rectEl = nodeEl.querySelector('.local-transfer-crop-rect');
    if (btn) {
        btn.textContent = state.cropMode ? '关闭' : '开启';
        btn.style.background = state.cropMode ? '#111827' : '#f9fafb';
        btn.style.color = state.cropMode ? '#fff' : '#374151';
    }
    if (rectEl) {
        rectEl.style.display = state.cropMode ? 'block' : 'none';
        const { x, y, width, height } = state.cropRect || getDefaultCropRect(node);
        rectEl.style.left = `${x}px`;
        rectEl.style.top = `${y}px`;
        rectEl.style.width = `${width}px`;
        rectEl.style.height = `${height}px`;
    }
}

function bindLocalTransferCropEvents(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    const rectEl = nodeEl?.querySelector('.local-transfer-crop-rect');
    if (!node || !nodeEl || !rectEl) return;
    const state = ensureLocalTransferState(node);
    let dragMode = null;
    let start = null;
    const onMouseDown = (e) => {
        if (!state.cropMode) return;
        e.stopPropagation();
        e.preventDefault();
        const corner = e.target.closest('.local-transfer-crop-handle')?.dataset.corner;
        const nodeRect = nodeEl.getBoundingClientRect();
        const scaleX = nodeRect.width / node.width;
        const scaleY = nodeRect.height / node.height;
        const startX = (e.clientX - nodeRect.left) / scaleX;
        const startY = (e.clientY - nodeRect.top) / scaleY;
        start = { x: startX, y: startY, rect: { ...state.cropRect } };
        dragMode = corner ? `resize-${corner}` : 'move';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e) => {
        if (!start || !state.cropMode) return;
        const nodeRect = nodeEl.getBoundingClientRect();
        const scaleX = nodeRect.width / node.width;
        const scaleY = nodeRect.height / node.height;
        const currentX = (e.clientX - nodeRect.left) / scaleX;
        const currentY = (e.clientY - nodeRect.top) / scaleY;
        const dx = currentX - start.x;
        const dy = currentY - start.y;
        let { x, y, width, height } = start.rect;
        if (dragMode === 'move') {
            x += dx;
            y += dy;
        } else if (dragMode?.startsWith('resize')) {
            const corner = dragMode.replace('resize-', '');
            // 1:1比例裁切：使用较大的变化量
            const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (corner === 'se') {
                width += delta;
                height += delta;
            } else if (corner === 'sw') {
                x -= delta;
                width += delta;
                height += delta;
            } else if (corner === 'ne') {
                y -= delta;
                width += delta;
                height += delta;
            } else if (corner === 'nw') {
                x -= delta;
                y -= delta;
                width += delta;
                height += delta;
            }
        }
        const minSize = 20;
        // 强制1:1比例
        const size = Math.max(minSize, Math.min(width, height));
        width = size;
        height = size;
        x = Math.max(0, Math.min(node.width - size, x));
        y = Math.max(0, Math.min(node.height - size, y));
        state.cropRect = { x, y, width, height };
        updateLocalTransferCropUI(nodeId);
    };
    const onMouseUp = () => {
        start = null;
        dragMode = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    rectEl.onmousedown = onMouseDown;
    rectEl.querySelectorAll('.local-transfer-crop-handle').forEach(handle => {
        handle.onmousedown = onMouseDown;
    });
}

function getLocalTransferMaskCoverage(nodeId, cropRect = null) {
    const maskCanvas = document.querySelector(`#node-${nodeId} .local-transfer-mask`);
    if (!maskCanvas) return 0;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return 0;
    const rect = cropRect || { x: 0, y: 0, width: maskCanvas.width, height: maskCanvas.height };
    const rx = Math.max(0, Math.floor(rect.x));
    const ry = Math.max(0, Math.floor(rect.y));
    const rw = Math.max(1, Math.min(maskCanvas.width - rx, Math.floor(rect.width)));
    const rh = Math.max(1, Math.min(maskCanvas.height - ry, Math.floor(rect.height)));
    let data;
    try {
        data = ctx.getImageData(rx, ry, rw, rh).data;
    } catch (err) {
        return 0;
    }
    let active = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 6) active++;
    }
    return active / (rw * rh);
}

function parseResolutionValue(resolution) {
    const value = typeof resolution === 'string' ? resolution : '';
    const m = value.match(/(\d+)\s*x\s*(\d+)/i);
    if (!m) return null;
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (!w || !h) return null;
    return { width: w, height: h };
}

async function buildLocalTransferComposite(node, generatedUrl, transferRectDisplay) {
    const srcBlob = await fetchImageAsBlob(node.url);
    const srcImg = await loadImageFromBlob(srcBlob);
    const patchBlob = await fetchImageAsBlob(generatedUrl);
    const patchImg = await loadImageFromBlob(patchBlob);
    const srcW = node.origW || node.width;
    const srcH = node.origH || node.height;
    const sx = Math.round((transferRectDisplay.x / node.width) * srcW);
    const sy = Math.round((transferRectDisplay.y / node.height) * srcH);
    const sWidth = Math.max(1, Math.round((transferRectDisplay.width / node.width) * srcW));
    const sHeight = Math.max(1, Math.round((transferRectDisplay.height / node.height) * srcH));
    const canvas = document.createElement('canvas');
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
    if (!ctx) throw new Error('合成画布不可用');
    ctx.drawImage(srcImg, 0, 0, srcW, srcH);
    ctx.drawImage(patchImg, 0, 0, patchImg.width, patchImg.height, sx, sy, sWidth, sHeight);
    return canvas.toDataURL('image/png');
}

async function applyLocalTransfer(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    const maskCanvas = nodeEl?.querySelector('.local-transfer-mask');
    if (!node || !node.url || !nodeEl || !maskCanvas) return;
    const state = ensureLocalTransferState(node);
    const transferRectDisplay = state.cropMode && state.cropRect ? state.cropRect : { x: 0, y: 0, width: node.width, height: node.height };
    const coverage = getLocalTransferMaskCoverage(nodeId, transferRectDisplay);
    if (coverage < 0.002) {
        if (typeof showToast === 'function') showToast('请先用黑色画笔涂抹需要迁移的区域', 'warning');
        return;
    }
    const srcW = node.origW || node.width;
    const srcH = node.origH || node.height;
    const sx = Math.round((transferRectDisplay.x / node.width) * srcW);
    const sy = Math.round((transferRectDisplay.y / node.height) * srcH);
    const sWidth = Math.max(1, Math.round((transferRectDisplay.width / node.width) * srcW));
    const sHeight = Math.max(1, Math.round((transferRectDisplay.height / node.height) * srcH));
    const srcBlob = await fetchImageAsBlob(node.url);
    const srcImg = await loadImageFromBlob(srcBlob);
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = sWidth;
    patchCanvas.height = sHeight;
    const patchCtx = patchCanvas.getContext('2d', { colorSpace: 'srgb' }) || patchCanvas.getContext('2d');
    if (!patchCtx) return;
    patchCtx.drawImage(srcImg, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    const localMaskCanvas = document.createElement('canvas');
    localMaskCanvas.width = sWidth;
    localMaskCanvas.height = sHeight;
    const localMaskCtx = localMaskCanvas.getContext('2d', { colorSpace: 'srgb' }) || localMaskCanvas.getContext('2d');
    if (!localMaskCtx) return;
    localMaskCtx.drawImage(
        maskCanvas,
        transferRectDisplay.x, transferRectDisplay.y, transferRectDisplay.width, transferRectDisplay.height,
        0, 0, sWidth, sHeight
    );
    const imageData = localMaskCtx.getImageData(0, 0, sWidth, sHeight);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const alpha = imageData.data[i + 3];
        const binary = alpha > 6 ? 255 : 0;
        imageData.data[i] = binary;
        imageData.data[i + 1] = binary;
        imageData.data[i + 2] = binary;
        imageData.data[i + 3] = 255;
    }
    localMaskCtx.putImageData(imageData, 0, 0);
    const patchDataUrl = patchCanvas.toDataURL('image/png');
    const maskDataUrl = localMaskCanvas.toDataURL('image/png');
    const ratio = getClosestAspectRatio(sWidth, sHeight);
    const panelResolutionEl = document.getElementById(`resolution-${nodeId}`);
    const fallbackResolution = getResolutionFromSize(srcW, srcH);
    const resolution = panelResolutionEl?.value || fallbackResolution;
    const parsedRes = parseResolutionValue(resolution) || { width: srcW, height: srcH };
    const prompt = `Local transfer edit with banana2. Strictly modify only masked area. Keep all unmasked content unchanged. Maintain original style, perspective, color consistency, and object boundaries.`;
    const applyBtn = document.getElementById(`apply-local-transfer-btn-${nodeId}`);
    try {
        if (applyBtn) {
            applyBtn.disabled = true;
            applyBtn.textContent = '迁移中...';
            applyBtn.style.opacity = '0.7';
        }
        showImageNodeLoading(nodeId, '正在执行局部迁移...');
        if (typeof generateImage !== 'function') throw new Error('图像生成接口不可用');
        const result = await generateImage({
            prompt,
            aspectRatio: ratio,
            resolution: `${parsedRes.width}x${parsedRes.height}`,
            referenceImages: [patchDataUrl, maskDataUrl],
            model: 'nano-banana-pro'
        });
        let imageUrl = null;
        if (result.type === 'immediate') {
            imageUrl = result.url;
        } else if (result.type === 'async' && typeof pollImageTask === 'function') {
            const poll = await pollImageTask(result.taskId);
            imageUrl = poll.url;
        }
        if (!imageUrl) throw new Error('未返回迁移结果');
        imageUrl = normalizeCanvasImageUrl(imageUrl);
        const mergedDataUrl = await buildLocalTransferComposite(node, imageUrl, transferRectDisplay);
        createImageNode(mergedDataUrl, node.name ? `transfer-${node.name}` : 'local-transfer.png', node.x + node.width + 50, node.y);
        if (typeof window.addGenerationToHistory === 'function') {
            window.addGenerationToHistory({ type: 'image', url: mergedDataUrl });
        }
        // 保存到本地文件夹（如果开启了媒体本地储存）
        if (isMediaStorageEnabled()) {
            saveMediaToLocal(mergedDataUrl, 'image', `transfer-${nodeId}-${Date.now()}.png`).catch(() => {});
        }
        if (typeof showToast === 'function') showToast('局部迁移完成（输出尺寸与原图一致）');
        removeLocalTransferPanelAndOverlay(nodeId);
    } catch (err) {
        if (typeof showToast === 'function') showToast('局部迁移失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = '执行迁移';
            applyBtn.style.opacity = '1';
        }
    }
}

// ==================== 局部迁移节点（新版） ====================

function createLocalTransferNodeAtPos(x, y) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    const node = {
        id, type: NODE_TYPES.AI_LOCAL_TRANSFER, x, y,
        width: 620, height: 420,
        sourceImage: null,
        referenceImages: [],
        brushSize: 28, brushOpacity: 0.45, eraseMode: false,
        maskDataUrl: null,
        cropRect: null, cropEnabled: false, cropPreviewUrl: null,
        prompt: '',
        ltModel: 'nano-banana-pro',
        resultUrl: null, resultImages: [], currentImageIndex: 0
    };
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderLocalTransferNode(node);
    hideEmptyHint();
    return id;
}

function renderLocalTransferNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    if (!node.resultImages) node.resultImages = [];
    if (!node.currentImageIndex) node.currentImageIndex = 0;
    if (!node.referenceImages) node.referenceImages = [];

    const existingEl = document.getElementById(`node-${node.id}`);
    if (existingEl) existingEl.remove();

    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node local-transfer-new-node absolute';
    el.style.cssText = `left:${node.x}px;top:${node.y}px;`;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;

    const hasSource = !!(node.sourceImage && node.sourceImage.url);
    const cropPreview = node.cropPreviewUrl || (hasSource ? (node.sourceImage.previewUrl || node.sourceImage.url) : '');
    const hasResult = node.resultUrl || (node.resultImages && node.resultImages.length > 0);
    const currentResultUrl = node.resultImages.length > 0 ? node.resultImages[node.currentImageIndex || 0] : node.resultUrl;
    const imageCount = node.resultImages.length;
    const hasMask = !!node.maskDataUrl;
    const hasCrop = !!node.cropPreviewUrl;
    const refCount = node.referenceImages.length;

    el.innerHTML = `
        <div class="node-body rounded-2xl overflow-hidden shadow-lg" style="width:620px;background:#ffffff;border:1px solid #e5e7eb;position:relative;display:flex;flex-direction:column;">
            <!-- 标题栏 -->
            <div style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;">
                <span style="font-size:12px;color:#3b82f6;font-weight:600;letter-spacing:0.5px;">✦ 局部迁移</span>
                <div style="display:flex;gap:6px;align-items:center;">
                    ${imageCount > 0 ? `<button id="multi-img-btn-${node.id}" onclick="event.stopPropagation();showLTImagePicker('${node.id}')" style="display:flex;align-items:center;gap:3px;padding:2px 8px;background:#f1f5f9;border:none;border-radius:10px;color:#64748b;font-size:10px;cursor:pointer;"><span id="img-count-${node.id}">${imageCount}</span>张</button>` : ''}
                    <button onclick="event.stopPropagation();ltFullscreen('${node.id}')" style="padding:2px 6px;background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;" title="全屏">⛶</button>
                    <button onclick="event.stopPropagation();ltDownload('${node.id}')" style="padding:2px 6px;background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;" title="下载">↓</button>
                    <button onclick="event.stopPropagation();window.deleteNode('${node.id}')" style="padding:2px 6px;background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;" title="删除">✕</button>
                </div>
            </div>
            <!-- 四宫格主体 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 10px;">
                <!-- 左上：原图区域 -->
                <div style="position:relative;">
                    <div id="lt-source-area-${node.id}" style="width:100%;aspect-ratio:1/1;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;">
                        ${hasSource ? `<img src="${cropPreview}" style="width:100%;height:100%;object-fit:${hasCrop ? 'cover' : 'contain'};"/>` : `<div style="text-align:center;color:#94a3b8;font-size:11px;"><div style="font-size:24px;opacity:0.4;margin-bottom:4px;">🖼️</div>连接图片到左侧端口</div>`}
                        ${hasMask && hasSource && !hasCrop ? `<img src="${node.maskDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.35;pointer-events:none;"/>` : ''}
                    </div>
                </div>
                <!-- 右上：功能区 -->
                <div id="lt-func-area-${node.id}" style="display:flex;flex-direction:column;gap:6px;">
                    <!-- 裁切/涂抹按钮 -->
                    <div data-action-btns style="display:flex;gap:6px;">
                        ${hasSource ? `
                        <button onclick="event.stopPropagation();ltOpenCropOnSource('${node.id}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#8b5cf6;color:#fff;cursor:pointer;white-space:nowrap;">✂ 裁切</button>
                        <button onclick="event.stopPropagation();ltOpenBrushOnSlot('${node.id}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;white-space:nowrap;">✏ 涂抹</button>
                        ` : ''}
                    </div>
                    <!-- 状态标签 -->
                    <div data-status-tags style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${hasCrop ? `<span style="font-size:10px;color:#8b5cf6;background:#f5f3ff;padding:2px 8px;border-radius:4px;">已裁切 ✓</span>` : ''}
                        ${hasMask ? `<span style="font-size:10px;color:#3b82f6;background:#eff6ff;padding:2px 8px;border-radius:4px;">已涂抹 ✓</span>` : ''}
                    </div>
                    <!-- 工具栏插槽 -->
                    <div id="lt-brush-toolbar-slot-${node.id}"></div>
                    <!-- 模型选择 -->
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:10px;color:#6b7280;white-space:nowrap;">模型</span>
                        <select id="lt-model-${node.id}" onchange="event.stopPropagation();ltUpdateModel('${node.id}',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" style="flex:1;padding:4px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc;color:#374151;outline:none;cursor:pointer;">
                            <option value="nano-banana-pro" ${(node.ltModel||'nano-banana-pro')==='nano-banana-pro'?'selected':''}>nano-banana-pro</option>
                            <option value="nano-banana-2" ${node.ltModel==='nano-banana-2'?'selected':''}>nano-banana-2</option>
                        </select>
                    </div>
                    <!-- 提示词 -->
                    <textarea id="lt-prompt-${node.id}" placeholder="描述局部迁移效果..." oninput="ltUpdatePrompt('${node.id}',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" style="flex:1;min-height:44px;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-size:12px;resize:none;outline:none;box-sizing:border-box;background:#f8fafc;color:#374151;">${node.prompt || ''}</textarea>
                </div>
                <!-- 左下：参考图 -->
                <div style="position:relative;">
                    <div id="lt-ref-area-${node.id}" style="width:100%;aspect-ratio:1/1;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;position:relative;">
                        ${refCount > 0 ? '' : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px;"><div style="text-align:center;"><div style="font-size:24px;opacity:0.4;margin-bottom:4px;">📎</div>连接参考图</div></div>`}
                    </div>
                </div>
                <!-- 右下：结果预览 + 操作 -->
                <div style="display:flex;flex-direction:column;position:relative;">
                    <div id="lt-result-area-${node.id}" style="width:100%;aspect-ratio:1/1;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                        ${hasResult ? `<img src="${currentResultUrl}" style="width:100%;height:100%;object-fit:contain;"/>` : `<div style="text-align:center;color:#94a3b8;font-size:11px;"><div style="font-size:24px;opacity:0.4;margin-bottom:4px;">🎨</div>生成结果</div>`}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;padding:6px 0 0;justify-content:flex-end;">
                        ${hasResult ? `<button onclick="event.stopPropagation();ltSendToCanvas('${node.id}')" style="padding:5px 10px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;">发送到画布</button>` : ''}
                        <button id="lt-run-btn-${node.id}" onclick="event.stopPropagation();applyLocalTransferNode('${node.id}')" style="padding:5px 14px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;opacity:${hasSource?1:0.4};" ${hasSource?'':'disabled'}>▶ 生成</button>
                    </div>
                </div>
            </div>
        </div>
        <!-- 端口：蓝色=左上中心, 紫色=左下中心, 绿色=右下中心 -->
        <div class="node-port can-connect-target connect-port floating-port" data-port="left" data-node-id="${node.id}" style="position:absolute;left:-36px;top:25%;width:28px;height:28px;background:#3b82f6;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(59,130,246,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="node-port can-connect-target connect-port floating-port lt-ref-port" data-port="left-ref" data-node-id="${node.id}" style="position:absolute;left:-36px;top:75%;width:28px;height:28px;background:#8b5cf6;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(139,92,246,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="node-port connect-port floating-port" data-port="right" data-node-id="${node.id}" style="position:absolute;right:-36px;top:75%;width:28px;height:28px;background:#22c55e;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(34,197,94,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <!-- 顶部工具栏 -->
        <div id="toolbar-panel-${node.id}" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">
            <button onclick="event.stopPropagation();ltFullscreen('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">⛶ 全屏</button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();ltDownload('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">↓ 下载</button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();window.deleteNode('${node.id}')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">🗑 删除</button>
        </div>
    `;

    el.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
    el.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    el.querySelectorAll('.floating-port').forEach(port => {
        port.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
        port.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    });
    container.appendChild(el);

    if (node.referenceImages.length > 0) {
        renderLTRefImages(node.id);
    }
}

function getLTCropSize(node) {
    if (!node.sourceImage) return { w: 256, h: 256 };
    const origW = node.sourceImage.origW || 512;
    const origH = node.sourceImage.origH || 512;
    const minSide = Math.min(origW, origH);
    return { w: minSide, h: minSide };
}

function ltUpdatePrompt(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.prompt = val;
}

function ltUpdateModel(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.ltModel = val;
}

// 连接到局部迁移节点（原图或参考图槽位）
function addConnectionToLocalTransfer(fromId, toId, slotType) {
    const fromNode = CanvasNodeSystem.nodes.find(n => n.id === fromId);
    const toNode = CanvasNodeSystem.nodes.find(n => n.id === toId);
    if (!fromNode || !toNode) return;

    let sourceUrl = null;
    if (fromNode.type === NODE_TYPES.IMAGE) {
        sourceUrl = fromNode.url;
    } else if (fromNode.type === NODE_TYPES.AI_DRAW || fromNode.type === NODE_TYPES.AI_TRYLOOK || fromNode.type === NODE_TYPES.RH_APP) {
        sourceUrl = (fromNode.resultImages && fromNode.resultImages.length > 0)
            ? fromNode.resultImages[fromNode.currentImageIndex || 0]
            : fromNode.resultUrl;
    }
    if (!sourceUrl) {
        if (typeof showToast === 'function') showToast('请先生成图片再连接', 'error');
        return;
    }

    const previewUrl = fromNode.previewUrl || sourceUrl;
    const origW = fromNode.origW || fromNode.width || 512;
    const origH = fromNode.origH || fromNode.height || 512;

    if (slotType === 'source') {
        // 原图槽位只能一个
        if (toNode.sourceImage) {
            if (typeof showToast === 'function') showToast('原图槽位已有图片，请先断开', 'warning');
            return;
        }
        toNode.sourceImage = { nodeId: fromId, url: sourceUrl, previewUrl, origW, origH };
        updateLTSourceDisplay(toId);
        if (typeof showToast === 'function') showToast('已连接原图');
    } else {
        // 参考图槽位可多个
        const transform = { x: 0, y: 0, scale: 1 };
        toNode.referenceImages.push({ nodeId: fromId, url: sourceUrl, previewUrl, transform });
        renderLTRefImages(toId);
        if (typeof showToast === 'function') showToast('已连接参考图');
    }

    renderConnections();
    updatePortConnectionStatus();
}

function updateLTSourceDisplay(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const area = document.getElementById(`lt-source-area-${nodeId}`);
    if (!node || !area) return;
    if (node.sourceImage && node.sourceImage.url) {
        const displayUrl = node.cropPreviewUrl || node.sourceImage.previewUrl || node.sourceImage.url;
        const isCropped = !!node.cropPreviewUrl;
        const hasMask = !!node.maskDataUrl;
        const maskOverlay = hasMask && !isCropped ? `<img src="${node.maskDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.35;pointer-events:none;"/>` : '';
        area.innerHTML = `<img src="${displayUrl}" style="width:100%;height:100%;object-fit:${isCropped ? 'cover' : 'contain'};"/>${maskOverlay}`;
        const runBtn = document.getElementById(`lt-run-btn-${nodeId}`);
        if (runBtn) { runBtn.disabled = false; runBtn.style.opacity = '1'; }
        // 更新右上功能区的状态标签和按钮
        const funcArea = document.getElementById(`lt-func-area-${nodeId}`);
        if (funcArea) {
            const btnsDiv = funcArea.querySelector('[data-action-btns]');
            if (btnsDiv && btnsDiv.children.length === 0) {
                btnsDiv.innerHTML = `
                    <button onclick="event.stopPropagation();ltOpenCropOnSource('${nodeId}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#8b5cf6;color:#fff;cursor:pointer;white-space:nowrap;">✂ 裁切</button>
                    <button onclick="event.stopPropagation();ltOpenBrushOnSlot('${nodeId}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;white-space:nowrap;">✏ 涂抹</button>`;
            }
            const statusDiv = funcArea.querySelector('[data-status-tags]');
            if (statusDiv) {
                statusDiv.innerHTML = (isCropped ? `<span style="font-size:10px;color:#8b5cf6;background:#f5f3ff;padding:2px 8px;border-radius:4px;">已裁切 ✓</span>` : '') +
                    (hasMask ? `<span style="font-size:10px;color:#3b82f6;background:#eff6ff;padding:2px 8px;border-radius:4px;">已涂抹 ✓</span>` : '');
            }
        }
    } else {
        area.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:11px;"><div style="font-size:24px;opacity:0.4;margin-bottom:4px;">🖼️</div>连接图片到左侧端口</div>`;
    }
}

// 渲染参考图列表到1:1调整区域
function renderLTRefImages(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const area = document.getElementById(`lt-ref-area-${nodeId}`);
    if (!node || !area) return;
    if (!node.referenceImages || node.referenceImages.length === 0) {
        area.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#4b5563;font-size:11px;"><div style="text-align:center;"><div style="font-size:24px;opacity:0.4;margin-bottom:4px;">📎</div>连接参考图</div></div>`;
        return;
    }
    area.innerHTML = '';
    const labels = '①②③④⑤⑥⑦⑧⑨⑩';
    node.referenceImages.forEach((ref, idx) => {
        const t = ref.transform || { x: 0, y: 0, scale: 1 };
        const imgWrap = document.createElement('div');
        imgWrap.className = 'lt-ref-img-wrap';
        imgWrap.dataset.refIndex = idx;
        imgWrap.style.cssText = `position:absolute;inset:0;overflow:hidden;cursor:grab;`;
        const img = document.createElement('img');
        img.src = ref.previewUrl || ref.url;
        img.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(calc(-50% + ${t.x}px), calc(-50% + ${t.y}px)) scale(${t.scale});max-width:none;pointer-events:none;user-select:none;`;
        img.draggable = false;
        imgWrap.appendChild(img);
        // 编号标签
        const label = document.createElement('div');
        label.textContent = labels[idx] || (idx + 1);
        label.style.cssText = 'position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;background:rgba(99,102,241,0.85);color:white;border:none;font-size:12px;z-index:5;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:600;pointer-events:none;';
        imgWrap.appendChild(label);
        // 删除按钮
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '×';
        delBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,0.5);color:white;border:none;font-size:12px;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center;line-height:1;';
        delBtn.onclick = (e) => { e.stopPropagation(); ltRemoveRef(nodeId, idx); };
        imgWrap.appendChild(delBtn);
        area.appendChild(imgWrap);
        bindLTRefDragEvents(nodeId, idx, imgWrap, img);
    });
}

function bindLTRefDragEvents(nodeId, refIndex, wrap, imgEl) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

    wrap.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault();
        dragging = true;
        const ref = node.referenceImages[refIndex];
        const t = ref?.transform || { x: 0, y: 0, scale: 1 };
        startX = e.clientX; startY = e.clientY;
        startTx = t.x; startTy = t.y;
        wrap.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
        if (!dragging) return;
        const ref = node.referenceImages[refIndex];
        if (!ref) return;
        ref.transform.x = startTx + (e.clientX - startX);
        ref.transform.y = startTy + (e.clientY - startY);
        imgEl.style.transform = `translate(calc(-50% + ${ref.transform.x}px), calc(-50% + ${ref.transform.y}px)) scale(${ref.transform.scale})`;
    };
    const onUp = () => {
        if (dragging) { dragging = false; wrap.style.cursor = 'grab'; }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    // 滚轮缩放
    wrap.onwheel = (e) => {
        e.stopPropagation(); e.preventDefault();
        const ref = node.referenceImages[refIndex];
        if (!ref) return;
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        ref.transform.scale = Math.max(0.1, Math.min(5, (ref.transform.scale || 1) + delta));
        imgEl.style.transform = `translate(calc(-50% + ${ref.transform.x}px), calc(-50% + ${ref.transform.y}px)) scale(${ref.transform.scale})`;
    };
}

function ltRemoveRef(nodeId, refIndex) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.referenceImages) return;
    const ref = node.referenceImages[refIndex];
    if (ref) {
        // 移除对应的connection
        CanvasNodeSystem.connections = CanvasNodeSystem.connections.filter(c => !(c.from === ref.nodeId && c.to === nodeId));
    }
    node.referenceImages.splice(refIndex, 1);
    renderLTRefImages(nodeId);
    renderConnections();
    updatePortConnectionStatus();
}

// ==================== 裁切功能：在源图片节点上操作 ====================
function ltOpenCropOnSource(ltNodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node || !node.sourceImage || !node.sourceImage.nodeId) {
        if (typeof showToast === 'function') showToast('请先连接原图', 'warning');
        return;
    }
    const sourceNodeId = node.sourceImage.nodeId;
    const sourceNode = CanvasNodeSystem.nodes.find(n => n.id === sourceNodeId);
    const sourceEl = document.getElementById(`node-${sourceNodeId}`);
    if (!sourceNode || !sourceEl) {
        if (typeof showToast === 'function') showToast('源图片节点不存在', 'error');
        return;
    }
    // 检查是否已有裁切overlay
    const existingOverlay = sourceEl.querySelector('.lt-crop-overlay');
    if (existingOverlay) {
        ltCloseCrop(ltNodeId);
        return;
    }

    sourceEl.classList.add('lt-crop-mode');
    const nodeBody = sourceEl.querySelector('.node-body');
    const targetContainer = nodeBody || sourceEl;

    const overlay = document.createElement('div');
    overlay.className = 'lt-crop-overlay';
    overlay.dataset.ltNodeId = ltNodeId;
    overlay.style.cssText = 'position:absolute;inset:0;z-index:200;pointer-events:auto;overflow:hidden;border-radius:8px;';

    const nw = Math.max(1, Math.round(sourceNode.width));
    const nh = Math.max(1, Math.round(sourceNode.height));

    // 1:1裁切框
    const side = Math.min(nw, nh) * 0.6;
    const cx = (nw - side) / 2, cy = (nh - side) / 2;
    const cr = node.cropRect || { x: cx, y: cy, width: side, height: side };

    const cropRect = document.createElement('div');
    cropRect.className = 'lt-crop-rect';
    cropRect.style.cssText = `position:absolute;left:${cr.x}px;top:${cr.y}px;width:${cr.width}px;height:${cr.height}px;border:2px dashed #8b5cf6;border-radius:4px;cursor:move;z-index:10;box-shadow:0 0 0 9999px rgba(0,0,0,0.4);pointer-events:auto;`;
    ['nw','ne','sw','se'].forEach(corner => {
        const handle = document.createElement('div');
        handle.dataset.corner = corner;
        handle.style.cssText = 'position:absolute;width:14px;height:14px;background:white;border:2px solid #8b5cf6;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto;';
        if (corner.includes('n')) handle.style.top = '-7px';
        if (corner.includes('s')) handle.style.bottom = '-7px';
        if (corner.includes('w')) handle.style.left = '-7px';
        if (corner.includes('e')) handle.style.right = '-7px';
        handle.style.cursor = `${corner}-resize`;
        cropRect.appendChild(handle);
    });

    overlay.appendChild(cropRect);
    targetContainer.appendChild(overlay);

    // 绑定裁切事件
    _bindCropRectEvents(ltNodeId, cropRect, nw, nh);
    // 显示裁切工具栏
    _showCropToolbar(ltNodeId, sourceNodeId);
}

function _bindCropRectEvents(ltNodeId, cropRectEl, maxW, maxH) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node || !cropRectEl) return;
    let mode = null, startX = 0, startY = 0, startRect = {};

    cropRectEl.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault();
        const handle = e.target.dataset?.corner;
        mode = handle || 'move';
        startX = e.clientX; startY = e.clientY;
        startRect = {
            x: parseFloat(cropRectEl.style.left) || 0,
            y: parseFloat(cropRectEl.style.top) || 0,
            width: parseFloat(cropRectEl.style.width) || 100,
            height: parseFloat(cropRectEl.style.height) || 100
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => {
        if (!mode) return;
        e.stopPropagation();
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (mode === 'move') {
            let nx = Math.max(0, Math.min(maxW - startRect.width, startRect.x + dx));
            let ny = Math.max(0, Math.min(maxH - startRect.height, startRect.y + dy));
            cropRectEl.style.left = nx + 'px';
            cropRectEl.style.top = ny + 'px';
        } else {
            let delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (mode === 'nw') delta = -delta;
            if (mode === 'ne') delta = Math.abs(dx) > Math.abs(dy) ? dx : -dy;
            if (mode === 'sw') delta = Math.abs(dx) > Math.abs(dy) ? -dx : dy;
            let newSize = Math.max(40, Math.min(maxW, maxH, startRect.width + delta));
            let nx = startRect.x, ny = startRect.y;
            if (mode.includes('w')) nx = startRect.x + startRect.width - newSize;
            if (mode.includes('n')) ny = startRect.y + startRect.height - newSize;
            nx = Math.max(0, Math.min(maxW - newSize, nx));
            ny = Math.max(0, Math.min(maxH - newSize, ny));
            cropRectEl.style.left = nx + 'px';
            cropRectEl.style.top = ny + 'px';
            cropRectEl.style.width = newSize + 'px';
            cropRectEl.style.height = newSize + 'px';
        }
    };
    const onUp = () => {
        mode = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
}

function _showCropToolbar(ltNodeId, sourceNodeId) {
    let tb = document.getElementById(`lt-crop-toolbar-${ltNodeId}`);
    if (tb) tb.remove();
    tb = document.createElement('div');
    tb.id = `lt-crop-toolbar-${ltNodeId}`;
    tb.style.cssText = 'background:#ffffff;border:2px solid #8b5cf6;border-radius:8px;padding:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;box-shadow:0 0 16px rgba(139,92,246,0.45),0 0 0 4px rgba(139,92,246,0.15);position:relative;z-index:10;';
    tb.onclick = (e) => e.stopPropagation();
    tb.innerHTML = `
        <span style="font-size:10px;color:#64748b;flex:1;">拖动调整裁切区域</span>
        <button onclick="event.stopPropagation();ltCloseCrop('${ltNodeId}')" style="padding:4px 10px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;">取消</button>
        <button onclick="event.stopPropagation();ltConfirmCrop('${ltNodeId}')" style="padding:4px 10px;font-size:10px;border-radius:6px;border:none;background:#8b5cf6;color:#fff;cursor:pointer;font-weight:600;">确认裁切</button>
    `;
    const slot = document.getElementById(`lt-brush-toolbar-slot-${ltNodeId}`);
    if (slot) { slot.innerHTML = ''; slot.appendChild(tb); }
}

function ltCloseCrop(ltNodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node) return;
    const sourceNodeId = node.sourceImage?.nodeId;
    const sourceEl = sourceNodeId ? document.getElementById(`node-${sourceNodeId}`) : null;
    if (sourceEl) {
        sourceEl.querySelector('.lt-crop-overlay')?.remove();
        sourceEl.classList.remove('lt-crop-mode');
    }
    document.getElementById(`lt-crop-toolbar-${ltNodeId}`)?.remove();
    const slot = document.getElementById(`lt-brush-toolbar-slot-${ltNodeId}`);
    if (slot) slot.innerHTML = '';
}

function ltConfirmCrop(ltNodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node) return;
    const sourceNodeId = node.sourceImage?.nodeId;
    const sourceEl = sourceNodeId ? document.getElementById(`node-${sourceNodeId}`) : null;
    if (sourceEl) {
        const cropRectEl = sourceEl.querySelector('.lt-crop-rect');
        if (cropRectEl) {
            node.cropRect = {
                x: parseFloat(cropRectEl.style.left) || 0,
                y: parseFloat(cropRectEl.style.top) || 0,
                width: parseFloat(cropRectEl.style.width) || 100,
                height: parseFloat(cropRectEl.style.height) || 100
            };
            node.cropEnabled = true;
        }
    }
    ltCloseCrop(ltNodeId);
    _ltGenerateCropPreview(ltNodeId);
    if (typeof showToast === 'function') showToast('裁切已保存');
}

// ==================== 涂抹功能：在迁移节点主槽位上操作 ====================
function ltOpenBrushOnSlot(ltNodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node || !node.sourceImage) {
        if (typeof showToast === 'function') showToast('请先连接原图', 'warning');
        return;
    }
    const area = document.getElementById(`lt-source-area-${ltNodeId}`);
    if (!area) return;

    // 检查是否已有涂抹overlay
    const existingOverlay = area.querySelector('.lt-brush-overlay');
    if (existingOverlay) {
        ltCloseBrushSlot(ltNodeId);
        return;
    }

    // 获取主槽位尺寸
    const areaRect = area.getBoundingClientRect();
    const aw = Math.round(areaRect.width);
    const ah = Math.round(areaRect.height);

    const overlay = document.createElement('div');
    overlay.className = 'lt-brush-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:50;pointer-events:auto;overflow:hidden;border-radius:10px;';

    const maskCanvas = document.createElement('canvas');
    maskCanvas.className = 'lt-mask-canvas';
    maskCanvas.width = aw; maskCanvas.height = ah;
    maskCanvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;opacity:${node.brushOpacity || 0.45};pointer-events:auto;`;

    const brushCursor = document.createElement('div');
    brushCursor.className = 'lt-brush-cursor';
    brushCursor.style.cssText = `position:absolute;width:${node.brushSize||28}px;height:${node.brushSize||28}px;border:2px solid #3b82f6;border-radius:50%;pointer-events:none;display:none;box-shadow:0 0 0 1px rgba(0,0,0,0.3);`;

    overlay.appendChild(maskCanvas);
    overlay.appendChild(brushCursor);
    area.appendChild(overlay);

    // 恢复已有mask
    if (node.maskDataUrl) {
        const img = new Image();
        img.onload = () => {
            const ctx = maskCanvas.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
        };
        img.src = node.maskDataUrl;
    }

    _bindBrushEvents(ltNodeId, maskCanvas, brushCursor);
    _showBrushToolbar(ltNodeId);
}

function _bindBrushEvents(nodeId, maskCanvas, brushCursor) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !maskCanvas) return;
    let drawing = false, prev = null;
    if (!node._ltUndoStack) node._ltUndoStack = [];

    const getLocalPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * maskCanvas.width, y: ((e.clientY - rect.top) / rect.height) * maskCanvas.height };
    };
    const getScreenPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const drawPoint = (x, y) => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = node.eraseMode ? 'destination-out' : 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = node.eraseMode ? 1 : (node.brushOpacity || 0.45);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, (node.brushSize || 28)) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
    const drawLine = (from, to) => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = node.eraseMode ? 'destination-out' : 'source-over';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = node.eraseMode ? 1 : (node.brushOpacity || 0.45);
        ctx.lineWidth = Math.max(1, (node.brushSize || 28));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.restore();
    };
    const updateCursor = (e) => {
        if (!brushCursor) return;
        const overlay = brushCursor.parentElement;
        const overlayRect = overlay ? overlay.getBoundingClientRect() : maskCanvas.getBoundingClientRect();
        const zoom = CanvasNodeSystem.zoom || 1;
        const rect = maskCanvas.getBoundingClientRect();
        const scaleX = rect.width / maskCanvas.width;
        const sz = (node.brushSize || 28) * scaleX / zoom;
        brushCursor.style.width = sz + 'px';
        brushCursor.style.height = sz + 'px';
        const ox = (e.clientX - overlayRect.left) / zoom;
        const oy = (e.clientY - overlayRect.top) / zoom;
        brushCursor.style.left = (ox - sz / 2) + 'px';
        brushCursor.style.top = (oy - sz / 2) + 'px';
        brushCursor.style.display = 'block';
    };

    maskCanvas.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault();
        drawing = true;
        node._ltUndoStack.push(maskCanvas.toDataURL('image/png'));
        if (node._ltUndoStack.length > 30) node._ltUndoStack.shift();
        const pos = getLocalPos(e);
        drawPoint(pos.x, pos.y);
        prev = pos;
    };
    maskCanvas.onmousemove = (e) => {
        updateCursor(e);
        if (!drawing) return;
        e.stopPropagation();
        const pos = getLocalPos(e);
        if (prev) drawLine(prev, pos);
        prev = pos;
    };
    maskCanvas.onmouseenter = (e) => { if (brushCursor) { brushCursor.style.display = 'block'; updateCursor(e); } };
    maskCanvas.onmouseleave = () => { if (brushCursor) brushCursor.style.display = 'none'; };

    const onFinish = () => {
        if (!drawing) return;
        drawing = false; prev = null;
        node.maskDataUrl = maskCanvas.toDataURL('image/png');
        // 更新状态标签
        const funcArea = document.getElementById(`lt-func-area-${nodeId}`);
        if (funcArea) {
            const statusDiv = funcArea.querySelector('[data-status-tags]');
            if (statusDiv) {
                const isCropped = !!node.cropPreviewUrl;
                statusDiv.innerHTML = (isCropped ? `<span style="font-size:10px;color:#8b5cf6;background:#f5f3ff;padding:2px 8px;border-radius:4px;">已裁切 ✓</span>` : '') +
                    `<span style="font-size:10px;color:#3b82f6;background:#eff6ff;padding:2px 8px;border-radius:4px;">已涂抹 ✓</span>`;
            }
        }
    };
    if (maskCanvas._ltMouseUp) document.removeEventListener('mouseup', maskCanvas._ltMouseUp);
    maskCanvas._ltMouseUp = onFinish;
    document.addEventListener('mouseup', onFinish);
}

function _showBrushToolbar(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    let tb = document.getElementById(`lt-brush-toolbar-${nodeId}`);
    if (tb) tb.remove();
    tb = document.createElement('div');
    tb.id = `lt-brush-toolbar-${nodeId}`;
    tb.style.cssText = 'background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;';
    tb.onclick = (e) => e.stopPropagation();
    tb.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:10px;color:#64748b;white-space:nowrap;">大小</span>
            <input type="range" min="6" max="80" value="${node.brushSize||28}" oninput="ltSetBrushSize('${nodeId}',this.value)" style="flex:1;min-width:0;"/>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:10px;color:#64748b;white-space:nowrap;">透明度</span>
            <input type="range" min="0.1" max="1" step="0.05" value="${node.brushOpacity||0.45}" oninput="ltSetBrushOpacity('${nodeId}',this.value)" style="flex:1;min-width:0;"/>
        </div>
        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
            <button onclick="event.stopPropagation();ltSetEraseMode('${nodeId}',false)" id="lt-paint-${nodeId}" style="padding:4px 8px;font-size:10px;border-radius:6px;border:none;background:${node.eraseMode?'#f1f5f9':'#3b82f6'};color:${node.eraseMode?'#64748b':'#fff'};cursor:pointer;">涂抹</button>
            <button onclick="event.stopPropagation();ltSetEraseMode('${nodeId}',true)" id="lt-erase-${nodeId}" style="padding:4px 8px;font-size:10px;border-radius:6px;border:none;background:${node.eraseMode?'#3b82f6':'#f1f5f9'};color:${node.eraseMode?'#fff':'#64748b'};cursor:pointer;">擦除</button>
            <button onclick="event.stopPropagation();ltUndoStroke('${nodeId}')" style="padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;">撤销</button>
            <button onclick="event.stopPropagation();ltClearMask('${nodeId}')" style="padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;">清空</button>
        </div>
    `;
    const slot = document.getElementById(`lt-brush-toolbar-slot-${nodeId}`);
    if (slot) { slot.innerHTML = ''; slot.appendChild(tb); }
}

function ltCloseBrushSlot(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const area = document.getElementById(`lt-source-area-${nodeId}`);
    if (node && area) {
        const maskCanvas = area.querySelector('.lt-mask-canvas');
        if (maskCanvas) {
            node.maskDataUrl = maskCanvas.toDataURL('image/png');
        }
        area.querySelector('.lt-brush-overlay')?.remove();
    }
    document.getElementById(`lt-brush-toolbar-${nodeId}`)?.remove();
    const slot = document.getElementById(`lt-brush-toolbar-slot-${nodeId}`);
    if (slot) slot.innerHTML = '';
    updateLTSourceDisplay(nodeId);
}

function ltConfirmBrushSlot(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const area = document.getElementById(`lt-source-area-${nodeId}`);
    if (node && area) {
        const maskCanvas = area.querySelector('.lt-mask-canvas');
        if (maskCanvas) {
            node.maskDataUrl = maskCanvas.toDataURL('image/png');
        }
    }
    ltCloseBrushSlot(nodeId);
    updateLTSourceDisplay(nodeId);
    if (typeof showToast === 'function') showToast('涂抹已保存');
}

// 旧函数兼容
function ltOpenBrushOnSourceNode(ltNodeId) {
    ltOpenBrushOnSlot(ltNodeId);
}

// 兼容旧调用
function ltOpenBrushPanel(nodeId) {
    ltOpenBrushOnSlot(nodeId);
}

function ltConfirmBrush(ltNodeId) {
    ltConfirmBrushSlot(ltNodeId);
}

function ltCancelBrush(ltNodeId) {
    ltCloseBrushSlot(ltNodeId);
}

function ltCloseBrushPanel(nodeId) {
    ltConfirmBrushSlot(nodeId);
}

function hideLTBrushToolbar(nodeId) {
    document.getElementById(`lt-brush-toolbar-${nodeId}`)?.remove();
}

function _ltFindMaskCanvas(nodeId) {
    return document.querySelector(`#lt-source-area-${nodeId} .lt-mask-canvas`);
}

function ltSetBrushSize(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.brushSize = Math.max(1, parseInt(val, 10) || 28);
}

function ltSetBrushOpacity(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.brushOpacity = Math.max(0.1, Math.min(1, parseFloat(val) || 0.45));
    const maskCanvas = _ltFindMaskCanvas(nodeId);
    if (maskCanvas) maskCanvas.style.opacity = val;
}

function ltSetEraseMode(nodeId, erase) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.eraseMode = !!erase;
    const paintBtn = document.getElementById(`lt-paint-${nodeId}`);
    const eraseBtn = document.getElementById(`lt-erase-${nodeId}`);
    if (paintBtn) { paintBtn.style.background = erase ? '#f1f5f9' : '#3b82f6'; paintBtn.style.color = erase ? '#64748b' : '#fff'; }
    if (eraseBtn) { eraseBtn.style.background = erase ? '#3b82f6' : '#f1f5f9'; eraseBtn.style.color = erase ? '#fff' : '#64748b'; }
}

function ltUndoStroke(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = _ltFindMaskCanvas(nodeId);
    if (!node || !maskCanvas || !node._ltUndoStack || node._ltUndoStack.length === 0) return;
    const last = node._ltUndoStack.pop();
    const img = new Image();
    img.onload = () => {
        const ctx = maskCanvas.getContext('2d');
        if (ctx) { ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); ctx.drawImage(img, 0, 0); }
        node.maskDataUrl = maskCanvas.toDataURL('image/png');
    };
    img.src = last;
}

function ltClearMask(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const maskCanvas = _ltFindMaskCanvas(nodeId);
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (node) node.maskDataUrl = null;
}

// 生成1:1裁切预览（从源图片裁切cropRect区域）
async function _ltGenerateCropPreview(ltNodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === ltNodeId);
    if (!node || !node.sourceImage || !node.sourceImage.url) { updateLTSourceDisplay(ltNodeId); return; }
    if (!node.cropRect) {
        node.cropPreviewUrl = null;
        updateLTSourceDisplay(ltNodeId);
        return;
    }
    try {
        const sourceNodeId = node.sourceImage.nodeId;
        const sourceNode = CanvasNodeSystem.nodes.find(n => n.id === sourceNodeId);
        const nw = sourceNode ? Math.round(sourceNode.width) : 512;
        const nh = sourceNode ? Math.round(sourceNode.height) : 512;
        const origW = node.sourceImage.origW || 512;
        const origH = node.sourceImage.origH || 512;
        // cropRect是在源节点逻辑坐标(nw x nh)上的，图片以object-fit:cover填充
        const imgRatio = origW / origH, nodeRatio = nw / nh;
        let displayW, displayH, offsetX, offsetY;
        if (imgRatio > nodeRatio) {
            displayH = nh; displayW = nh * imgRatio; offsetX = (nw - displayW) / 2; offsetY = 0;
        } else {
            displayW = nw; displayH = nw / imgRatio; offsetX = 0; offsetY = (nh - displayH) / 2;
        }
        const cr = node.cropRect;
        const sx = Math.round(((cr.x - offsetX) / displayW) * origW);
        const sy = Math.round(((cr.y - offsetY) / displayH) * origH);
        const sw = Math.round((cr.width / displayW) * origW);
        const sh = Math.round((cr.height / displayH) * origH);
        const srcBlob = await fetchImageAsBlob(node.sourceImage.url);
        const srcImg = await loadImageFromBlob(srcBlob);
        const cvs = document.createElement('canvas');
        const side = Math.max(sw, sh, 256);
        cvs.width = side; cvs.height = side;
        const ctx = cvs.getContext('2d', { colorSpace: 'srgb' }) || cvs.getContext('2d');
        ctx.drawImage(srcImg, Math.max(0, sx), Math.max(0, sy), Math.min(sw, origW), Math.min(sh, origH), 0, 0, side, side);
        node.cropPreviewUrl = cvs.toDataURL('image/jpeg', 0.85);
    } catch (e) {
        console.warn('裁切预览生成失败:', e);
        node.cropPreviewUrl = null;
    }
    updateLTSourceDisplay(ltNodeId);
}

// 执行局部迁移生图
async function applyLocalTransferNode(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.sourceImage || !node.sourceImage.url) {
        if (typeof showToast === 'function') showToast('请先连接原图', 'warning');
        return;
    }

    // 先关闭画笔面板保存mask
    ltCloseBrushPanel(nodeId);

    const sourceUrl = node.sourceImage.url;
    const origW = node.sourceImage.origW || 512;
    const origH = node.sourceImage.origH || 512;

    // 计算裁切区域（原图像素坐标）
    // cropRect现在是在源图片节点overlay上的坐标（maskW x maskH），图片以object-fit:cover填充
    const sourceNode = CanvasNodeSystem.nodes.find(n => n.id === (node.sourceImage.nodeId));
    const maskW = sourceNode ? Math.round(sourceNode.width) : origW;
    const maskH = sourceNode ? Math.round(sourceNode.height) : origH;
    let cropPixel;
    if (node.cropEnabled && node.cropRect) {
        const imgRatio = origW / origH, nodeRatio = maskW / maskH;
        let displayW, displayH, offsetX, offsetY;
        if (imgRatio > nodeRatio) {
            displayH = maskH; displayW = maskH * imgRatio; offsetX = (maskW - displayW) / 2; offsetY = 0;
        } else {
            displayW = maskW; displayH = maskW / imgRatio; offsetX = 0; offsetY = (maskH - displayH) / 2;
        }
        const sx = Math.round(((node.cropRect.x - offsetX) / displayW) * origW);
        const sy = Math.round(((node.cropRect.y - offsetY) / displayH) * origH);
        const side = Math.round((node.cropRect.width / displayW) * origW);
        cropPixel = { x: Math.max(0, sx), y: Math.max(0, sy), w: Math.min(side, origW), h: Math.min(side, origH) };
    } else {
        const side = Math.min(origW, origH);
        cropPixel = { x: Math.round((origW - side) / 2), y: Math.round((origH - side) / 2), w: side, h: side };
    }

    // 裁切原图（限制最大1024px用于API调用）
    const maxCropSize = 1024;
    const apiW = Math.min(cropPixel.w, maxCropSize);
    const apiH = Math.min(cropPixel.h, maxCropSize);
    const srcBlob = await fetchImageAsBlob(sourceUrl);
    const srcImg = await loadImageFromBlob(srcBlob);
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = apiW; patchCanvas.height = apiH;
    const patchCtx = patchCanvas.getContext('2d', { colorSpace: 'srgb' }) || patchCanvas.getContext('2d');
    patchCtx.drawImage(srcImg, cropPixel.x, cropPixel.y, cropPixel.w, cropPixel.h, 0, 0, apiW, apiH);

    // 处理mask
    let maskDataUrl = null;
    if (node.maskDataUrl) {
        const maskImg = await loadImageFromUrl(node.maskDataUrl);
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = apiW; maskCanvas.height = apiH;
        const maskCtx = maskCanvas.getContext('2d', { colorSpace: 'srgb' }) || maskCanvas.getContext('2d');
        // mask是在源节点上绘制的(maskW x maskH)，图片以object-fit:cover填充
        // 计算cover模式下图片在源节点中的显示区域
        const imgRatio = origW / origH;
        const nodeRatio = maskW / maskH;
        let displayW, displayH, offsetX, offsetY;
        if (imgRatio > nodeRatio) {
            // 图片更宽，高度填满，宽度裁切
            displayH = maskH; displayW = maskH * imgRatio;
            offsetX = (maskW - displayW) / 2; offsetY = 0;
        } else {
            // 图片更高，宽度填满，高度裁切
            displayW = maskW; displayH = maskW / imgRatio;
            offsetX = 0; offsetY = (maskH - displayH) / 2;
        }
        // 将cropPixel映射到mask坐标
        const scaleToMask = displayW / origW;
        const msx = cropPixel.x * scaleToMask + offsetX;
        const msy = cropPixel.y * scaleToMask + offsetY;
        const msw = cropPixel.w * scaleToMask;
        const msh = cropPixel.h * scaleToMask;
        maskCtx.drawImage(maskImg, msx, msy, msw, msh, 0, 0, apiW, apiH);
        // 二值化
        const imageData = maskCtx.getImageData(0, 0, apiW, apiH);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const a = imageData.data[i + 3];
            const b = a > 6 ? 255 : 0;
            imageData.data[i] = b; imageData.data[i+1] = b; imageData.data[i+2] = b; imageData.data[i+3] = 255;
        }
        maskCtx.putImageData(imageData, 0, 0);
        maskDataUrl = maskCanvas.toDataURL('image/png');
    }

    // 构建参考图合成（1:1区域）
    let refCompositeUrl = null;
    if (node.referenceImages && node.referenceImages.length > 0) {
        refCompositeUrl = await buildLTRefComposite(node, apiW, apiH);
    }

    const patchDataUrl = patchCanvas.toDataURL('image/png');
    const referenceImages = [patchDataUrl];
    if (maskDataUrl) referenceImages.push(maskDataUrl);
    if (refCompositeUrl) referenceImages.push(refCompositeUrl);

    const prompt = node.prompt || 'Local transfer edit. Modify only masked area using reference image style. Keep unmasked content unchanged.';
    const resolution = `${apiW}x${apiH}`;

    const selectedModel = node.ltModel || 'nano-banana-pro';
    const runBtn = document.getElementById(`lt-run-btn-${nodeId}`);
    try {
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = '生成中...'; }
        showImageNodeLoading(nodeId, '正在执行局部迁移...');
        if (typeof generateImage !== 'function') throw new Error('图像生成接口不可用');
        const result = await generateImage({
            prompt,
            aspectRatio: '1:1',
            resolution,
            referenceImages,
            model: selectedModel
        });
        let imageUrl = null;
        if (result.type === 'immediate') imageUrl = result.url;
        else if (result.type === 'async' && typeof pollImageTask === 'function') {
            const poll = await pollImageTask(result.taskId);
            imageUrl = poll.url;
        }
        if (!imageUrl) throw new Error('未返回迁移结果');
        imageUrl = normalizeCanvasImageUrl(imageUrl);

        // 精确像素回切到原图
        const finalUrl = await buildLTCompositeExact(sourceUrl, imageUrl, cropPixel, origW, origH);
        node.resultUrl = finalUrl;
        node.resultImages.push(finalUrl);
        node.currentImageIndex = node.resultImages.length - 1;

        // 更新结果预览
        const resultArea = document.getElementById(`lt-result-area-${nodeId}`);
        if (resultArea) {
            resultArea.style.display = '';
            resultArea.style.padding = '0 10px 8px';
            const tempImg = new Image();
            tempImg.onload = () => { resultArea.innerHTML = `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;max-height:180px;display:flex;align-items:center;justify-content:center;"><img src="${finalUrl}" style="max-width:100%;max-height:180px;object-fit:contain;"/></div>`; };
            tempImg.src = finalUrl;
        }
        // 更新多图计数
        const countEl = document.getElementById(`img-count-${nodeId}`);
        if (countEl) countEl.textContent = node.resultImages.length;
        const multiBtn = document.getElementById(`multi-img-btn-${nodeId}`);
        if (multiBtn) multiBtn.classList.remove('hidden');

        if (typeof window.addGenerationToHistory === 'function') window.addGenerationToHistory({ type: 'image', url: finalUrl });
        // 保存到本地文件夹（如果开启了媒体本地储存）
        if (isMediaStorageEnabled()) {
            saveMediaToLocal(finalUrl, 'image', `lt-${nodeId}-${Date.now()}.png`).catch(() => {});
        }
        if (typeof showToast === 'function') showToast('局部迁移完成');
    } catch (err) {
        if (typeof showToast === 'function') showToast('局部迁移失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
        if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '▶ 生成'; }
    }
}

// 构建参考图合成（将参考图按用户调整的位置合成到1:1画布上）
async function buildLTRefComposite(node, targetW, targetH) {
    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    for (const ref of node.referenceImages) {
        try {
            const blob = await fetchImageAsBlob(ref.url);
            const img = await loadImageFromBlob(blob);
            const t = ref.transform || { x: 0, y: 0, scale: 1 };
            const scale = t.scale || 1;
            const drawW = img.width * scale * (targetW / 400);
            const drawH = img.height * scale * (targetH / 400);
            const drawX = (targetW - drawW) / 2 + t.x * (targetW / 400);
            const drawY = (targetH - drawH) / 2 + t.y * (targetH / 400);
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch (e) {
            console.warn('参考图加载失败:', e);
        }
    }
    return canvas.toDataURL('image/jpeg', 0.92);
}

// 精确像素回切：将生成的patch贴回原图的裁切位置
async function buildLTCompositeExact(sourceUrl, patchUrl, cropPixel, origW, origH) {
    const srcBlob = await fetchImageAsBlob(sourceUrl);
    const srcImg = await loadImageFromBlob(srcBlob);
    const patchBlob = await fetchImageAsBlob(patchUrl);
    const patchImg = await loadImageFromBlob(patchBlob);

    const canvas = document.createElement('canvas');
    canvas.width = origW; canvas.height = origH;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');
    if (!ctx) throw new Error('合成画布不可用');
    ctx.drawImage(srcImg, 0, 0, origW, origH);
    ctx.drawImage(patchImg, 0, 0, patchImg.width, patchImg.height, cropPixel.x, cropPixel.y, cropPixel.w, cropPixel.h);
    return canvas.toDataURL('image/png');
}

function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// 发送结果到画布（创建新图片节点）
function ltSendToCanvas(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : node.resultUrl;
    if (!url) {
        if (typeof showToast === 'function') showToast('暂无结果可发送', 'warning');
        return;
    }
    createImageNode(url, 'local-transfer-result.png', node.x + node.width + 50, node.y);
    if (typeof showToast === 'function') showToast('已发送到画布');
}

function ltFullscreen(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : node.resultUrl;
    if (!url) return;
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center cursor-zoom-out';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${url}" class="max-w-[95vw] max-h-[95vh] object-contain" /><button onclick="event.stopPropagation();this.parentElement.remove();" class="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition-colors">\u00d7</button>`;
    document.body.appendChild(overlay);
}

async function ltDownload(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : node.resultUrl;
    if (!url) return;
    try {
        let blob;
        if (url.startsWith('data:') && typeof dataURLtoBlob === 'function') {
            blob = await dataURLtoBlob(url);
        } else {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            blob = await resp.blob();
        }
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = 'local-transfer.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch (e) {
        if (typeof showToast === 'function') showToast('下载失败: ' + e.message, 'error');
    }
}

function showLTImagePicker(nodeId) {
    if (typeof showImagePicker === 'function') showImagePicker(nodeId);
}

async function applyTextEdits(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;
    
    const panel = document.getElementById('text-edit-panel');
    if (!panel || panel.dataset.nodeId !== nodeId) return;
    
    const inputs = Array.from(panel.querySelectorAll('input[data-index]'));
    const newTexts = inputs.map(input => input.value.trim());
    const originalElements = node.textElements || [];
    
    const changes = [];
    for (let i = 0; i < Math.max(originalElements.length, newTexts.length); i++) {
        const elem = originalElements[i];
        const oldText = typeof elem === 'string' ? elem : (elem?.text || '');
        const style = (typeof elem === 'object' && elem?.style) ? elem.style : {};
        const newText = newTexts[i] || '';
        if (oldText && oldText !== newText) {
            changes.push({ oldText, newText, style });
        }
    }
    
    if (!changes.length) {
        if (typeof showToast === 'function') showToast('未发现需要修改的文字', 'warning');
        return;
    }
    
    const aspectRatio = getClosestAspectRatio(node.origW || node.width, node.origH || node.height);
    const panelResolution = getTextEditResolution(nodeId);
    const resolution = panelResolution || getResolutionFromSize(node.origW || node.width, node.origH || node.height);
    const prompt = buildTextReplacePrompt(changes);
    
    setTextEditPanelLoading(true);
    showImageNodeLoading(nodeId, '正在替换文字...');
    
    try {
        if (typeof generateImage !== 'function') {
            throw new Error('图像编辑接口不可用');
        }
        const result = await generateImage({
            prompt,
            aspectRatio,
            resolution,
            referenceImages: [node.url],
            model: 'qwen-image-edit'
        });
        
        let imageUrl = null;
        if (result.type === 'immediate') {
            imageUrl = result.url;
        } else if (result.type === 'async' && typeof pollImageTask === 'function') {
            const poll = await pollImageTask(result.taskId);
            imageUrl = poll.url;
        }
        
        if (imageUrl) {
            imageUrl = normalizeCanvasImageUrl(imageUrl);
            replaceImageNode(nodeId, imageUrl, node.name || 'text-edit.png');
            // 更新文字元素，保留原有样式信息
            node.textElements = originalElements.map((elem, i) => {
                const style = (typeof elem === 'object' && elem?.style) ? elem.style : {};
                return { text: newTexts[i] || '', style };
            });
            if (typeof window.addGenerationToHistory === 'function') {
                window.addGenerationToHistory({ type: 'image', url: imageUrl });
            }
            if (typeof showToast === 'function') showToast('文字替换完成！');
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('替换失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
        setTextEditPanelLoading(false);
    }
}

function buildTextReplacePrompt(changes) {
    const fontSizeDescMap = { small: '小号字', medium: '正常字号', large: '大号字', xlarge: '特大号字' };
    
    const lines = changes.map((item, idx) => {
        const nextText = item.newText === '' ? '[删除此文字]' : item.newText;
        const style = item.style || {};
        
        // 构建样式描述
        const styleDesc = [];
        if (style.color) styleDesc.push(`颜色${style.color}`);
        if (style.bold) styleDesc.push('粗体');
        if (style.fontStyle === 'italic') styleDesc.push('斜体');
        if (style.fontSize) styleDesc.push(fontSizeDescMap[style.fontSize] || style.fontSize);
        if (style.align && style.align !== 'left') styleDesc.push(`${style.align === 'center' ? '居中' : '右对齐'}`);
        
        const styleStr = styleDesc.length ? `（样式: ${styleDesc.join('、')}）` : '';
        return `${idx + 1}) "${item.oldText}" -> "${nextText}" ${styleStr}`;
    }).join('\n');
    
    return `保持原图风格完全一致，仅替换指定的文字内容。

关键要求：
- 新文字必须保持与原文字完全相同的视觉样式（字体、字号、字重、颜色、对齐方式）
- 不要改变文字的位置和排版
- 不要重绘背景、图标或其他装饰元素
- 替换后的文字应自然融入原图

请按如下对应替换：
${lines}

除指定替换的文字外，图片中其他所有元素必须保持不变。`;
}

function getClosestAspectRatio(width, height) {
    if (!width || !height) return '1:1';
    const target = width / height;
    const ratios = [
        { label: '1:1', value: 1 },
        { label: '4:3', value: 4 / 3 },
        { label: '3:4', value: 3 / 4 },
        { label: '16:9', value: 16 / 9 },
        { label: '9:16', value: 9 / 16 },
        { label: '3:2', value: 3 / 2 },
        { label: '2:3', value: 2 / 3 },
        { label: '21:9', value: 21 / 9 }
    ];
    let best = ratios[0];
    let bestDiff = Math.abs(target - best.value);
    ratios.forEach(ratio => {
        const diff = Math.abs(target - ratio.value);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = ratio;
        }
    });
    return best.label;
}

function getResolutionFromSize(width, height) {
    const maxSide = Math.max(width || 0, height || 0);
    if (maxSide >= 3500) return '4096x4096';
    if (maxSide >= 1700) return '2048x2048';
    return '1024x1024';
}

function getUpscaleResolution(width, height, maxSide = 4096) {
    if (!width || !height) return `${maxSide}x${maxSide}`;
    const ratio = width / height;
    if (!isFinite(ratio) || ratio <= 0) return `${maxSide}x${maxSide}`;
    if (ratio >= 1) {
        const w = maxSide;
        const h = Math.max(1, Math.round(maxSide / ratio));
        return `${w}x${h}`;
    }
    const h = maxSide;
    const w = Math.max(1, Math.round(maxSide * ratio));
    return `${w}x${h}`;
}

function updateSelectionUIPosition(node) {
    // 位置由节点本身的 style.left/top 控制，UI是相对定位的
}

function updateSelectionUISize(node) {
    const panel = document.getElementById('sel-panel');
    if (panel) {
        const panelWidth = Math.max(node.width, 520);
        panel.style.top = (node.height + 12) + 'px';
        panel.style.width = panelWidth + 'px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
    }
    // 更新分辨率显示
    const resText = `${node.origW||Math.round(node.width)} × ${node.origH||Math.round(node.height)}`;
    const resEl = document.getElementById('sel-resolution');
    if (resEl) resEl.textContent = resText;
}

// ==================== 连接线 ====================
function createTempLine() {
    const svg = document.getElementById('connections-svg');
    if (!svg) return;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.id = 'temp-line';
    line.setAttribute('stroke', '#3b82f6');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(line);
}

function updateTempLine(e) {
    const line = document.getElementById('temp-line');
    const fromNode = CanvasNodeSystem.nodes.find(n => n.id === CanvasNodeSystem.activeData.fromId);
    const fromPort = CanvasNodeSystem.activeData.fromPort;
    if (!line || !fromNode) return;
    
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    
    // 根据端口类型计算起始位置
    let x1, y1;
    if (fromPort === 'left') {
        // 从左侧端口开始
        x1 = fromNode.x - 36;
        y1 = fromNode.y + (fromNode.height || 200) / 2;
    } else {
        // 从右侧端口开始
        x1 = fromNode.x + fromNode.width + 36;
        y1 = fromNode.y + (fromNode.height || 200) / 2;
    }
    
    const x2 = (e.clientX - rect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const y2 = (e.clientY - rect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    
    const mx = (x1 + x2) / 2;
    line.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
}

function removeTempLine() {
    const line = document.getElementById('temp-line');
    if (line) line.remove();
}

function highlightPorts(excludeId) {
    const fromPort = CanvasNodeSystem.activeData.fromPort;
    const fromNode = CanvasNodeSystem.nodes.find(n => n.id === excludeId);
    
    document.querySelectorAll('.canvas-node').forEach(el => {
        if (el.dataset.nodeId !== excludeId) {
            const nodeId = el.dataset.nodeId;
            const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
            
            if (fromPort === 'left') {
                // 从左侧端口（输入端口）开始拖拽 - 高亮可作为源的节点的右侧端口
                // 只有 IMAGE 和 AI_DRAW（有结果）节点可以作为源
                if (node && (node.type === NODE_TYPES.IMAGE || 
                    (node.type === NODE_TYPES.AI_DRAW && (node.resultUrl || (node.resultImages && node.resultImages.length > 0))) ||
                    (node.type === NODE_TYPES.AI_TRYLOOK && (node.resultUrl || (node.resultImages && node.resultImages.length > 0))) ||
                    (node.type === NODE_TYPES.RH_APP && (node.resultUrl || (node.resultImages && node.resultImages.length > 0))))) {
                    el.querySelectorAll('.node-port[data-port="right"]').forEach(p => {
                        p.classList.add('can-connect');
                        p.classList.add('can-connect-target'); // 添加目标类以便检测
                        p.style.animation = 'pulsePort 0.8s ease infinite';
                        p.style.transform = 'translateY(-50%) scale(1.1)';
                    });
                }
            } else {
                // 从右侧端口（输出端口）开始拖拽 - 高亮左侧输入端口
                el.querySelectorAll('.can-connect-target').forEach(p => {
                    p.classList.add('can-connect');
                    p.style.animation = 'pulsePort 0.8s ease infinite';
                    p.style.transform = 'translateY(-50%) scale(1.1)';
                });
            }
        }
    });
}

function unhighlightPorts() {
    document.querySelectorAll('.can-connect').forEach(p => {
        p.classList.remove('can-connect');
        // 只移除右侧端口临时添加的 can-connect-target 类
        if (p.dataset.port === 'right') {
            p.classList.remove('can-connect-target');
        }
        p.style.animation = '';
        p.style.transform = 'translateY(-50%)';
    });
}

function addConnection(fromId, toId) {
    const exists = CanvasNodeSystem.connections.some(c => c.from === fromId && c.to === toId);
    if (exists) return;

    const fromNode = CanvasNodeSystem.nodes.find(n => n.id === fromId);
    const toNode = CanvasNodeSystem.nodes.find(n => n.id === toId);

    if (!fromNode || !toNode) return;
    const canUseAsSource = fromNode.type === NODE_TYPES.IMAGE
        || fromNode.type === NODE_TYPES.AI_DRAW
        || fromNode.type === NODE_TYPES.AI_TRYLOOK
        || fromNode.type === NODE_TYPES.RH_APP;
    if (!canUseAsSource) return;
    if (toNode.type !== NODE_TYPES.AI_DRAW && toNode.type !== NODE_TYPES.AI_VIDEO && toNode.type !== NODE_TYPES.AI_TRYLOOK && toNode.type !== NODE_TYPES.AI_LOCAL_TRANSFER && toNode.type !== NODE_TYPES.RH_APP) return;

    let sourceUrl = null;
    if (fromNode.type === NODE_TYPES.IMAGE) {
        sourceUrl = fromNode.url;
    } else if (fromNode.type === NODE_TYPES.AI_DRAW) {
        sourceUrl = (fromNode.resultImages && fromNode.resultImages.length > 0)
            ? fromNode.resultImages[fromNode.currentImageIndex || 0]
            : fromNode.resultUrl;
    } else if (fromNode.type === NODE_TYPES.AI_TRYLOOK) {
        sourceUrl = (fromNode.resultImages && fromNode.resultImages.length > 0)
            ? fromNode.resultImages[fromNode.currentImageIndex || 0]
            : fromNode.resultUrl;
    } else if (fromNode.type === NODE_TYPES.RH_APP) {
        sourceUrl = (fromNode.resultImages && fromNode.resultImages.length > 0)
            ? fromNode.resultImages[fromNode.currentImageIndex || 0]
            : fromNode.resultUrl;
    }
    if (!sourceUrl) {
        if (typeof showToast === 'function') showToast('请先生成图片再连接', 'error');
        return;
    }

    pushUndoState(captureCanvasState());
    CanvasNodeSystem.connections.push({ from: fromId, to: toId });

    // 局部迁移节点特殊处理
    if (toNode.type === NODE_TYPES.AI_LOCAL_TRANSFER) {
        addConnectionToLocalTransfer(fromId, toId, toNode.sourceImage ? 'reference' : 'source');
        return;
    }

    const entry = { nodeId: fromId, url: sourceUrl, previewUrl: null };
    toNode.inputImages.push(entry);
    ensureInputImagePreview(toNode, entry);

    renderConnections();
    updatePortConnectionStatus();

    if (toNode.type === NODE_TYPES.AI_DRAW) updateAIDrawRefs(toNode);
    if (toNode.type === NODE_TYPES.AI_VIDEO) updateAIVideoRefs(toNode);
    if (toNode.type === NODE_TYPES.AI_TRYLOOK) updateAITryLookRefs(toNode);
    if (toNode.type === NODE_TYPES.RH_APP && typeof updateRhAppRefs === 'function') updateRhAppRefs(toNode);

    if (typeof showToast === 'function') showToast('已连接');
}

// 更新端口的连接状态（被连接时变绿）
function updatePortConnectionStatus() {
    // 先移除所有端口的connected类
    document.querySelectorAll('.floating-port.connected').forEach(p => {
        p.classList.remove('connected');
    });
    
    // 为有连接的端口添加connected类
    CanvasNodeSystem.connections.forEach(conn => {
        // 源节点的右侧端口
        const fromEl = document.querySelector(`[data-node-id="${conn.from}"][data-port="right"]`);
        if (fromEl) fromEl.classList.add('connected');
        
        // 目标节点的左侧端口
        const toEl = document.querySelector(`[data-node-id="${conn.to}"][data-port="left"]`);
        if (toEl) toEl.classList.add('connected');
    });
}

function toggleNodePorts(nodeId, show) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    const ports = nodeEl.querySelectorAll('.floating-port');
    if (show) {
        const timer = CanvasNodeSystem.portHideTimers[nodeId];
        if (timer) clearTimeout(timer);
        nodeEl.classList.add('show-ports');
        return;
    }
    const hideTimer = setTimeout(() => {
        const isHovering = nodeEl.matches(':hover') || Array.from(ports).some(p => p.matches(':hover'));
        if (!isHovering) nodeEl.classList.remove('show-ports');
    }, 400);
    CanvasNodeSystem.portHideTimers[nodeId] = hideTimer;
}

function renderConnections() {
    const svg = document.getElementById('connections-svg');
    if (!svg) return;
    
    // 保留临时线
    const tempLine = document.getElementById('temp-line');
    svg.innerHTML = '';
    if (tempLine) svg.appendChild(tempLine);
    
    // 移除旧的连线删除按钮
    document.querySelectorAll('.connection-delete-btn-inline').forEach(el => el.remove());
    
    CanvasNodeSystem.connections.forEach((c, index) => {
        const from = CanvasNodeSystem.nodes.find(n => n.id === c.from);
        const to = CanvasNodeSystem.nodes.find(n => n.id === c.to);
        if (!from || !to) return;
        
        // 计算节点边缘位置（连线直接连接到节点边缘）
        const x1 = from.x + from.width;
        const y1 = from.y + (from.height || 200) / 2;
        const x2 = to.x;
        const y2 = to.y + (to.height || 200) / 2;
        
        const mx = (x1 + x2) / 2;
        const pathD = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        
        // 计算曲线中点（贝塞尔曲线的近似中点）
        const midX = (x1 + 2 * mx + x2) / 4;
        const midY = (y1 + y2) / 2;
        
        // 创建可点击的透明宽线（方便点击）
        const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitArea.setAttribute('d', pathD);
        hitArea.setAttribute('stroke', 'transparent');
        hitArea.setAttribute('stroke-width', '16');
        hitArea.setAttribute('fill', 'none');
        hitArea.setAttribute('cursor', 'pointer');
        hitArea.dataset.connectionIndex = index;
        hitArea.dataset.fromId = c.from;
        hitArea.dataset.toId = c.to;
        
        // 双击显示删除按钮（保留原有功能）
        hitArea.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showConnectionDeleteButton(e, index, c.from, c.to);
        });
        
        // 阻止单击冒泡
        hitArea.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        svg.appendChild(hitArea);
        
        // 可见的连接线
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('stroke', '#6b7280');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('pointer-events', 'none');
        svg.appendChild(path);
        
        // 在连线中间添加删除按钮（使用HTML元素覆盖在SVG上）
        createConnectionDeleteButton(c.from, c.to, midX, midY);
    });
}

// 在连线中间创建删除按钮
function createConnectionDeleteButton(fromId, toId, x, y) {
    const nodesLayer = document.getElementById('nodes-layer');
    if (!nodesLayer) return;
    
    const btn = document.createElement('div');
    btn.className = 'connection-delete-btn-inline';
    btn.dataset.fromId = fromId;
    btn.dataset.toId = toId;
    btn.style.cssText = `
        position: absolute;
        left: ${x - 12}px;
        top: ${y - 12}px;
        width: 24px;
        height: 24px;
        background: white;
        border: 2px solid #e5e7eb;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 15;
        opacity: 0;
        transition: all 0.15s ease;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    `;
    btn.innerHTML = `
        <svg style="width:12px;height:12px;color:#9ca3af;transition:color 0.15s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
    `;
    
    // 鼠标悬停显示
    btn.onmouseenter = () => {
        btn.style.opacity = '1';
        btn.style.borderColor = '#ef4444';
        btn.style.background = '#fef2f2';
        btn.querySelector('svg').style.color = '#ef4444';
    };
    btn.onmouseleave = () => {
        btn.style.opacity = '0';
        btn.style.borderColor = '#e5e7eb';
        btn.style.background = 'white';
        btn.querySelector('svg').style.color = '#9ca3af';
    };
    
    // 点击删除
    btn.onclick = (e) => {
        e.stopPropagation();
        deleteConnection(fromId, toId);
    };
    
    nodesLayer.appendChild(btn);
    
    // 当鼠标靠近连线时显示删除按钮
    const showOnHover = () => {
        document.querySelectorAll('.connection-delete-btn-inline').forEach(b => {
            b.style.opacity = '0.6';
        });
    };
    const hideOnLeave = () => {
        document.querySelectorAll('.connection-delete-btn-inline').forEach(b => {
            if (!b.matches(':hover')) {
                b.style.opacity = '0';
            }
        });
    };
    
    // 监听连线区域的悬停
    const svg = document.getElementById('connections-svg');
    if (svg && !svg._hoverListenerAdded) {
        svg._hoverListenerAdded = true;
        svg.style.pointerEvents = 'auto';
        svg.addEventListener('mouseenter', showOnHover);
        svg.addEventListener('mouseleave', hideOnLeave);
    }
}

// 显示连接线删除按钮
function showConnectionDeleteButton(e, connectionIndex, fromId, toId) {
    // 移除已有的删除按钮
    const existing = document.getElementById('connection-delete-btn');
    if (existing) existing.remove();
    
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    
    const btn = document.createElement('div');
    btn.id = 'connection-delete-btn';
    btn.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY - 40}px;
        background: #ef4444;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 6px;
        animation: fadeIn 0.15s ease;
    `;
    btn.innerHTML = `
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        删除连线
    `;
    
    btn.onclick = (evt) => {
        evt.stopPropagation();
        deleteConnection(fromId, toId);
        btn.remove();
    };
    
    document.body.appendChild(btn);
    
    // 点击其他地方关闭
    const closeHandler = (evt) => {
        if (!btn.contains(evt.target)) {
            btn.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
    }, 100);
}

// 删除连接
function deleteConnection(fromId, toId) {
    const index = CanvasNodeSystem.connections.findIndex(c => c.from === fromId && c.to === toId);
    if (index === -1) return;
    
    // 删除连接
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.connections.splice(index, 1);
    
    // 更新目标节点的引用图片
    const toNode = CanvasNodeSystem.nodes.find(n => n.id === toId);
    if (toNode) {
        if (toNode.inputImages) {
            toNode.inputImages = toNode.inputImages.filter(img => img.nodeId !== fromId);
            if (toNode.type === NODE_TYPES.AI_DRAW) updateAIDrawRefs(toNode);
            if (toNode.type === NODE_TYPES.AI_VIDEO) updateAIVideoRefs(toNode);
            if (toNode.type === NODE_TYPES.AI_TRYLOOK) updateAITryLookRefs(toNode);
            if (toNode.type === NODE_TYPES.RH_APP && typeof updateRhAppRefs === 'function') updateRhAppRefs(toNode);
        }
        if (toNode.type === NODE_TYPES.AI_LOCAL_TRANSFER) {
            if (toNode.sourceImage && toNode.sourceImage.nodeId === fromId) {
                toNode.sourceImage = null;
                toNode.cropPreviewUrl = null; toNode.maskDataUrl = null; toNode.cropRect = null;
                updateLTSourceDisplay(toId);
            }
            if (toNode.referenceImages) {
                toNode.referenceImages = toNode.referenceImages.filter(r => r.nodeId !== fromId);
                renderLTRefImages(toId);
            }
        }
    }
    
    renderConnections();
    updatePortConnectionStatus();
    if (typeof showToast === 'function') showToast('连线已删除');
}

// ==================== 操作函数 ====================

function normalizeApiBaseUrl(url) {
    return String(url || '').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
}

function cleanReversePromptText(content) {
    if (!content) return '';
    let cleaned = String(content).trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    cleaned = cleaned.replace(/^["“]|["”]$/g, '').trim();
    return cleaned;
}

async function reversePromptFromImage(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;

    const apiKey = (typeof apiConfig !== 'undefined' && apiConfig.apiKey) ? apiConfig.apiKey : '';
    if (!apiKey) {
        if (typeof showToast === 'function') showToast('请先配置 API Key', 'error');
        if (typeof openSettings === 'function') openSettings();
        return;
    }

    const baseUrl = (typeof apiConfig !== 'undefined' && apiConfig.baseUrl)
        ? apiConfig.baseUrl
        : (typeof DEFAULT_API_URL !== 'undefined' ? DEFAULT_API_URL : '');
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;

    const systemPrompt = `你是一个提示词工程师，详细叙述这个图片
要求：中文提示词，不要出现对图像水印的描述，不要出现无关的文字和符号，不需要总结，限制在1000字以内`;
    const userInstruction = '请根据这张图片生成详细提示词。';

    if (typeof showToast === 'function') showToast('正在反推提示词...');
    showImageNodeLoading(nodeId, '正在反推提示词...');

    try {
        // 关键：将 blob URL 转换为 base64 data URL，确保 API 能访问图片
        let base64ImageUrl;
        if (typeof imageUrlToBase64DataUrl === 'function') {
            try {
                base64ImageUrl = await imageUrlToBase64DataUrl(node.url);
                console.log('[反推] 图片已转换为 base64，长度:', base64ImageUrl.length);
            } catch (e) {
                console.error('[反推] 图片转换失败:', e);
                throw new Error('图片读取失败');
            }
        } else {
            base64ImageUrl = node.url;
        }

        const llmModel = (typeof modelConfig !== 'undefined' && modelConfig.llm) ? modelConfig.llm : 'gemini-3-flash-preview';

        const multimodalMessages = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userInstruction },
                    { type: 'image_url', image_url: { url: base64ImageUrl } }
                ]
            }
        ];

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: llmModel,
                    messages: multimodalMessages,
                    temperature: 0.6,
                    max_tokens: 1500
                })
            });
        } catch (e) {
            response = null;
        }

        if (!response || !response.ok) {
            // 降级：尝试 detail:low 模式
            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: llmModel,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: [
                                { type: 'text', text: userInstruction },
                                { type: 'image_url', image_url: { url: base64ImageUrl, detail: 'low' } }
                            ] }
                        ],
                        temperature: 0.6,
                        max_tokens: 1500
                    })
                });
            } catch (e2) {
                throw new Error('反推请求失败，请检查网络');
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`反推失败: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const rawPrompt = data?.choices?.[0]?.message?.content || '';
        const promptText = cleanReversePromptText(rawPrompt);
        if (!promptText) throw new Error('未获取到有效提示词');

        if (typeof createAIDrawNodeAtPos !== 'function') {
            throw new Error('AI 绘图节点不可用');
        }

        const newId = createAIDrawNodeAtPos(node.x + node.width + 60, node.y);
        const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
        if (newNode) {
            newNode.prompt = promptText;
            newNode.aspectRatio = getClosestAspectRatio(node.origW || node.width, node.origH || node.height);
            newNode.resolution = getResolutionFromSize(node.origW || node.width, node.origH || node.height);
        }

        setTimeout(() => {
            const promptEl = document.getElementById(`prompt-${newId}`);
            const ratioEl = document.getElementById(`ratio-${newId}`);
            const resolutionEl = document.getElementById(`resolution-${newId}`);
            if (promptEl) promptEl.value = promptText;
            if (ratioEl && newNode?.aspectRatio) ratioEl.value = newNode.aspectRatio;
            if (resolutionEl && newNode?.resolution) resolutionEl.value = newNode.resolution;
            if (typeof selectCanvasNode === 'function') selectCanvasNode(newId);
        }, 60);

        if (typeof showToast === 'function') showToast('反推完成，已生成AI绘图节点');
    } catch (err) {
        if (typeof showToast === 'function') showToast('反推失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
    }
}

// 放大至4K（保持画面细节）
async function actionUpscale(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    if (typeof showToast === 'function') showToast('正在放大至4K...');
    showImageNodeLoading(nodeId, '正在放大至4K...');
    
    // 预设放大提示词：保持原图细节
    const upscalePrompt = `High resolution 4K upscale of the image, maintain all original details, enhance clarity and sharpness without changing any elements, preserve the exact composition and style`;
    
    // 获取当前节点的图片URL作为参考图
    const referenceImages = node.url ? [node.url] : [];
    
    try {
        if (typeof generateImage === 'function') {
            const targetW = node.origW || node.width;
            const targetH = node.origH || node.height;
            const aspectRatio = getClosestAspectRatio(targetW, targetH);
            const resolution = getUpscaleResolution(targetW, targetH, 4096);
            const result = await generateImage({ 
                prompt: upscalePrompt, 
                aspectRatio: aspectRatio, 
                resolution: resolution,
                referenceImages: referenceImages  // 传递参考图片
            });
            
            let imageUrl = null;
            if (result.type === 'immediate') {
                imageUrl = result.url;
            } else if (result.type === 'async' && typeof pollImageTask === 'function') {
                const poll = await pollImageTask(result.taskId);
                imageUrl = poll.url;
            }
            
            if (imageUrl) {
                imageUrl = normalizeCanvasImageUrl(imageUrl);
                createImageNode(imageUrl, 'upscaled-4k.png', node.x + node.width + 50, node.y);
                if (typeof window.addGenerationToHistory === 'function') {
                    window.addGenerationToHistory({ type: 'image', url: imageUrl });
                }
                if (typeof showToast === 'function') showToast('4K放大完成！');
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('放大失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
    }
}

// 移除背景（保留主体）
async function actionRemoveBg(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    if (typeof showToast === 'function') showToast('正在移除背景...');
    showImageNodeLoading(nodeId, '正在移除背景...');
    
    // 预设移除背景提示词
    const removeBgPrompt = `Remove the background completely, keep only the main subject/object in the center, create a pure white background, professional product photo style with clean edges`;
    
    // 获取当前节点的图片URL作为参考图
    const referenceImages = node.url ? [node.url] : [];
    
    try {
        if (typeof generateImage === 'function') {
            const aspectRatio = getClosestAspectRatio(node.origW || node.width, node.origH || node.height);
            const result = await generateImage({ 
                prompt: removeBgPrompt, 
                aspectRatio,
                resolution: '4096x4096',
                referenceImages: referenceImages  // 传递参考图片
            });
            
            let imageUrl = null;
            if (result.type === 'immediate') {
                imageUrl = result.url;
            } else if (result.type === 'async' && typeof pollImageTask === 'function') {
                const poll = await pollImageTask(result.taskId);
                imageUrl = poll.url;
            }
            
            if (imageUrl) {
                imageUrl = normalizeCanvasImageUrl(imageUrl);
                createImageNode(imageUrl, 'no-background.png', node.x + node.width + 50, node.y);
                if (typeof window.addGenerationToHistory === 'function') {
                    window.addGenerationToHistory({ type: 'image', url: imageUrl });
                }
                if (typeof showToast === 'function') showToast('背景移除完成！');
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('移除背景失败: ' + err.message, 'error');
    } finally {
        hideImageNodeLoading(nodeId);
    }
}

// 裁切功能
function actionCrop(nodeId) {
    if (typeof showToast === 'function') showToast('裁切功能开发中...');
}

// 全屏查看
function actionFullscreen(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;
    
    // 创建全屏遮罩
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center cursor-zoom-out';
    overlay.onclick = () => overlay.remove();
    
    overlay.innerHTML = `
        <img src="${node.url}" class="max-w-[95vw] max-h-[95vh] object-contain" />
        <button onclick="event.stopPropagation();this.parentElement.remove();" class="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition-colors">×</button>
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">${node.name} · ${node.origW||Math.round(node.width)} × ${node.origH||Math.round(node.height)}</div>
    `;
    
    document.body.appendChild(overlay);
}

// 下载图片
async function actionDownload(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) return;
    
    const filename = node.name || 'image.png';
    try {
        let blob;
        if (node.url.startsWith('data:') && typeof dataURLtoBlob === 'function') {
            blob = await dataURLtoBlob(node.url);
        } else {
            const response = await fetch(node.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            blob = await response.blob();
        }
        
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = ensureFilenameExt(filename, blob.type);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        
        if (typeof showToast === 'function') showToast('图片已下载');
    } catch (err) {
        if (typeof showToast === 'function') showToast('下载失败: ' + err.message, 'error');
    }
}

// 图生图
async function actionImg2Img(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const promptEl = document.getElementById(`edit-prompt-${nodeId}`);
    const ratioEl = document.getElementById(`ratio-${nodeId}`);
    const resolutionEl = document.getElementById(`resolution-${nodeId}`);
    
    let prompt = buildInlineMarkerPrompt(nodeId) || (promptEl?.value?.trim() || '');
    const ratio = ratioEl?.value || 'auto';
    const resolution = resolutionEl?.value || '1024x1024';
    
    // 获取视角信息（如果视角面板已打开）
    const viewAnglePrompt = getActiveViewAnglePrompt();
    
    // 如果没有prompt但有视角信息，使用内置提示词
    if (!prompt && viewAnglePrompt) {
        prompt = 'same scene with different camera angle';
    }
    
    // 如果既没有prompt也没有视角信息，提示用户
    if (!prompt && !viewAnglePrompt) {
        if (typeof showToast === 'function') showToast('请输入提示词或调整视角', 'error');
        return;
    }

    node.img2imgPrompt = prompt;
    node.img2imgRatio = ratio;
    node.img2imgResolution = resolution;
    _img2imgGenerating.add(nodeId);
    setImageEditLock(nodeId, true);
    
    if (typeof showToast === 'function') showToast('正在生成图片（图生图）...');
    showImageNodeLoading(nodeId, '正在生成图片...');
    
    // 禁用生成按钮
    const btn = document.querySelector(`#sel-panel button[onclick*="actionImg2Img"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span> 生成中...`;
    }
    
    let success = false;
    try {
        // 组合用户输入和视角信息
        let fullPrompt = prompt;
        if (viewAnglePrompt) {
            fullPrompt = prompt + ', ' + viewAnglePrompt;
        }
        
        // 获取当前节点的图片URL作为参考图
        const referenceImages = node.url ? [node.url] : [];
        
        console.log('[图生图] 提示词:', fullPrompt);
        console.log('[图生图] 参考图片:', referenceImages.length > 0 ? '有' : '无');
        
        if (typeof generateImage === 'function') {
        const effectiveRatio = ratio === 'auto'
            ? resolveAutoAspectRatioLabel(node, '1:1')
            : ratio;
        const result = await generateImage({ 
                prompt: fullPrompt, 
            aspectRatio: effectiveRatio, 
                resolution: resolution,
                referenceImages: referenceImages  // 传递参考图片
            });
            
            let imageUrl = null;
            if (result.type === 'immediate') {
                imageUrl = result.url;
            } else if (result.type === 'async' && typeof pollImageTask === 'function') {
                const poll = await pollImageTask(result.taskId);
                imageUrl = poll.url;
            }
            
            if (imageUrl) {
                imageUrl = normalizeCanvasImageUrl(imageUrl);
                createImageNode(imageUrl, 'img2img-result.png', node.x + node.width + 50, node.y);
                if (typeof window.addGenerationToHistory === 'function') {
                    window.addGenerationToHistory({ type: 'image', url: imageUrl });
                }
                if (typeof showToast === 'function') showToast('图生图完成！');
                success = true;
                setImageEditLock(nodeId, false);
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('生成失败: ' + err.message, 'error');
    } finally {
        _img2imgGenerating.delete(nodeId);
        if (!success) setImageEditLock(nodeId, false);
        // 恢复按钮
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `↑ 生成`;
        }
        hideImageNodeLoading(nodeId);
    }
}

function setImageEditLock(nodeId, locked) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.img2imgLocked = locked;
    const promptEl = document.getElementById(`edit-prompt-${nodeId}`);
    const wrapper = document.getElementById(`edit-prompt-wrapper-${nodeId}`);
    const ratioEl = document.getElementById(`ratio-${nodeId}`);
    const resolutionEl = document.getElementById(`resolution-${nodeId}`);
    const inlineInputs = wrapper ? wrapper.querySelectorAll('.marker-inline-input') : [];
    if (inlineInputs && inlineInputs.length > 0) {
        inlineInputs.forEach(input => {
            input.readOnly = locked;
            input.style.background = locked ? '#f3f4f6' : 'transparent';
            input.style.cursor = locked ? 'not-allowed' : 'text';
        });
    } else if (promptEl) {
        promptEl.readOnly = locked;
        promptEl.style.background = locked ? '#f3f4f6' : 'transparent';
        promptEl.style.cursor = locked ? 'not-allowed' : 'text';
    }
    if (ratioEl) {
        ratioEl.disabled = locked;
        ratioEl.style.cursor = locked ? 'not-allowed' : 'pointer';
        ratioEl.style.background = locked ? '#f3f4f6' : '#f9fafb';
    }
    if (resolutionEl) {
        resolutionEl.disabled = locked;
        resolutionEl.style.cursor = locked ? 'not-allowed' : 'pointer';
        resolutionEl.style.background = locked ? '#f3f4f6' : '#f9fafb';
    }
}

function showImageNodeLoading(nodeId, text = '处理中...') {
    const el = document.getElementById(`node-${nodeId}`);
    if (!el) return;
    const body = el.querySelector('.node-body');
    if (!body) return;
    if (body.querySelector('.generating-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'generating-overlay';
    overlay.innerHTML = `
        <div class="generating-text">${text}</div>
        <div class="generating-bar"></div>
    `;
    body.appendChild(overlay);
}

function hideImageNodeLoading(nodeId) {
    const el = document.getElementById(`node-${nodeId}`);
    if (!el) return;
    const overlay = el.querySelector('.generating-overlay');
    if (overlay) overlay.remove();
}

async function runAIDraw(nodeId, skipBilling = false) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const promptEl = document.getElementById(`prompt-${nodeId}`);
    const ratioEl = document.getElementById(`ratio-${nodeId}`);
    const resolutionEl = document.getElementById(`resolution-${nodeId}`);
    const modelEl = document.getElementById(`draw-model-${nodeId}`);
    
    node.prompt = promptEl?.value || '';
    const ratio = ratioEl?.value || 'auto';
    const resolution = resolutionEl?.value || '1024x1024';
    const model = modelEl?.value || node.model || 'nano-banana-pro';
    node.aspectRatio = ratio;
    node.resolution = resolution;
    node.model = model;
    const count = node.count || 1;
    
    // 获取视角信息（如果视角面板已打开）
    const viewAnglePrompt = getActiveViewAnglePrompt();
    
    // 如果没有prompt但有视角信息，使用内置提示词
    if (!node.prompt && viewAnglePrompt && node.inputImages.length > 0) {
        node.prompt = 'same scene with different camera angle';
    }
    
    if (!node.prompt && node.inputImages.length === 0 && !viewAnglePrompt) {
        if (typeof showToast === 'function') showToast('请输入提示词或连接图片', 'error');
        return;
    }
    
    // 组合用户输入和视角信息
    let fullPrompt = node.prompt || 'Generate an artistic image';
    if (viewAnglePrompt) {
        fullPrompt = fullPrompt + ', ' + viewAnglePrompt;
    }
    
    // 获取参考图片URL列表（支持多图参考）
    const referenceImages = node.inputImages
        .map(img => img.url)
        .filter(url => typeof url === 'string' && url.trim());
    
    const effectiveRatio = ratio === 'auto'
        ? resolveAutoAspectRatioLabel(node, '1:1')
        : ratio;
    console.log('[AI绘图] 模型:', model, '参考图数量:', referenceImages.length, '比例:', effectiveRatio, '清晰度:', resolution, '生成数量:', count);
    
    const previewEl = document.getElementById(`preview-${nodeId}`);
    
    // 显示毛玻璃加载动画
    if (previewEl) {
        const existingContent = previewEl.innerHTML;
        previewEl.innerHTML = `
            ${existingContent}
            <div class="generating-overlay" id="generating-${nodeId}">
                <div class="generating-text">🎨 AI 正在绘制${count > 1 ? ` (0/${count})` : ''}...</div>
                <div class="generating-bar"></div>
            </div>
        `;
    }
    
    try {
        if (typeof generateImage === 'function') {
            // 清空之前的结果
            node.resultImages = [];
            node.currentImageIndex = 0;
            
            const results = new Array(count).fill(null);
            let completed = 0;
            let firstShown = false;

            const updateProgress = () => {
                const genText = document.querySelector(`#generating-${nodeId} .generating-text`);
                if (genText && count > 1) {
                    genText.textContent = `🎨 AI 正在绘制 (${completed}/${count})...`;
                }
            };

            updateProgress();

            const tasks = Array.from({ length: count }, (_, i) => (async () => {
                try {
                    const result = await generateImage({ 
                        prompt: fullPrompt, 
                        aspectRatio: effectiveRatio, 
                        resolution: resolution,
                        referenceImages: referenceImages,
                        model: model
                    });
                    
                    let imageUrl = null;
                    if (result.type === 'immediate') {
                        imageUrl = result.url;
                    } else if (result.type === 'async') {
                        // MidJourney使用专用轮询函数
                        if (result.isMidJourney && typeof pollMidJourneyTask === 'function') {
                            console.log('[AI绘图] 使用MidJourney专用轮询');
                            const poll = await pollMidJourneyTask(result.taskId);
                            imageUrl = poll.url;
                        } else if (typeof pollImageTask === 'function') {
                            const poll = await pollImageTask(result.taskId);
                            imageUrl = poll.url;
                        }
                    }
                    if (imageUrl) {
                        imageUrl = normalizeCanvasImageUrl(imageUrl);
                    }
                    
                    results[i] = imageUrl || null;
                    if (imageUrl && !firstShown) {
                        firstShown = true;
                        node.resultUrl = imageUrl;
                        if (previewEl) {
                            // 预加载图片，加载完成后再替换，避免白屏
                            const tempImg = new Image();
                            tempImg.onload = () => {
                                previewEl.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-cover"/>`;
                            };
                            tempImg.src = imageUrl;
                        }
                        resizeAIDrawNodeToImage(nodeId, imageUrl);
                        updateAIDrawUIAfterGeneration(nodeId);
                    }
                } finally {
                    completed += 1;
                    updateProgress();
                }
            })());

            const settled = await Promise.allSettled(tasks);
            const successImages = results.filter(Boolean);
            node.resultImages = successImages;
            node.currentImageIndex = 0;
            if (successImages.length > 0) {
                node.resultUrl = successImages[0];
                updateConnectedInputImage(nodeId, node.resultUrl);
                if (typeof window.addGenerationToHistory === 'function') {
                    successImages.forEach(url => window.addGenerationToHistory({ type: 'image', url }));
                }
            }

            if (successImages.length === 0) {
                const firstError = settled.find(s => s.status === 'rejected');
                throw new Error(firstError?.reason?.message || '生成失败');
            }

            // 保存生成的图片到本地文件夹（如果开启了媒体本地储存）
            if (isMediaStorageEnabled()) {
                successImages.forEach((url, idx) => {
                    saveMediaToLocal(url, 'image', `draw-${nodeId}-${Date.now()}-${idx}.png`).catch(() => {});
                });
            }
            
            // 更新多图按钮（无论几张都更新）
            updateMultiImageButton(nodeId);
            
            // 更新图片画廊（用于选择器）
            if (node.resultImages.length > 0) {
                updateImageGallery(node);
            }
            
            console.log('[AI绘图] 生成完成，共', node.resultImages.length, '张图片');
            
            if (typeof showToast === 'function') {
                showToast(`生成成功！共 ${node.resultImages.length} 张图片`);
            }
        }
    } catch (err) {
        // 移除加载动画
        const overlay = document.getElementById(`generating-${nodeId}`);
        if (overlay) overlay.remove();
        
        // 如果已经生成了一些图片，保留它们
        if (node.resultImages && node.resultImages.length > 0) {
            node.resultUrl = node.resultImages[0];
            if (previewEl) {
                const tempImg = new Image();
                tempImg.onload = () => {
                    previewEl.innerHTML = `<img src="${node.resultUrl}" class="w-full h-full object-contain"/>`;
                };
                tempImg.src = node.resultUrl;
            }
            updateAIDrawUIAfterGeneration(nodeId);
            updateConnectedInputImage(nodeId, node.resultUrl);
            if (typeof window.addGenerationToHistory === 'function') {
                node.resultImages.forEach(url => window.addGenerationToHistory({ type: 'image', url }));
            }
            if (node.resultImages.length > 1) {
                updateImageGallery(node);
                updateMultiImageButton(nodeId);
            }
            if (typeof showToast === 'function') {
                showToast(`部分生成成功（${node.resultImages.length}张），后续失败: ${err.message}`, 'error');
            }
        } else {
        if (previewEl) {
            previewEl.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-red-400 text-sm">生成失败</div>`;
        }
        if (typeof showToast === 'function') showToast('生成失败: ' + err.message, 'error');
        }
    }
}

// 生成后更新UI（显示工具栏等）
function updateAIDrawUIAfterGeneration(nodeId) {
    const tools = document.getElementById(`draw-tools-${nodeId}`);
    if (tools) tools.style.display = 'flex';
}

// 更新多图选择按钮
function updateMultiImageButton(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 更新新样式的按钮
    const btn = document.getElementById(`multi-img-btn-${nodeId}`);
    const countEl = document.getElementById(`img-count-${nodeId}`);
    
    if (btn && node.resultImages && node.resultImages.length > 0) {
        btn.classList.remove('hidden');
        if (countEl) countEl.textContent = node.resultImages.length;
    } else if (btn) {
        btn.classList.add('hidden');
    }
}

function updateMultiVideoButton(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const btn = document.getElementById(`multi-video-btn-${nodeId}`);
    const countEl = document.getElementById(`video-count-${nodeId}`);
    if (btn && node.resultVideos && node.resultVideos.length > 0) {
        btn.classList.remove('hidden');
        if (countEl) countEl.textContent = node.resultVideos.length;
    } else if (btn) {
        btn.classList.add('hidden');
    }
}

// 更新图片画廊
function updateImageGallery(node) {
    const galleryGrid = document.getElementById(`gallery-grid-${node.id}`);
    if (!galleryGrid || !node.resultImages) return;
    
    galleryGrid.innerHTML = node.resultImages.map((url, index) => `
        <div onclick="event.stopPropagation();selectGalleryImage('${node.id}', ${index})" 
             class="relative cursor-pointer rounded-lg overflow-hidden border-2 ${index === node.currentImageIndex ? 'border-cyan-400' : 'border-transparent'} hover:border-cyan-300 transition">
            <img src="${url}" class="w-full aspect-square object-cover"/>
            ${index === node.currentImageIndex ? '<div class="absolute inset-0 bg-cyan-400/20 flex items-center justify-center"><span class="text-white text-xs font-bold bg-cyan-500 px-2 py-0.5 rounded">主图</span></div>' : ''}
            <div class="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">${index + 1}</div>
        </div>
    `).join('');
}

// 选择画廊中的图片作为主图
function selectGalleryImage(nodeId, index) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultImages || !node.resultImages[index]) return;

    node.currentImageIndex = index;
    node.resultUrl = node.resultImages[index];
    updateConnectedInputImage(nodeId, node.resultUrl);

    // 更新预览（预加载避免白屏）
    const previewEl = document.getElementById(`preview-${nodeId}`);
    if (previewEl) {
        const tempImg = new Image();
        tempImg.onload = () => {
            previewEl.innerHTML = `<img src="${node.resultUrl}" class="w-full h-full object-contain"/>`;
        };
        tempImg.src = node.resultUrl;
    }

    // 更新画廊高亮
    updateImageGallery(node);
    
    // 关闭画廊
    toggleImageGallery(nodeId);
    
    if (typeof showToast === 'function') showToast(`已选择第 ${index + 1} 张为主图`);
}

// 切换图片画廊显示
function toggleImageGallery(nodeId) {
    // 旧函数，保留兼容性
    showImagePicker(nodeId);
}

// 显示分离式图片选择器（在节点右上方弹出）
function showImagePicker(nodeId) {
    // 先隐藏已有的选择器
    hideImagePicker();
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultImages || node.resultImages.length === 0) return;
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    // 创建分离式选择器
    const picker = document.createElement('div');
    picker.id = 'image-picker-popup';
    picker.className = 'fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden';
    picker.style.cssText = 'width:280px;max-height:400px;';
    
    // 计算位置（节点右上方）
    const nodeRect = nodeEl.getBoundingClientRect();
    let left = nodeRect.right + 10;
    let top = nodeRect.top;
    
    // 确保不超出屏幕
    if (left + 280 > window.innerWidth) {
        left = nodeRect.left - 290;
    }
    if (top + 400 > window.innerHeight) {
        top = window.innerHeight - 410;
    }
    if (top < 10) top = 10;
    
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    
    // 构建内容
    const images = node.resultImages;
    const currentIndex = node.currentImageIndex || 0;
    
    picker.innerHTML = `
        <div class="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">生成的图片 (${images.length})</span>
            <button onclick="hideImagePicker()" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-2 overflow-y-auto" style="max-height:340px;">
            <div class="grid grid-cols-2 gap-2" id="picker-grid-${nodeId}">
                ${images.map((img, idx) => `
                    <div class="relative cursor-pointer group rounded-lg overflow-hidden border-2 ${idx === currentIndex ? 'border-cyan-500' : 'border-transparent hover:border-cyan-300'} transition" 
                         onclick="selectImageFromPicker('${nodeId}', ${idx})">
                        <img src="${typeof img === 'string' ? img : img.url || img}" class="w-full aspect-square object-cover"/>
                        ${idx === currentIndex ? `
                            <div class="absolute top-1 right-1 w-5 h-5 bg-cyan-500 text-white text-xs rounded-full flex items-center justify-center shadow">✓</div>
                        ` : ''}
                        <div class="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                            #${idx + 1}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(picker);
    
    // 点击外部关闭
    setTimeout(() => {
        document.addEventListener('click', handlePickerOutsideClick);
    }, 100);
}

function showVideoPicker(nodeId) {
    hideVideoPicker();
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultVideos || node.resultVideos.length === 0) return;
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;

    const picker = document.createElement('div');
    picker.id = 'video-picker-popup';
    picker.className = 'fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden';
    picker.style.cssText = 'width:320px;max-height:420px;';

    const nodeRect = nodeEl.getBoundingClientRect();
    let left = nodeRect.right + 10;
    let top = nodeRect.top;
    if (left + 320 > window.innerWidth) {
        left = nodeRect.left - 330;
    }
    if (top + 420 > window.innerHeight) {
        top = window.innerHeight - 430;
    }
    if (top < 10) top = 10;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';

    const videos = node.resultVideos;
    const currentIndex = node.currentVideoIndex || 0;

    picker.innerHTML = `
        <div class="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">生成的视频 (${videos.length})</span>
            <button onclick="hideVideoPicker()" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="p-2 overflow-y-auto" style="max-height:360px;">
            <div class="grid grid-cols-2 gap-2" id="video-picker-grid-${nodeId}">
                ${videos.map((vid, idx) => `
                    <div class="relative cursor-pointer group rounded-lg overflow-hidden border-2 ${idx === currentIndex ? 'border-cyan-500' : 'border-transparent hover:border-cyan-300'} transition" 
                         onclick="selectVideoFromPicker('${nodeId}', ${idx})">
                        <video src="${vid}" class="w-full aspect-square object-cover" muted preload="metadata"></video>
                        ${idx === currentIndex ? `
                            <div class="absolute top-1 right-1 w-5 h-5 bg-cyan-500 text-white text-xs rounded-full flex items-center justify-center shadow">✓</div>
                        ` : ''}
                        <div class="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                            #${idx + 1}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(picker);
    setTimeout(() => {
        document.addEventListener('click', handleVideoPickerOutsideClick);
    }, 100);
}

function handleVideoPickerOutsideClick(e) {
    const picker = document.getElementById('video-picker-popup');
    if (picker && !picker.contains(e.target) && !e.target.closest('[onclick*="showVideoPicker"]')) {
        hideVideoPicker();
    }
}

function hideVideoPicker() {
    const picker = document.getElementById('video-picker-popup');
    if (picker) picker.remove();
    document.removeEventListener('click', handleVideoPickerOutsideClick);
}

function selectVideoFromPicker(nodeId, index) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultVideos || !node.resultVideos[index]) return;
    node.currentVideoIndex = index;
    const videoUrl = node.resultVideos[index];
    node.resultUrl = videoUrl;
    const previewEl = document.getElementById(`vpreview-${nodeId}`);
    if (previewEl) {
        previewEl.innerHTML = `<video src="${videoUrl}" class="w-full h-full object-contain" controls autoplay onloadedmetadata="handleVideoLoaded('${node.id}', this)"></video>`;
    }
    hideVideoPicker();
    if (typeof showToast === 'function') showToast(`已选择第 ${index + 1} 个视频`);
}

function handlePickerOutsideClick(e) {
    const picker = document.getElementById('image-picker-popup');
    if (picker && !picker.contains(e.target) && !e.target.closest('[onclick*="showImagePicker"]')) {
        hideImagePicker();
    }
}

function hideImagePicker() {
    const picker = document.getElementById('image-picker-popup');
    if (picker) picker.remove();
    document.removeEventListener('click', handlePickerOutsideClick);
}

// 从选择器选择图片
function selectImageFromPicker(nodeId, index) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultImages || !node.resultImages[index]) return;

    node.currentImageIndex = index;
    const selectedImage = node.resultImages[index];
    const imageUrl = typeof selectedImage === 'string' ? selectedImage : selectedImage.url || selectedImage;
    node.resultUrl = imageUrl;
    updateConnectedInputImage(nodeId, imageUrl);

    // 更新主预览（预加载避免白屏）
    const previewEl = document.getElementById(`preview-${nodeId}`);
    if (previewEl) {
        const tempImg = new Image();
        tempImg.onload = () => {
            previewEl.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-contain"/>`;
        };
        tempImg.src = imageUrl;
    }

    // 更新选择器中的选中状态
    const pickerGrid = document.getElementById(`picker-grid-${nodeId}`);
    if (pickerGrid) {
        pickerGrid.querySelectorAll('[onclick*="selectImageFromPicker"]').forEach((el, idx) => {
            if (idx === index) {
                el.classList.remove('border-transparent', 'hover:border-cyan-300');
                el.classList.add('border-cyan-500');
                // 添加选中标记
                if (!el.querySelector('.bg-cyan-500')) {
                    const mark = document.createElement('div');
                    mark.className = 'absolute top-1 right-1 w-5 h-5 bg-cyan-500 text-white text-xs rounded-full flex items-center justify-center shadow';
                    mark.textContent = '✓';
                    el.appendChild(mark);
                }
            } else {
                el.classList.add('border-transparent', 'hover:border-cyan-300');
                el.classList.remove('border-cyan-500');
                const mark = el.querySelector('.bg-cyan-500');
                if (mark) mark.remove();
            }
        });
    }
    
    if (typeof showToast === 'function') showToast(`已选择第 ${index + 1} 张图片`);
}

// AI绘图节点工具栏函数
async function aiDrawUpscale(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    
    if (typeof showToast === 'function') showToast('正在放大至4K...');
    
    const upscalePrompt = `High resolution 4K upscale of the image, maintain all original details, enhance clarity and sharpness`;
    const referenceImages = [node.resultUrl];
    
    try {
        if (typeof generateImage === 'function') {
            const targetW = node.origW || node.width;
            const targetH = node.origH || node.height;
            const aspectRatio = getClosestAspectRatio(targetW, targetH);
            const resolution = getUpscaleResolution(targetW, targetH, 4096);
            const result = await generateImage({ 
                prompt: upscalePrompt, 
                aspectRatio: aspectRatio, 
                resolution: resolution,
                referenceImages: referenceImages
            });
            
            let imageUrl = null;
            if (result.type === 'immediate') {
                imageUrl = result.url;
            } else if (result.type === 'async' && typeof pollImageTask === 'function') {
                const poll = await pollImageTask(result.taskId);
                imageUrl = poll.url;
            }
            
            if (imageUrl) {
                imageUrl = normalizeCanvasImageUrl(imageUrl);
                // 添加到结果图片数组
                node.resultImages.push(imageUrl);
                node.currentImageIndex = node.resultImages.length - 1;
                node.resultUrl = imageUrl;
                updateConnectedInputImage(nodeId, imageUrl);
                if (typeof window.addGenerationToHistory === 'function') {
                    window.addGenerationToHistory({ type: 'image', url: imageUrl });
                }

                // 更新预览（预加载避免白屏）
                const previewEl = document.getElementById(`preview-${nodeId}`);
                if (previewEl) {
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        previewEl.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-contain"/>`;
                    };
                    tempImg.src = imageUrl;
                }

                updateImageGallery(node);
                updateMultiImageButton(nodeId);
                
                if (typeof showToast === 'function') showToast('4K放大完成！');
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('放大失败: ' + err.message, 'error');
    }
}

async function aiDrawRemoveBg(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    
    if (typeof showToast === 'function') showToast('正在移除背景...');
    
    const removeBgPrompt = `Remove the background completely, keep only the main subject, pure white background`;
    const referenceImages = [node.resultUrl];
    
    try {
        if (typeof generateImage === 'function') {
            const result = await generateImage({ 
                prompt: removeBgPrompt, 
                aspectRatio: '1:1', 
                resolution: '1024x1024',
                referenceImages: referenceImages
            });
            
            let imageUrl = null;
            if (result.type === 'immediate') {
                imageUrl = result.url;
            } else if (result.type === 'async' && typeof pollImageTask === 'function') {
                const poll = await pollImageTask(result.taskId);
                imageUrl = poll.url;
            }

            if (imageUrl) {
                imageUrl = normalizeCanvasImageUrl(imageUrl);
                node.resultImages.push(imageUrl);
                node.currentImageIndex = node.resultImages.length - 1;
                node.resultUrl = imageUrl;

                // 更新预览（预加载避免白屏）
                const previewEl = document.getElementById(`preview-${nodeId}`);
                if (previewEl) {
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        previewEl.innerHTML = `<img src="${imageUrl}" class="w-full h-full object-contain"/>`;
                    };
                    tempImg.src = imageUrl;
                }

                updateImageGallery(node);
                updateMultiImageButton(nodeId);
                
                if (typeof showToast === 'function') showToast('背景移除完成！');
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('移除背景失败: ' + err.message, 'error');
    }
}

function aiDrawFullscreen(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const currentImageUrl = node?.resultImages?.[node.currentImageIndex || 0] || node?.resultUrl;
    if (!node || !currentImageUrl) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-overlay';
    overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center cursor-zoom-out';
    overlay.onclick = () => overlay.remove();
    
    overlay.innerHTML = `
        <img src="${currentImageUrl}" class="max-w-[95vw] max-h-[95vh] object-contain" />
        <button onclick="event.stopPropagation();this.parentElement.remove();" class="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition-colors">×</button>
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">AI绘图结果</div>
    `;
    
    document.body.appendChild(overlay);
}

async function aiDrawDownload(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    
    const filename = `ai-draw-${Date.now()}.png`;
    try {
        let blob;
        if (node.resultUrl.startsWith('data:') && typeof dataURLtoBlob === 'function') {
            blob = await dataURLtoBlob(node.resultUrl);
        } else {
            const response = await fetch(node.resultUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            blob = await response.blob();
        }
        
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        
        if (typeof showToast === 'function') showToast('图片已下载');
    } catch (err) {
        if (typeof showToast === 'function') showToast('下载失败: ' + err.message, 'error');
    }
}

function aiDrawSendToCanvas(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const currentImageUrl = node?.resultImages?.[node.currentImageIndex || 0] || node?.resultUrl;
    if (!node || !currentImageUrl) return;
    
    // 创建新的图片节点在右侧
    createImageNode(currentImageUrl, 'ai-draw-result.png', node.x + node.width + 50, node.y);
    
    if (typeof showToast === 'function') showToast('已发送到画布');
}

function aiVideoSendToCanvas(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const videoUrl = node?.resultVideos?.[node.currentVideoIndex || 0] || node?.resultUrl;
    if (!node || !videoUrl) return;

    const newId = createAIVideoNodeAtPos(node.x + node.width + 60, node.y);
    const newNode = CanvasNodeSystem.nodes.find(n => n.id === newId);
    if (newNode) {
        newNode.resultUrl = videoUrl;
        newNode.resultVideos = [videoUrl];
        newNode.currentVideoIndex = 0;
        newNode.videoAspect = node.videoAspect || newNode.videoAspect;
    }

    const previewEl = document.getElementById(`vpreview-${newId}`);
    if (previewEl) {
        previewEl.innerHTML = `<video src="${videoUrl}" class="w-full h-full object-contain" controls autoplay onloadedmetadata="handleVideoLoaded('${newId}', this)"></video>`;
    }
    updateMultiVideoButton(newId);
    if (typeof showToast === 'function') showToast('已发送到画布');
}

async function runAIVideo(nodeId, skipBilling = false) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const promptEl = document.getElementById(`vprompt-${nodeId}`);
    const ratioEl = document.getElementById(`vratio-${nodeId}`);
    const modelEl = document.getElementById(`vmodel-${nodeId}`);
    const durationEl = document.getElementById(`vduration-${nodeId}`);
    
    node.prompt = promptEl?.value || '';
    const ratio = ratioEl?.value || 'auto';
    node.aspectRatio = ratio;
    node.model = modelEl?.value || node.model || 'veo3.1';
    node.duration = Number(durationEl?.value || node.duration || 8);
    const count = node.count || 1;
    
    if (!node.prompt && node.inputImages.length === 0) {
        if (typeof showToast === 'function') showToast('请输入提示词或连接图片', 'error');
        return;
    }
    
    let fullPrompt = node.prompt || 'Generate a smooth video';
    
    // 获取参考图片URL列表
    let referenceImages = node.inputImages.map(img => img.url);
    if (referenceImages.length > 0) {
        referenceImages = await normalizeVideoReferenceImages(referenceImages);
    }
    
    const effectiveRatio = ratio === 'auto'
        ? resolveAutoAspectRatioLabel(node, '16:9')
        : ratio;
    console.log('[AI视频] 参考图数量:', referenceImages.length, '比例:', effectiveRatio);
    
    const previewEl = document.getElementById(`vpreview-${nodeId}`);
    
    // 显示加载动画
    if (previewEl) {
        const existingContent = previewEl.innerHTML;
        previewEl.innerHTML = `
            ${existingContent}
            <div class="generating-overlay" id="generating-video-${nodeId}">
                <div class="generating-text">🎬 AI 正在生成视频${count > 1 ? ` (0/${count})` : ''}...</div>
                <div class="generating-bar"></div>
                <div style="font-size:11px;color:#9ca3af;margin-top:12px;">视频生成可能需要1-3分钟</div>
            </div>
        `;
    }
    
    try {
        if (typeof generateVideo === 'function') {
            node.resultVideos = [];
            node.currentVideoIndex = 0;
            let completed = 0;
            let firstShown = false;

            const updateProgress = () => {
                const genText = document.querySelector(`#generating-video-${nodeId} .generating-text`);
                if (genText && count > 1) {
                    genText.textContent = `🎬 AI 正在生成视频 (${completed}/${count})...`;
                }
            };
            updateProgress();

            const tasks = Array.from({ length: count }, () => (async () => {
                const result = await generateVideo({ 
                    prompt: fullPrompt, 
                    aspectRatio: effectiveRatio, 
                    duration: node.duration,
                    referenceImages: referenceImages,
                    model: node.model
                });
                
                let videoUrl = null;
                if (result.type === 'immediate') {
                    videoUrl = result.url;
                } else if (result.type === 'async' && typeof pollVideoTask === 'function') {
                    const poll = await pollVideoTask(result.taskId, null, { provider: result.provider, taskMode: result.taskMode, model: node.model });
                    videoUrl = poll.url;
                }
                
                if (videoUrl && !firstShown) {
                    firstShown = true;
                    node.resultUrl = videoUrl;
                    if (previewEl) {
                        previewEl.innerHTML = `<video src="${videoUrl}" class="w-full h-full object-contain" controls autoplay onloadedmetadata="handleVideoLoaded('${node.id}', this)"></video>`;
                    }
                }
                return videoUrl;
            })().finally(() => {
                completed += 1;
                updateProgress();
            }));

            const settled = await Promise.allSettled(tasks);
            const successVideos = settled
                .filter(item => item.status === 'fulfilled' && item.value)
                .map(item => item.value);
            node.resultVideos = successVideos;
            node.currentVideoIndex = 0;
            if (successVideos.length > 0 && typeof window.addGenerationToHistory === 'function') {
                successVideos.forEach(url => window.addGenerationToHistory({ type: 'video', url }));
            }

            if (successVideos.length === 0) {
                const firstError = settled.find(s => s.status === 'rejected');
                throw new Error(firstError?.reason?.message || '生成失败');
            }

            // 保存生成的视频到本地文件夹（如果开启了媒体本地储存）
            if (isMediaStorageEnabled()) {
                successVideos.forEach((url, idx) => {
                    saveMediaToLocal(url, 'video', `video-${nodeId}-${Date.now()}-${idx}.mp4`).catch(() => {});
                });
            }

            updateMultiVideoButton(nodeId);
            if (typeof showToast === 'function') showToast('视频生成成功！');
        } else {
            throw new Error('视频生成功能暂不可用');
        }
    } catch (err) {
        // 移除加载动画
        const overlay = document.getElementById(`generating-video-${nodeId}`);
        if (overlay) overlay.remove();
        
        if (previewEl && !node.resultUrl) {
            previewEl.innerHTML = `
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="text-red-400 text-sm text-center">
                        <div class="text-2xl mb-2">❌</div>
                        <div>生成失败</div>
                        <div class="text-xs text-gray-400 mt-1">${err.message}</div>
                    </div>
                </div>`;
        }
        if (typeof showToast === 'function') showToast('视频生成失败: ' + err.message, 'error');
    }
}

// 关闭视频生成中的提示
function closeVideoGenerating(nodeId) {
    const overlay = document.getElementById(`generating-video-${nodeId}`);
    if (overlay) overlay.remove();
}

// 下载视频
function downloadVideo(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) {
        if (typeof showToast === 'function') showToast('暂无视频可下载', 'error');
        return;
    }
    const filename = 'video.mp4';
    const downloadBlob = (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        if (typeof showToast === 'function') showToast('视频已下载');
    };
    
    if (node.resultUrl.startsWith('data:') && typeof dataURLtoBlob === 'function') {
        downloadBlob(dataURLtoBlob(node.resultUrl));
        return;
    }
    
    fetch(node.resultUrl)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        })
        .then(downloadBlob)
        .catch(err => {
            if (typeof showToast === 'function') showToast('下载失败: ' + err.message, 'error');
        });
}

// ==================== 删除节点 ====================
function deleteNode(nodeId) {
    console.log('[Canvas] deleteNode 被调用, nodeId:', nodeId);
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) {
        console.error('[Canvas] deleteNode 失败: 节点不存在', nodeId);
        return;
    }
    // 如果删除的是图片节点，取消所有在其上的LT画笔overlay
    const ltOverlay = document.querySelector(`#node-${nodeId} .lt-brush-overlay`);
    if (ltOverlay && ltOverlay.dataset.ltNodeId) {
        ltCancelBrush(ltOverlay.dataset.ltNodeId);
    }
    // 如果删除的是LT节点，取消其画笔overlay
    if (node.type === NODE_TYPES.AI_LOCAL_TRANSFER) {
        ltCancelBrush(nodeId);
    }
    pushUndoState(captureCanvasState());
    console.log('[Canvas] 找到节点，开始删除:', node);
    
    // 释放节点关联的对象URL
    if (node.type === NODE_TYPES.IMAGE) {
        revokeCanvasObjectUrl(node.url);
    } else if (node.type === NODE_TYPES.AI_DRAW) {
        revokeCanvasObjectUrl(node.resultUrl);
        if (Array.isArray(node.resultImages)) node.resultImages.forEach(revokeCanvasObjectUrl);
    } else if (node.type === NODE_TYPES.AI_VIDEO) {
        revokeCanvasObjectUrl(node.resultUrl);
        if (Array.isArray(node.resultVideos)) node.resultVideos.forEach(revokeCanvasObjectUrl);
    } else if (node.type === NODE_TYPES.AI_LOCAL_TRANSFER) {
        revokeCanvasObjectUrl(node.resultUrl);
        if (Array.isArray(node.resultImages)) node.resultImages.forEach(revokeCanvasObjectUrl);
    }

    // 删除所有相关连接
    const connectionsToRemove = CanvasNodeSystem.connections.filter(
        c => c.from === nodeId || c.to === nodeId
    );
    
    // 更新被连接节点的引用图片
    connectionsToRemove.forEach(conn => {
        if (conn.from === nodeId) {
            const toNode = CanvasNodeSystem.nodes.find(n => n.id === conn.to);
            if (toNode && toNode.inputImages) {
                toNode.inputImages = toNode.inputImages.filter(img => img.nodeId !== nodeId);
                if (toNode.type === NODE_TYPES.AI_DRAW) updateAIDrawRefs(toNode);
                if (toNode.type === NODE_TYPES.AI_VIDEO) updateAIVideoRefs(toNode);
            }
            // 局部迁移节点清理
            if (toNode && toNode.type === NODE_TYPES.AI_LOCAL_TRANSFER) {
                if (toNode.sourceImage && toNode.sourceImage.nodeId === nodeId) {
                    toNode.sourceImage = null;
                    toNode.cropPreviewUrl = null; toNode.maskDataUrl = null; toNode.cropRect = null;
                    updateLTSourceDisplay(toNode.id);
                }
                if (toNode.referenceImages) {
                    toNode.referenceImages = toNode.referenceImages.filter(r => r.nodeId !== nodeId);
                    renderLTRefImages(toNode.id);
                }
            }
        }
    });
    
    // 从连接数组中移除
    CanvasNodeSystem.connections = CanvasNodeSystem.connections.filter(
        c => c.from !== nodeId && c.to !== nodeId
    );
    
    // 从节点数组中移除
    CanvasNodeSystem.nodes = CanvasNodeSystem.nodes.filter(n => n.id !== nodeId);
    
    // 移除DOM元素
    const el = document.getElementById(`node-${nodeId}`);
    if (el) el.remove();
    
    // 取消选中
    if (CanvasNodeSystem.selectedNodeId === nodeId) {
        deselectAllNodes();
    }
    
    // 重新渲染连接线
    renderConnections();
    
    // 如果没有节点了，显示空状态提示
    if (CanvasNodeSystem.nodes.length === 0) {
        const hint = document.getElementById('canvas-empty-hint');
        if (hint) hint.style.display = 'block';
    }
    
    // 从分组中移除节点
    if (typeof removeNodeFromGroups === 'function') {
        removeNodeFromGroups(nodeId);
    }
    
    if (typeof showToast === 'function') showToast('节点已删除');
}

// 全屏观看视频
function fullscreenVideo(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) {
        if (typeof showToast === 'function') showToast('暂无视频可播放', 'error');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-video-overlay';
    overlay.className = 'fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center';
    
    overlay.innerHTML = `
        <video src="${node.resultUrl}" class="max-w-[90vw] max-h-[90vh] rounded-lg" controls autoplay></video>
        <button onclick="this.parentElement.remove()" class="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl">×</button>
    `;
    
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
    
    document.body.appendChild(overlay);
}

function hideEmptyHint() {
    const hint = document.getElementById('canvas-empty-hint');
    if (hint) hint.style.display = 'none';
}

// ==================== 对齐辅助线 ====================
const SNAP_THRESHOLD = 8; // 吸附阈值（像素）
const ALIGNMENT_SEARCH_RANGE = 500; // 对齐检测范围（像素），超出此范围的节点不参与检测

// 检测对齐并返回吸附后的位置
function checkAlignment(draggedNode, newX, newY) {
    const guides = [];
    let snapX = newX;
    let snapY = newY;
    
    const draggedRight = newX + draggedNode.width;
    const draggedBottom = newY + draggedNode.height;
    const draggedCenterX = newX + draggedNode.width / 2;
    const draggedCenterY = newY + draggedNode.height / 2;
    
    // 检查与其他图片节点的对齐（性能优化：只检测附近的节点）
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.id === draggedNode.id) return;
        if (node.type !== NODE_TYPES.IMAGE) return;
        
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        
        // 性能优化：快速排除距离太远的节点
        if (newX > nodeRight + ALIGNMENT_SEARCH_RANGE || draggedRight < node.x - ALIGNMENT_SEARCH_RANGE) return;
        if (newY > nodeBottom + ALIGNMENT_SEARCH_RANGE || draggedBottom < node.y - ALIGNMENT_SEARCH_RANGE) return;
        
        const nodeCenterX = node.x + node.width / 2;
        const nodeCenterY = node.y + node.height / 2;
        
        // 水平对齐检测
        // 左边对齐
        if (Math.abs(newX - node.x) < SNAP_THRESHOLD) {
            snapX = node.x;
            guides.push({ type: 'vertical', x: node.x });
        }
        // 右边对齐
        if (Math.abs(draggedRight - nodeRight) < SNAP_THRESHOLD) {
            snapX = nodeRight - draggedNode.width;
            guides.push({ type: 'vertical', x: nodeRight });
        }
        // 左边对齐到右边
        if (Math.abs(newX - nodeRight) < SNAP_THRESHOLD) {
            snapX = nodeRight;
            guides.push({ type: 'vertical', x: nodeRight });
        }
        // 右边对齐到左边
        if (Math.abs(draggedRight - node.x) < SNAP_THRESHOLD) {
            snapX = node.x - draggedNode.width;
            guides.push({ type: 'vertical', x: node.x });
        }
        // 中心水平对齐
        if (Math.abs(draggedCenterX - nodeCenterX) < SNAP_THRESHOLD) {
            snapX = nodeCenterX - draggedNode.width / 2;
            guides.push({ type: 'vertical', x: nodeCenterX });
        }
        
        // 垂直对齐检测
        // 顶部对齐
        if (Math.abs(newY - node.y) < SNAP_THRESHOLD) {
            snapY = node.y;
            guides.push({ type: 'horizontal', y: node.y });
        }
        // 底部对齐
        if (Math.abs(draggedBottom - nodeBottom) < SNAP_THRESHOLD) {
            snapY = nodeBottom - draggedNode.height;
            guides.push({ type: 'horizontal', y: nodeBottom });
        }
        // 顶部对齐到底部
        if (Math.abs(newY - nodeBottom) < SNAP_THRESHOLD) {
            snapY = nodeBottom;
            guides.push({ type: 'horizontal', y: nodeBottom });
        }
        // 底部对齐到顶部
        if (Math.abs(draggedBottom - node.y) < SNAP_THRESHOLD) {
            snapY = node.y - draggedNode.height;
            guides.push({ type: 'horizontal', y: node.y });
        }
        // 中心垂直对齐
        if (Math.abs(draggedCenterY - nodeCenterY) < SNAP_THRESHOLD) {
            snapY = nodeCenterY - draggedNode.height / 2;
            guides.push({ type: 'horizontal', y: nodeCenterY });
        }
    });
    
    return { x: snapX, y: snapY, guides };
}

// 显示对齐辅助线（缩短版本，只在节点附近显示）
function showAlignmentGuides(guides) {
    clearAlignmentGuides();
    
    if (!guides || guides.length === 0) return;
    
    const content = document.getElementById('canvas-content');
    if (!content) return;
    
    // 去重
    const uniqueGuides = [];
    guides.forEach(g => {
        const exists = uniqueGuides.some(ug => 
            ug.type === g.type && (g.type === 'vertical' ? ug.x === g.x : ug.y === g.y)
        );
        if (!exists) uniqueGuides.push(g);
    });
    
    // 计算所有节点的边界范围
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    CanvasNodeSystem.nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + (node.height || 300));
    });
    
    // 增加一些边距
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    uniqueGuides.forEach((guide, index) => {
        const line = document.createElement('div');
        line.className = `align-guide-line ${guide.type}`;
        line.id = `align-guide-${index}`;
        
        if (guide.type === 'vertical') {
            line.style.left = guide.x + 'px';
            line.style.top = minY + 'px';
            line.style.height = (maxY - minY) + 'px';
            line.style.width = '1px';
        } else {
            line.style.top = guide.y + 'px';
            line.style.left = minX + 'px';
            line.style.width = (maxX - minX) + 'px';
            line.style.height = '1px';
        }
        
        content.appendChild(line);
    });
}

// 清除对齐辅助线
function clearAlignmentGuides() {
    document.querySelectorAll('.align-guide-line').forEach(el => el.remove());
}

// ==================== 框选功能 ====================

// 创建框选矩形
function createSelectionRect(x, y) {
    removeSelectionRect();
    
    const rect = document.createElement('div');
    rect.id = 'box-select-rect';
    rect.className = 'selection-rect';
    rect.style.cssText = `left:${x}px;top:${y}px;width:0;height:0;`;
    
    document.body.appendChild(rect);
}

// 更新框选矩形
function updateSelectionRect(e) {
    const rect = document.getElementById('box-select-rect');
    if (!rect) return;
    
    const data = CanvasNodeSystem.activeData;
    const startX = data.startScreenX;
    const startY = data.startScreenY;
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    rect.style.left = left + 'px';
    rect.style.top = top + 'px';
    rect.style.width = width + 'px';
    rect.style.height = height + 'px';
    
    // 实时高亮被框选的节点
    highlightNodesInRect(left, top, width, height);
}

// 移除框选矩形
function removeSelectionRect() {
    const rect = document.getElementById('box-select-rect');
    if (rect) rect.remove();
}

// 完成框选
function finishBoxSelect(e) {
    const data = CanvasNodeSystem.activeData;
    const container = document.getElementById('canvas-container');
    const containerRect = container.getBoundingClientRect();
    
    // 计算框选的画布坐标范围
    const startX = data.startX;
    const startY = data.startY;
    const endX = (e.clientX - containerRect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const endY = (e.clientY - containerRect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    
    // 找出在框选范围内的图片节点
    const selectedNodes = CanvasNodeSystem.nodes.filter(node => {
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        
        // 检查节点是否与框选区域相交
        return !(node.x > maxX || nodeRight < minX || node.y > maxY || nodeBottom < minY);
    });
    
    removeSelectionRect();
    clearNodeHighlights();
    
    // 如果选中了多个节点，显示多选工具栏
    if (selectedNodes.length >= 2) {
        CanvasNodeSystem.selectedNodeIds = selectedNodes.map(n => n.id);
        showMultiSelectToolbar(selectedNodes);
        highlightSelectedNodes(selectedNodes);
    } else if (selectedNodes.length === 1) {
        // 只选中一个节点，使用单选逻辑
        selectCanvasNode(selectedNodes[0].id);
    }
}

// 高亮框选范围内的节点
function highlightNodesInRect(screenLeft, screenTop, screenWidth, screenHeight) {
    const container = document.getElementById('canvas-container');
    const containerRect = container.getBoundingClientRect();
    
    // 转换为画布坐标
    const minX = (screenLeft - containerRect.left - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const minY = (screenTop - containerRect.top - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    const maxX = minX + screenWidth / CanvasNodeSystem.zoom;
    const maxY = minY + screenHeight / CanvasNodeSystem.zoom;
    
    CanvasNodeSystem.nodes.forEach(node => {
        const el = document.getElementById(`node-${node.id}`);
        if (!el) return;
        
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        
        const isInRect = !(node.x > maxX || nodeRight < minX || node.y > maxY || nodeBottom < minY);
        
        if (isInRect) {
            el.style.outline = '3px solid #3b82f6';
            el.style.outlineOffset = '2px';
        } else {
            el.style.outline = '';
            el.style.outlineOffset = '';
        }
    });
}

// 清除节点高亮
function clearNodeHighlights() {
    CanvasNodeSystem.nodes.forEach(node => {
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
            el.style.outline = '';
            el.style.outlineOffset = '';
        }
    });
}

// 高亮选中的节点
function highlightSelectedNodes(nodes) {
    nodes.forEach(node => {
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
            el.style.outline = '3px solid #3b82f6';
            el.style.outlineOffset = '2px';
        }
    });
}

// 清除多选状态
function clearMultiSelection() {
    CanvasNodeSystem.selectedNodeIds = [];
    clearNodeHighlights();
    removeMultiSelectToolbar();
}

// 从当前选中的节点创建分组
function createGroupFromSelection() {
    const ids = CanvasNodeSystem.selectedNodeIds;
    if (!ids || ids.length < 2) {
        if (typeof showToast === 'function') showToast('请至少选择2个节点', 'warning');
        return;
    }
    
    const nodes = ids.map(id => CanvasNodeSystem.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length < 2) {
        if (typeof showToast === 'function') showToast('请至少选择2个节点', 'warning');
        return;
    }
    
    // 创建分组
    createNodeGroup(nodes);
    
    // 清除多选状态和工具栏
    clearMultiSelection();
}

// 暴露到全局
window.createGroupFromSelection = createGroupFromSelection;

// ==================== 多选工具栏 ====================

// 显示多选工具栏
function showMultiSelectToolbar(nodes) {
    removeMultiSelectToolbar();
    
    // 计算选中节点的边界
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    });
    
    // 计算屏幕位置
    const container = document.getElementById('canvas-container');
    const containerRect = container.getBoundingClientRect();
    
    const screenCenterX = containerRect.left + CanvasNodeSystem.offset.x + (minX + maxX) / 2 * CanvasNodeSystem.zoom;
    const screenTopY = containerRect.top + CanvasNodeSystem.offset.y + minY * CanvasNodeSystem.zoom - 60;
    
    const toolbar = document.createElement('div');
    toolbar.id = 'multi-select-toolbar';
    toolbar.className = 'multi-select-toolbar';
    toolbar.style.cssText = `
        position: fixed;
        left: ${screenCenterX}px;
        top: ${Math.max(60, screenTopY)}px;
        transform: translateX(-50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        padding: 6px 8px;
        gap: 4px;
        z-index: 1000;
    `;
    
    toolbar.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:0 8px;border-right:1px solid #e5e7eb;margin-right:4px;">
            <span style="font-size:12px;color:#6b7280;">已选 ${nodes.length} 个</span>
        </div>
        <button onclick="autoLayoutSelected()" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-size:13px;color:#374151;background:none;border:none;border-radius:8px;cursor:pointer;transition:background 0.15s;white-space:nowrap;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
            </svg>
            自动布局
        </button>
        <button onclick="mergeSelectedLayers()" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-size:13px;color:#374151;background:none;border:none;border-radius:8px;cursor:pointer;transition:background 0.15s;white-space:nowrap;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
            合并图层
        </button>
        <button onclick="createGroupFromSelection()" style="display:flex;align-items:center;gap:6px;padding:8px 14px;font-size:13px;color:#3b82f6;background:none;border:none;border-radius:8px;cursor:pointer;transition:background 0.15s;white-space:nowrap;font-weight:500;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="4 2"/>
                <path d="M12 8v8M8 12h8"/>
            </svg>
            创建分组
        </button>
        <button onclick="clearMultiSelection()" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;color:#9ca3af;background:none;border:none;border-radius:8px;cursor:pointer;transition:all 0.15s;margin-left:4px;" onmouseover="this.style.background='#fef2f2';this.style.color='#ef4444'" onmouseout="this.style.background='none';this.style.color='#9ca3af'">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;
    
    document.body.appendChild(toolbar);
}

// 移除多选工具栏
function removeMultiSelectToolbar() {
    const toolbar = document.getElementById('multi-select-toolbar');
    if (toolbar) toolbar.remove();
}

// 自动布局选中的节点
function autoLayoutSelected() {
    const ids = CanvasNodeSystem.selectedNodeIds;
    if (ids.length < 2) return;
    
    const nodes = ids.map(id => CanvasNodeSystem.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length < 2) return;

    pushUndoState(captureCanvasState());
    
    // 计算起始位置
    let startX = Math.min(...nodes.map(n => n.x));
    let startY = Math.min(...nodes.map(n => n.y));
    
    // 按行排列，每行最多3个
    const gap = 20;
    const maxPerRow = 3;
    let currentX = startX;
    let currentY = startY;
    let rowMaxHeight = 0;
    
    nodes.forEach((node, index) => {
        if (index > 0 && index % maxPerRow === 0) {
            currentX = startX;
            currentY += rowMaxHeight + gap;
            rowMaxHeight = 0;
        }
        
        node.x = currentX;
        node.y = currentY;
        
        const el = document.getElementById(`node-${node.id}`);
        if (el) {
            el.style.left = node.x + 'px';
            el.style.top = node.y + 'px';
        }
        
        currentX += node.width + gap;
        rowMaxHeight = Math.max(rowMaxHeight, node.height);
    });
    
    renderConnections();
    
    // 更新工具栏位置
    showMultiSelectToolbar(nodes);
    highlightSelectedNodes(nodes);
    
    if (typeof showToast === 'function') showToast('已自动布局');
}

// 合并选中的图层（保持原始清晰度）
function mergeSelectedLayers() {
    const ids = CanvasNodeSystem.selectedNodeIds;
    if (ids.length < 2) return;
    
    const nodes = ids.map(id => CanvasNodeSystem.nodes.find(n => n.id === id)).filter(Boolean);
    if (nodes.length < 2) return;

    pushUndoState(captureCanvasState());
    
    // 计算显示尺寸的边界
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    });
    
    const displayWidth = maxX - minX;
    const displayHeight = maxY - minY;
    
    // 计算最大的缩放比例，以保持原始清晰度
    let maxScaleRatio = 1;
    nodes.forEach(node => {
        const origW = node.origW || node.width;
        const origH = node.origH || node.height;
        const scaleX = origW / node.width;
        const scaleY = origH / node.height;
        maxScaleRatio = Math.max(maxScaleRatio, scaleX, scaleY);
    });
    
    // 使用高分辨率创建 canvas
    const canvasWidth = Math.round(displayWidth * maxScaleRatio);
    const canvasHeight = Math.round(displayHeight * maxScaleRatio);
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' }) || canvas.getContext('2d');

    // 填充白色背景
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // 按顺序绘制每个图片（使用原始分辨率）
    let loadedCount = 0;
    const totalCount = nodes.length;
    
    nodes.forEach(node => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // 计算在高分辨率 canvas 上的位置和大小
            const drawX = (node.x - minX) * maxScaleRatio;
            const drawY = (node.y - minY) * maxScaleRatio;
            const drawW = node.width * maxScaleRatio;
            const drawH = node.height * maxScaleRatio;
            
            // 使用原始图片绘制到 canvas（保持清晰度）
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            
            loadedCount++;
            if (loadedCount === totalCount) {
                // 所有图片加载完成，创建合并后的节点
                const dataUrl = canvas.toDataURL('image/png', 1.0); // 最高质量
                
                // 删除原来的节点
                ids.forEach(id => {
                    deleteNode(id);
                });
                
                // 创建新的合并节点（显示尺寸保持原来的，但原始分辨率更高）
                const newId = createImageNodeFromData(dataUrl, 'merged.png', minX, minY, displayWidth, displayHeight, canvasWidth, canvasHeight);
                
                clearMultiSelection();
                
                if (typeof showToast === 'function') showToast('图层已合并');
            }
        };
        img.onerror = () => {
            loadedCount++;
            console.error('Failed to load image:', node.url);
        };
        img.src = node.url;
    });
}

// 从数据创建图片节点（用于合并图层）
function createImageNodeFromData(url, name, x, y, width, height, origW, origH) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    const normalizedUrl = normalizeCanvasImageUrl(url);
    
    const node = {
        id, type: NODE_TYPES.IMAGE, name, url: normalizedUrl, x, y,
        width: width, height: height,
        origW: origW || width, origH: origH || height
    };
    
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderImageNode(node);
    ensureImageNodePreview(node);
    hideEmptyHint();
    
    return id;
}

function updateConnectedInputImage(fromNodeId, imageUrl) {
    if (!fromNodeId || !imageUrl) return;
    console.log('[Canvas] updateConnectedInputImage:', fromNodeId, '->', imageUrl.substring(0, 50) + '...');
    const affectedConnections = CanvasNodeSystem.connections.filter(conn => conn.from === fromNodeId);
    affectedConnections.forEach(conn => {
        const toNode = CanvasNodeSystem.nodes.find(n => n.id === conn.to);
        if (!toNode) return;
        if (!toNode.inputImages) toNode.inputImages = [];
        const entry = toNode.inputImages.find(img => img.nodeId === fromNodeId);
        if (entry) {
            entry.url = imageUrl;
            entry.previewUrl = null;
            ensureInputImagePreview(toNode, entry);
        } else {
            const newEntry = { nodeId: fromNodeId, url: imageUrl, previewUrl: null };
            toNode.inputImages.push(newEntry);
            ensureInputImagePreview(toNode, newEntry);
        }
        // 更新各类型节点的参考图显示
        if (toNode.type === NODE_TYPES.AI_DRAW) updateAIDrawRefs(toNode);
        if (toNode.type === NODE_TYPES.AI_VIDEO) updateAIVideoRefs(toNode);
        if (toNode.type === NODE_TYPES.AI_TRYLOOK) updateAITryLookRefs(toNode);
        if (toNode.type === NODE_TYPES.RH_APP && typeof updateRhAppRefs === 'function') updateRhAppRefs(toNode);
    });
}

function replaceImageNode(nodeId, dataUrl, filename) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const normalizedUrl = normalizeCanvasImageUrl(dataUrl);
    revokeCanvasObjectUrl(node.url);
    node.url = normalizedUrl;
    node.previewUrl = null;
    if (filename) node.name = filename;
    
    updateConnectedInputImage(nodeId, normalizedUrl);
    const img = new Image();
    img.onload = () => {
        node.origW = img.width;
        node.origH = img.height;
        node.previewUrl = createPreviewFromImageElement(img, IMAGE_PREVIEW_MAX_SIDE);
        // 按新图比例调整节点尺寸（保持最长边不变）
        const maxSide = Math.max(node.width, node.height);
        const ratio = img.width / img.height;
        if (ratio >= 1) {
            node.width = maxSide;
            node.height = Math.max(60, Math.round(maxSide / ratio));
        } else {
            node.height = maxSide;
            node.width = Math.max(60, Math.round(maxSide * ratio));
        }
        updateImageNodeDisplay(node);
        const el = document.getElementById(`node-${nodeId}`);
        if (el) {
            const imgEl = el.querySelector('img');
            if (imgEl) imgEl.src = (_hdPreviewEnabled ? normalizedUrl : node.previewUrl) || normalizedUrl;
        }
        // 图片加载完成后再次更新连接的节点（必须使用原图URL，不能用缩略图）
        updateConnectedInputImage(nodeId, normalizedUrl);
    };
    img.onerror = () => {
        const el = document.getElementById(`node-${nodeId}`);
        if (el) {
            const imgEl = el.querySelector('img');
            if (imgEl) imgEl.src = normalizedUrl;
        }
        // 即使加载失败也更新连接
        updateConnectedInputImage(nodeId, normalizedUrl);
    };
    img.src = normalizedUrl;
}

function createAIDrawNodeFromData(data, x, y) {
    const newId = createAIDrawNodeAtPos(x, y);
    const node = CanvasNodeSystem.nodes.find(n => n.id === newId);
    if (!node) return;
    node.width = data.width || node.width;
    node.height = data.height || node.height;
    node.prompt = data.prompt || '';
    node.model = data.model || 'nano-banana-pro';
    node.aspectRatio = data.aspectRatio || 'auto';
    node.resolution = data.resolution || '1024x1024';
    node.count = data.count || 1;
    node.resultUrl = data.resultUrl ? normalizeCanvasImageUrl(data.resultUrl) : null;
    node.resultImages = data.resultImages ? data.resultImages.map(normalizeCanvasImageUrl) : [];
    node.currentImageIndex = data.currentImageIndex || 0;
    node.inputImages = (data.inputImages || []).map(img => ({ url: normalizeCanvasImageUrl(img.url), nodeId: null, previewUrl: null }));
    const oldEl = document.getElementById(`node-${newId}`);
    if (oldEl) oldEl.remove();
    renderAIDrawNode(node);
    updateAINodeDisplay(node);
    updateAIDrawRefs(node);
    node.inputImages.forEach(entry => ensureInputImagePreview(node, entry));
    updateMultiImageButton(newId);
    if (node.resultImages.length > 0) {
        updateImageGallery(node);
        resizeAIDrawNodeToImage(newId, node.resultImages[node.currentImageIndex || 0]);
    }
    return newId;
}

function createAIVideoNodeFromData(data, x, y) {
    const newId = createAIVideoNodeAtPos(x, y);
    const node = CanvasNodeSystem.nodes.find(n => n.id === newId);
    if (!node) return;
    node.width = data.width || node.width;
    node.height = data.height || node.height;
    node.prompt = data.prompt || '';
    node.model = data.model || 'veo3.1';
    node.duration = data.duration || node.duration || 8;
    node.aspectRatio = data.aspectRatio || 'auto';
    node.count = data.count || 1;
    node.resultUrl = data.resultUrl ? normalizeCanvasImageUrl(data.resultUrl) : null;
    node.inputImages = (data.inputImages || []).map(img => ({ url: normalizeCanvasImageUrl(img.url), nodeId: null, previewUrl: null }));
    const oldEl = document.getElementById(`node-${newId}`);
    if (oldEl) oldEl.remove();
    renderAIVideoNode(node);
    updateAINodeDisplay(node);
    updateAIVideoRefs(node);
    node.inputImages.forEach(entry => ensureInputImagePreview(node, entry));
    return newId;
}

function resizeAIDrawNodeToImage(nodeId, imageUrl) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !imageUrl) return;
    const img = new Image();
    img.onload = () => {
        const ratio = img.width / img.height;
        const maxSide = Math.max(node.width, node.height);
        let newW = node.width;
        let newH = node.height;
        if (ratio >= 1) {
            newW = maxSide;
            newH = Math.max(240, Math.round(maxSide / ratio));
        } else {
            newH = maxSide;
            newW = Math.max(240, Math.round(maxSide * ratio));
        }
        node.width = newW;
        node.height = newH;
        updateAINodeDisplay(node);
    };
    img.onerror = () => {};
    img.src = imageUrl;
}

// ==================== AITryLook工作流节点 ====================

// 创建AITryLook节点
function createAITryLookNodeAtPos(x, y, config = null) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    
    const node = {
        id, type: NODE_TYPES.AI_TRYLOOK, x, y,
        width: 400, height: 380,
        inputImages: [],
        webappId: config?.webappId || '',
        appName: config?.appName || 'AITryLook工作流',
        workflowNodes: config?.nodes || [],
        resultUrl: null,
        resultImages: [],
        currentImageIndex: 0,
        isGenerating: false
    };
    
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderAITryLookNode(node);
    hideEmptyHint();
    return id;
}

// 创建AITryLook节点并自动连接
function createAITryLookNodeAtPosWithConnection(x, y) {
    const nodeId = createAITryLookNodeAtPos(x, y);
    
    // 如果有待连接的源节点，自动建立连接
    if (CanvasNodeSystem.pendingConnectionFrom) {
        const { nodeId: fromId, fromPort } = CanvasNodeSystem.pendingConnectionFrom;
        const fromNode = CanvasNodeSystem.nodes.find(n => n.id === fromId);
        const toNode = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
        
        if (fromNode && toNode) {
            // 检查源节点是否有有效的图片
            let imageUrl = null;
            if (fromNode.type === NODE_TYPES.IMAGE && fromNode.imageUrl) {
                imageUrl = fromNode.imageUrl;
            } else if ((fromNode.type === NODE_TYPES.AI_DRAW || fromNode.type === NODE_TYPES.AI_VIDEO || fromNode.type === NODE_TYPES.AI_TRYLOOK) && fromNode.resultUrl) {
                imageUrl = fromNode.resultUrl;
            }
            
            if (imageUrl) {
                // 添加连接
                CanvasNodeSystem.connections.push({
                    from: fromId,
                    to: nodeId,
                    fromPort: fromPort || 'right',
                    toPort: 'left'
                });
                
                // 将图片添加到输入
                toNode.inputImages.push({
                    nodeId: fromId,
                    url: imageUrl
                });
                
                renderConnections();
                updatePortConnectionStatus();
                updateAITryLookRefs(toNode);
            }
        }
        
        CanvasNodeSystem.pendingConnectionFrom = null;
    }
    
    return nodeId;
}

// 渲染AITryLook节点
function renderAITryLookNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    
    // 初始化数据
    if (!node.resultImages) node.resultImages = [];
    if (!node.currentImageIndex) node.currentImageIndex = 0;
    if (!node.workflowNodes) node.workflowNodes = [];
    
    const panelWidth = Math.max(node.width, 520);
    
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node ai-trylook-node absolute';
    el.style.cssText = `left:${node.x}px;top:${node.y}px;`;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    
    // 判断是否有生成结果
    const hasResult = node.resultUrl || (node.resultImages && node.resultImages.length > 0);
    const currentImageUrl = node.resultImages && node.resultImages.length > 0 
        ? node.resultImages[node.currentImageIndex || 0] 
        : node.resultUrl;
    const imageCount = node.resultImages ? node.resultImages.length : 0;
    
    // 获取输入字段数量
    const inputFieldsCount = node.workflowNodes.filter(n => 
        n.fieldType === 'IMAGE' || n.fieldType === 'STRING'
    ).length;
    
    el.innerHTML = `
        <!-- 展示区域 -->
        <div class="node-body rounded-2xl overflow-hidden shadow-lg" style="width:${node.width}px;height:${node.height}px;background:linear-gradient(135deg, #1e3a8a, #0891b2);border:none;position:relative;">
            <div class="absolute top-2 left-2 flex items-center gap-2 text-xs text-white drop-shadow" style="z-index:20;text-shadow:0 0 1px #000, 0 0 2px #000;">
                <div class="w-5 h-5 bg-white/20 rounded flex items-center justify-center text-[10px] font-bold">AI</div>
                <span>${node.appName || 'AITryLook工作流'}</span>
            </div>
            
            <!-- 多图数量按钮 -->
            <button id="multi-img-btn-${node.id}" onclick="event.stopPropagation();showTryLookImagePicker('${node.id}')" 
                class="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition ${imageCount > 0 ? '' : 'hidden'}" title="查看所有生成结果" style="z-index:20;">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                <span id="img-count-trylook-${node.id}">${imageCount}</span>
            </button>
            
            <!-- 生成中遮罩 -->
            <div id="generating-overlay-${node.id}" class="generating-overlay" style="display:${node.isGenerating ? 'flex' : 'none'};">
                <div class="generating-text">正在运行工作流...</div>
                <div class="generating-bar"></div>
            </div>
            
            <!-- 图片预览区域 -->
            <div class="relative overflow-hidden" style="height:${node.height}px;" id="preview-trylook-${node.id}">
                ${currentImageUrl ? `<img src="${currentImageUrl}" class="w-full h-full object-cover"/>` : `
                <div class="absolute inset-0 flex items-center justify-center">
                    <div class="text-white/70 text-sm text-center">
                        <div class="text-4xl mb-2 opacity-60">🔧</div>
                        <div class="text-white/60">工作流结果将显示在这里</div>
                        <div class="text-[10px] text-white/40 mt-2">输入字段: ${inputFieldsCount} 个</div>
                    </div>
                </div>`}
            </div>
            
            <!-- 缩放角 -->
            <div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #0891b2;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:35;"></div>
        </div>
        
        <!-- 左侧悬浮输入端口 -->
        <div class="node-port can-connect-target connect-port floating-port" data-port="left" data-node-id="${node.id}" style="position:absolute;left:-36px;top:${node.height / 2}px;transform:translateY(-50%);width:28px;height:28px;background:linear-gradient(135deg,#3b82f6,#0891b2);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(59,130,246,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        
        <!-- 顶部工具栏（选中后显示） -->
        <div id="toolbar-panel-${node.id}" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">
            <button onclick="event.stopPropagation();tryLookFullscreen('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="全屏查看">
                ⛶ 全屏
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();tryLookDownload('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="下载结果">
                ↓ 下载
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();tryLookSendToCanvas('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#0891b2;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;font-weight:600;" onmouseover="this.style.background='#ecfeff'" onmouseout="this.style.background='none'" title="发送到画布">
                📤 发送
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();openTryLookSettings('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="配置工作流">
                ⚙️ 配置
            </button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();window.deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'" title="删除节点">
                <svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                删除
            </button>
        </div>
        
        <!-- 输入控制区域（选中后显示） -->
        <div id="input-panel-${node.id}" class="ai-input-panel rounded-xl overflow-hidden shadow-lg" style="position:absolute;left:50%;top:${node.height + 12}px;transform:translateX(-50%);width:${panelWidth}px;background:white;border:1px solid #e5e7eb;display:none;max-height:400px;overflow-y:auto;">
            <div class="p-3">
                <!-- 参考图片区域 -->
                <div class="flex gap-2 mb-2 flex-wrap min-h-[36px] p-2 bg-gray-50 rounded-lg border border-gray-200" id="refs-trylook-${node.id}"></div>
                
                <!-- 关键内容输入 -->
                ${renderTryLookContentField(node)}
                
                <!-- 工作流输入字段 -->
                <div id="workflow-fields-${node.id}" class="space-y-2 mb-3">
                    ${renderWorkflowFields(node)}
                </div>
                
                <!-- 底部控制行 -->
                <div class="flex items-center gap-2 mt-2">
                    <button onclick="event.stopPropagation();selectWorkflowFromRh('${node.id}')" class="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 rounded-md border border-blue-200 text-xs cursor-pointer transition" title="点击选择工作流">
                        <svg class="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                        <span class="text-blue-600 font-medium">${node.appName || '选择工作流'}</span>
                    </button>
                    <button onclick="event.stopPropagation();openRhFavorites('${node.id}')" class="p-1.5 bg-amber-50 hover:bg-amber-100 rounded-md border border-amber-200 transition" title="收藏的工作流">
                        <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </button>
                    <button onclick="event.stopPropagation();openRhRecent('${node.id}')" class="p-1.5 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition" title="最近使用">
                        <svg class="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    </button>
                    <div class="flex-1"></div>
                    <button onclick="runAITryLook('${node.id}')" class="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-lg text-xs font-medium hover:opacity-90 transition flex items-center gap-1.5 shadow-sm">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                        运行工作流
                    </button>
                </div>
            </div>
        </div>
    `;
    
    el.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
    el.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    el.querySelectorAll('.floating-port').forEach(port => {
        port.addEventListener('mouseenter', () => toggleNodePorts(node.id, true));
        port.addEventListener('mouseleave', () => toggleNodePorts(node.id, false));
    });
    container.appendChild(el);
    updateAITryLookRefs(node);
}

// 渲染工作流输入字段
function getTryLookContentFieldIndex(node) {
    if (!node || !node.workflowNodes) return -1;
    return node.workflowNodes.findIndex(field =>
        /prompt|content|contents|文本|内容/i.test((field.fieldName || field.nodeName || ''))
    );
}

function renderTryLookContentField(node) {
    const idx = getTryLookContentFieldIndex(node);
    if (idx === -1) return '';
    const field = node.workflowNodes[idx];
    const value = field.fieldValue || node.lastContent || '';
    return `
        <div class="mb-2 p-2 bg-white rounded-lg border border-blue-200">
            <div class="flex items-center gap-2">
                <span class="text-xs text-blue-600 font-medium w-20 truncate" title="${field.nodeName || field.fieldName}">内容:</span>
                <input type="text" id="trylook-content-${node.id}"
                    value="${value}"
                    oninput="updateTryLookContent('${node.id}', ${idx}, this.value)"
                    placeholder="请输入内容/提示词"
                    class="flex-1 px-2 py-1 bg-white text-gray-700 text-xs outline-none placeholder-gray-400 rounded border border-gray-200 focus:border-blue-400 transition"/>
            </div>
        </div>
    `;
}

function updateTryLookContent(nodeId, fieldIndex, value) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;
    node.workflowNodes[fieldIndex].fieldValue = value;
    node.lastContent = value;
}

function normalizeTryLookValue(value) {
    if (value === null || value === undefined) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const first = parsed[0];
                if (typeof first === 'string') return first;
                if (Array.isArray(first)) return String(first[0] ?? '');
                if (first && typeof first === 'object') return String(first.value || first.index || first.name || '');
            }
        } catch (e) {
            // ignore
        }
    }
    return raw;
}

function parseTryLookOptions(field) {
    const raw = field.fieldData || field.field_data || field.options || '';
    if (!raw) return [];
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(item => {
                        if (typeof item === 'string') return { label: item, value: item };
                        if (Array.isArray(item)) return { label: String(item[0]), value: String(item[0]) };
                        if (item && typeof item === 'object') {
                            const label = item.name || item.label || item.value || item.index;
                            const value = item.value || item.index || item.name || item.label;
                            return { label: String(label), value: String(value) };
                        }
                        return null;
                    }).filter(Boolean);
                }
            } catch (e) {
                // fallback to split
            }
        }
        return trimmed.split(',').map(opt => {
            const val = opt.trim();
            return { label: val, value: val };
        }).filter(opt => opt.value);
    }
    if (Array.isArray(raw)) {
        return raw.map(item => ({ label: String(item), value: String(item) }));
    }
    return [];
}

function renderWorkflowFields(node) {
    if (!node.workflowNodes || node.workflowNodes.length === 0) {
        return `<div class="text-xs text-gray-400 text-center py-2">暂无配置的输入字段</div>`;
    }
    const hasLinkedImage = node.inputImages && node.inputImages.length > 0;
    const contentIndex = getTryLookContentFieldIndex(node);
    return node.workflowNodes.map((field, idx) => {
        if (idx === contentIndex) return '';
        // 对于 LIST 类型，确保有有效的默认值
        if (field.fieldType === 'LIST') {
            const options = parseTryLookOptions(field);
            if (options.length > 0) {
                const currentVal = field.fieldValue;
                const isValid = options.some(opt => opt.value === currentVal);
                if (!isValid || !currentVal || currentVal.startsWith('[')) {
                    // 自动设置为第一个选项
                    field.fieldValue = options[0].value;
                }
            }
        }
        const normalizedValue = normalizeTryLookValue(field.fieldValue);
        if (field.fieldType === 'IMAGE') {
            return `
                <div class="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <span class="text-xs text-blue-600 font-medium w-20 truncate" title="${field.nodeName}">${field.nodeName}:</span>
                    <input type="text" id="field-${node.id}-${idx}" 
                        value="${normalizedValue}"
                        onchange="updateTryLookField('${node.id}', ${idx}, this.value)"
                        placeholder="图片URL（或通过连接节点传入）"
                        ${hasLinkedImage ? 'disabled title="已由连线提供"' : ''}
                        class="flex-1 px-2 py-1 bg-white text-gray-700 text-xs resize-none outline-none placeholder-gray-400 rounded border border-gray-200 focus:border-blue-400 transition ${hasLinkedImage ? 'opacity-60 cursor-not-allowed' : ''}"/>
                </div>
            `;
        } else if (field.fieldType === 'STRING') {
            return `
                <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span class="text-xs text-gray-600 font-medium w-20 truncate" title="${field.nodeName}">${field.nodeName}:</span>
                    <input type="text" id="field-${node.id}-${idx}" 
                        value="${normalizedValue}"
                        onchange="updateTryLookField('${node.id}', ${idx}, this.value)"
                        placeholder="${field.description || '输入文本'}"
                        class="flex-1 px-2 py-1 bg-white text-gray-700 text-xs outline-none placeholder-gray-400 rounded border border-gray-200 focus:border-blue-400 transition"/>
                </div>
            `;
        } else if (field.fieldType === 'LIST') {
            const options = parseTryLookOptions(field);
            const current = normalizedValue;
            return `
                <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span class="text-xs text-gray-600 font-medium w-20 truncate" title="${field.nodeName}">${field.nodeName}:</span>
                    <select id="field-${node.id}-${idx}" 
                        onchange="updateTryLookField('${node.id}', ${idx}, this.value)"
                        class="flex-1 px-2 py-1 bg-white text-gray-700 text-xs outline-none rounded border border-gray-200 focus:border-blue-400 transition cursor-pointer">
                        ${options.map(opt => `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (field.fieldType === 'INT' || field.fieldType === 'FLOAT') {
            return `
                <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span class="text-xs text-gray-600 font-medium w-20 truncate" title="${field.nodeName}">${field.nodeName}:</span>
                    <input type="number" id="field-${node.id}-${idx}" 
                        value="${normalizedValue}"
                        onchange="updateTryLookField('${node.id}', ${idx}, this.value)"
                        step="${field.fieldType === 'FLOAT' ? '0.1' : '1'}"
                        placeholder="${field.description || '数值'}"
                        class="flex-1 px-2 py-1 bg-white text-gray-700 text-xs outline-none placeholder-gray-400 rounded border border-gray-200 focus:border-blue-400 transition"/>
                </div>
            `;
        } else if (field.fieldType === 'SWITCH') {
            return `
                <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span class="text-xs text-gray-600 font-medium w-20 truncate" title="${field.nodeName}">${field.nodeName}:</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="field-${node.id}-${idx}"
                            ${normalizedValue === 'true' || normalizedValue === true ? 'checked' : ''}
                            onchange="updateTryLookField('${node.id}', ${idx}, this.checked ? 'true' : 'false')"
                            class="sr-only peer">
                        <div class="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                </div>
            `;
        }
        return '';
    }).join('');
}

// 更新参考图片显示
function updateAITryLookRefs(node) {
    const el = document.getElementById(`refs-trylook-${node.id}`);
    if (!el) return;
    
    if (!node.inputImages || node.inputImages.length === 0) {
        el.innerHTML = `
            <div class="flex items-center gap-2 text-xs text-gray-400">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>从左侧连接图片节点添加参考图</span>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="flex items-center gap-2 mr-2 text-xs text-gray-500">
                <span>参考图:</span>
                <span class="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px]">${node.inputImages.length}</span>
            </div>
            ${node.inputImages.map((img, i) => {
                const displayUrl = img.previewUrl || img.url;
                return `
                <div class="relative group">
                    <img src="${displayUrl}" class="w-10 h-10 rounded-lg object-cover border-2 border-gray-200 hover:border-blue-400 transition cursor-pointer" onclick="event.stopPropagation();openChatMediaFullscreen('${img.url}','image')"/>
                    <span class="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] rounded-full flex items-center justify-center font-medium shadow">图${i+1}</span>
                    <button onclick="event.stopPropagation();removeTryLookRef('${node.id}','${img.nodeId}')" class="absolute -top-1 -left-1 w-4 h-4 bg-black/70 text-white text-[10px] rounded-full opacity-0 group-hover:opacity-100 transition flex items-center justify-center">×</button>
                </div>
            `;
            }).join('')}
        `;
    }
    updateTryLookImageFieldState(node);
}

function updateTryLookImageFieldState(node) {
    if (!node || !node.workflowNodes) return;
    const hasLinkedImage = node.inputImages && node.inputImages.length > 0;
    node.workflowNodes.forEach((field, idx) => {
        if (field.fieldType !== 'IMAGE') return;
        const input = document.getElementById(`field-${node.id}-${idx}`);
        if (!input) return;
        input.disabled = !!hasLinkedImage;
        input.readOnly = !!hasLinkedImage;
        input.title = hasLinkedImage ? '已由连线提供' : '';
        input.style.opacity = hasLinkedImage ? '0.6' : '1';
        input.style.cursor = hasLinkedImage ? 'not-allowed' : '';
        if (hasLinkedImage) {
            const img = node.inputImages[0];
            if (img && img.fileName) input.value = img.fileName;
        }
    });
}

// 更新工作流字段值
function updateTryLookField(nodeId, fieldIndex, value) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;
    node.workflowNodes[fieldIndex].fieldValue = value;
}

// 移除参考图片
function removeTryLookRef(nodeId, fromId) {
    // 删除连接
    deleteConnection(fromId, nodeId);
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.inputImages = node.inputImages.filter(img => img.nodeId !== fromId);
    updateAITryLookRefs(node);
}

// 运行AITryLook工作流
function isLocalImageUrl(url) {
    return typeof url === 'string' && (
        url.startsWith('blob:') ||
        url.startsWith('data:') ||
        url.startsWith('file:')
    );
}

function requestUploadFilesToRunningHub(files) {
    return new Promise((resolve, reject) => {
        const rhIframe = document.getElementById('rh-iframe');
        if (!rhIframe || !rhIframe.contentWindow) {
            reject(new Error('工作台未就绪'));
            return;
        }
        const requestId = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const handler = (event) => {
            const data = event.data;
            if (!data || data.requestId !== requestId) return;
            if (data.type === 'UPLOAD_FILES_RESULT') {
                window.removeEventListener('message', handler);
                resolve(data.results || []);
            } else if (data.type === 'UPLOAD_FILES_ERROR') {
                window.removeEventListener('message', handler);
                reject(new Error(data.error || '上传失败'));
            }
        };
        window.addEventListener('message', handler);
        rhIframe.contentWindow.postMessage({ type: 'UPLOAD_FILES', requestId, files }, '*');
    });
}

async function ensureTryLookUploads(node) {
    const localImages = (node.inputImages || []).filter(img => isLocalImageUrl(img.url));
    if (localImages.length === 0) return;
    const files = [];
    for (const img of localImages) {
        const blob = await fetch(img.url).then(r => r.blob());
        const name = img.name || img.fileName || `input_${Date.now()}.png`;
        files.push({
            id: img.nodeId || name,
            name,
            type: blob.type || 'image/png',
            buffer: await blob.arrayBuffer()
        });
    }
    const results = await requestUploadFilesToRunningHub(files);
    results.forEach((res) => {
        const target = node.inputImages.find(img => img.nodeId === res.id || img.name === res.name);
        if (!target) return;
        target.fileName = res.fileName;
        target.url = res.url;
    });
    updateAITryLookRefs(node);
}

async function runAITryLook(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 显示生成中状态
    node.isGenerating = true;
    const overlay = document.getElementById(`generating-overlay-${nodeId}`);
    if (overlay) overlay.style.display = 'flex';
    
    // 收集输入数据
    const rhKey = (typeof apiConfig !== 'undefined' && apiConfig.runninghubApiKey) ? apiConfig.runninghubApiKey : '';
    const contentIndex = getTryLookContentFieldIndex(node);
    if (contentIndex >= 0) {
        const contentEl = document.getElementById(`trylook-content-${nodeId}`);
        if (contentEl && contentEl.value !== '') {
            node.workflowNodes[contentIndex].fieldValue = contentEl.value;
        }
    }
    const inputData = {
        webappId: node.webappId,
        nodes: node.workflowNodes.map((field, idx) => {
            const inputEl = document.getElementById(`field-${nodeId}-${idx}`);
            if (inputEl) {
                if (inputEl.type === 'checkbox') {
                    field.fieldValue = inputEl.checked ? 'true' : 'false';
                } else if (inputEl.value !== '') {
                    // 仅在有值时覆盖，避免清空已保存的字段
                    field.fieldValue = inputEl.value;
                }
            }
            return { ...field };
        }),
        inputImages: node.inputImages.map(img => img.url),
        apiKey: rhKey
    };
    
    // 若存在本地图片，先无损直传获取URL/文件名
    try {
        await ensureTryLookUploads(node);
    } catch (err) {
        node.isGenerating = false;
        if (overlay) overlay.style.display = 'none';
        if (typeof showToast === 'function') showToast(`上传失败: ${err.message}`, 'error');
        return;
    }

    // 如果有图片输入且工作流中有IMAGE类型字段，自动填充
    if (node.inputImages.length > 0 && inputData.nodes.some(n => n.fieldType === 'IMAGE')) {
        const imageFields = inputData.nodes.filter(n => n.fieldType === 'IMAGE');
        node.inputImages.forEach((img, i) => {
            if (imageFields[i]) {
                imageFields[i].fieldValue = img.fileName || img.url;
            }
        });
    }

    const missingPrompt = inputData.nodes.find(n =>
        /prompt|content|contents|文本|内容/i.test((n.fieldName || n.nodeName || ''))
        && !String(n.fieldValue || '').trim()
    );
    if (missingPrompt) {
        node.isGenerating = false;
        if (overlay) overlay.style.display = 'none';
        const label = missingPrompt.nodeName || missingPrompt.fieldName || '提示词';
        if (typeof showToast === 'function') showToast(`请填写工作流字段：${label}`, 'error');
        return;
    }
    
    // 通过iframe调用RunningHub执行
    try {
        const rhIframe = document.getElementById('rh-iframe');
        if (!rhIframe || !rhIframe.contentWindow) {
            if (typeof showToast === 'function') showToast('工作台未就绪，请先打开RunningHub面板', 'error');
            node.isGenerating = false;
            if (overlay) overlay.style.display = 'none';
            return;
        }
        rhIframe.contentWindow.postMessage({
            type: 'RUN_WORKFLOW',
            nodeId: nodeId,
            data: inputData
        }, '*');
        if (typeof showToast === 'function') showToast('已发送运行请求到工作台', 'success');
    } catch (err) {
        console.error('Failed to run workflow:', err);
        node.isGenerating = false;
        if (overlay) overlay.style.display = 'none';
        showToast('运行工作流失败', 'error');
    }
}

// 处理工作流完成回调
function handleTryLookComplete(nodeId, results) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    node.isGenerating = false;
    const overlay = document.getElementById(`generating-overlay-${nodeId}`);
    if (overlay) overlay.style.display = 'none';
    
    if (results && results.length > 0) {
        // 提取图片结果
        const imageResults = results.filter(r => r.fileType === 'image' || r.fileUrl.match(/\.(jpg|jpeg|png|gif|webp)/i));
        if (imageResults.length > 0) {
            node.resultImages = imageResults.map(r => r.fileUrl);
            node.resultUrl = node.resultImages[0];
            node.currentImageIndex = 0;
            
            // 更新显示
            const preview = document.getElementById(`preview-trylook-${nodeId}`);
            if (preview) {
                preview.innerHTML = `<img src="${node.resultUrl}" class="w-full h-full object-cover"/>`;
            }
            
            // 更新多图按钮
            const btn = document.getElementById(`multi-img-btn-${nodeId}`);
            const count = document.getElementById(`img-count-trylook-${nodeId}`);
            if (btn) btn.classList.remove('hidden');
            if (count) count.textContent = node.resultImages.length;
        }
        
        // 保存到最近使用的工作流列表
        if (node.webappId && node.appName) {
            saveToRecentWorkflows({
                appId: node.webappId,
                appName: node.appName
            });
        }

        // 保存生成的结果到本地文件夹（如果开启了媒体本地储存）
        if (isMediaStorageEnabled()) {
            if (node.resultImages && node.resultImages.length > 0) {
                node.resultImages.forEach((url, idx) => {
                    saveMediaToLocal(url, 'image', `trylook-${nodeId}-${Date.now()}-${idx}.png`).catch(() => {});
                });
            }
        }
        
        showToast('工作流运行完成！', 'success');
    }
}

// 工具栏功能
function tryLookFullscreen(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    openChatMediaFullscreen(node.resultUrl, 'image');
}

function tryLookDownload(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    const a = document.createElement('a');
    a.href = node.resultUrl;
    a.download = `trylook_${nodeId}_${Date.now()}.png`;
    a.click();
}

function tryLookSendToCanvas(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultUrl) return;
    
    const newX = node.x + node.width + 80;
    const newY = node.y;
    createImageNode(node.resultUrl, `trylook_result_${Date.now()}.png`, newX, newY);
    showToast('已发送到画布', 'success');
}

function openTryLookSettings(nodeId) {
    // 打开RunningHub面板进行配置
    openRhPanel();
    showToast('请在工作台中配置工作流后，点击"保存为节点"按钮', 'info');
}

// 选择工作流 - 打开RunningHub工作台面板
let pendingWorkflowNodeId = null;

function selectWorkflowFromRh(nodeId) {
    pendingWorkflowNodeId = nodeId;
    // 打开内部的RunningHub面板
    openRhPanel();
    showToast('请选择工作流后点击"保存为节点"', 'info');
}

// 收藏的工作流列表（本地存储）
let favoriteWorkflows = JSON.parse(localStorage.getItem('favoriteWorkflows') || '[]');

// 保存工作流到收藏
function saveToFavoriteWorkflows(workflow) {
    // 检查是否已存在
    const exists = favoriteWorkflows.some(w => w.appId === workflow.appId);
    if (exists) {
        showToast('该工作流已在收藏中', 'info');
        return;
    }
    favoriteWorkflows.unshift({
        appId: workflow.appId,
        appName: workflow.appName || '未命名工作流',
        timestamp: Date.now()
    });
    localStorage.setItem('favoriteWorkflows', JSON.stringify(favoriteWorkflows));
    showToast('已添加到收藏', 'success');
}

// 从收藏中移除
function removeFromFavoriteWorkflows(appId) {
    favoriteWorkflows = favoriteWorkflows.filter(w => w.appId !== appId);
    localStorage.setItem('favoriteWorkflows', JSON.stringify(favoriteWorkflows));
}

// 打开收藏的工作流 - 在节点右侧弹出分离式小框
function openRhFavorites(nodeId) {
    pendingWorkflowNodeId = nodeId;
    
    // 关闭其他已打开的弹窗
    const existingRecent = document.getElementById('recent-workflows-popup');
    if (existingRecent) existingRecent.remove();
    const existingFavorite = document.getElementById('favorite-workflows-popup');
    if (existingFavorite) existingFavorite.remove();
    
    // 获取节点元素位置
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    
    const nodeRect = nodeEl.getBoundingClientRect();
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 创建分离式弹窗
    const popup = document.createElement('div');
    popup.id = 'favorite-workflows-popup';
    popup.setAttribute('data-for-node', nodeId);
    popup.style.cssText = `
        position: fixed;
        left: ${nodeRect.right + 10}px;
        top: ${nodeRect.top}px;
        width: 280px;
        max-height: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        z-index: 10000;
        overflow: hidden;
        animation: popupFadeIn 0.2s ease;
    `;
    
    // 弹窗内容
    const hasFavorites = favoriteWorkflows.length > 0;
    popup.innerHTML = `
        <div style="padding:12px 16px;background:linear-gradient(135deg,#fffbeb,#fef3c7);border-bottom:1px solid #fde68a;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;color:#b45309;font-size:14px;">⭐ 收藏的工作流</span>
            <button onclick="closeFavoriteWorkflowsPopup()" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:16px;padding:2px 6px;">&times;</button>
        </div>
        <div style="max-height:340px;overflow-y:auto;padding:8px;">
            ${hasFavorites ? favoriteWorkflows.map((wf, idx) => `
                <div style="display:flex;align-items:center;padding:10px 12px;margin:4px 0;border-radius:8px;transition:all 0.15s;background:#fffbeb;border:1px solid #fde68a;" onmouseover="this.style.background='#fef3c7';this.style.borderColor='#fbbf24'" onmouseout="this.style.background='#fffbeb';this.style.borderColor='#fde68a'">
                    <div style="flex:1;cursor:pointer;" onclick="selectFavoriteWorkflow('${nodeId}', ${idx})">
                        <div style="font-weight:500;color:#1e293b;font-size:13px;margin-bottom:4px;">${wf.appName}</div>
                        <div style="font-size:11px;color:#94a3b8;">收藏于 ${formatTimeAgo(wf.timestamp)}</div>
                    </div>
                    <button onclick="event.stopPropagation();removeFavoriteWorkflow(${idx},'${nodeId}')" style="background:none;border:none;cursor:pointer;color:#dc2626;padding:4px;border-radius:4px;transition:background 0.15s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'" title="取消收藏">
                        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `).join('') : `
                <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
                    <svg style="width:48px;height:48px;margin:0 auto 12px;opacity:0.5;color:#fbbf24;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <div>暂无收藏的工作流</div>
                    <div style="font-size:12px;margin-top:8px;">在工作台中运行工作流后可添加收藏</div>
                </div>
            `}
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // 点击外部关闭
    setTimeout(() => {
        document.addEventListener('click', closeFavoriteOnOutsideClick);
    }, 100);
}

function closeFavoriteOnOutsideClick(e) {
    const popup = document.getElementById('favorite-workflows-popup');
    if (popup && !popup.contains(e.target) && !e.target.closest('[onclick*="openRhFavorites"]')) {
        closeFavoriteWorkflowsPopup();
    }
}

function closeFavoriteWorkflowsPopup() {
    const popup = document.getElementById('favorite-workflows-popup');
    if (popup) popup.remove();
    document.removeEventListener('click', closeFavoriteOnOutsideClick);
}

// 选择收藏的工作流
function selectFavoriteWorkflow(nodeId, idx) {
    const workflow = favoriteWorkflows[idx];
    if (!workflow) return;
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) {
        node.webappId = workflow.appId;
        node.appName = workflow.appName;
        renderAITryLookNode(node);
        showToast(`已选择工作流: ${workflow.appName}`, 'success');
    }
    closeFavoriteWorkflowsPopup();
}

// 从收藏中移除（弹窗中的按钮）
function removeFavoriteWorkflow(idx, nodeId) {
    favoriteWorkflows.splice(idx, 1);
    localStorage.setItem('favoriteWorkflows', JSON.stringify(favoriteWorkflows));
    // 刷新弹窗
    closeFavoriteWorkflowsPopup();
    openRhFavorites(nodeId);
    showToast('已取消收藏', 'success');
}

// 最近使用的工作流列表（本地存储）
let recentWorkflows = JSON.parse(localStorage.getItem('recentWorkflows') || '[]');

// 保存工作流到最近使用
function saveToRecentWorkflows(workflow) {
    // 移除重复项
    recentWorkflows = recentWorkflows.filter(w => w.appId !== workflow.appId);
    // 添加到开头
    recentWorkflows.unshift({
        appId: workflow.appId,
        appName: workflow.appName || '未命名工作流',
        timestamp: Date.now()
    });
    // 最多保存20条
    if (recentWorkflows.length > 20) recentWorkflows = recentWorkflows.slice(0, 20);
    localStorage.setItem('recentWorkflows', JSON.stringify(recentWorkflows));
}

// 打开最近使用的工作流 - 在节点右侧弹出分离式小框
function openRhRecent(nodeId) {
    pendingWorkflowNodeId = nodeId;
    
    // 关闭其他已打开的最近使用弹窗
    const existingPopup = document.getElementById('recent-workflows-popup');
    if (existingPopup) existingPopup.remove();
    
    // 获取节点元素位置
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    
    const nodeRect = nodeEl.getBoundingClientRect();
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // 创建分离式弹窗
    const popup = document.createElement('div');
    popup.id = 'recent-workflows-popup';
    popup.setAttribute('data-for-node', nodeId);
    popup.style.cssText = `
        position: fixed;
        left: ${nodeRect.right + 10}px;
        top: ${nodeRect.top}px;
        width: 280px;
        max-height: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        z-index: 10000;
        overflow: hidden;
        animation: popupFadeIn 0.2s ease;
    `;
    
    // 弹窗内容
    const hasRecent = recentWorkflows.length > 0;
    popup.innerHTML = `
        <div style="padding:12px 16px;background:linear-gradient(135deg,#f0f9ff,#ecfeff);border-bottom:1px solid #e0e7ff;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;color:#1e40af;font-size:14px;">最近使用的工作流</span>
            <button onclick="closeRecentWorkflowsPopup()" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:16px;padding:2px 6px;">&times;</button>
        </div>
        <div style="max-height:340px;overflow-y:auto;padding:8px;">
            ${hasRecent ? recentWorkflows.map((wf, idx) => `
                <div onclick="selectRecentWorkflow('${nodeId}', ${idx})" style="padding:10px 12px;margin:4px 0;border-radius:8px;cursor:pointer;transition:all 0.15s;background:#f8fafc;border:1px solid #e2e8f0;" onmouseover="this.style.background='#eff6ff';this.style.borderColor='#93c5fd'" onmouseout="this.style.background='#f8fafc';this.style.borderColor='#e2e8f0'">
                    <div style="font-weight:500;color:#1e293b;font-size:13px;margin-bottom:4px;">${wf.appName}</div>
                    <div style="font-size:11px;color:#94a3b8;">${formatTimeAgo(wf.timestamp)}</div>
                </div>
            `).join('') : `
                <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
                    <svg style="width:48px;height:48px;margin:0 auto 12px;opacity:0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <div>暂无最近使用记录</div>
                </div>
            `}
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // 点击外部关闭
    setTimeout(() => {
        document.addEventListener('click', closeRecentOnOutsideClick);
    }, 100);
}

function closeRecentOnOutsideClick(e) {
    const popup = document.getElementById('recent-workflows-popup');
    if (popup && !popup.contains(e.target) && !e.target.closest('[onclick*="openRhRecent"]')) {
        closeRecentWorkflowsPopup();
    }
}

function closeRecentWorkflowsPopup() {
    const popup = document.getElementById('recent-workflows-popup');
    if (popup) popup.remove();
    document.removeEventListener('click', closeRecentOnOutsideClick);
}

// 选择最近使用的工作流
function selectRecentWorkflow(nodeId, idx) {
    const workflow = recentWorkflows[idx];
    if (!workflow) return;
    
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) {
        node.appId = workflow.appId;
        node.appName = workflow.appName;
        renderAITryLookNode(node);
        showToast(`已选择工作流: ${workflow.appName}`, 'success');
    }
    closeRecentWorkflowsPopup();
}

// 格式化时间为相对时间
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString();
}

function showTryLookImagePicker(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.resultImages || node.resultImages.length === 0) return;
    
    // 复用现有的图片选择器
    showImagePicker(nodeId);
}

// 从iframe接收的addAITryLookNode函数
function addAITryLookNode(payload) {
    console.log('[Canvas] addAITryLookNode called with:', payload);
    
    // 计算新节点位置（在画布中央偏移）
    const container = document.getElementById('canvas-container');
    const rect = container ? container.getBoundingClientRect() : { width: 800, height: 600 };
    const centerX = (rect.width / 2 - CanvasNodeSystem.offset.x) / CanvasNodeSystem.zoom;
    const centerY = (rect.height / 2 - CanvasNodeSystem.offset.y) / CanvasNodeSystem.zoom;
    
    // 创建节点
    const nodeId = createAITryLookNodeAtPos(centerX - 200, centerY - 200, {
        webappId: payload.webappId,
        appName: payload.appName,
        nodes: payload.nodes
    });
    
    // 关闭RunningHub面板
    closeRhPanel();
    
    showToast(`已创建工作流节点: ${payload.appName}`, 'success');
    
    return nodeId;
}

// ==================== 点击标记系统 ====================

// 标记状态管理
let _markerState = {
    active: false,       // 是否处于标记模式
    nodeId: null,        // 当前标记的节点ID
    markers: {},         // { nodeId: [{ id, number, percentX, percentY, label, subParts:[] }] }
    nextNumber: 1,       // 下一个标记编号
    identifying: false   // 是否正在LLM识别中
};

/**
 * 切换标记模式
 */
function toggleMarkerMode(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const nodeEl = document.getElementById(`node-${nodeId}`);
    const btn = document.getElementById(`marker-btn-${nodeId}`);
    
    if (_markerState.active && _markerState.nodeId === nodeId) {
        // 关闭标记模式
        exitMarkerMode();
    } else {
        // 进入标记模式
        _markerState.active = true;
        _markerState.nodeId = nodeId;
        
        // 初始化该节点的标记数组
        if (!_markerState.markers[nodeId]) {
            _markerState.markers[nodeId] = [];
            _markerState.nextNumber = 1;
        } else {
            // 续编号
            const maxNum = Math.max(0, ..._markerState.markers[nodeId].map(m => m.number));
            _markerState.nextNumber = maxNum + 1;
        }
        
        // 添加标记模式样式
        if (nodeEl) {
            nodeEl.classList.add('marking-mode');
            nodeEl.classList.add('node-active');
        }
        
        // 高亮按钮
        if (btn) {
            btn.classList.add('marker-active');
            btn.style.background = '#dbeafe';
            btn.style.color = '#2563eb';
        }
        
        // 标记点击通过 onMouseDown 拦截处理，无需额外绑定事件
        
        if (typeof showToast === 'function') showToast('标记模式：点击图片放置标记，再次点击「标记」退出', 'info');
    }
}

/**
 * 退出标记模式
 */
function exitMarkerMode() {
    const nodeId = _markerState.nodeId;
    const nodeEl = nodeId ? document.getElementById(`node-${nodeId}`) : null;
    const btn = nodeId ? document.getElementById(`marker-btn-${nodeId}`) : null;
    
    if (nodeEl) {
        nodeEl.classList.remove('marking-mode');
    }
    
    if (btn) {
        btn.classList.remove('marker-active');
        btn.style.background = 'none';
        btn.style.color = '#374151';
    }
    
    // 刷新胶囊标签
    if (nodeId) {
        renderMarkerCapsules(nodeId);
    }
    
    _markerState.active = false;
    _markerState.nodeId = null;
}

/**
 * 在图片上放置标记
 */
function placeMarker(nodeId, e) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!node || !nodeEl) return;
    
    const nodeBody = nodeEl.querySelector('.node-body');
    if (!nodeBody) return;
    
    const rect = nodeBody.getBoundingClientRect();
    
    // 计算点击在图片内的百分比位置
    const percentX = ((e.clientX - rect.left) / rect.width) * 100;
    const percentY = ((e.clientY - rect.top) / rect.height) * 100;
    
    // 边界检查
    if (percentX < 0 || percentX > 100 || percentY < 0 || percentY > 100) return;
    
    const markerId = 'marker_' + Date.now() + '_' + _markerState.nextNumber;
    const number = _markerState.nextNumber++;
    
    const marker = {
        id: markerId,
        number: number,
        percentX: percentX,
        percentY: percentY,
        label: '识别中...',
        subParts: [],
        _expanded: false
    };
    
    if (!_markerState.markers[nodeId]) _markerState.markers[nodeId] = [];
    _markerState.markers[nodeId].push(marker);
    
    // 渲染标记点
    renderMarkerPin(nodeId, marker);
    
    // 更新标记面板和胶囊
    updateMarkerPanel(nodeId);
    renderMarkerCapsules(nodeId);
    
    // 使用 LLM 识别该位置的物品
    identifyMarkerItem(nodeId, marker);
}

/**
 * 渲染标记点（蓝色圆圈+数字）
 */
function renderMarkerPin(nodeId, marker) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    
    const nodeBody = nodeEl.querySelector('.node-body');
    if (!nodeBody) return;
    
    const pin = document.createElement('div');
    pin.id = `marker-pin-${marker.id}`;
    pin.className = 'marker-pin';
    pin.style.left = marker.percentX + '%';
    pin.style.top = marker.percentY + '%';
    pin.textContent = marker.number;
    pin.title = `标记 ${marker.number}: ${marker.label}`;
    pin.onclick = function(e) {
        e.stopPropagation();
    };
    
    nodeBody.appendChild(pin);
}

/**
 * 移除单个标记
 */
function removeMarker(nodeId, markerId) {
    // 关闭气泡框
    hideCapsulePopup();
    
    const markers = _markerState.markers[nodeId];
    if (!markers) return;
    
    const idx = markers.findIndex(m => m.id === markerId);
    if (idx > -1) markers.splice(idx, 1);
    
    // 强同步图片上的标记点，避免偶发“胶囊删了但图上标记还在”
    syncMarkerPins(nodeId);
    
    // 更新面板、输入框、胶囊
    updateMarkerPanel(nodeId);
    syncMarkersToPrompt(nodeId);
    renderMarkerCapsules(nodeId);
}

/**
 * 清除某节点所有标记
 */
function clearAllMarkers(nodeId) {
    // 关闭气泡框
    hideCapsulePopup();
    
    const markers = _markerState.markers[nodeId];
    if (markers) {
        markers.forEach(m => {
            const pin = document.getElementById(`marker-pin-${m.id}`);
            if (pin) pin.remove();
        });
        _markerState.markers[nodeId] = [];
        _markerState.nextNumber = 1;
    }
    
    // ★ 额外保险：移除节点内所有 marker-pin DOM 元素
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (nodeEl) {
        nodeEl.querySelectorAll('.marker-pin').forEach(pin => pin.remove());
    }
    
    updateMarkerPanel(nodeId);
    renderMarkerCapsules(nodeId);
    syncMarkerPins(nodeId);
    
    // 清除时也清空输入框中的标记内容
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.markerInlineTexts = [''];
    const promptEl = document.getElementById(`edit-prompt-${nodeId}`);
    if (promptEl) promptEl.value = '';
}

// 标记面板已移除 — 胶囊现在直接在输入框内显示
function showMarkerPanel(nodeId) { /* 已弃用 */ }
function buildMarkerPanelHTML(nodeId) { return ''; }
function toggleSubParts(nodeId, markerId) { /* 已弃用 */ }
function selectSubPart(nodeId, markerId, partName) { selectCapsulePart(nodeId, markerId, partName); }
function updateMarkerPanel(nodeId) { renderMarkerCapsules(nodeId); }
function repositionMarkerPanel(nodeId) { /* 已弃用 */ }

/**
 * 使用 LLM 识别标记位置的物品（带重试和降级）
 */
async function identifyMarkerItem(nodeId, marker) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.url) {
        marker.label = '未知物品';
        marker.subParts = [];
        updateMarkerPanel(nodeId);
        syncMarkersToPrompt(nodeId);
        return;
    }
    
    const apiKey = (typeof apiConfig !== 'undefined' && apiConfig.apiKey) ? apiConfig.apiKey : '';
    if (!apiKey) {
        marker.label = '需配置API Key';
        marker.subParts = [];
        updateMarkerPanel(nodeId);
        updateMarkerPinTitle(marker);
        return;
    }
    
    const baseUrl = (typeof apiConfig !== 'undefined' && apiConfig.baseUrl)
        ? apiConfig.baseUrl
        : (typeof DEFAULT_API_URL !== 'undefined' ? DEFAULT_API_URL : '');
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;
    
    // 提前转换 base64
    let base64ImageUrl;
    try {
        if (typeof imageUrlToBase64DataUrl === 'function') {
            base64ImageUrl = await imageUrlToBase64DataUrl(node.url);
        } else {
            base64ImageUrl = node.url;
        }
    } catch (e) {
        console.error('[Marker] 图片转换失败:', e);
        marker.label = '图片读取失败';
        marker.subParts = [];
        updateMarkerPanel(nodeId);
        syncMarkersToPrompt(nodeId);
        return;
    }
    
    const llmModel = (typeof modelConfig !== 'undefined' && modelConfig.llm) ? modelConfig.llm : 'gemini-3-flash-preview';
    
    const systemPrompt = `你是专业图片内容识别助手。用户在图片上标记了一个位置，请识别该处的物体。

严格按以下JSON格式回复，禁止输出任何其他文字或markdown：
{"name":"物体简短名称","parts":["整体","子部件1","子部件2",...]}

name要求：
- 2-6个中文词，简明概括（如"蓝色条纹上衣""黑色皮靴""白色沙发"）
- 包含颜色+核心特征+物品类型
- 不要过长，不要写完整句子

parts要求（这是用户可能想修改的部位列表，非常重要）：
- 第一项固定为"整体"
- 之后列出8-12个该物体用户最可能想修改的具体部位/细节/属性
- 要同时包含「结构部位」和「视觉属性」两类：
  · 结构部位：物体的物理组成部分（如上衣→领口/袖口/衣袖/前襟/下摆/口袋）
  · 视觉属性：可替换的视觉特征（如→颜色/图案/面料材质/纹理/风格）
- 尽量具体，方便用户选择要修改哪个部分

参考示例：
上衣→{"name":"蓝黑横条纹上衣","parts":["整体","领口","袖口","衣袖","前襟","下摆","口袋","条纹图案","面料材质","颜色","版型风格"]}
裙子→{"name":"碎花A字裙","parts":["整体","裙摆","腰部","裙长","印花图案","面料材质","颜色","褶皱","拉链","腰带","版型"]}
鞋子→{"name":"黑色高跟鞋","parts":["整体","鞋面","鞋跟","鞋头","鞋底","鞋带/扣件","材质","颜色","跟高","鞋型"]}
包→{"name":"棕色皮革挎包","parts":["整体","包身","肩带","五金扣件","皮革材质","拉链","内衬","颜色","包型","装饰"]}
人脸→{"name":"女性面部","parts":["整体","发型","发色","眼妆","唇色","表情","首饰","耳环","眼镜","帽子"]}
家具→{"name":"白色布艺沙发","parts":["整体","坐垫","靠背","扶手","布料材质","框架","颜色","靠枕","风格"]}
杯子→{"name":"透明玻璃水杯","parts":["整体","杯口","杯身","杯底","把手","透明度","杯中液体","液体颜色","液位高度","气泡","冰块"]}`;

    const userInstruction = `图中标记位置：水平${Math.round(marker.percentX)}%，垂直${Math.round(marker.percentY)}%处。识别该处物体，JSON回复。`;
    
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
            { type: 'image_url', image_url: { url: base64ImageUrl } },
            { type: 'text', text: userInstruction }
        ]}
    ];
    
    // 最多重试2次（共3次尝试）
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[Marker] 第 ${attempt + 1} 次重试识别...`);
                marker.label = `识别中(重试${attempt})...`;
                updateMarkerPanel(nodeId);
                await new Promise(r => setTimeout(r, 1500 * attempt));
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: llmModel,
                    messages: messages,
                    temperature: 0.2,
                    max_tokens: 500
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                let content = data.choices?.[0]?.message?.content?.trim() || '';
                console.log(`[Marker] LLM原始返回: "${content}"`);
                
                if (content) {
                    // 尝试提取JSON（多种方式）
                    let parsed = null;
                    
                    // 方式1: 先去掉 markdown 代码块标记
                    let cleanContent = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
                    
                    try {
                        // 提取 {} 之间的内容
                        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            parsed = JSON.parse(jsonMatch[0]);
                        }
                    } catch (parseErr) {
                        console.warn('[Marker] JSON解析失败(方式1):', parseErr.message);
                    }
                    
                    // 方式2: 如果JSON.parse失败，尝试用正则直接提取name和parts
                    if (!parsed || !parsed.name) {
                        try {
                            const nameMatch = cleanContent.match(/"name"\s*:\s*"([^"]+)"/);
                            if (nameMatch && nameMatch[1]) {
                                const partsMatch = cleanContent.match(/"parts"\s*:\s*\[([\s\S]*?)\]/);
                                let parts = [];
                                if (partsMatch && partsMatch[1]) {
                                    // 提取所有引号内的字符串
                                    const partStrings = partsMatch[1].match(/"([^"]+)"/g);
                                    if (partStrings) {
                                        parts = partStrings.map(s => s.replace(/"/g, ''));
                                    }
                                }
                                parsed = { name: nameMatch[1], parts: parts };
                                console.log('[Marker] 通过正则提取成功:', parsed.name);
                            }
                        } catch (regexErr) {
                            console.warn('[Marker] 正则提取也失败:', regexErr.message);
                        }
                    }
                    
                    if (parsed && parsed.name) {
                        // JSON格式解析成功
                        const name = parsed.name.replace(/["""''。，！？\n]/g, '').substring(0, 30);
                        marker.label = name || '未识别';
                        marker.subParts = ensureMarkerSubParts(
                            marker.label,
                            Array.isArray(parsed.parts) ? parsed.parts : []
                        );
                        console.log(`[Marker] 识别成功: ${marker.label}, 子部件: ${marker.subParts.join(', ')}`);
                        break;
                    } else {
                        // 降级为纯文本处理
                        // ★ 如果内容看起来像JSON但解析失败，尝试提取name值
                        if (cleanContent.includes('"name"')) {
                            const simpleNameMatch = cleanContent.match(/["']?name["']?\s*[:：]\s*["']([^"']+)/);
                            if (simpleNameMatch && simpleNameMatch[1]) {
                                marker.label = simpleNameMatch[1].substring(0, 30);
                                marker.subParts = ensureMarkerSubParts(marker.label, []);
                                console.log(`[Marker] 从JSON片段提取name: ${marker.label}`);
                                break;
                            }
                        }
                        
                        // 去掉JSON语法字符，提取纯文本
                        content = cleanContent.replace(/[\{"\}:\[\]]/g, '').replace(/name/gi, '').replace(/parts/gi, '');
                        content = content.replace(/^["'"'「」【】,\s]+|["'"'「」【】。，！？\.\s,]+$/g, '');
                        if (content.includes('\n')) content = content.split('\n')[0].trim();
                        // 去掉多余逗号和空白
                        content = content.replace(/^[,\s]+/, '').trim();
                        
                        if (content.length < 2) {
                            console.warn(`[Marker] 回复太短(${content.length}字): "${content}"，重试...`);
                            lastError = `回复太短: ${content}`;
                            marker.label = content || '识别中...';
                            marker.subParts = [];
                            if (attempt < 2) continue;
                        }
                        marker.label = content.substring(0, 30) || '未识别';
                        marker.subParts = [];
                        break;
                    }
                } else {
                    lastError = '返回内容为空';
                    marker.label = '识别失败';
                    marker.subParts = [];
                }
            } else {
                const errText = await response.text().catch(() => '');
                lastError = `HTTP ${response.status}: ${errText.substring(0, 100)}`;
                console.error(`[Marker] API错误:`, lastError);
                marker.label = '识别失败';
                marker.subParts = [];
                if (response.status >= 400 && response.status < 500) break;
            }
        } catch (e) {
            lastError = e.message;
            marker.subParts = [];
            if (e.name === 'AbortError') {
                console.warn('[Marker] 识别超时');
                marker.label = '识别超时';
            } else {
                console.error('[Marker] LLM 识别失败:', e);
                marker.label = '识别失败';
            }
        }
    }
    
    if (marker.label === '识别失败' || marker.label === '识别超时') {
        console.warn('[Marker] 最终识别失败:', lastError);
    }
    
    updateMarkerPanel(nodeId);
    updateMarkerPinTitle(marker);
    syncMarkersToPrompt(nodeId);
    renderMarkerCapsules(nodeId);
}

/**
 * 基于标记构建前缀提示词（不包含用户补充描述）
 */
function buildMarkerPromptPrefix(nodeId) {
    const markers = _markerState.markers[nodeId] || [];
    const invalidLabels = ['识别中', '识别失败', '识别超时', '未知物品', '需配置', '图片读取'];
    const validMarkers = markers.filter(m =>
        m.label && !invalidLabels.some(s => m.label.includes(s))
    );
    if (validMarkers.length === 0) return '';
    
    if (validMarkers.length === 1) {
        const m = validMarkers[0];
        const selectedPart = m._selectedPart;
        if (selectedPart && selectedPart !== '整体') {
            return `把[${m.label}]的[${selectedPart}]改为`;
        }
        return `把[${m.label}]改为`;
    }
    
    return validMarkers.map(m => {
        const circleNum = String.fromCodePoint(0x245F + m.number);
        const selectedPart = m._selectedPart;
        if (selectedPart && selectedPart !== '整体') {
            return `${circleNum}[${m.label}]的[${selectedPart}]改为`;
        }
        return `${circleNum}[${m.label}]改为`;
    }).join('；');
}

// 为标记生成可编辑细节（兜底：即使LLM未返回parts，也保证胶囊可点击）
function ensureMarkerSubParts(label, rawParts) {
    const commonParts = ['整体', '颜色', '材质', '纹理', '图案', '风格', '细节'];
    const labelText = String(label || '');
    const parts = Array.isArray(rawParts) ? rawParts : [];
    
    const cleaned = parts
        .map(p => String(p || '').trim().substring(0, 15))
        .filter(Boolean);
    
    const deduped = [];
    const seen = new Set();
    cleaned.forEach(p => {
        if (!seen.has(p)) {
            seen.add(p);
            deduped.push(p);
        }
    });
    
    if (!seen.has('整体')) {
        deduped.unshift('整体');
        seen.add('整体');
    }
    
    const addList = (list) => {
        list.forEach(p => {
            const part = String(p || '').trim().substring(0, 15);
            if (part && !seen.has(part)) {
                seen.add(part);
                deduped.push(part);
            }
        });
    };
    
    const byType = [];
    
    const isUpperWear = /(上衣|衬衫|T恤|外套|夹克|风衣|卫衣|毛衣|针织|背心|抹胸|大衣)/.test(labelText);
    const isPants = /(裤|牛仔裤|长裤|短裤|阔腿裤|喇叭裤|西裤|工装裤|休闲裤|打底裤|裤装)/.test(labelText);
    const isSkirt = /(裙|半裙|短裙|长裙|百褶裙|A字裙|裙装)/.test(labelText) && !/(连衣裙)/.test(labelText);
    const isDress = /(连衣裙|礼服|裙子)/.test(labelText);
    const isHair = /(头发|发型|刘海|发色|卷发|直发|发丝|发尾|马尾|辫子)/.test(labelText);
    const isApparel = /(服|穿搭|衣物)/.test(labelText) || isUpperWear || isPants || isSkirt || isDress;
    
    // 上装部位
    if (isUpperWear) {
        byType.push(
            '衣领', '领口', '袖口', '袖子', '袖子长度',
            '前襟', '下摆', '衣摆长度', '衣摆宽度',
            '版型', '褶皱', '纽扣/拉链', '面料厚薄'
        );
    }
    
    // 裤装部位（避免出现领口/袖口等上衣词）
    if (isPants) {
        byType.push(
            '裤腰', '腰线', '裤裆', '裤腿', '裤长',
            '裤脚', '裤脚口', '口袋', '拉链/纽扣',
            '版型', '褶皱', '面料厚薄'
        );
    }
    
    // 半裙部位
    if (isSkirt) {
        byType.push(
            '裙腰', '腰线', '裙摆', '裙长', '裙摆宽度',
            '褶皱', '开衩', '拉链/纽扣', '版型', '面料厚薄'
        );
    }
    
    // 连衣裙兼具上装与裙装结构
    if (isDress) {
        byType.push(
            '领口', '袖口', '袖子', '腰线', '裙摆',
            '裙长', '开衩', '拉链/纽扣', '版型', '面料厚薄'
        );
    }
    
    // 泛服饰兜底（不覆盖明确品类）
    if (isApparel && !isUpperWear && !isPants && !isSkirt && !isDress) {
        byType.push('版型', '褶皱', '接缝', '下摆', '纽扣/拉链', '面料厚薄');
    }
    
    // 发型/头发：强相关候选优先，避免弹窗出现无关服饰词
    if (isHair) {
        byType.push(
            '发型', '发色', '刘海', '发长', '卷度',
            '分缝', '发量', '发尾', '发丝质感', '光泽'
        );
    }
    
    // 鞋靴配饰
    if (/(鞋|靴|高跟|运动鞋|凉鞋)/.test(labelText)) {
        byType.push('鞋头', '鞋跟', '鞋底', '鞋带/扣件', '跟高', '鞋型');
    }
    if (/(包|手提|挎包|背包|钱包)/.test(labelText)) {
        byType.push('包型', '包身', '肩带', '五金', '开合方式', '口袋');
    }
    
    // 容器/杯具：补齐“液体相关”可编辑点
    if (/(杯|玻璃杯|水杯|马克杯|咖啡杯|茶杯|高脚杯|酒杯|奶茶杯|瓶|罐)/.test(labelText)) {
        byType.push(
            '杯口', '杯身', '杯底', '把手', '透明度',
            '杯中液体', '液体颜色', '液位高度', '气泡', '冰块'
        );
    }
    
    // 餐具/食物
    if (/(碗|盘|餐具|食物|面包|蛋糕|水果|沙拉|牛排|米饭|菜)/.test(labelText)) {
        byType.push('表面质感', '摆盘', '份量', '酱汁', '热气', '配料');
    }
    
    // 人像（服装场景里也常见）
    if (/(人|女性|男性|模特|面部|头发|发型)/.test(labelText)) {
        byType.push('发型', '发色', '妆容', '表情', '配饰');
    }
    
    // 通用兜底
    if (byType.length === 0) {
        byType.push('形状', '边缘', '结构', '装饰', '尺寸');
    }
    
    addList(byType);
    addList(commonParts);
    
    // 品类词纠偏：裤装剔除上衣专属部位，避免出现“裤子领口/袖口”这类错误选项
    const upperOnlyParts = new Set(['衣领', '领口', '袖口', '袖子', '袖子长度', '前襟', '衣摆', '衣摆长度', '衣摆宽度']);
    const apparelOnlyParts = new Set(['衣领', '领口', '袖口', '袖子', '袖子长度', '前襟', '衣摆', '衣摆长度', '衣摆宽度', '裤腰', '裤裆', '裤腿', '裤长', '裤脚', '裤脚口', '裙摆', '裙长']);
    let filtered = isPants ? deduped.filter(p => !upperOnlyParts.has(p) || p === '整体') : deduped;
    if (isHair) {
        filtered = filtered.filter(p => !apparelOnlyParts.has(p) || p === '整体');
    }
    
    // 防止候选过多，优先保留“模型返回 + 类别关键项”
    return filtered.slice(0, 16);
}

/**
 * 保存当前内联输入内容（按 slot 顺序）
 */
function persistMarkerInlineTexts(nodeId, wrapperEl) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !wrapperEl) return;
    const inputs = Array.from(wrapperEl.querySelectorAll('.marker-inline-input'));
    if (inputs.length === 0) return;
    node.markerInlineTexts = inputs.map(input => input.value || '');
}

function getMarkerInlineTexts(nodeId, slotCount) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    const cached = (node && Array.isArray(node.markerInlineTexts)) ? node.markerInlineTexts : [];
    const out = [];
    for (let i = 0; i < slotCount; i++) {
        out.push(cached[i] || '');
    }
    return out;
}

function buildInlineMarkerPrompt(nodeId) {
    const markers = _markerState.markers[nodeId] || [];
    const invalidLabels = ['识别中', '识别失败', '识别超时', '未知物品', '需配置', '图片读取'];
    const slotTexts = getMarkerInlineTexts(nodeId, markers.length + 1).map(v => String(v || '').trim());
    
    if (markers.length === 0) {
        return (slotTexts[0] || '').trim();
    }
    
    const chunks = [];
    markers.forEach((m, idx) => {
        if (slotTexts[idx]) chunks.push(slotTexts[idx]);
        if (!m.label || invalidLabels.some(s => m.label.includes(s))) return;
        const selectedPart = m._selectedPart;
        // 胶囊视为“打包好的文本片段”，只输出片段本身，不自动补全句式
        if (selectedPart && selectedPart !== '整体') chunks.push(`${m.label} ${selectedPart}`);
        else chunks.push(`${m.label}`);
    });
    const tail = slotTexts[markers.length];
    if (tail) chunks.push(tail);
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * 将标记状态同步到输入框（胶囊像文字片段一样可前后输入）
 */
function syncMarkersToPrompt(nodeId) {
    const wrapper = document.getElementById(`edit-prompt-wrapper-${nodeId}`);
    if (!wrapper) return;
    persistMarkerInlineTexts(nodeId, wrapper);
    renderMarkerCapsules(nodeId);
}

/**
 * 渲染胶囊标记到输入框包装器内（在 input 元素前面内联显示）
 */
function renderMarkerCapsules(nodeId) {
    const wrapper = document.getElementById(`edit-prompt-wrapper-${nodeId}`);
    const promptEl = document.getElementById(`edit-prompt-${nodeId}`);
    if (!wrapper || !promptEl) return;
    
    persistMarkerInlineTexts(nodeId, wrapper);
    
    // 清理后重建，保证“每个胶囊前后都有输入位”
    wrapper.querySelectorAll('.marker-capsule, .capsule-clear-all, .marker-inline-input').forEach(el => {
        if (el !== promptEl) el.remove();
    });
    
    const markers = _markerState.markers[nodeId] || [];
    const slotCount = markers.length + 1;
    const slotTexts = getMarkerInlineTexts(nodeId, slotCount);
    
    const invalidLabels = ['识别中', '识别失败', '识别超时', '未知物品', '需配置', '图片读取'];
    const frag = document.createDocumentFragment();
    
    // 让输入槽和普通文字一样按内容占位，避免固定最小宽度导致版式被撑开
    const resizeInlineInput = (input, isLastSlot) => {
        if (!input) return;
        const value = String(input.value || '');
        const isFocused = document.activeElement === input;
        const hasText = value.length > 0;
        
        if (isLastSlot) {
            // 胶囊后的输入位作为主输入区，始终占据剩余空间，避免后续长文本被遮挡
            input.style.flex = '1 1 120px';
            input.style.minWidth = '120px';
            input.style.width = 'auto';
            input.style.padding = '4px 2px';
            return;
        }
        
        if (!hasText && !isFocused) {
            // 前置槽位无文字时收缩到几乎 0，让胶囊贴到最前，保持“像文字流”效果
            input.style.flex = '0 0 auto';
            input.style.width = '0';
            input.style.padding = '0';
            return;
        }
        
        const text = value.trim() || ' ';
        const textLen = Math.max(1, text.length);
        const minPx = 20;
        const maxPx = 260;
        const estimated = Math.round(textLen * 8 + 12);
        const width = Math.min(maxPx, Math.max(minPx, estimated));
        input.style.flex = '0 0 auto';
        input.style.width = `${width}px`;
        input.style.padding = '4px 2px';
    };
    
    const createSlotInput = (slotIndex, isLast) => {
        const input = isLast ? promptEl : document.createElement('input');
        input.type = 'text';
        input.className = 'marker-inline-input';
        input.dataset.slotIndex = String(slotIndex);
        if (!isLast) input.onclick = function(e) { e.stopPropagation(); };
        input.style.cssText = 'flex:0 0 auto;min-width:0;padding:4px 2px;background:transparent;color:#374151;font-size:13px;border:none;outline:none;font-family:inherit;';
        const hasAnyMarkers = markers.length > 0;
        input.placeholder = hasAnyMarkers ? '' : '在此输入修改描述...';
        input.value = slotTexts[slotIndex] || '';
        resizeInlineInput(input, isLast);
        input.oninput = function() {
            resizeInlineInput(input, isLast);
            persistMarkerInlineTexts(nodeId, wrapper);
        };
        input.onfocus = function() { resizeInlineInput(input, isLast); };
        input.onblur = function() { resizeInlineInput(input, isLast); };
        return input;
    };
    
    if (markers.length === 0) {
        const singleInput = createSlotInput(0, true);
        singleInput.id = `edit-prompt-${nodeId}`;
        frag.appendChild(singleInput);
        wrapper.innerHTML = '';
        wrapper.appendChild(frag);
        return;
    }
    
    markers.forEach((m, idx) => {
        // 先插入“胶囊前”输入位
        frag.appendChild(createSlotInput(idx, false));
        
        // 兼容历史数据：已有label但无parts时，自动补全可编辑细节
        if ((!Array.isArray(m.subParts) || m.subParts.length === 0) && m.label && !invalidLabels.some(s => m.label.includes(s))) {
            m.subParts = ensureMarkerSubParts(m.label, []);
        }
        
        const isLoading = !m.label || invalidLabels.some(s => m.label.includes(s)) || m.label.includes('识别中');
        const hasSubParts = m.subParts && m.subParts.length > 0;
        const selectedPart = m._selectedPart;
        
        // 显示文本：蓝色胶囊样式（编号 + 标签 + 已选部位）
        let displayLabel = m.label || '识别中...';
        const partLabel = (selectedPart && selectedPart !== '整体') ? selectedPart : '';
        
        const capsule = document.createElement('div');
        capsule.className = 'marker-capsule' + (isLoading ? ' capsule-loading' : '');
        capsule.title = isLoading ? '正在识别...' : (hasSubParts ? '点击选择要修改的部位' : (m.label || ''));
        
        capsule.innerHTML = `
            <div class="capsule-badge">${m.number}</div>
            <span class="capsule-label">${displayLabel}</span>
            ${partLabel ? `<span class="capsule-part" title="已选部位">${partLabel}</span>` : ''}
            <button class="capsule-remove" title="移除">✕</button>
        `;
        
        // 点击胶囊 → 弹出子部件选择
        if (hasSubParts && !isLoading) {
            capsule.style.cursor = 'pointer';
            capsule.addEventListener('click', function(e) {
                e.stopPropagation();
                // 检查是否点击了删除按钮
                if (e.target.closest('.capsule-remove')) return;
                window.showCapsulePopup(nodeId, m.id, capsule, e);
            });
        }
        
        // 删除按钮
        const removeBtn = capsule.querySelector('.capsule-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                window.removeMarker(nodeId, m.id);
            });
        }
        
        frag.appendChild(capsule);
    });
    
    // 末尾输入位
    const tailInput = createSlotInput(markers.length, true);
    tailInput.id = `edit-prompt-${nodeId}`;
    frag.appendChild(tailInput);
    
    // 2个以上标记时，加一个清除全部的小按钮
    if (markers.length > 1) {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'capsule-clear-all';
        clearBtn.textContent = '清除';
        clearBtn.style.cssText = 'padding:2px 7px;font-size:10px;color:#9ca3af;background:none;border:1px solid #e5e7eb;border-radius:999px;cursor:pointer;transition:all 0.15s;white-space:nowrap;flex-shrink:0;';
        clearBtn.onmouseover = function() { this.style.color='#ef4444'; this.style.borderColor='#fecaca'; };
        clearBtn.onmouseout = function() { this.style.color='#9ca3af'; this.style.borderColor='#e5e7eb'; };
        clearBtn.onclick = function(e) { e.stopPropagation(); window.clearAllMarkers(nodeId); };
        frag.appendChild(clearBtn);
    }
    
    wrapper.innerHTML = '';
    wrapper.appendChild(frag);
}

/**
 * 显示子部件选择气泡框（优先定位在胶囊上方）
 */
function showCapsulePopup(nodeId, markerId, anchorEl, evt) {
    // 先关闭已有气泡
    hideCapsulePopup();
    
    const markers = _markerState.markers[nodeId];
    if (!markers) return;
    const marker = markers.find(m => m.id === markerId);
    if (!marker || !marker.subParts || marker.subParts.length === 0) return;
    
    const popup = document.createElement('div');
    popup.id = 'capsule-popup';
    popup.className = 'capsule-popup';
    popup.onclick = (e) => e.stopPropagation();
    popup.onmousedown = (e) => e.stopPropagation();
    
    // 构建子部件选项
    const chipsHTML = marker.subParts.map(part => {
        const isSelected = marker._selectedPart === part;
        const isWhole = part === '整体';
        let chipClass = 'popup-chip';
        if (isWhole) chipClass += ' popup-chip-whole';
        const selectedStyle = isSelected ? 'background:#3b82f6;color:white;border-color:#3b82f6;font-weight:600;' : '';
        return `<button class="${chipClass}" style="${selectedStyle}" onclick="event.stopPropagation();window.selectCapsulePart('${nodeId}','${markerId}','${part.replace(/'/g, "\\'")}')">${part}</button>`;
    }).join('');
    
    popup.innerHTML = `
        <div class="popup-header">
            <span class="popup-title">修改 ${marker.label} 的哪个部位？</span>
            <button class="popup-close" onclick="event.stopPropagation();window.hideCapsulePopup()">×</button>
        </div>
        <div class="popup-chips">${chipsHTML}</div>
    `;
    
    document.body.appendChild(popup);
    
    // 定位：优先锚定到胶囊上方，fallback 到点击点附近
    const popupRect = popup.getBoundingClientRect();
    // 兼容旧调用签名：showCapsulePopup(nodeId, markerId, event)
    if (!evt && anchorEl && typeof anchorEl.clientX === 'number') {
        evt = anchorEl;
        anchorEl = null;
    }
    
    const anchorRect = anchorEl && typeof anchorEl.getBoundingClientRect === 'function'
        ? anchorEl.getBoundingClientRect()
        : null;
    
    let left;
    let top;
    if (anchorRect) {
        left = anchorRect.left + (anchorRect.width / 2) - (popupRect.width / 2);
        top = anchorRect.top - popupRect.height - 10;
    } else {
        const x = evt?.clientX || (window.innerWidth / 2);
        const y = evt?.clientY || (window.innerHeight / 2);
        left = x - popupRect.width / 2;
        top = y - popupRect.height - 12;
    }
    
    // 如果上方空间不够，显示在下方
    if (top < 8) {
        top = anchorRect ? (anchorRect.bottom + 10) : ((evt?.clientY || 0) + 12);
    }
    // 水平边界检查
    if (left < 8) left = 8;
    if (left + popupRect.width > window.innerWidth - 8) {
        left = window.innerWidth - popupRect.width - 8;
    }
    // 垂直边界检查
    if (top + popupRect.height > window.innerHeight - 8) {
        top = window.innerHeight - popupRect.height - 8;
    }
    if (top < 8) top = 8;
    
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    
    // 点击其他区域关闭
    setTimeout(() => {
        document.addEventListener('mousedown', _capsulePopupOutsideClick, { once: true });
    }, 50);
}

function _capsulePopupOutsideClick(e) {
    const popup = document.getElementById('capsule-popup');
    if (popup && !popup.contains(e.target)) {
        hideCapsulePopup();
    } else if (popup) {
        // 如果点击在弹窗内，重新绑定
        setTimeout(() => {
            document.addEventListener('mousedown', _capsulePopupOutsideClick, { once: true });
        }, 50);
    }
}

/**
 * 关闭子部件气泡框
 */
function hideCapsulePopup() {
    const popup = document.getElementById('capsule-popup');
    if (popup) popup.remove();
    document.removeEventListener('mousedown', _capsulePopupOutsideClick);
}

/**
 * 选择子部件 → 更新提示词
 */
function selectCapsulePart(nodeId, markerId, partName) {
    const markers = _markerState.markers[nodeId];
    if (!markers) return;
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    
    // 记录选择
    marker._selectedPart = partName;
    
    // 关闭气泡
    hideCapsulePopup();
    
    // 更新提示词
    syncMarkersToPrompt(nodeId);
    
    // 更新胶囊显示
    renderMarkerCapsules(nodeId);
    
    // 聚焦输入框让用户继续输入
    const promptEl = document.getElementById(`edit-prompt-${nodeId}`);
    if (promptEl) {
        promptEl.focus();
        // 将光标放到末尾
        const len = promptEl.value.length;
        promptEl.setSelectionRange(len, len);
    }
}

/**
 * 更新标记点的 title 提示
 */
function updateMarkerPinTitle(marker) {
    const pin = document.getElementById(`marker-pin-${marker.id}`);
    if (pin) {
        pin.title = `标记 ${marker.number}: ${marker.label}`;
    }
}

/**
 * 按当前 marker 状态重建图片上的标记点，避免视图与数据不同步
 */
function syncMarkerPins(nodeId) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) return;
    const nodeBody = nodeEl.querySelector('.image-node-body');
    if (!nodeBody) return;
    
    nodeBody.querySelectorAll('.marker-pin').forEach(pin => pin.remove());
    const markers = _markerState.markers[nodeId] || [];
    markers.forEach(marker => renderMarkerPin(nodeId, marker));
}

/**
 * 根据点击位置就近聚焦输入槽，让胶囊前后输入体验接近普通文字流
 */
function focusMarkerInputByClick(nodeId, evt) {
    const wrapper = document.getElementById(`edit-prompt-wrapper-${nodeId}`);
    if (!wrapper) return;
    const inputs = Array.from(wrapper.querySelectorAll('.marker-inline-input'));
    if (inputs.length === 0) return;
    
    const clickX = typeof evt?.clientX === 'number' ? evt.clientX : null;
    let target = inputs[inputs.length - 1];
    if (clickX !== null) {
        let minDist = Infinity;
        inputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const dist = Math.abs(clickX - centerX);
            if (dist < minDist) {
                minDist = dist;
                target = input;
            }
        });
    }
    
    target.focus();
    const len = target.value.length;
    target.setSelectionRange(len, len);
}

/**
 * 获取指定节点的所有标记（供外部使用）
 */
function getNodeMarkers(nodeId) {
    return _markerState.markers[nodeId] || [];
}

// ==================== 导出 ====================
window.initCanvasNodeSystem = initCanvasNodeSystem;
window.refreshModelLists = refreshModelLists;
window.getImageModels = getImageModels;
window.getVideoModels = getVideoModels;
window.createImageNode = createImageNode;
window.createImageNodeAtPos = createImageNodeAtPos;
window.createAIDrawNodeAtPos = createAIDrawNodeAtPos;
window.createAIVideoNodeAtPos = createAIVideoNodeAtPos;
window.createAITryLookNodeAtPos = createAITryLookNodeAtPos;
window.createImageNodeAtPosWithConnection = createImageNodeAtPosWithConnection;
window.createAIDrawNodeAtPosWithConnection = createAIDrawNodeAtPosWithConnection;
window.createAIVideoNodeAtPosWithConnection = createAIVideoNodeAtPosWithConnection;
window.createAITryLookNodeAtPosWithConnection = createAITryLookNodeAtPosWithConnection;
window.selectCanvasNode = selectCanvasNode;
window.deselectAllNodes = deselectAllNodes;
window.closeAddNodeMenu = closeAddNodeMenu;
window.zoomCanvas = zoomCanvas;
window.resetCanvasView = resetCanvasView;
window.applyTransform = applyTransform;
window.actionUpscale = actionUpscale;
window.actionRemoveBg = actionRemoveBg;
window.actionCrop = actionCrop;
window.actionFullscreen = actionFullscreen;
window.actionDownload = actionDownload;
window.actionImg2Img = actionImg2Img;
window.reversePromptFromImage = reversePromptFromImage;
window.runAIDraw = runAIDraw;
window.runAIVideo = runAIVideo;
window.downloadVideo = downloadVideo;
window.fullscreenVideo = fullscreenVideo;
window.deleteNode = deleteNode;
window.deleteConnection = deleteConnection;
window.toggleVideoCount = toggleVideoCount;
window.toggleDrawCount = toggleDrawCount;
window.updateAIVideoRatio = updateAIVideoRatio;
window.updateAIVideoModel = updateAIVideoModel;
window.updateAIDrawModel = updateAIDrawModel;
window.handleVideoLoaded = handleVideoLoaded;
window.clearMultiSelection = clearMultiSelection;
window.autoLayoutSelected = autoLayoutSelected;
window.mergeSelectedLayers = mergeSelectedLayers;
window.CanvasNodeSystem = CanvasNodeSystem;

// 新增的AI绘图节点工具栏函数
window.aiDrawUpscale = aiDrawUpscale;
window.aiDrawRemoveBg = aiDrawRemoveBg;
window.aiDrawFullscreen = aiDrawFullscreen;
window.aiDrawDownload = aiDrawDownload;
window.aiDrawSendToCanvas = aiDrawSendToCanvas;
window.aiVideoSendToCanvas = aiVideoSendToCanvas;
window.toggleImageGallery = toggleImageGallery;
window.selectGalleryImage = selectGalleryImage;
window.closeVideoGenerating = closeVideoGenerating;

// 图片选择器函数
window.showImagePicker = showImagePicker;
window.hideImagePicker = hideImagePicker;
window.selectImageFromPicker = selectImageFromPicker;
window.showVideoPicker = showVideoPicker;
window.hideVideoPicker = hideVideoPicker;
window.selectVideoFromPicker = selectVideoFromPicker;

// AITryLook节点函数
window.addAITryLookNode = addAITryLookNode;
window.runAITryLook = runAITryLook;
window.handleTryLookComplete = handleTryLookComplete;
window.tryLookFullscreen = tryLookFullscreen;
window.tryLookDownload = tryLookDownload;
window.tryLookSendToCanvas = tryLookSendToCanvas;
window.openTryLookSettings = openTryLookSettings;
window.showTryLookImagePicker = showTryLookImagePicker;
window.updateTryLookField = updateTryLookField;
window.removeTryLookRef = removeTryLookRef;
window.selectWorkflowFromRh = selectWorkflowFromRh;
window.openRhFavorites = openRhFavorites;
window.openRhRecent = openRhRecent;

// 参考图拖拽排序函数
window.handleAIDrawRefPointerDown = handleAIDrawRefPointerDown;
window.handleAIDrawRefDragStart = handleAIDrawRefDragStart;
window.handleAIDrawRefDragOver = handleAIDrawRefDragOver;
window.handleAIDrawRefDrop = handleAIDrawRefDrop;
window.handleAIDrawRefDragEnd = handleAIDrawRefDragEnd;

// 提示词输入框和模板函数
window.togglePromptExpand = togglePromptExpand;
window.togglePromptTemplates = togglePromptTemplates;
window.closePromptTemplates = closePromptTemplates;
window.saveAsPromptTemplate = saveAsPromptTemplate;
window.confirmSaveTemplate = confirmSaveTemplate;
window.cancelSaveTemplate = cancelSaveTemplate;
window.searchPromptTemplates = searchPromptTemplates;
window.confirmTemplateSearch = confirmTemplateSearch;
window.usePromptTemplate = usePromptTemplate;
window.editPromptTemplate = editPromptTemplate;
window.editPromptTemplateName = editPromptTemplateName;
window.deletePromptTemplate = deletePromptTemplate;

// 视频节点提示词模板函数
window.toggleVideoPromptExpand = toggleVideoPromptExpand;
window.toggleVideoPromptTemplates = toggleVideoPromptTemplates;
window.closeVideoPromptTemplates = closeVideoPromptTemplates;
window.saveAsVideoPromptTemplate = saveAsVideoPromptTemplate;
window.confirmSaveVideoTemplate = confirmSaveVideoTemplate;
window.cancelSaveVideoTemplate = cancelSaveVideoTemplate;
window.searchVideoPromptTemplates = searchVideoPromptTemplates;
window.confirmVideoTemplateSearch = confirmVideoTemplateSearch;
window.useVideoPromptTemplate = useVideoPromptTemplate;
window.editVideoPromptTemplateName = editVideoPromptTemplateName;
window.deleteVideoPromptTemplate = deleteVideoPromptTemplate;

// 最近使用工作流相关函数
window.openRhRecent = openRhRecent;
window.closeRecentWorkflowsPopup = closeRecentWorkflowsPopup;
window.selectRecentWorkflow = selectRecentWorkflow;
window.saveToRecentWorkflows = saveToRecentWorkflows;

// 收藏工作流相关函数
window.openRhFavorites = openRhFavorites;
window.closeFavoriteWorkflowsPopup = closeFavoriteWorkflowsPopup;
window.selectFavoriteWorkflow = selectFavoriteWorkflow;
window.removeFavoriteWorkflow = removeFavoriteWorkflow;
window.saveToFavoriteWorkflows = saveToFavoriteWorkflows;

// 关闭所有弹窗
window.closeAllPopups = closeAllPopups;

// 局部迁移节点（新版）函数
window.createLocalTransferNodeAtPos = createLocalTransferNodeAtPos;
window.renderLocalTransferNode = renderLocalTransferNode;
window.addConnectionToLocalTransfer = addConnectionToLocalTransfer;
window.updateLTSourceDisplay = updateLTSourceDisplay;
window.renderLTRefImages = renderLTRefImages;
window.ltUpdatePrompt = ltUpdatePrompt;
window.ltOpenBrushPanel = ltOpenBrushPanel;
window.ltOpenBrushOnSourceNode = ltOpenBrushOnSourceNode;
window.ltCloseBrushPanel = ltCloseBrushPanel;
window.ltConfirmBrush = ltConfirmBrush;
window.ltCancelBrush = ltCancelBrush;
window.ltSetBrushSize = ltSetBrushSize;
window.ltSetBrushOpacity = ltSetBrushOpacity;
window.ltSetEraseMode = ltSetEraseMode;
window.ltUndoStroke = ltUndoStroke;
window.ltClearMask = ltClearMask;
window.ltRemoveRef = ltRemoveRef;
window.applyLocalTransferNode = applyLocalTransferNode;
window.ltSendToCanvas = ltSendToCanvas;
window.ltFullscreen = ltFullscreen;
window.ltDownload = ltDownload;
window.showLTImagePicker = showLTImagePicker;
// 新增裁切和涂抹分离函数
window.ltOpenCropOnSource = ltOpenCropOnSource;
window.ltCloseCrop = ltCloseCrop;
window.ltConfirmCrop = ltConfirmCrop;
window.ltOpenBrushOnSlot = ltOpenBrushOnSlot;
window.ltCloseBrushSlot = ltCloseBrushSlot;
window.ltConfirmBrushSlot = ltConfirmBrushSlot;

// 标记系统函数
window.toggleMarkerMode = toggleMarkerMode;
window.exitMarkerMode = exitMarkerMode;
window.removeMarker = removeMarker;
window.clearAllMarkers = clearAllMarkers;
window.getNodeMarkers = getNodeMarkers;
window.syncMarkersToPrompt = syncMarkersToPrompt;
window.toggleSubParts = toggleSubParts;
window.selectSubPart = selectSubPart;
window.renderMarkerCapsules = renderMarkerCapsules;
window.focusMarkerInputByClick = focusMarkerInputByClick;
window.showCapsulePopup = showCapsulePopup;
window.hideCapsulePopup = hideCapsulePopup;
window.selectCapsulePart = selectCapsulePart;

// 页面加载时自动初始化
document.addEventListener('DOMContentLoaded', () => {
    // 延迟一下确保DOM完全加载
    setTimeout(() => {
        initCanvasNodeSystem();
    }, 100);
});

// 监听来自iframe的消息
window.addEventListener('message', (event) => {
    try {
        const data = event.data;
        if (!data || !data.type) return;
        
        switch (data.type) {
            case 'SAVE_AS_NODE':
                if (data.payload) {
                    addAITryLookNode(data.payload);
                }
                break;
            case 'WORKFLOW_COMPLETE':
                // 工作流运行完成
                if (data.nodeId && data.results) {
                    var completeNode = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
                    if (completeNode && completeNode.type === NODE_TYPES.RH_APP && typeof handleRhAppComplete === 'function') {
                        handleRhAppComplete(data.nodeId, data.results);
                    } else {
                        handleTryLookComplete(data.nodeId, data.results);
                    }
                }
                break;
            case 'WORKFLOW_ERROR':
                // 工作流运行出错
                if (data.nodeId) {
                    const node = CanvasNodeSystem.nodes.find(n => n.id === data.nodeId);
                    if (node) {
                        node.isGenerating = false;
                        const overlay = document.getElementById(`generating-overlay-${data.nodeId}`) || document.getElementById(`generating-overlay-rh-${data.nodeId}`);
                        if (overlay) overlay.style.display = 'none';
                    }
                    showToast(data.error || '工作流运行失败', 'error');
                }
                break;
        }
    } catch (err) {
        console.error('[Canvas] Message handler error:', err);
    }
});

// 测试函数 - 在控制台运行 testSelectionUI() 来测试
window.testSelectionUI = function() {
    console.log('=== 测试选中UI ===');
    console.log('NODE_TYPES.IMAGE =', NODE_TYPES.IMAGE);
    console.log('当前节点数量:', CanvasNodeSystem.nodes.length);
    
    if (CanvasNodeSystem.nodes.length === 0) {
        console.log('没有节点，创建一个测试节点...');
        createImageNode('https://via.placeholder.com/200', 'test.png', 100, 100);
        return;
    }
    
    const firstNode = CanvasNodeSystem.nodes[0];
    console.log('第一个节点:', firstNode);
    console.log('节点类型:', firstNode.type);
    console.log('类型匹配:', firstNode.type === NODE_TYPES.IMAGE);
    
    selectCanvasNode(firstNode.id);
    
    // 检查UI元素是否存在
    setTimeout(() => {
        console.log('selection-ui:', document.getElementById('selection-ui'));
        console.log('sel-info:', document.getElementById('sel-info'));
        console.log('sel-toolbar:', document.getElementById('sel-toolbar'));
        console.log('sel-panel:', document.getElementById('sel-panel'));
    }, 100);
};

// ==================== 一键全局生成 ====================

// 运行全部可执行节点（AI绘图、AI视频、AITryLook）
function runAllExecutableNodes() {
    const executableNodes = CanvasNodeSystem.nodes.filter(n => 
        n.type === NODE_TYPES.AI_DRAW || 
        n.type === NODE_TYPES.AI_VIDEO || 
        n.type === NODE_TYPES.AI_TRYLOOK ||
        n.type === NODE_TYPES.RH_APP
    );
    
    if (executableNodes.length === 0) {
        if (typeof showToast === 'function') {
            showToast('画布上没有可执行的AI节点', 'warning');
        }
        return;
    }
    
    // 过滤掉正在生成中的节点
    const readyNodes = executableNodes.filter(n => !n.isGenerating);
    
    if (readyNodes.length === 0) {
        if (typeof showToast === 'function') {
            showToast('所有节点都在运行中', 'info');
        }
        return;
    }
    
    // 执行所有节点（无积分检查，直接运行）
    if (typeof showToast === 'function') {
        showToast(`🚀 开始并发运行 ${readyNodes.length} 个节点`, 'success');
    }
    
    // 同时启动所有节点
    readyNodes.forEach(node => {
        if (node.type === NODE_TYPES.AI_DRAW) {
            runAIDraw(node.id, true);
        } else if (node.type === NODE_TYPES.AI_VIDEO) {
            runAIVideo(node.id, true);
        } else if (node.type === NODE_TYPES.AI_TRYLOOK) {
            runAITryLook(node.id);
        } else if (node.type === NODE_TYPES.RH_APP && typeof runRhApp === 'function') {
            runRhApp(node.id);
        }
    });
}

// 暴露到全局
window.runAllExecutableNodes = runAllExecutableNodes;

// ==================== 节点分组功能 ====================

// 分组颜色配置：赤橙黄绿蓝靛紫白
const GROUP_COLORS = {
    red:    { name: '赤', border: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', panel: '#fef2f2', panelBorder: '#fecaca' },
    orange: { name: '橙', border: '#f97316', bg: 'rgba(249, 115, 22, 0.08)', panel: '#fff7ed', panelBorder: '#fed7aa' },
    yellow: { name: '黄', border: '#eab308', bg: 'rgba(234, 179, 8, 0.08)', panel: '#fefce8', panelBorder: '#fef08a' },
    green:  { name: '绿', border: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)', panel: '#f0fdf4', panelBorder: '#bbf7d0' },
    blue:   { name: '蓝', border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', panel: '#eff6ff', panelBorder: '#bfdbfe' },
    indigo: { name: '靛', border: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)', panel: '#eef2ff', panelBorder: '#c7d2fe' },
    purple: { name: '紫', border: '#a855f7', bg: 'rgba(168, 85, 247, 0.08)', panel: '#faf5ff', panelBorder: '#e9d5ff' },
    white:  { name: '白', border: '#1f2937', bg: 'rgba(31, 41, 55, 0.04)', panel: '#f9fafb', panelBorder: '#e5e7eb' }
};

const GROUP_COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'purple', 'white'];

// 创建节点分组
function createNodeGroup(nodes, colorKey = 'blue') {
    if (!nodes || nodes.length < 2) return null;
    
    const groupId = 'group_' + (++CanvasNodeSystem.groupIdCounter) + '_' + Date.now();
    const nodeIds = nodes.map(n => n.id);
    
    // 计算分组包围盒
    const bounds = calculateGroupBounds(nodes);
    
    const group = {
        id: groupId,
        name: `分组 ${CanvasNodeSystem.groupIdCounter}`,
        nodeIds: nodeIds,
        colorKey: colorKey,
        bounds: bounds
    };
    
    CanvasNodeSystem.groups.push(group);
    
    // 渲染分组UI
    renderGroupUI(group);
    
    if (typeof showToast === 'function') {
        showToast(`已创建分组，包含 ${nodeIds.length} 个节点`, 'success');
    }
    
    return groupId;
}

// 计算分组包围盒
function calculateGroupBounds(nodes) {
    if (!nodes || nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + (node.height || 200));
    });
    
    // 添加padding
    const padding = 20;
    return {
        x: minX - padding,
        y: minY - padding - 50, // 顶部留出控制面板空间
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2 + 50
    };
}

// 更新分组包围盒
function updateGroupBounds(groupId) {
    const group = CanvasNodeSystem.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const nodes = group.nodeIds
        .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
        .filter(Boolean);
    
    if (nodes.length === 0) {
        // 所有节点都被删除了，移除分组
        removeGroup(groupId);
        return;
    }
    
    group.bounds = calculateGroupBounds(nodes);
    
    // 更新UI
    const el = document.getElementById(`group-${groupId}`);
    if (el) {
        el.style.left = group.bounds.x + 'px';
        el.style.top = group.bounds.y + 'px';
        el.style.width = group.bounds.width + 'px';
        el.style.height = group.bounds.height + 'px';
    }
}

// 渲染分组UI
function renderGroupUI(group) {
    removeGroupUI(group.id);
    
    const color = GROUP_COLORS[group.colorKey] || GROUP_COLORS.blue;
    const nodesLayer = document.getElementById('nodes-layer');
    if (!nodesLayer) return;
    
    const el = document.createElement('div');
    el.id = `group-${group.id}`;
    el.className = 'node-group';
    el.style.cssText = `
        position: absolute;
        left: ${group.bounds.x}px;
        top: ${group.bounds.y}px;
        width: ${group.bounds.width}px;
        height: ${group.bounds.height}px;
        border: 2px dashed ${color.border};
        background: ${color.bg};
        border-radius: 12px;
        pointer-events: none;
        z-index: 1;
    `;
    
    // 控制面板
    const panel = document.createElement('div');
    panel.id = `group-panel-${group.id}`;
    panel.className = 'group-control-panel';
    panel.style.cssText = `
        position: absolute;
        left: 8px;
        top: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: ${color.panel};
        border: 1px solid ${color.panelBorder};
        border-radius: 8px;
        pointer-events: auto;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 100;
    `;
    
    panel.innerHTML = `
        <input type="text" value="${group.name}" 
            onchange="updateGroupName('${group.id}', this.value)"
            onclick="event.stopPropagation()"
            class="group-name-input"
            style="width: 80px; padding: 4px 8px; border: 1px solid ${color.panelBorder}; border-radius: 4px; font-size: 12px; background: white; outline: none;"
        />
        <div class="group-color-picker" style="display: flex; gap: 2px;">
            ${GROUP_COLOR_KEYS.map(key => {
                const c = GROUP_COLORS[key];
                const isActive = key === group.colorKey;
                return `<button onclick="event.stopPropagation();changeGroupColor('${group.id}', '${key}')" 
                    title="${c.name}" 
                    style="width: 16px; height: 16px; border-radius: 50%; background: ${c.border}; border: 2px solid ${isActive ? '#1f2937' : 'transparent'}; cursor: pointer; transition: transform 0.15s;"
                    onmouseover="this.style.transform='scale(1.2)'" 
                    onmouseout="this.style.transform='scale(1)'"
                ></button>`;
            }).join('')}
        </div>
        <button onclick="event.stopPropagation();runGroupNodes('${group.id}')" 
            title="启动分组内所有AI节点"
            style="padding: 4px 10px; background: linear-gradient(135deg, ${color.border}, ${color.border}dd); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            启动
        </button>
        <button onclick="event.stopPropagation();downloadGroupResults('${group.id}')" 
            title="下载分组内所有结果"
            style="padding: 4px 10px; background: white; color: ${color.border}; border: 1px solid ${color.border}; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            下载
        </button>
        <button onclick="event.stopPropagation();removeGroup('${group.id}')" 
            title="取消分组"
            style="padding: 4px 8px; background: white; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 11px; cursor: pointer;">
            ✕
        </button>
    `;
    
    el.appendChild(panel);
    
    // 插入到最底层（在节点之下）
    nodesLayer.insertBefore(el, nodesLayer.firstChild);
}

// 移除分组UI
function removeGroupUI(groupId) {
    const el = document.getElementById(`group-${groupId}`);
    if (el) el.remove();
}

// 更新分组名称
function updateGroupName(groupId, newName) {
    const group = CanvasNodeSystem.groups.find(g => g.id === groupId);
    if (group) {
        group.name = newName || `分组 ${CanvasNodeSystem.groupIdCounter}`;
    }
}

// 更改分组颜色
function changeGroupColor(groupId, colorKey) {
    const group = CanvasNodeSystem.groups.find(g => g.id === groupId);
    if (!group) return;
    
    group.colorKey = colorKey;
    renderGroupUI(group);
}

// 运行分组内的所有AI节点
function runGroupNodes(groupId) {
    const group = CanvasNodeSystem.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const executableNodes = group.nodeIds
        .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
        .filter(n => n && (n.type === NODE_TYPES.AI_DRAW || n.type === NODE_TYPES.AI_VIDEO || n.type === NODE_TYPES.AI_TRYLOOK || n.type === NODE_TYPES.RH_APP))
        .filter(n => !n.isGenerating);
    
    if (executableNodes.length === 0) {
        if (typeof showToast === 'function') {
            showToast('分组内没有可执行的AI节点', 'warning');
        }
        return;
    }
    
    if (typeof showToast === 'function') {
        showToast(`🚀 启动分组 "${group.name}"，运行 ${executableNodes.length} 个节点`, 'success');
    }
    
    executableNodes.forEach(node => {
        if (node.type === NODE_TYPES.AI_DRAW) {
            runAIDraw(node.id);
        } else if (node.type === NODE_TYPES.AI_VIDEO) {
            runAIVideo(node.id);
        } else if (node.type === NODE_TYPES.AI_TRYLOOK) {
            runAITryLook(node.id);
        } else if (node.type === NODE_TYPES.RH_APP && typeof runRhApp === 'function') {
            runRhApp(node.id);
        }
    });
}

// 下载分组内所有结果
function downloadGroupResults(groupId) {
    const group = CanvasNodeSystem.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const nodes = group.nodeIds
        .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
        .filter(Boolean);
    
    let downloadCount = 0;
    
    nodes.forEach((node, index) => {
        let url = null;
        let filename = `${group.name}_${index + 1}`;
        
        if (node.type === NODE_TYPES.IMAGE && node.url) {
            url = node.url;
            filename = node.filename || filename + '.png';
        } else if ((node.type === NODE_TYPES.AI_DRAW || node.type === NODE_TYPES.AI_TRYLOOK || node.type === NODE_TYPES.RH_APP) && node.resultUrl) {
            url = node.resultImages?.[node.currentImageIndex || 0] || node.resultUrl;
            filename = filename + '.png';
        } else if (node.type === NODE_TYPES.AI_VIDEO && node.resultUrl) {
            url = node.resultUrl;
            filename = filename + '.mp4';
        }
        
        if (url) {
            // 延迟下载避免浏览器阻止
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
            }, index * 300);
            downloadCount++;
        }
    });
    
    if (downloadCount > 0) {
        if (typeof showToast === 'function') {
            showToast(`开始下载 ${downloadCount} 个文件`, 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('分组内没有可下载的结果', 'warning');
        }
    }
}

// 移除分组
function removeGroup(groupId) {
    const index = CanvasNodeSystem.groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
        CanvasNodeSystem.groups.splice(index, 1);
    }
    removeGroupUI(groupId);
    
    if (typeof showToast === 'function') {
        showToast('已取消分组', 'info');
    }
}

// 重新渲染所有分组（用于画布缩放/平移后更新）
function renderAllGroups() {
    CanvasNodeSystem.groups.forEach(group => {
        // 更新包围盒
        const nodes = group.nodeIds
            .map(id => CanvasNodeSystem.nodes.find(n => n.id === id))
            .filter(Boolean);
        
        if (nodes.length > 0) {
            group.bounds = calculateGroupBounds(nodes);
            renderGroupUI(group);
        } else {
            removeGroup(group.id);
        }
    });
}

// 节点移动后更新相关分组
function updateGroupsForNode(nodeId) {
    CanvasNodeSystem.groups.forEach(group => {
        if (group.nodeIds.includes(nodeId)) {
            updateGroupBounds(group.id);
        }
    });
}

// 节点删除后更新分组
function removeNodeFromGroups(nodeId) {
    CanvasNodeSystem.groups.forEach(group => {
        const idx = group.nodeIds.indexOf(nodeId);
        if (idx !== -1) {
            group.nodeIds.splice(idx, 1);
            if (group.nodeIds.length < 2) {
                // 分组节点少于2个，自动移除分组
                removeGroup(group.id);
            } else {
                updateGroupBounds(group.id);
            }
        }
    });
}

// 暴露分组相关函数到全局
window.createNodeGroup = createNodeGroup;
window.updateGroupName = updateGroupName;
window.changeGroupColor = changeGroupColor;
window.runGroupNodes = runGroupNodes;
window.downloadGroupResults = downloadGroupResults;
window.removeGroup = removeGroup;
window.renderAllGroups = renderAllGroups;
window.updateGroupsForNode = updateGroupsForNode;
window.removeNodeFromGroups = removeNodeFromGroups;

// ==================== 性能设置：画布图片清晰度 ====================
let _hdPreviewEnabled = false;

// ==================== 自动保存配置 ====================
let _autoSaveEnabled = localStorage.getItem('aitrylook_autosave_enabled') === 'true';
let _autoSaveInterval = parseInt(localStorage.getItem('aitrylook_autosave_interval') || '5', 10);
let _autoSaveKeepCount = parseInt(localStorage.getItem('aitrylook_autosave_keep_count') || '1', 10);
let _autoSaveDir = localStorage.getItem('aitrylook_autosave_dir') || '';
let _autoSaveTimerId = null;
// 自动保存文件夹 handle（File System Access API）
if (!window._autoSaveDirHandle) window._autoSaveDirHandle = null;

// ==================== 媒体本地储存配置 ====================
let _mediaStorageEnabled = localStorage.getItem('aitrylook_media_storage_enabled') === 'true';
let _mediaStorageDir = localStorage.getItem('aitrylook_media_storage_dir') || '';
if (!window._mediaStorageDirHandle) window._mediaStorageDirHandle = null;

function isHDPreviewEnabled() {
    return _hdPreviewEnabled;
}

function togglePerformancePanel() {
    let panel = document.getElementById('perf-panel');
    if (panel) {
        if (panel._memTimer) clearInterval(panel._memTimer);
        panel.remove();
        document.removeEventListener('mousedown', _perfPanelOutsideClick);
        return;
    }

    // 计算按钮位置，从按钮下方弹出
    const btn = document.getElementById('perf-settings-btn');
    const rect = btn.getBoundingClientRect();

    panel = document.createElement('div');
    panel.id = 'perf-panel';
    panel.style.top = (rect.bottom + 8) + 'px';
    panel.style.left = rect.left + 'px';
    panel.style.minWidth = '300px';

    const memInfo = getMemoryInfo();

    // 生成时间选项
    let intervalOptions = '';
    for (let m = 1; m <= 60; m++) {
        intervalOptions += `<option value="${m}" ${m === _autoSaveInterval ? 'selected' : ''}>${m} 分钟</option>`;
    }
    // 生成保留份数选项
    let keepCountOptions = '';
    for (let k = 1; k <= 10; k++) {
        keepCountOptions += `<option value="${k}" ${k === _autoSaveKeepCount ? 'selected' : ''}>${k} 份</option>`;
    }

    panel.innerHTML = `
        <div class="perf-title">
            <svg width="14" height="14" fill="none" stroke="#3b82f6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            性能设置
        </div>
        <div class="perf-row">
            <span class="perf-label">高清预览</span>
            <div class="toggle-capsule ${_hdPreviewEnabled ? 'active' : ''}" id="hd-preview-toggle" onclick="toggleHDPreview()">
                <div class="toggle-knob"></div>
            </div>
        </div>
        <div class="perf-desc">开启后画布上的图片将使用原图分辨率显示，关闭时使用缩略图以提升性能。</div>

        <div class="perf-section">
            <div class="perf-section-label">💾 自动保存</div>
            <div class="perf-row">
                <span class="perf-label">自动保存画布</span>
                <div class="toggle-capsule ${_autoSaveEnabled ? 'active' : ''}" id="autosave-toggle" onclick="toggleAutoSave()">
                    <div class="toggle-knob"></div>
                </div>
            </div>
            <div class="perf-desc">开启后将定时自动保存画布上的所有内容（节点、连线、设置、提示词、图片）到本地文件夹。</div>
            <div class="perf-sub-row">
                <span class="perf-sub-label">保存间隔</span>
                <select class="perf-select" id="autosave-interval-select" onchange="updateAutoSaveInterval(Number(this.value))" ${!_autoSaveEnabled ? 'disabled' : ''}>
                    ${intervalOptions}
                </select>
            </div>
            <div class="perf-sub-row">
                <span class="perf-sub-label">保留份数</span>
                <select class="perf-select" id="autosave-keep-count-select" onchange="updateAutoSaveKeepCount(Number(this.value))" ${!_autoSaveEnabled ? 'disabled' : ''}>
                    ${keepCountOptions}
                </select>
            </div>
            <div class="perf-path-row">
                <input type="text" class="perf-path-input" id="autosave-dir-input" placeholder="选择自动保存文件夹" value="${escapeHtmlAttr(_autoSaveDir)}" readonly />
                <button class="perf-browse-btn" onclick="browseAutoSaveDir()" ${!_autoSaveEnabled ? 'disabled' : ''}>选择</button>
            </div>
        </div>

        <div class="perf-section">
            <div class="perf-section-label">📂 媒体本地储存</div>
            <div class="perf-row">
                <span class="perf-label">生成内容保存到本地</span>
                <div class="toggle-capsule ${_mediaStorageEnabled ? 'active' : ''}" id="media-storage-toggle" onclick="toggleMediaStorage()">
                    <div class="toggle-knob"></div>
                </div>
            </div>
            <div class="perf-desc">开启后所有 AI 生成的图片和视频将直接保存到本地文件夹，释放浏览器缓存。</div>
            <div class="perf-path-row">
                <input type="text" class="perf-path-input" id="media-storage-dir-input" placeholder="选择媒体储存文件夹" value="${escapeHtmlAttr(_mediaStorageDir)}" readonly />
                <button class="perf-browse-btn" onclick="browseMediaStorageDir()" ${!_mediaStorageEnabled ? 'disabled' : ''}>选择</button>
            </div>
        </div>

        <div class="perf-section">
            <div class="perf-section-label">💾 数据缓存目录</div>
            <div class="perf-path-row">
                <input type="text" class="perf-path-input" id="perf-cache-dir-input" placeholder="未设置，仅使用浏览器缓存" value="${escapeHtmlAttr(_storageConfig.cacheDir)}" readonly />
                <button class="perf-browse-btn" onclick="browsePerfCacheDir()">选择</button>
            </div>
            <div class="perf-desc">选择本地目录后，AI 生成的素材将按类型分类缓存。浏览器清理缓存或刷新后可自动恢复。</div>
        </div>

        <div class="perf-section">
            <div class="perf-section-label">🧠 内存管理器</div>
            <div class="memory-bar-bg">
                <div class="memory-bar-fill" id="memory-bar-fill" style="width:${memInfo.percent}%;background:${memInfo.color};"></div>
            </div>
            <div class="memory-stats">
                <span>已用 ${memInfo.used}</span>
                <span>总计 ${memInfo.total}</span>
            </div>
            <div class="perf-desc">显示当前页面的内存占用情况。节点和图片越多，内存占用越高。</div>
        </div>
    `;
    document.body.appendChild(panel);

    // 定时刷新内存信息
    panel._memTimer = setInterval(() => {
        if (!document.getElementById('perf-panel')) {
            clearInterval(panel._memTimer);
            return;
        }
        refreshMemoryBar();
    }, 2000);

    setTimeout(() => {
        document.addEventListener('mousedown', _perfPanelOutsideClick);
    }, 0);
}

function _perfPanelOutsideClick(e) {
    const panel = document.getElementById('perf-panel');
    const btn = document.getElementById('perf-settings-btn');
    if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
        if (panel._memTimer) clearInterval(panel._memTimer);
        panel.remove();
        document.removeEventListener('mousedown', _perfPanelOutsideClick);
    }
}

function toggleHDPreview() {
    _hdPreviewEnabled = !_hdPreviewEnabled;
    const toggle = document.getElementById('hd-preview-toggle');
    if (toggle) {
        toggle.classList.toggle('active', _hdPreviewEnabled);
    }
    applyHDPreviewToAllNodes();
}

function applyHDPreviewToAllNodes() {
    if (!CanvasNodeSystem || !CanvasNodeSystem.nodes) return;
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === NODE_TYPES.IMAGE) {
            const el = document.getElementById(`node-${node.id}`);
            if (!el) return;
            const imgEl = el.querySelector('.node-body > img');
            if (!imgEl) return;
            if (_hdPreviewEnabled) {
                // 使用原图
                imgEl.src = node.url;
            } else {
                // 使用缩略图（如果有）
                imgEl.src = node.previewUrl || node.url;
            }
        }
        // AI绘图节点的预览图
        if (node.type === NODE_TYPES.AI_DRAW) {
            const previewEl = document.getElementById(`preview-${node.id}`);
            if (!previewEl) return;
            const imgEl = previewEl.querySelector('img');
            if (!imgEl || !node.generatedImages || node.generatedImages.length === 0) return;
            const currentIdx = node.currentImageIndex || 0;
            const currentUrl = node.generatedImages[currentIdx];
            if (!currentUrl) return;
            if (_hdPreviewEnabled) {
                imgEl.src = currentUrl;
            } else {
                imgEl.src = node.generatedPreviews && node.generatedPreviews[currentIdx] ? node.generatedPreviews[currentIdx] : currentUrl;
            }
        }
        // AI视频节点的首帧/封面图
        if (node.type === NODE_TYPES.AI_VIDEO) {
            const previewEl = document.getElementById(`vpreview-${node.id}`);
            if (!previewEl) return;
            const imgEl = previewEl.querySelector('img');
            if (!imgEl) return;
            if (node.coverUrl && node.coverPreviewUrl) {
                imgEl.src = _hdPreviewEnabled ? node.coverUrl : node.coverPreviewUrl;
            }
        }
    });
}

// 暴露到全局
window.togglePerformancePanel = togglePerformancePanel;
window.toggleHDPreview = toggleHDPreview;
window.isHDPreviewEnabled = isHDPreviewEnabled;

// ==================== 自动保存功能 ====================

function toggleAutoSave() {
    _autoSaveEnabled = !_autoSaveEnabled;
    localStorage.setItem('aitrylook_autosave_enabled', _autoSaveEnabled ? 'true' : 'false');
    const toggle = document.getElementById('autosave-toggle');
    if (toggle) toggle.classList.toggle('active', _autoSaveEnabled);
    // 更新控件禁用状态
    const intervalSel = document.getElementById('autosave-interval-select');
    const keepCountSel = document.getElementById('autosave-keep-count-select');
    const browseBtn = document.querySelector('#perf-panel .perf-section:nth-child(3) .perf-browse-btn');
    if (intervalSel) intervalSel.disabled = !_autoSaveEnabled;
    if (keepCountSel) keepCountSel.disabled = !_autoSaveEnabled;
    if (browseBtn) browseBtn.disabled = !_autoSaveEnabled;

    if (_autoSaveEnabled) {
        _startAutoSaveTimer();
    } else {
        _stopAutoSaveTimer();
    }
}

function updateAutoSaveInterval(minutes) {
    _autoSaveInterval = Math.max(1, Math.min(60, minutes));
    localStorage.setItem('aitrylook_autosave_interval', String(_autoSaveInterval));
    // 重启定时器
    if (_autoSaveEnabled) {
        _stopAutoSaveTimer();
        _startAutoSaveTimer();
    }
}

function updateAutoSaveKeepCount(count) {
    _autoSaveKeepCount = Math.max(1, Math.min(10, count));
    localStorage.setItem('aitrylook_autosave_keep_count', String(_autoSaveKeepCount));
}

async function browseAutoSaveDir() {
    try {
        let dirPath = null;
        // 优先使用 Tauri 原生对话框
        if (_isTauri()) {
            try {
                dirPath = await _tauriInvoke('pick_directory');
            } catch (e) {
                if (e === '用户取消选择' || (e && e.message && e.message.includes('取消'))) return;
                console.warn('[AutoSave] Tauri pick_directory 失败:', e);
            }
        }
        // 降级：浏览器 File System Access API
        if (!dirPath && window.showDirectoryPicker) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                window._autoSaveDirHandle = dirHandle;
                _autoSaveDir = dirHandle.name;
                localStorage.setItem('aitrylook_autosave_dir', _autoSaveDir);
                const input = document.getElementById('autosave-dir-input');
                if (input) input.value = _autoSaveDir;
                if (typeof showToast === 'function') showToast('已设置自动保存文件夹: ' + _autoSaveDir);
                if (_autoSaveEnabled) { _stopAutoSaveTimer(); _startAutoSaveTimer(); }
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.warn('[AutoSave] showDirectoryPicker 失败:', e);
            }
        }
        if (dirPath) {
            _autoSaveDir = dirPath;
            localStorage.setItem('aitrylook_autosave_dir', dirPath);
            window._autoSaveDirHandle = null; // Tauri 模式不需要 handle
            const input = document.getElementById('autosave-dir-input');
            if (input) input.value = dirPath;
            if (typeof showToast === 'function') showToast('已设置自动保存文件夹: ' + dirPath);
            if (_autoSaveEnabled) { _stopAutoSaveTimer(); _startAutoSaveTimer(); }
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[AutoSave] 选择文件夹失败:', e);
    }
}

function _startAutoSaveTimer() {
    _stopAutoSaveTimer();
    if (!_autoSaveEnabled) return;
    const ms = _autoSaveInterval * 60 * 1000;
    _autoSaveTimerId = setInterval(() => {
        _performAutoSave();
    }, ms);
    console.log('[AutoSave] 定时器已启动，间隔', _autoSaveInterval, '分钟');
}

function _stopAutoSaveTimer() {
    if (_autoSaveTimerId) {
        clearInterval(_autoSaveTimerId);
        _autoSaveTimerId = null;
        console.log('[AutoSave] 定时器已停止');
    }
}

async function _performAutoSave() {
    if (!_autoSaveEnabled) return;
    if (typeof CanvasNodeSystem === 'undefined' || !CanvasNodeSystem.nodes || CanvasNodeSystem.nodes.length === 0) return;

    try {
        const snapshot = await _getCanvasSnapshot();
        if (!snapshot) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `autosave-${timestamp}.json`;
        const jsonStr = JSON.stringify(snapshot, null, 2);

        // 方式1：Tauri 环境 + 已设置完整路径
        if (_isTauri() && _autoSaveDir && _autoSaveDir.length > 1) {
            try {
                const sep = _autoSaveDir.includes('\\') ? '\\' : '/';
                const filePath = _autoSaveDir + sep + filename;
                await _tauriInvoke('write_file_text', { path: filePath, content: jsonStr });
                console.log('[AutoSave] Tauri 已保存:', filePath);
                if (typeof showToast === 'function') showToast('自动保存成功', 'info');
                await _cleanupOldAutoSavesTauri(_autoSaveDir);
                return;
            } catch (e) {
                console.warn('[AutoSave] Tauri 写入失败:', e);
            }
        }

        // 方式2：浏览器 File System Access API（dirHandle）
        if (window._autoSaveDirHandle) {
            try {
                const fileHandle = await window._autoSaveDirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                console.log('[AutoSave] 已保存到文件夹:', filename);
                if (typeof showToast === 'function') showToast('自动保存成功', 'info');
                await _cleanupOldAutoSaves(window._autoSaveDirHandle);
                return;
            } catch (e) {
                console.warn('[AutoSave] 文件夹写入失败，降级为项目保存:', e);
            }
        }

        // 方式3：降级为项目保存系统
        const now = Date.now();
        const projId = '_autosave_' + now;
        const projName = '自动保存 ' + new Date().toLocaleString('zh-CN');
        await _saveProject(projId, projName, jsonStr, now, now);
        console.log('[AutoSave] 已保存为项目:', projName);
        if (typeof showToast === 'function') showToast('自动保存成功', 'info');

    } catch (e) {
        console.error('[AutoSave] 自动保存失败:', e);
    }
}

async function _cleanupOldAutoSavesTauri(dirPath) {
    try {
        const files = await _tauriInvoke('list_files_in_dir', { dir: dirPath, prefix: 'autosave-', suffix: '.json' });
        if (!files || files.length <= _autoSaveKeepCount) return;
        const toDelete = files.slice(0, files.length - _autoSaveKeepCount);
        const sep = dirPath.includes('\\') ? '\\' : '/';
        for (const name of toDelete) {
            await _tauriInvoke('delete_file', { path: dirPath + sep + name });
        }
    } catch (e) {
        console.warn('[AutoSave] Tauri 清理旧文件失败:', e);
    }
}

async function _cleanupOldAutoSaves(dirHandle) {
    try {
        const autoSaveFiles = [];
        for await (const [name, handle] of dirHandle) {
            if (handle.kind === 'file' && name.startsWith('autosave-') && name.endsWith('.json')) {
                autoSaveFiles.push(name);
            }
        }
        autoSaveFiles.sort();
        // 按用户设置保留份数
        const toDelete = autoSaveFiles.slice(0, Math.max(0, autoSaveFiles.length - _autoSaveKeepCount));
        for (const name of toDelete) {
            await dirHandle.removeEntry(name);
        }
    } catch (e) {
        console.warn('[AutoSave] 清理旧文件失败:', e);
    }
}

// 页面加载时恢复自动保存定时器
if (_autoSaveEnabled) {
    // 延迟启动，等画布初始化完成
    setTimeout(() => _startAutoSaveTimer(), 3000);
}

window.toggleAutoSave = toggleAutoSave;
window.updateAutoSaveInterval = updateAutoSaveInterval;
window.updateAutoSaveKeepCount = updateAutoSaveKeepCount;
window.browseAutoSaveDir = browseAutoSaveDir;

// ==================== 媒体本地储存功能 ====================

function toggleMediaStorage() {
    _mediaStorageEnabled = !_mediaStorageEnabled;
    localStorage.setItem('aitrylook_media_storage_enabled', _mediaStorageEnabled ? 'true' : 'false');
    const toggle = document.getElementById('media-storage-toggle');
    if (toggle) toggle.classList.toggle('active', _mediaStorageEnabled);
    const browseBtn = document.querySelector('#perf-panel .perf-section:last-child .perf-browse-btn');
    if (browseBtn) browseBtn.disabled = !_mediaStorageEnabled;
}

async function browseMediaStorageDir() {
    try {
        let dirPath = null;
        if (_isTauri()) {
            try {
                dirPath = await _tauriInvoke('pick_directory');
            } catch (e) {
                if (e === '用户取消选择' || (e && e.message && e.message.includes('取消'))) return;
                console.warn('[MediaStorage] Tauri pick_directory 失败:', e);
            }
        }
        if (!dirPath && window.showDirectoryPicker) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                window._mediaStorageDirHandle = dirHandle;
                _mediaStorageDir = dirHandle.name;
                localStorage.setItem('aitrylook_media_storage_dir', _mediaStorageDir);
                const input = document.getElementById('media-storage-dir-input');
                if (input) input.value = _mediaStorageDir;
                if (typeof showToast === 'function') showToast('已设置媒体储存文件夹: ' + _mediaStorageDir);
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        if (dirPath) {
            _mediaStorageDir = dirPath;
            localStorage.setItem('aitrylook_media_storage_dir', dirPath);
            window._mediaStorageDirHandle = null;
            const input = document.getElementById('media-storage-dir-input');
            if (input) input.value = dirPath;
            if (typeof showToast === 'function') showToast('已设置媒体储存文件夹: ' + dirPath);
        }
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[MediaStorage] 选择文件夹失败:', e);
    }
}

/**
 * 将生成的媒体文件保存到本地文件夹
 * @param {string} url - 图片/视频的 URL 或 data URL
 * @param {string} type - 'image' 或 'video'
 * @param {string} [customName] - 自定义文件名
 * @returns {Promise<string|null>} 保存后的本地路径或 null
 */
async function saveMediaToLocal(url, type, customName) {
    if (!_mediaStorageEnabled) return null;
    // 需要有路径（Tauri）或 dirHandle（浏览器）
    const hasTauriPath = _isTauri() && _mediaStorageDir && _mediaStorageDir.length > 1;
    const hasBrowserHandle = !!window._mediaStorageDirHandle;
    if (!hasTauriPath && !hasBrowserHandle) return null;

    try {
        const timestamp = Date.now();
        const ext = type === 'video' ? '.mp4' : '.png';
        const filename = customName || `${type}-${timestamp}${ext}`;
        const subDir = type === 'video' ? 'videos' : 'images';

        // 获取文件内容
        let blob;
        try {
            const resp = await fetch(url);
            blob = await resp.blob();
        } catch (e) {
            console.warn('[MediaStorage] fetch 失败:', e);
            return null;
        }

        // Tauri 模式：写入完整路径
        if (hasTauriPath) {
            const sep = _mediaStorageDir.includes('\\') ? '\\' : '/';
            const dirPath = _mediaStorageDir + sep + subDir;
            const filePath = dirPath + sep + filename;
            const arrayBuf = await blob.arrayBuffer();
            const uint8 = Array.from(new Uint8Array(arrayBuf));
            await _tauriInvoke('write_file_binary', { path: filePath, content: uint8 });
            console.log('[MediaStorage] Tauri 已保存:', filePath);
            return filePath;
        }

        // 浏览器 File System Access API
        if (hasBrowserHandle) {
            const dirHandle = window._mediaStorageDirHandle;
            let subDirHandle;
            try {
                subDirHandle = await dirHandle.getDirectoryHandle(subDir, { create: true });
            } catch {
                subDirHandle = dirHandle;
            }
            const fileHandle = await subDirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log('[MediaStorage] 已保存:', subDir + '/' + filename);
            return filename;
        }
    } catch (e) {
        console.warn('[MediaStorage] 保存失败:', e);
        return null;
    }
    return null;
}

function isMediaStorageEnabled() {
    if (!_mediaStorageEnabled) return false;
    if (_isTauri() && _mediaStorageDir && _mediaStorageDir.length > 1) return true;
    return !!window._mediaStorageDirHandle;
}

window.toggleMediaStorage = toggleMediaStorage;
window.browseMediaStorageDir = browseMediaStorageDir;
window.saveMediaToLocal = saveMediaToLocal;
window.isMediaStorageEnabled = isMediaStorageEnabled;

// ==================== 数据缓存目录（从储存面板移入性能面板） ====================
async function browsePerfCacheDir() {
    try {
        let dirPath = null;
        if (_isTauri()) {
            try {
                dirPath = await _tauriInvoke('pick_directory');
            } catch (e) {
                if (e === '用户取消选择' || (e && e.message && e.message.includes('取消'))) return;
            }
        }
        if (!dirPath && window.showDirectoryPicker) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                if (!window._storageDirHandles) window._storageDirHandles = {};
                window._storageDirHandles['cacheDir'] = dirHandle;
                dirPath = dirHandle.name;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        if (dirPath) {
            _storageConfig.cacheDir = dirPath;
            localStorage.setItem('aitrylook_cache_dir', dirPath);
            const input = document.getElementById('perf-cache-dir-input');
            if (input) input.value = dirPath;
            if (typeof showToast === 'function') showToast('已设置数据缓存目录: ' + dirPath);
        }
    } catch (e) {
        console.warn('[CacheDir] 选择文件夹失败:', e);
    }
}
window.browsePerfCacheDir = browsePerfCacheDir;

// ==================== 储存设置面板 ====================
const _storageConfig = {
    downloadDir: localStorage.getItem('aitrylook_download_dir') || '',
    cacheDir: localStorage.getItem('aitrylook_cache_dir') || '',
    projectDir: localStorage.getItem('aitrylook_project_dir') || ''
};

function toggleStoragePanel() {
    let panel = document.getElementById('storage-panel');
    if (panel) {
        panel.remove();
        document.removeEventListener('mousedown', _storagePanelOutsideClick);
        return;
    }

    const btn = document.getElementById('storage-settings-btn');
    const rect = btn.getBoundingClientRect();

    panel = document.createElement('div');
    panel.id = 'storage-panel';
    panel.style.top = (rect.bottom + 8) + 'px';
    panel.style.left = (rect.left + rect.width / 2 - 170) + 'px';

    const memInfo = getMemoryInfo();

    panel.innerHTML = `
        <div class="storage-title">
            <svg width="14" height="14" fill="none" stroke="#3b82f6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
            储存设置
        </div>

        <div class="storage-section">
            <div class="storage-section-label">� 项目储存地址</div>
            <div class="storage-path-row">
                <input type="text" class="storage-path-input" id="storage-project-dir" placeholder="未设置，使用浏览器内置存储" value="${escapeHtmlAttr(_storageConfig.projectDir)}" onchange="updateStorageConfig('projectDir', this.value)" />
                <button class="storage-browse-btn" onclick="browseStorageDir('projectDir')">选择</button>
            </div>
            <div class="storage-section-desc">设置保存项目的本地文件夹。通过左上角项目标记可随时打开已保存的项目。</div>
        </div>

        <div class="storage-section">
            <div class="storage-section-label">📁 下载目录</div>
            <div class="storage-path-row">
                <input type="text" class="storage-path-input" id="storage-download-dir" placeholder="未设置，使用默认下载目录" value="${escapeHtmlAttr(_storageConfig.downloadDir)}" onchange="updateStorageConfig('downloadDir', this.value)" />
                <button class="storage-browse-btn" onclick="browseStorageDir('downloadDir')">选择</button>
            </div>
            <div class="storage-section-desc">设置生成的图片/视频保存到哪个本地文件夹。</div>
        </div>

        <div class="storage-section">
            <div class="storage-section-label">💾 数据缓存目录</div>
            <div class="storage-path-row">
                <input type="text" class="storage-path-input" id="storage-cache-dir" placeholder="未设置，仅使用浏览器缓存" value="${escapeHtmlAttr(_storageConfig.cacheDir)}" onchange="updateStorageConfig('cacheDir', this.value)" />
                <button class="storage-browse-btn" onclick="browseStorageDir('cacheDir')">选择</button>
            </div>
            <div class="storage-section-desc">选择本地目录后，AI 生成的素材将按类型（图片/视频）分类缓存。当浏览器清理 IndexedDB 或页面刷新导致 Blob URL 失效时，可从本地缓存自动恢复。导出项目时也会优先从本地缓存读取，提升导出速度。</div>
        </div>

        <div class="storage-section">
            <div class="storage-section-label">🧠 内存管理器</div>
            <div class="memory-bar-bg">
                <div class="memory-bar-fill" id="memory-bar-fill" style="width:${memInfo.percent}%;background:${memInfo.color};"></div>
            </div>
            <div class="memory-stats">
                <span>已用 ${memInfo.used}</span>
                <span>总计 ${memInfo.total}</span>
            </div>
            <div class="storage-section-desc">显示当前页面的内存占用情况，帮助你了解画布运行状态。节点和图片越多，内存占用越高。</div>
        </div>
    `;

    document.body.appendChild(panel);

    setTimeout(() => {
        document.addEventListener('mousedown', _storagePanelOutsideClick);
    }, 0);

    // 定时刷新内存信息
    panel._memTimer = setInterval(() => {
        if (!document.getElementById('storage-panel')) {
            clearInterval(panel._memTimer);
            return;
        }
        refreshMemoryBar();
    }, 2000);
}

function _storagePanelOutsideClick(e) {
    const panel = document.getElementById('storage-panel');
    const btn = document.getElementById('storage-settings-btn');
    if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
        if (panel._memTimer) clearInterval(panel._memTimer);
        panel.remove();
        document.removeEventListener('mousedown', _storagePanelOutsideClick);
    }
}

function escapeHtmlAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateStorageConfig(key, value) {
    _storageConfig[key] = value;
    const keyMap = { downloadDir: 'download_dir', cacheDir: 'cache_dir', projectDir: 'project_dir' };
    localStorage.setItem('aitrylook_' + (keyMap[key] || key), value);
}

async function browseStorageDir(configKey) {
    const inputIdMap = {
        downloadDir: 'storage-download-dir',
        cacheDir: 'storage-cache-dir',
        projectDir: 'storage-project-dir'
    };
    try {
        let dirPath = null;
        if (_isTauri()) {
            try {
                dirPath = await _tauriInvoke('pick_directory');
            } catch (e) {
                if (e === '用户取消选择' || (e && e.message && e.message.includes('取消'))) return;
            }
        }
        if (!dirPath && window.showDirectoryPicker) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                if (!window._storageDirHandles) window._storageDirHandles = {};
                window._storageDirHandles[configKey] = dirHandle;
                dirPath = dirHandle.name;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        if (dirPath) {
            const input = document.getElementById(inputIdMap[configKey]);
            if (input) input.value = dirPath;
            updateStorageConfig(configKey, dirPath);
        }
    } catch (e) {
        console.warn('[Storage] 选择文件夹失败:', e);
    }
}

function getMemoryInfo() {
    const perf = performance;
    if (perf && perf.memory) {
        const used = perf.memory.usedJSHeapSize;
        const total = perf.memory.jsHeapSizeLimit;
        const percent = Math.round((used / total) * 100);
        let color = '#22c55e'; // 绿
        if (percent > 70) color = '#f59e0b'; // 黄
        if (percent > 90) color = '#ef4444'; // 红
        return {
            used: formatBytes(used),
            total: formatBytes(total),
            percent,
            color
        };
    }
    // 不支持 performance.memory
    return { used: '--', total: '--', percent: 0, color: '#94a3b8' };
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function refreshMemoryBar() {
    const info = getMemoryInfo();
    const fill = document.getElementById('memory-bar-fill');
    if (fill) {
        fill.style.width = info.percent + '%';
        fill.style.background = info.color;
    }
    const stats = document.querySelector('#perf-panel .memory-stats');
    if (stats) {
        stats.innerHTML = `<span>已用 ${info.used}</span><span>总计 ${info.total}</span>`;
    }
}

window.toggleStoragePanel = toggleStoragePanel;
window.updateStorageConfig = updateStorageConfig;
window.browseStorageDir = browseStorageDir;

// ==================== 项目管理系统（Tauri 文件存储 + localStorage 降级） ====================
let _currentProjectId = null;
let _currentProjectName = '未命名项目';

// 检测是否在 Tauri 环境
function _isTauri() {
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

async function _tauriInvoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        return window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        return window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    throw new Error('Tauri invoke 不可用');
}

// --- blob URL 转 base64 ---
function _blobUrlToDataUrl(blobUrl) {
    return new Promise((resolve) => {
        if (!blobUrl || !blobUrl.startsWith('blob:')) return resolve(blobUrl);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const ctx = c.getContext('2d', { colorSpace: 'srgb' }) || c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            } catch (e) {
                console.warn('[Project] blob转base64失败:', e);
                resolve(blobUrl);
            }
        };
        img.onerror = () => resolve(blobUrl);
        img.src = blobUrl;
    });
}

async function _persistNodeUrls(nodes) {
    for (const node of nodes) {
        if (node.url && node.url.startsWith('blob:')) {
            node.url = await _blobUrlToDataUrl(node.url);
        }
        // previewUrl 不保存，加载时重新生成，节省空间
        node.previewUrl = null;
        if (node.resultUrl && node.resultUrl.startsWith('blob:')) {
            node.resultUrl = await _blobUrlToDataUrl(node.resultUrl);
        }
        if (node.resultImages) {
            for (let i = 0; i < node.resultImages.length; i++) {
                if (node.resultImages[i] && node.resultImages[i].startsWith('blob:')) {
                    node.resultImages[i] = await _blobUrlToDataUrl(node.resultImages[i]);
                }
            }
        }
        if (node.generatedImages) {
            for (let i = 0; i < node.generatedImages.length; i++) {
                if (node.generatedImages[i] && node.generatedImages[i].startsWith('blob:')) {
                    node.generatedImages[i] = await _blobUrlToDataUrl(node.generatedImages[i]);
                }
            }
        }
        // generatedPreviews 不保存
        if (node.generatedPreviews) node.generatedPreviews = null;
        if (node.inputImages) {
            for (const img of node.inputImages) {
                if (img.url && img.url.startsWith('blob:')) {
                    img.url = await _blobUrlToDataUrl(img.url);
                }
                img.previewUrl = null;
            }
        }
        if (node.sourceImage && node.sourceImage.url && node.sourceImage.url.startsWith('blob:')) {
            node.sourceImage.url = await _blobUrlToDataUrl(node.sourceImage.url);
            if (node.sourceImage.previewUrl) node.sourceImage.previewUrl = null;
        }
        if (node.cropPreviewUrl && node.cropPreviewUrl.startsWith('blob:')) {
            node.cropPreviewUrl = await _blobUrlToDataUrl(node.cropPreviewUrl);
        }
    }
    return nodes;
}

// --- localStorage 降级（非 Tauri 环境） ---
const _PROJ_LIST_KEY = 'aitrylook_proj_list';
const _PROJ_DATA_PREFIX = 'aitrylook_proj_data_';

function _lsLoadProjectList() {
    try { return JSON.parse(localStorage.getItem(_PROJ_LIST_KEY) || '[]'); } catch { return []; }
}
function _lsSaveProjectList(list) {
    localStorage.setItem(_PROJ_LIST_KEY, JSON.stringify(list));
}
function _lsSaveProjectData(id, dataStr) {
    try { localStorage.setItem(_PROJ_DATA_PREFIX + id, dataStr); }
    catch (e) { throw new Error('localStorage 空间不足: ' + e.message); }
}
function _lsLoadProjectData(id) {
    try { const r = localStorage.getItem(_PROJ_DATA_PREFIX + id); return r ? JSON.parse(r) : null; } catch { return null; }
}
function _lsDeleteProject(id) {
    localStorage.removeItem(_PROJ_DATA_PREFIX + id);
}

// --- 统一接口 ---
async function _loadSavedProjects() {
    if (_isTauri()) {
        try { return await _tauriInvoke('list_projects'); } catch (e) { console.warn('[Project] Tauri list失败:', e); }
    }
    return _lsLoadProjectList();
}

async function _saveProject(id, name, dataStr, createdAt, updatedAt) {
    if (_isTauri()) {
        try {
            await _tauriInvoke('save_project', { id, name, data: dataStr, createdAt, updatedAt });
            return;
        } catch (e) { console.warn('[Project] Tauri save失败，降级localStorage:', e); }
    }
    // 降级
    const list = _lsLoadProjectList();
    const existing = list.find(p => p.id === id);
    if (existing) { existing.name = name; existing.updatedAt = updatedAt; }
    else { list.unshift({ id, name, createdAt, updatedAt }); }
    _lsSaveProjectData(id, dataStr);
    _lsSaveProjectList(list);
}

async function _loadProjectData(id) {
    if (_isTauri()) {
        try {
            const str = await _tauriInvoke('load_project', { id });
            return JSON.parse(str);
        } catch (e) { console.warn('[Project] Tauri load失败:', e); }
    }
    return _lsLoadProjectData(id);
}

async function _deleteProjectById(id) {
    if (_isTauri()) {
        try { await _tauriInvoke('delete_project', { id }); return; } catch (e) { console.warn('[Project] Tauri delete失败:', e); }
    }
    _lsDeleteProject(id);
    const list = _lsLoadProjectList();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) list.splice(idx, 1);
    _lsSaveProjectList(list);
}

async function _getProjectsPath() {
    if (_isTauri()) {
        try { return await _tauriInvoke('get_projects_path'); } catch { return ''; }
    }
    return '浏览器本地存储';
}

async function _getCanvasSnapshot() {
    if (typeof CanvasNodeSystem === 'undefined') return null;
    // 同步当前输入框的值到节点数据
    CanvasNodeSystem.nodes.forEach(node => {
        if (node.type === 'ai_draw') {
            const p = document.getElementById(`prompt-${node.id}`);
            const r = document.getElementById(`ratio-${node.id}`);
            const res = document.getElementById(`resolution-${node.id}`);
            if (p) node.prompt = p.value || '';
            if (r) node.aspectRatio = r.value;
            if (res) node.resolution = res.value;
        }
        if (node.type === 'ai_video') {
            const p = document.getElementById(`vprompt-${node.id}`);
            const r = document.getElementById(`vratio-${node.id}`);
            const m = document.getElementById(`vmodel-${node.id}`);
            const d = document.getElementById(`vduration-${node.id}`);
            if (p) node.prompt = p.value || '';
            if (r) node.aspectRatio = r.value;
            if (m) node.model = m.value;
            if (d) node.duration = Number(d.value);
        }
    });
    const snapshot = {
        nodes: JSON.parse(JSON.stringify(CanvasNodeSystem.nodes)),
        connections: JSON.parse(JSON.stringify(CanvasNodeSystem.connections)),
        groups: JSON.parse(JSON.stringify(CanvasNodeSystem.groups || [])),
        zoom: CanvasNodeSystem.zoom,
        offset: { ...CanvasNodeSystem.offset }
    };
    // 把所有 blob URL 转成 base64
    await _persistNodeUrls(snapshot.nodes);
    return snapshot;
}

function setProjectName(name) {
    _currentProjectName = name || '未命名项目';
    const label = document.getElementById('project-name-label');
    if (label) label.textContent = _currentProjectName;
}

async function toggleProjectPanel() {
    let panel = document.getElementById('project-panel');
    if (panel) {
        panel.remove();
        document.removeEventListener('mousedown', _projectPanelOutsideClick);
        return;
    }

    const projects = await _loadSavedProjects();
    panel = document.createElement('div');
    panel.id = 'project-panel';

    let listHtml = '';
    if (projects.length === 0) {
        listHtml = '<div class="proj-empty">暂无保存的项目</div>';
    } else {
        listHtml = projects.map((p) => {
            const isActive = p.id === _currentProjectId;
            const updatedAt = p.updatedAt || p.updated_at;
            const time = updatedAt ? _formatProjectTime(updatedAt) : '';
            return `<div class="proj-item ${isActive ? 'active' : ''}" onclick="openProject('${_escHtml(p.id)}')">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                <span class="truncate" style="max-width:120px;">${_escHtml(p.name)}</span>
                <span class="proj-item-time">${time}</span>
                <span class="proj-item-del" onclick="event.stopPropagation();deleteProject('${_escHtml(p.id)}')" title="删除">×</span>
            </div>`;
        }).join('');
    }

    panel.innerHTML = `
        <div class="proj-header">
            <span class="proj-title">项目</span>
        </div>
        <input class="proj-name-edit" id="proj-name-input" placeholder="输入项目名称" value="${_escHtml(_currentProjectName)}" onchange="setProjectName(this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" />
        <div class="proj-list-label">已保存的项目</div>
        <div class="proj-list">${listHtml}</div>
    `;

    document.body.appendChild(panel);
    setTimeout(() => {
        document.addEventListener('mousedown', _projectPanelOutsideClick);
    }, 0);
}

function _projectPanelOutsideClick(e) {
    const panel = document.getElementById('project-panel');
    const badge = document.getElementById('project-badge');
    if (panel && !panel.contains(e.target) && !badge.contains(e.target)) {
        panel.remove();
        document.removeEventListener('mousedown', _projectPanelOutsideClick);
    }
}

async function saveAsProject() {
    if (typeof showToast === 'function') showToast('正在保存项目...', 'info');
    const snapshot = await _getCanvasSnapshot();
    if (!snapshot) { if (typeof showToast === 'function') showToast('画布系统未初始化', 'error'); return; }

    const now = Date.now();
    const dataStr = JSON.stringify(snapshot);

    try {
        if (_currentProjectId) {
            await _saveProject(_currentProjectId, _currentProjectName, dataStr, now, now);
            if (typeof showToast === 'function') showToast('项目已保存');
            _refreshProjectPanel();
            return;
        }

        const id = 'proj_' + now + '_' + Math.random().toString(36).slice(2, 8);
        await _saveProject(id, _currentProjectName, dataStr, now, now);
        _currentProjectId = id;
        if (typeof showToast === 'function') showToast('项目已保存');
        _refreshProjectPanel();
    } catch (e) {
        console.error('[Project] 保存失败:', e);
        if (typeof showToast === 'function') showToast('项目保存失败: ' + (e.message || e), 'error');
    }
}

async function openProject(projectId) {
    const data = await _loadProjectData(projectId);
    if (!data) {
        if (typeof showToast === 'function') showToast('项目数据加载失败', 'error');
        return;
    }

    const projects = await _loadSavedProjects();
    const proj = projects.find(p => p.id === projectId);
    _currentProjectId = projectId;
    setProjectName(proj ? proj.name : '未命名项目');

    // 清空当前画布
    if (typeof CanvasNodeSystem !== 'undefined') {
        CanvasNodeSystem.nodes.length = 0;
        CanvasNodeSystem.connections.length = 0;
        if (CanvasNodeSystem.groups) CanvasNodeSystem.groups.length = 0;
        const nodesLayer = document.getElementById('nodes-layer');
        if (nodesLayer) nodesLayer.innerHTML = '';
        const svg = document.getElementById('connections-svg');
        if (svg) svg.innerHTML = '';
    }

    if (typeof mergeCanvasData === 'function') {
        mergeCanvasData(data);
    }

    const panel = document.getElementById('project-panel');
    if (panel) {
        panel.remove();
        document.removeEventListener('mousedown', _projectPanelOutsideClick);
    }

    if (typeof showToast === 'function') showToast('已打开项目: ' + (proj ? proj.name : ''));
}

async function deleteProject(projectId) {
    await _deleteProjectById(projectId);
    if (projectId === _currentProjectId) _currentProjectId = null;
    _refreshProjectPanel();
}

function _refreshProjectPanel() {
    const panel = document.getElementById('project-panel');
    if (!panel) return;
    // 重新打开面板
    panel.remove();
    document.removeEventListener('mousedown', _projectPanelOutsideClick);
    toggleProjectPanel();
}

function _formatProjectTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function _escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== 保存菜单 ====================
function toggleSaveMenu() {
    let menu = document.getElementById('save-menu');
    if (menu) {
        menu.remove();
        document.removeEventListener('mousedown', _saveMenuOutsideClick);
        return;
    }

    const btn = document.getElementById('save-canvas-btn');
    const rect = btn.getBoundingClientRect();

    menu = document.createElement('div');
    menu.id = 'save-menu';
    menu.style.top = rect.top + 'px';
    menu.style.left = (rect.right + 8) + 'px';

    menu.innerHTML = `
        <div class="save-menu-item" onclick="saveCanvasToJSON();closeSaveMenu();">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
            <div>
                <div>导出为 JSON</div>
                <div class="save-menu-desc">保存工作流为文件</div>
            </div>
        </div>
        <div class="save-menu-item" onclick="saveAsProject();closeSaveMenu();">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
            <div>
                <div>保存为项目</div>
                <div class="save-menu-desc">存到本地，随时打开</div>
            </div>
        </div>
    `;

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('mousedown', _saveMenuOutsideClick);
    }, 0);
}

function _saveMenuOutsideClick(e) {
    const menu = document.getElementById('save-menu');
    const btn = document.getElementById('save-canvas-btn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
        closeSaveMenu();
    }
}

function closeSaveMenu() {
    const menu = document.getElementById('save-menu');
    if (menu) menu.remove();
    document.removeEventListener('mousedown', _saveMenuOutsideClick);
}

window.toggleProjectPanel = toggleProjectPanel;
window.setProjectName = setProjectName;
window.saveAsProject = saveAsProject;
window.openProject = openProject;
window.deleteProject = deleteProject;
window.toggleSaveMenu = toggleSaveMenu;
window.closeSaveMenu = closeSaveMenu;
