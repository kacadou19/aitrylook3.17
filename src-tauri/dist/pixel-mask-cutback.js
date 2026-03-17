// ==================== 像素遮罩回切节点 ====================

function createPixelMaskCutbackNodeAtPos(x, y) {
    const id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    const node = {
        id, type: NODE_TYPES.PIXEL_MASK_CUTBACK, x, y,
        width: 420, height: 420,
        inputImages: [],
        brushSize: 28, brushOpacity: 0.45, eraseMode: false,
        fillInsideMode: false,
        edgeBlend: 15,
        maskDataUrl: null,
        _maskActualW: 0, _maskActualH: 0,
        model: 'nano-banana-pro',
        prompt: '',
        aspectRatio: 'auto',
        resolution: '1024x1024',
        count: 1,
        resultUrl: null, resultImages: [], currentImageIndex: 0
    };
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderPixelMaskCutbackNode(node);
    hideEmptyHint();
    return id;
}

function renderPixelMaskCutbackNode(node) {
    const container = document.getElementById('nodes-layer');
    if (!container) return;
    if (!node.inputImages) node.inputImages = [];
    if (!node.resultImages) node.resultImages = [];
    if (!node.currentImageIndex) node.currentImageIndex = 0;

    const existingEl = document.getElementById(`node-${node.id}`);
    if (existingEl) existingEl.remove();

    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'canvas-node pixel-mask-cutback-node absolute';
    el.style.cssText = `left:${node.x}px;top:${node.y}px;`;
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;

    const hasInputs = node.inputImages.length > 0;
    const firstImg = hasInputs ? node.inputImages[0] : null;
    const firstUrl = firstImg ? (firstImg.url || firstImg.previewUrl) : '';
    const hasMask = !!node.maskDataUrl;
    const hasResult = node.resultUrl || (node.resultImages && node.resultImages.length > 0);
    const currentResultUrl = node.resultImages.length > 0 ? node.resultImages[node.currentImageIndex || 0] : node.resultUrl;
    const imageCount = node.resultImages.length;
    const panelWidth = Math.max(node.width, 420);

    el.innerHTML = `
        <div class="node-body rounded-2xl overflow-hidden shadow-lg" style="width:${node.width}px;height:${node.height}px;background:#1a1a1a;border:none;position:relative;">
            <div class="absolute top-2 left-2 text-xs text-white drop-shadow" style="z-index:20;text-shadow:0 0 1px #000,0 0 2px #000;">🎭 像素遮罩回切</div>
            ${imageCount > 0 ? `<button id="multi-img-btn-${node.id}" onclick="event.stopPropagation();showImagePicker('${node.id}')" class="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/40 hover:bg-black/60 text-white text-xs rounded-full transition" title="查看所有生成图片" style="z-index:20;"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span id="img-count-${node.id}">${imageCount}</span></button>` : ''}
            <div class="relative overflow-hidden" style="height:${node.height}px;background:#1a1a1a;" id="pmc-preview-${node.id}">
                ${hasResult ? `<img src="${currentResultUrl}" class="w-full h-full object-contain"/>` :
                (firstUrl ? `<img src="${firstUrl}" class="w-full h-full object-contain"/>` : `
                <div class="absolute inset-0 flex items-center justify-center" style="background:#f9fafb;">
                    <div class="text-gray-400 text-sm text-center">
                        <div class="text-4xl mb-2 opacity-40">🎭</div>
                        <div class="text-gray-400">连接图片后涂抹遮罩区域</div>
                    </div>
                </div>`)}
                ${hasMask && firstUrl && !hasResult ? `<img src="${node.maskDataUrl}" class="pmc-mask-static" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.4;pointer-events:none;mix-blend-mode:multiply;"/>` : ''}
            </div>
            <div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #e11d48;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:35;"></div>
        </div>
        <div class="node-port can-connect-target connect-port floating-port" data-port="left" data-node-id="${node.id}" style="position:absolute;left:-36px;top:${node.height/2}px;transform:translateY(-50%);width:28px;height:28px;background:linear-gradient(135deg,#e11d48,#be123c);border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999;box-shadow:0 3px 10px rgba(225,29,72,0.4);transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div id="toolbar-panel-${node.id}" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">
            <button onclick="event.stopPropagation();pmcFullscreen('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="全屏查看">⛶ 全屏</button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();pmcDownload('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#374151;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'" title="下载">↓ 下载</button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();pmcSendToCanvas('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#06b6d4;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;font-weight:600;" onmouseover="this.style.background='#ecfeff'" onmouseout="this.style.background='none'" title="发送到画布">📤 发送</button>
            <div style="width:1px;height:18px;background:#e5e7eb;"></div>
            <button onclick="event.stopPropagation();window.deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'" title="删除节点"><svg style="width:14px;height:14px;pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> 删除</button>
        </div>
        <div id="input-panel-${node.id}" class="ai-input-panel rounded-xl overflow-hidden shadow-lg" style="position:absolute;left:50%;top:${node.height + 12}px;transform:translateX(-50%);width:${panelWidth}px;background:white;border:1px solid #e5e7eb;display:none;">
            <div class="p-3">
                <div class="flex items-center gap-2 mb-2">
                    <div class="flex gap-2 flex-wrap flex-1 min-h-[36px] p-2 bg-gray-50 rounded-lg border border-gray-200" id="pmc-refs-${node.id}"></div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                    <button onclick="event.stopPropagation();pmcOpenBrush('${node.id}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:none;background:#e11d48;color:#fff;cursor:pointer;opacity:${hasInputs?1:0.4};" ${hasInputs?'':'disabled'}>✏ 涂抹遮罩</button>
                    <button onclick="event.stopPropagation();pmcInvertMask('${node.id}')" style="padding:5px 12px;font-size:10px;font-weight:600;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;opacity:${hasInputs?1:0.4};" ${hasInputs?'':'disabled'} title="反转涂抹区域">🔄 反转</button>
                    <button onclick="event.stopPropagation();pmcClearMask('${node.id}')" style="padding:5px 12px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;opacity:${hasInputs?1:0.4};" ${hasInputs?'':'disabled'}>清空</button>
                    ${hasMask ? `<span style="font-size:10px;color:#e11d48;background:#fff1f2;padding:2px 8px;border-radius:4px;">已涂抹 ✓</span>` : ''}
                </div>
                <div id="pmc-brush-toolbar-slot-${node.id}"></div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:4px 8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
                    <span style="font-size:10px;color:#64748b;white-space:nowrap;" title="控制遮罩边缘向内收缩的像素数，值越大融合越自然但覆盖区域越小">🔀 边缘融合</span>
                    <input type="range" min="0" max="40" value="${node.edgeBlend || 15}" oninput="pmcUpdateEdgeBlend('${node.id}',this.value);document.getElementById('pmc-blend-val-${node.id}').textContent=this.value+'px'" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" style="flex:1;min-width:0;accent-color:#e11d48;"/>
                    <span id="pmc-blend-val-${node.id}" style="font-size:10px;color:#e11d48;font-weight:600;min-width:28px;text-align:right;">${node.edgeBlend || 15}px</span>
                </div>
                <div class="relative mb-2">
                    <textarea id="pmc-prompt-${node.id}" class="w-full p-2.5 bg-gray-50 text-gray-700 text-sm resize-none outline-none placeholder-gray-400 rounded-lg border border-gray-200 focus:border-rose-400 transition" rows="2" placeholder="描述要替换的效果..." oninput="pmcUpdatePrompt('${node.id}',this.value)" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">${node.prompt || ''}</textarea>
                </div>
                <div class="flex items-center gap-2 mt-2 flex-wrap">
                    <select id="pmc-model-${node.id}" onchange="pmcUpdateModel('${node.id}',this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">${renderModelOptions(getImageModels(), node.model, 'nano-banana-pro')}</select>
                    <select id="pmc-ratio-${node.id}" onchange="pmcUpdateRatio('${node.id}',this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        <option value="auto" ${(node.aspectRatio||'auto')==='auto'?'selected':''}>Auto</option>
                        <option value="1:1" ${node.aspectRatio==='1:1'?'selected':''}>1:1</option>
                        <option value="16:9" ${node.aspectRatio==='16:9'?'selected':''}>16:9</option>
                        <option value="9:16" ${node.aspectRatio==='9:16'?'selected':''}>9:16</option>
                        <option value="4:3" ${node.aspectRatio==='4:3'?'selected':''}>4:3</option>
                        <option value="3:4" ${node.aspectRatio==='3:4'?'selected':''}>3:4</option>
                        <option value="3:2" ${node.aspectRatio==='3:2'?'selected':''}>3:2</option>
                        <option value="2:3" ${node.aspectRatio==='2:3'?'selected':''}>2:3</option>
                    </select>
                    <select id="pmc-resolution-${node.id}" onchange="pmcUpdateResolution('${node.id}',this.value)" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 outline-none text-xs cursor-pointer hover:border-gray-300">
                        <option value="1024x1024" ${(node.resolution||'1024x1024')==='1024x1024'?'selected':''}>1K</option>
                        <option value="2048x2048" ${node.resolution==='2048x2048'?'selected':''}>2K</option>
                        <option value="4096x4096" ${node.resolution==='4096x4096'?'selected':''}>4K</option>
                    </select>
                    <button onclick="event.stopPropagation();pmcToggleCount('${node.id}')" id="pmc-count-${node.id}" class="px-2.5 py-1.5 bg-gray-50 text-gray-600 rounded-md border border-gray-200 text-xs cursor-pointer hover:bg-gray-100 transition">${node.count||1}x</button>
                    <div class="flex-1"></div>
                    <button id="pmc-run-btn-${node.id}" onclick="event.stopPropagation();runPixelMaskCutback('${node.id}')" class="px-4 py-1.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-lg text-xs font-medium hover:opacity-90 transition flex items-center gap-1.5 shadow-sm" style="opacity:${hasInputs?1:0.4};" ${hasInputs?'':'disabled'}>
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg> 生成
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
    updatePMCRefs(node);
}

function updatePMCRefs(node) {
    const refsEl = document.getElementById(`pmc-refs-${node.id}`);
    if (!refsEl) return;
    if (!node.inputImages || node.inputImages.length === 0) {
        refsEl.innerHTML = '<span class="text-xs text-gray-400">连接图片节点（第1张为原图，其余为参考图）</span>';
        return;
    }
    refsEl.innerHTML = node.inputImages.map((img, i) => {
        const url = img.previewUrl || img.url;
        const label = i === 0 ? '原图' : `参考${i}`;
        return `<div class="relative group" style="width:48px;height:48px;border-radius:6px;overflow:hidden;border:1px solid ${i===0?'#e11d48':'#8b5cf6'};flex-shrink:0;">
            <img src="${url}" style="width:100%;height:100%;object-fit:cover;"/>
            <div style="position:absolute;bottom:0;left:0;right:0;background:${i===0?'rgba(225,29,72,0.8)':'rgba(139,92,246,0.8)'};color:#fff;font-size:8px;text-align:center;padding:1px 0;">${label}</div>
        </div>`;
    }).join('');

    // 当原图更新且没有生成结果时，更新主预览区域显示新原图
    const hasResult = node.resultUrl || (node.resultImages && node.resultImages.length > 0);
    if (!hasResult && node.inputImages.length > 0) {
        const firstUrl = node.inputImages[0].url || node.inputImages[0].previewUrl;
        if (firstUrl) {
            const previewEl = document.getElementById(`pmc-preview-${node.id}`);
            if (previewEl) {
                const imgEl = previewEl.querySelector('img');
                if (imgEl) {
                    imgEl.src = firstUrl;
                } else {
                    previewEl.innerHTML = `<img src="${firstUrl}" class="w-full h-full object-contain"/>`;
                }
            }
            // 只有原图URL真正变化时才更新尺寸和清除遮罩
            if (node._pmcLastSourceUrl && node._pmcLastSourceUrl !== firstUrl) {
                const tempImg = new Image();
                tempImg.onload = () => {
                    node._maskActualW = tempImg.naturalWidth;
                    node._maskActualH = tempImg.naturalHeight;
                    if (node.maskDataUrl) {
                        node.maskDataUrl = null;
                        node._pmcUndoStack = [];
                        renderPixelMaskCutbackNode(node);
                        if (typeof showToast === 'function') showToast('原图已更换，遮罩已清除', 'info');
                    }
                };
                tempImg.src = firstUrl;
            }
            node._pmcLastSourceUrl = firstUrl;
        }
    }
}

function pmcUpdatePrompt(nodeId, val) { const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (n) n.prompt = val; }
function pmcUpdateModel(nodeId, val) { const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (n) n.model = val; }
function pmcUpdateRatio(nodeId, val) { const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (n) n.aspectRatio = val; }
function pmcUpdateResolution(nodeId, val) { const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (n) n.resolution = val; }
function pmcUpdateEdgeBlend(nodeId, val) { const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (n) n.edgeBlend = parseInt(val) || 15; }
function pmcToggleCount(nodeId) {
    const n = CanvasNodeSystem.nodes.find(n => n.id === nodeId); if (!n) return;
    n.count = (n.count || 1) >= 4 ? 1 : (n.count || 1) + 1;
    const btn = document.getElementById(`pmc-count-${nodeId}`);
    if (btn) btn.textContent = n.count + 'x';
}

// ==================== 涂抹功能（实际图片分辨率遮罩） ====================
function pmcOpenBrush(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.inputImages || node.inputImages.length === 0) {
        if (typeof showToast === 'function') showToast('请先连接图片', 'warning');
        return;
    }
    const area = document.getElementById(`pmc-preview-${nodeId}`);
    if (!area) return;
    const existingOverlay = area.querySelector('.pmc-brush-overlay');
    if (existingOverlay) { pmcCloseBrush(nodeId); return; }

    // 移除静态遮罩预览
    const staticMask = area.querySelector('.pmc-mask-static');
    if (staticMask) staticMask.remove();

    const firstUrl = node.inputImages[0].url || node.inputImages[0].previewUrl;
    const imgEl = area.querySelector('img');
    if (imgEl) imgEl.src = firstUrl;

    // 使用实际图片分辨率作为遮罩画布尺寸，确保像素精准
    const actualW = node._maskActualW || 0;
    const actualH = node._maskActualH || 0;

    if (actualW > 0 && actualH > 0) {
        _pmcCreateBrushOverlay(nodeId, node, area, actualW, actualH);
    } else {
        // 首次打开，加载图片获取实际尺寸
        const tempImg = new Image();
        tempImg.onload = () => {
            node._maskActualW = tempImg.naturalWidth || tempImg.width;
            node._maskActualH = tempImg.naturalHeight || tempImg.height;
            _pmcCreateBrushOverlay(nodeId, node, area, node._maskActualW, node._maskActualH);
        };
        tempImg.onerror = () => {
            // 降级：使用显示尺寸
            const r = area.getBoundingClientRect();
            node._maskActualW = Math.round(r.width);
            node._maskActualH = Math.round(r.height);
            _pmcCreateBrushOverlay(nodeId, node, area, node._maskActualW, node._maskActualH);
        };
        tempImg.src = firstUrl;
    }
}

function _pmcCreateBrushOverlay(nodeId, node, area, canvasW, canvasH) {
    const overlay = document.createElement('div');
    overlay.className = 'pmc-brush-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:50;pointer-events:auto;overflow:hidden;';

    const maskCanvas = document.createElement('canvas');
    maskCanvas.className = 'pmc-mask-canvas';
    maskCanvas.width = canvasW;
    maskCanvas.height = canvasH;
    maskCanvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;opacity:${node.brushOpacity||0.45};pointer-events:auto;`;

    const brushCursor = document.createElement('div');
    brushCursor.className = 'pmc-brush-cursor';
    brushCursor.style.cssText = `position:absolute;width:${node.brushSize||28}px;height:${node.brushSize||28}px;border:2px solid #e11d48;border-radius:50%;pointer-events:none;display:none;box-shadow:0 0 0 1px rgba(0,0,0,0.3);`;

    overlay.appendChild(maskCanvas);
    overlay.appendChild(brushCursor);
    area.appendChild(overlay);

    if (node.maskDataUrl) {
        const img = new Image();
        img.onload = () => { const ctx = maskCanvas.getContext('2d'); if (ctx) ctx.drawImage(img, 0, 0, canvasW, canvasH); };
        img.src = node.maskDataUrl;
    }
    _pmcBindBrushEvents(nodeId, maskCanvas, brushCursor);
    _pmcShowBrushToolbar(nodeId);
}

function _pmcBindBrushEvents(nodeId, maskCanvas, brushCursor) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !maskCanvas) return;
    let drawing = false, prev = null;
    if (!node._pmcUndoStack) node._pmcUndoStack = [];
    // 遮罩内补模式：记录路径点
    let fillPath = [];

    const getLocalPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * maskCanvas.width, y: ((e.clientY - rect.top) / rect.height) * maskCanvas.height };
    };
    const drawStroke = (from, to) => {
        const ctx = maskCanvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = node.eraseMode ? 'destination-out' : 'source-over';
        ctx.strokeStyle = 'rgba(255,0,80,1)';
        ctx.fillStyle = 'rgba(255,0,80,1)';
        ctx.globalAlpha = 1;
        const r = Math.max(1, (node.brushSize || 28)) / 2;
        if (!from) { ctx.beginPath(); ctx.arc(to.x, to.y, r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.lineWidth = r * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); }
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
        brushCursor.style.width = sz + 'px'; brushCursor.style.height = sz + 'px';
        const ox = (e.clientX - overlayRect.left) / zoom;
        const oy = (e.clientY - overlayRect.top) / zoom;
        brushCursor.style.left = (ox - sz / 2) + 'px'; brushCursor.style.top = (oy - sz / 2) + 'px';
        brushCursor.style.display = 'block';
    };
    maskCanvas.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault(); drawing = true;
        node._pmcUndoStack.push(maskCanvas.toDataURL('image/png'));
        if (node._pmcUndoStack.length > 30) node._pmcUndoStack.shift();
        const pos = getLocalPos(e);
        if (node.fillInsideMode && !node.eraseMode) {
            fillPath = [pos];
            drawStroke(null, pos);
        } else {
            drawStroke(null, pos);
        }
        prev = pos;
    };
    maskCanvas.onmousemove = (e) => {
        updateCursor(e); if (!drawing) return; e.stopPropagation();
        const pos = getLocalPos(e);
        if (node.fillInsideMode && !node.eraseMode) {
            fillPath.push(pos);
            drawStroke(prev, pos);
        } else {
            if (prev) drawStroke(prev, pos);
        }
        prev = pos;
    };
    maskCanvas.onmouseenter = (e) => { if (brushCursor) { brushCursor.style.display = 'block'; updateCursor(e); } };
    maskCanvas.onmouseleave = () => { if (brushCursor) brushCursor.style.display = 'none'; };
    const onFinish = () => {
        if (!drawing) return; drawing = false; prev = null;
        // 遮罩内补：闭合路径并填充内部
        if (node.fillInsideMode && !node.eraseMode && fillPath.length > 2) {
            const ctx = maskCanvas.getContext('2d');
            if (ctx) {
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = 'rgba(255,0,80,1)';
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.moveTo(fillPath[0].x, fillPath[0].y);
                for (let i = 1; i < fillPath.length; i++) ctx.lineTo(fillPath[i].x, fillPath[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            fillPath = [];
        }
        node.maskDataUrl = maskCanvas.toDataURL('image/png');
    };
    if (maskCanvas._pmcMouseUp) document.removeEventListener('mouseup', maskCanvas._pmcMouseUp);
    maskCanvas._pmcMouseUp = onFinish;
    document.addEventListener('mouseup', onFinish);
}

function _pmcShowBrushToolbar(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    let tb = document.getElementById(`pmc-brush-toolbar-${nodeId}`);
    if (tb) tb.remove();
    tb = document.createElement('div');
    tb.id = `pmc-brush-toolbar-${nodeId}`;
    tb.style.cssText = 'background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;';
    tb.onclick = (e) => e.stopPropagation();
    tb.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:10px;color:#64748b;white-space:nowrap;">大小</span>
            <input type="range" min="6" max="80" value="${node.brushSize||28}" oninput="pmcSetBrushSize('${nodeId}',this.value)" style="flex:1;min-width:0;"/>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
            <button onclick="event.stopPropagation();pmcSetEraseMode('${nodeId}',false)" id="pmc-paint-${nodeId}" style="padding:4px 8px;font-size:10px;border-radius:6px;border:none;background:${node.eraseMode?'#f1f5f9':'#e11d48'};color:${node.eraseMode?'#64748b':'#fff'};cursor:pointer;">涂抹</button>
            <button onclick="event.stopPropagation();pmcSetEraseMode('${nodeId}',true)" id="pmc-erase-${nodeId}" style="padding:4px 8px;font-size:10px;border-radius:6px;border:none;background:${node.eraseMode?'#e11d48':'#f1f5f9'};color:${node.eraseMode?'#fff':'#64748b'};cursor:pointer;">擦除</button>
            <label id="pmc-fill-label-${nodeId}" style="display:flex;align-items:center;gap:3px;padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid ${node.fillInsideMode?'#e11d48':'#e5e7eb'};background:${node.fillInsideMode?'#fff1f2':'#fff'};color:${node.fillInsideMode?'#e11d48':'#64748b'};cursor:pointer;" title="画圈自动填充内部">
                <input type="checkbox" ${node.fillInsideMode?'checked':''} onchange="event.stopPropagation();pmcToggleFillInside('${nodeId}',this.checked)" style="width:12px;height:12px;accent-color:#e11d48;cursor:pointer;"/>遮罩内补
            </label>
            <button onclick="event.stopPropagation();pmcUndoStroke('${nodeId}')" style="padding:4px 8px;font-size:10px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;color:#64748b;cursor:pointer;">撤销</button>
            <button onclick="event.stopPropagation();pmcCloseBrush('${nodeId}')" style="padding:4px 8px;font-size:10px;border-radius:6px;border:none;background:#22c55e;color:#fff;cursor:pointer;">✓ 完成</button>
        </div>
    `;
    const slot = document.getElementById(`pmc-brush-toolbar-slot-${nodeId}`);
    if (slot) { slot.innerHTML = ''; slot.appendChild(tb); }
}

// ==================== 完成涂抹 ====================
function pmcCloseBrush(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const area = document.getElementById(`pmc-preview-${nodeId}`);
    if (!area) return;
    const maskCanvas = area.querySelector('.pmc-mask-canvas');
    if (maskCanvas) {
        node.maskDataUrl = maskCanvas.toDataURL('image/png');
        // 清理mouseup监听
        if (maskCanvas._pmcMouseUp) {
            document.removeEventListener('mouseup', maskCanvas._pmcMouseUp);
            maskCanvas._pmcMouseUp = null;
        }
    }
    // 移除笔刷覆盖层
    const overlay = area.querySelector('.pmc-brush-overlay');
    if (overlay) overlay.remove();
    // 移除笔刷工具栏
    const tb = document.getElementById(`pmc-brush-toolbar-${nodeId}`);
    if (tb) tb.remove();
    // 重新渲染节点以显示静态遮罩覆盖层
    renderPixelMaskCutbackNode(node);
    if (typeof showToast === 'function') showToast('遮罩已保存', 'success');
}

function pmcSetBrushSize(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (node) node.brushSize = parseInt(val) || 28;
}

function pmcSetBrushOpacity(nodeId, val) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.brushOpacity = parseFloat(val) || 0.45;
    const area = document.getElementById(`pmc-preview-${nodeId}`);
    if (area) {
        const mc = area.querySelector('.pmc-mask-canvas');
        if (mc) mc.style.opacity = node.brushOpacity;
    }
}

function pmcSetEraseMode(nodeId, erase) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.eraseMode = !!erase;
    const paintBtn = document.getElementById(`pmc-paint-${nodeId}`);
    const eraseBtn = document.getElementById(`pmc-erase-${nodeId}`);
    if (paintBtn) { paintBtn.style.background = erase ? '#f1f5f9' : '#e11d48'; paintBtn.style.color = erase ? '#64748b' : '#fff'; }
    if (eraseBtn) { eraseBtn.style.background = erase ? '#e11d48' : '#f1f5f9'; eraseBtn.style.color = erase ? '#fff' : '#64748b'; }
}

function pmcToggleFillInside(nodeId, checked) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.fillInsideMode = !!checked;
    const label = document.getElementById(`pmc-fill-label-${nodeId}`);
    if (label) {
        label.style.border = `1px solid ${checked ? '#e11d48' : '#e5e7eb'}`;
        label.style.background = checked ? '#fff1f2' : '#fff';
        label.style.color = checked ? '#e11d48' : '#64748b';
    }
}

function pmcUndoStroke(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node._pmcUndoStack || node._pmcUndoStack.length === 0) return;
    const area = document.getElementById(`pmc-preview-${nodeId}`);
    if (!area) return;
    const maskCanvas = area.querySelector('.pmc-mask-canvas');
    if (!maskCanvas) return;
    const prevData = node._pmcUndoStack.pop();
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
        node.maskDataUrl = maskCanvas.toDataURL('image/png');
    };
    img.src = prevData;
}

function pmcClearMask(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.maskDataUrl = null;
    node._pmcUndoStack = [];
    const area = document.getElementById(`pmc-preview-${nodeId}`);
    if (area) {
        const maskCanvas = area.querySelector('.pmc-mask-canvas');
        if (maskCanvas) {
            const ctx = maskCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
        // 移除静态遮罩
        const staticMask = area.querySelector('.pmc-mask-static');
        if (staticMask) staticMask.remove();
    }
    // 重新渲染以更新UI状态（移除"已涂抹"标记等）
    renderPixelMaskCutbackNode(node);
}

function pmcInvertMask(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node || !node.maskDataUrl) {
        if (typeof showToast === 'function') showToast('请先涂抹遮罩', 'warning');
        return;
    }
    const w = node._maskActualW || 420;
    const h = node._maskActualH || 420;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w; tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
        // 先填充整个画布
        ctx.fillStyle = 'rgba(255,0,80,1)';
        ctx.fillRect(0, 0, w, h);
        // 用destination-out擦除原有遮罩区域
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(img, 0, 0, w, h);
        node.maskDataUrl = tempCanvas.toDataURL('image/png');
        // 如果笔刷打开中，更新画布
        const area = document.getElementById(`pmc-preview-${nodeId}`);
        if (area) {
            const mc = area.querySelector('.pmc-mask-canvas');
            if (mc) {
                const mctx = mc.getContext('2d');
                if (mctx) {
                    mctx.clearRect(0, 0, mc.width, mc.height);
                    const inv = new Image();
                    inv.onload = () => { mctx.drawImage(inv, 0, 0, mc.width, mc.height); };
                    inv.src = node.maskDataUrl;
                }
            }
        }
        // 重新渲染节点以更新静态遮罩
        renderPixelMaskCutbackNode(node);
        if (typeof showToast === 'function') showToast('遮罩已反转', 'success');
    };
    img.src = node.maskDataUrl;
}

// ==================== 回切辅助：将AI结果按遮罩贴回原图 ====================
// 原理：在原图尺寸画布上，先画原图，再把AI结果缩放到bbox区域，
// 然后逐像素检查遮罩alpha：有遮罩的地方用AI结果，没遮罩的地方保留原图。
// 这样保证未涂抹区域100%是原图像素，不会有任何变化。
function _pmcLoadImg(src, crossOrigin) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// 遮罩腐蚀：将遮罩向内收缩erodeR像素，消除AI结果最外圈的白边/杂色
// 然后在收缩后的边缘做窄过渡（fadeR像素），实现自然融合
function _pmcProcessMaskAlpha(alphaArr, w, h, erodeR, fadeR) {
    // 第1步：计算每个像素到遮罩边缘的最短距离（距离变换的简化版）
    // 用多pass扫描近似欧氏距离
    const dist = new Float32Array(w * h);
    const INF = w + h;
    // 初始化：遮罩内=INF，遮罩外=0
    for (let i = 0; i < w * h; i++) {
        dist[i] = alphaArr[i] > 0.5 ? INF : 0;
    }
    // 正向扫描
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (dist[i] === 0) continue;
            let d = INF;
            if (x > 0) d = Math.min(d, dist[i - 1] + 1);
            if (y > 0) d = Math.min(d, dist[(y - 1) * w + x] + 1);
            if (x > 0 && y > 0) d = Math.min(d, dist[(y - 1) * w + x - 1] + 1.414);
            if (x < w - 1 && y > 0) d = Math.min(d, dist[(y - 1) * w + x + 1] + 1.414);
            dist[i] = d;
        }
    }
    // 反向扫描
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (dist[i] === 0) continue;
            let d = dist[i];
            if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
            if (y < h - 1) d = Math.min(d, dist[(y + 1) * w + x] + 1);
            if (x < w - 1 && y < h - 1) d = Math.min(d, dist[(y + 1) * w + x + 1] + 1.414);
            if (x > 0 && y < h - 1) d = Math.min(d, dist[(y + 1) * w + x - 1] + 1.414);
            dist[i] = d;
        }
    }
    // 第2步：根据距离生成新alpha
    // dist < erodeR → alpha=0（腐蚀掉的边缘）
    // dist >= erodeR 且 dist < erodeR+fadeR → 线性过渡 0~1
    // dist >= erodeR+fadeR → alpha=1（完全使用AI结果）
    const totalR = erodeR + fadeR;
    for (let i = 0; i < w * h; i++) {
        if (alphaArr[i] < 0.01) { alphaArr[i] = 0; continue; }
        const d = dist[i];
        if (d < erodeR) {
            alphaArr[i] = 0;
        } else if (d < totalR) {
            alphaArr[i] = (d - erodeR) / fadeR;
        } else {
            alphaArr[i] = 1;
        }
    }
}

async function _pmcCompositeBack(srcImgEl, maskImg, aiResultUrl, actualW, actualH, bboxX, bboxY, bboxW, bboxH) {
    const aiImg = await _pmcLoadImg(aiResultUrl, true);

    // 输出画布 = 原图尺寸
    const outCanvas = document.createElement('canvas');
    outCanvas.width = actualW;
    outCanvas.height = actualH;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(srcImgEl, 0, 0, actualW, actualH);

    // AI结果缩放到bbox尺寸
    const aiScaledCanvas = document.createElement('canvas');
    aiScaledCanvas.width = bboxW;
    aiScaledCanvas.height = bboxH;
    const aiCtx = aiScaledCanvas.getContext('2d');
    aiCtx.drawImage(aiImg, 0, 0, bboxW, bboxH);

    // 获取遮罩在bbox区域的alpha
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = actualW;
    maskCanvas.height = actualH;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(maskImg, 0, 0, actualW, actualH);
    const maskData = maskCtx.getImageData(bboxX, bboxY, bboxW, bboxH).data;

    // 构建alpha数组
    const alphaArr = new Float32Array(bboxW * bboxH);
    for (let i = 0; i < bboxW * bboxH; i++) {
        alphaArr[i] = maskData[i * 4 + 3] / 255;
    }

    // 腐蚀2像素 + 3像素窄过渡（总共只影响边缘5像素，不会大范围模糊）
    _pmcProcessMaskAlpha(alphaArr, bboxW, bboxH, 2, 3);

    // 获取AI和原图像素数据
    const aiData = aiCtx.getImageData(0, 0, bboxW, bboxH).data;
    const outData = outCtx.getImageData(bboxX, bboxY, bboxW, bboxH);
    const pixels = outData.data;

    // 逐像素混合
    for (let i = 0; i < bboxW * bboxH; i++) {
        const a = alphaArr[i];
        if (a < 0.005) continue;
        const idx = i * 4;
        pixels[idx]     = Math.round(aiData[idx]     * a + pixels[idx]     * (1 - a));
        pixels[idx + 1] = Math.round(aiData[idx + 1] * a + pixels[idx + 1] * (1 - a));
        pixels[idx + 2] = Math.round(aiData[idx + 2] * a + pixels[idx + 2] * (1 - a));
        pixels[idx + 3] = 255;
    }

    outCtx.putImageData(outData, bboxX, bboxY);
    return outCanvas.toDataURL('image/png');
}

// ==================== 统一尺寸辅助函数 ====================
// 解析分辨率字符串 "1024x1024" → {w:1024, h:1024}
function _pmcParseResolution(res) {
    const parts = (res || '1024x1024').split('x');
    return { w: parseInt(parts[0]) || 1024, h: parseInt(parts[1]) || 1024 };
}

// ==================== 生成（正方形扩图 + 遮罩回切） ====================
// 核心逻辑（正方形扩图法）：
// 1. 把原图、遮罩、参考图全部扩图到1:1正方形（≥2K），原图居中
// 2. 用正方形图发给AI（比例1:1，无变形）
// 3. AI返回1:1正方形结果，从中裁剪出原图区域
// 4. 用遮罩按像素混合回切到原图，保证不偏移
async function runPixelMaskCutback(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!node.inputImages || node.inputImages.length === 0) {
        if (typeof showToast === 'function') showToast('请先连接图片', 'error');
        return;
    }
    if (!node.maskDataUrl) {
        if (typeof showToast === 'function') showToast('请先涂抹遮罩区域', 'error');
        return;
    }

    const sourceImg = node.inputImages[0];
    const sourceUrl = sourceImg.url || sourceImg.previewUrl;
    const model = node.model || 'nano-banana-pro';
    const resolution = node.resolution || '1024x1024';
    const count = node.count || 1;
    const prompt = node.prompt || '根据参考图生成';

    // 加载遮罩和原图
    const maskImg = await _pmcLoadImg(node.maskDataUrl, false);
    const srcImgEl = await _pmcLoadImg(sourceUrl, true);
    const origW = srcImgEl.naturalWidth;
    const origH = srcImgEl.naturalHeight;

    // ===== 第1步：确定正方形尺寸（≥2048，取原图长边） =====
    const resParsed = _pmcParseResolution(resolution);
    const minSquare = Math.max(resParsed.w, resParsed.h, 2048);
    const origMaxSide = Math.max(origW, origH);
    const squareSize = Math.max(minSquare, origMaxSide);
    // 原图在正方形中的缩放：保持比例，长边=squareSize
    const scale = squareSize / origMaxSide;
    const scaledW = Math.round(origW * scale);
    const scaledH = Math.round(origH * scale);
    // 原图在正方形中居中的偏移
    const offsetX = Math.round((squareSize - scaledW) / 2);
    const offsetY = Math.round((squareSize - scaledH) / 2);
    console.log('[像素遮罩回切] 正方形扩图:', {
        原图: `${origW}x${origH}`, 正方形: `${squareSize}x${squareSize}`,
        缩放后: `${scaledW}x${scaledH}`, 偏移: `(${offsetX},${offsetY})`
    });

    // ===== 第2步：原图扩图到正方形（居中，边缘镜像填充） =====
    const srcSquare = document.createElement('canvas');
    srcSquare.width = squareSize; srcSquare.height = squareSize;
    const srcSqCtx = srcSquare.getContext('2d');
    // 取原图四角平均色作为背景
    const tmpC = document.createElement('canvas');
    tmpC.width = origW; tmpC.height = origH;
    tmpC.getContext('2d').drawImage(srcImgEl, 0, 0);
    const tmpCtx = tmpC.getContext('2d');
    const corners = [
        tmpCtx.getImageData(0, 0, 1, 1).data,
        tmpCtx.getImageData(origW - 1, 0, 1, 1).data,
        tmpCtx.getImageData(0, origH - 1, 1, 1).data,
        tmpCtx.getImageData(origW - 1, origH - 1, 1, 1).data
    ];
    const avgR = Math.round((corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4);
    const avgG = Math.round((corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4);
    const avgB = Math.round((corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4);
    srcSqCtx.fillStyle = `rgb(${avgR},${avgG},${avgB})`;
    srcSqCtx.fillRect(0, 0, squareSize, squareSize);
    // 镜像填充边缘
    if (offsetY > 0) {
        srcSqCtx.save(); srcSqCtx.translate(offsetX, offsetY); srcSqCtx.scale(1, -1);
        srcSqCtx.drawImage(srcImgEl, 0, 0, origW, Math.min(origH, offsetY / scale), 0, 0, scaledW, offsetY);
        srcSqCtx.restore();
    }
    if (offsetY > 0) {
        srcSqCtx.save(); srcSqCtx.translate(offsetX, offsetY + scaledH); srcSqCtx.scale(1, -1);
        const srcYStart = Math.max(0, origH - offsetY / scale);
        srcSqCtx.drawImage(srcImgEl, 0, srcYStart, origW, origH - srcYStart, 0, -offsetY, scaledW, offsetY);
        srcSqCtx.restore();
    }
    if (offsetX > 0) {
        srcSqCtx.save(); srcSqCtx.translate(offsetX, offsetY); srcSqCtx.scale(-1, 1);
        srcSqCtx.drawImage(srcImgEl, 0, 0, Math.min(origW, offsetX / scale), origH, 0, 0, offsetX, scaledH);
        srcSqCtx.restore();
    }
    if (offsetX > 0) {
        srcSqCtx.save(); srcSqCtx.translate(offsetX + scaledW, offsetY); srcSqCtx.scale(-1, 1);
        const srcXStart = Math.max(0, origW - offsetX / scale);
        srcSqCtx.drawImage(srcImgEl, srcXStart, 0, origW - srcXStart, origH, 0, 0, offsetX, scaledH);
        srcSqCtx.restore();
    }
    // 原图本体居中
    srcSqCtx.drawImage(srcImgEl, offsetX, offsetY, scaledW, scaledH);

    // ===== 第3步：遮罩扩图到正方形（居中，周围透明） =====
    const maskSquare = document.createElement('canvas');
    maskSquare.width = squareSize; maskSquare.height = squareSize;
    maskSquare.getContext('2d').drawImage(maskImg, offsetX, offsetY, scaledW, scaledH);

    // ===== 第4步：用遮罩提取涂抹区域 =====
    const maskedSquare = document.createElement('canvas');
    maskedSquare.width = squareSize; maskedSquare.height = squareSize;
    const mSqCtx = maskedSquare.getContext('2d');
    mSqCtx.drawImage(srcSquare, 0, 0);
    mSqCtx.globalCompositeOperation = 'destination-in';
    mSqCtx.drawImage(maskSquare, 0, 0);
    mSqCtx.globalCompositeOperation = 'source-over';

    // 检查遮罩是否有内容
    const maskCheckData = maskSquare.getContext('2d').getImageData(offsetX, offsetY, scaledW, scaledH).data;
    let hasMaskPixels = false;
    for (let i = 3; i < maskCheckData.length; i += 4) {
        if (maskCheckData[i] > 10) { hasMaskPixels = true; break; }
    }
    if (!hasMaskPixels) {
        if (typeof showToast === 'function') showToast('遮罩区域为空，请重新涂抹', 'error');
        return;
    }

    const srcSquareUrl = srcSquare.toDataURL('image/png');
    const maskedSquareUrl = maskedSquare.toDataURL('image/png');

    // ===== 第5步：参考图也扩图到正方形 =====
    const referenceImages = [srcSquareUrl, maskedSquareUrl];
    for (let i = 1; i < node.inputImages.length; i++) {
        const refUrl = node.inputImages[i].url || node.inputImages[i].previewUrl;
        if (refUrl) {
            try {
                const refImg = await _pmcLoadImg(refUrl, true);
                const rW = refImg.naturalWidth, rH = refImg.naturalHeight;
                const refSq = document.createElement('canvas');
                refSq.width = squareSize; refSq.height = squareSize;
                const rSqCtx = refSq.getContext('2d');
                const rMax = Math.max(rW, rH);
                const rSc = squareSize / rMax;
                const rScW = Math.round(rW * rSc), rScH = Math.round(rH * rSc);
                const rOffX = Math.round((squareSize - rScW) / 2);
                const rOffY = Math.round((squareSize - rScH) / 2);
                rSqCtx.fillStyle = `rgb(${avgR},${avgG},${avgB})`;
                rSqCtx.fillRect(0, 0, squareSize, squareSize);
                rSqCtx.drawImage(refImg, rOffX, rOffY, rScW, rScH);
                referenceImages.push(refSq.toDataURL('image/png'));
            } catch (e) { referenceImages.push(refUrl); }
        }
    }

    const squareResolution = `${squareSize}x${squareSize}`;
    console.log('[像素遮罩回切] 正方形1:1模式, 尺寸:', squareSize, '参考图数:', referenceImages.length);

    // 显示加载动画
    const previewEl = document.getElementById(`pmc-preview-${nodeId}`);
    if (previewEl) {
        previewEl.innerHTML += `
            <div class="generating-overlay" id="pmc-generating-${nodeId}" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:60;">
                <div style="color:#fff;font-size:14px;margin-bottom:8px;">🎭 正在生成${count > 1 ? ` (0/${count})` : ''}...</div>
                <div style="width:60%;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;">
                    <div style="width:30%;height:100%;background:linear-gradient(90deg,#e11d48,#f472b6);border-radius:2px;animation:pmcProgress 1.5s ease-in-out infinite;"></div>
                </div>
            </div>
        `;
        if (!document.getElementById('pmc-progress-style')) {
            const style = document.createElement('style');
            style.id = 'pmc-progress-style';
            style.textContent = '@keyframes pmcProgress{0%{transform:translateX(-100%)}50%{transform:translateX(100%)}100%{transform:translateX(-100%)}}';
            document.head.appendChild(style);
        }
    }

    const runBtn = document.getElementById(`pmc-run-btn-${nodeId}`);
    if (runBtn) { runBtn.disabled = true; runBtn.style.opacity = '0.5'; }

    try {
        if (typeof generateImage !== 'function') throw new Error('generateImage 函数不可用');

        node.resultImages = [];
        node.currentImageIndex = 0;
        const results = new Array(count).fill(null);
        let completed = 0;
        let firstShown = false;

        // 预计算正方形遮罩alpha（含腐蚀+过渡）
        const edgeBlend = node.edgeBlend || 15;
        const sizeScale = squareSize / 1024;
        const scaledBlend = Math.round(edgeBlend * sizeScale);
        const erodeR = Math.max(1, Math.round(scaledBlend * 0.6));
        const fadeR = Math.max(1, scaledBlend - erodeR);
        console.log('[像素遮罩回切] 边缘融合:', edgeBlend, 'px → erode:', erodeR, 'fade:', fadeR);
        const maskSqData = maskSquare.getContext('2d').getImageData(0, 0, squareSize, squareSize).data;
        const sqAlpha = new Float32Array(squareSize * squareSize);
        for (let i = 0; i < squareSize * squareSize; i++) sqAlpha[i] = maskSqData[i * 4 + 3] / 255;
        _pmcProcessMaskAlpha(sqAlpha, squareSize, squareSize, erodeR, fadeR);

        const tasks = Array.from({ length: count }, (_, idx) => (async () => {
            try {
                const result = await generateImage({
                    prompt: prompt, aspectRatio: '1:1',
                    resolution: squareResolution, referenceImages: referenceImages, model: model,
                    imageSize: squareResolution
                });
                let imageUrl = null;
                if (result.type === 'immediate') imageUrl = result.url;
                else if (result.type === 'async') {
                    if (result.isMidJourney && typeof pollMidJourneyTask === 'function') {
                        imageUrl = (await pollMidJourneyTask(result.taskId)).url;
                    } else if (typeof pollImageTask === 'function') {
                        imageUrl = (await pollImageTask(result.taskId)).url;
                    }
                }
                if (imageUrl) imageUrl = normalizeCanvasImageUrl(imageUrl);

                // ===== 第6步：从AI正方形结果中裁剪原图区域并回切 =====
                if (imageUrl) {
                    const aiImg = await _pmcLoadImg(imageUrl, true);
                    const aiNatW = aiImg.naturalWidth, aiNatH = aiImg.naturalHeight;
                    console.log('[像素遮罩回切] AI结果:', aiNatW, 'x', aiNatH, '正方形:', squareSize);

                    // AI结果缩放到正方形尺寸
                    const aiSqC = document.createElement('canvas');
                    aiSqC.width = squareSize; aiSqC.height = squareSize;
                    aiSqC.getContext('2d').drawImage(aiImg, 0, 0, squareSize, squareSize);

                    // 在正方形上做遮罩混合
                    const outSqC = document.createElement('canvas');
                    outSqC.width = squareSize; outSqC.height = squareSize;
                    const outSqCtx = outSqC.getContext('2d');
                    outSqCtx.drawImage(srcSquare, 0, 0);
                    const aiSqData = aiSqC.getContext('2d').getImageData(0, 0, squareSize, squareSize).data;
                    const outSqData = outSqCtx.getImageData(0, 0, squareSize, squareSize);
                    const px = outSqData.data;
                    for (let i = 0; i < squareSize * squareSize; i++) {
                        const a = sqAlpha[i];
                        if (a < 0.005) continue;
                        const p = i * 4;
                        px[p]     = Math.round(aiSqData[p]     * a + px[p]     * (1 - a));
                        px[p + 1] = Math.round(aiSqData[p + 1] * a + px[p + 1] * (1 - a));
                        px[p + 2] = Math.round(aiSqData[p + 2] * a + px[p + 2] * (1 - a));
                        px[p + 3] = 255;
                    }
                    outSqCtx.putImageData(outSqData, 0, 0);

                    // 从正方形中精确裁剪出原图区域
                    const finalC = document.createElement('canvas');
                    finalC.width = origW; finalC.height = origH;
                    finalC.getContext('2d').drawImage(outSqC,
                        offsetX, offsetY, scaledW, scaledH,
                        0, 0, origW, origH
                    );
                    const compositeUrl = finalC.toDataURL('image/png');
                    results[idx] = compositeUrl;
                    console.log('[像素遮罩回切] 裁剪回原图:', `从(${offsetX},${offsetY}) ${scaledW}x${scaledH} → ${origW}x${origH}`);

                    if (!firstShown) {
                        firstShown = true;
                        node.resultUrl = compositeUrl;
                        if (previewEl) {
                            const genOverlay = document.getElementById(`pmc-generating-${nodeId}`);
                            if (genOverlay) genOverlay.remove();
                            previewEl.innerHTML = `<img src="${compositeUrl}" class="w-full h-full object-contain"/>`;
                        }
                    }
                }
            } finally {
                completed++;
                const genText = document.querySelector(`#pmc-generating-${nodeId} div`);
                if (genText && count > 1) genText.textContent = `🎭 正在生成 (${completed}/${count})...`;
            }
        })());

        await Promise.allSettled(tasks);
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
        if (successImages.length === 0) throw new Error('生成失败，请重试');
        updateMultiImageButton(nodeId);
        if (node.resultImages.length > 0) updateImageGallery(node);
        console.log('[像素遮罩回切] 完成，共', node.resultImages.length, '张（正方形扩图回切）');
        if (typeof showToast === 'function') showToast(`生成完成！共 ${node.resultImages.length} 张`);
    } catch (err) {
        console.error('[像素遮罩回切] 错误:', err);
        const genOverlay = document.getElementById(`pmc-generating-${nodeId}`);
        if (genOverlay) genOverlay.remove();
        if (typeof showToast === 'function') showToast('生成失败: ' + (err.message || err), 'error');
    } finally {
        if (runBtn) { runBtn.disabled = false; runBtn.style.opacity = '1'; }
    }
}



// ==================== 全屏/下载/发送 ====================
function pmcFullscreen(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : (node.resultUrl || (node.inputImages[0] && (node.inputImages[0].url || node.inputImages[0].previewUrl)));
    if (!url) { if (typeof showToast === 'function') showToast('暂无图片可查看', 'warning'); return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    overlay.onclick = () => overlay.remove();
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;';
    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

async function pmcDownload(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : node.resultUrl;
    if (!url) { if (typeof showToast === 'function') showToast('暂无结果可下载', 'warning'); return; }
    try {
        let blob;
        if (url.startsWith('data:') && typeof dataURLtoBlob === 'function') {
            blob = dataURLtoBlob(url);
        } else {
            blob = await (await fetch(url)).blob();
        }
        const filename = `pixel-mask-cutback-${Date.now()}.png`;
        if (typeof saveToDownloadDir === 'function') {
            const saved = await saveToDownloadDir(blob, filename);
            if (saved) { if (typeof showToast === 'function') showToast('已保存到下载目录'); return; }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        if (typeof showToast === 'function') showToast('下载成功');
    } catch (err) {
        console.error('[PMC下载] 错误:', err);
        if (typeof showToast === 'function') showToast('下载失败', 'error');
    }
}

function pmcSendToCanvas(nodeId) {
    const node = CanvasNodeSystem.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const url = node.resultImages && node.resultImages.length > 0
        ? node.resultImages[node.currentImageIndex || 0]
        : node.resultUrl;
    if (!url) { if (typeof showToast === 'function') showToast('暂无结果可发送', 'warning'); return; }
    if (typeof createImageNode === 'function') {
        createImageNode(url, 'pixel-mask-cutback-result.png', node.x + node.width + 50, node.y);
        if (typeof showToast === 'function') showToast('已发送到画布');
    }
}

// ==================== 全局导出 ====================
window.createPixelMaskCutbackNodeAtPos = createPixelMaskCutbackNodeAtPos;
window.renderPixelMaskCutbackNode = renderPixelMaskCutbackNode;
window.updatePMCRefs = updatePMCRefs;
window.pmcUpdatePrompt = pmcUpdatePrompt;
window.pmcUpdateModel = pmcUpdateModel;
window.pmcUpdateRatio = pmcUpdateRatio;
window.pmcUpdateResolution = pmcUpdateResolution;
window.pmcUpdateEdgeBlend = pmcUpdateEdgeBlend;
window.pmcToggleCount = pmcToggleCount;
window.pmcOpenBrush = pmcOpenBrush;
window.pmcCloseBrush = pmcCloseBrush;
window.pmcSetBrushSize = pmcSetBrushSize;
window.pmcSetBrushOpacity = pmcSetBrushOpacity;
window.pmcSetEraseMode = pmcSetEraseMode;
window.pmcToggleFillInside = pmcToggleFillInside;
window.pmcUndoStroke = pmcUndoStroke;
window.pmcClearMask = pmcClearMask;
window.pmcInvertMask = pmcInvertMask;
window.runPixelMaskCutback = runPixelMaskCutback;
window.pmcFullscreen = pmcFullscreen;
window.pmcDownload = pmcDownload;
window.pmcSendToCanvas = pmcSendToCanvas;
