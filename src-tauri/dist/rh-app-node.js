/**
 * RH应用节点 - RunningHub 应用节点系统
 * 独立模块，依赖 canvas-nodes.js 中的全局变量和函数
 * 
 * 特性：
 * - 参数设置面板（类似 RunningHub 工作台）
 * - IMAGE 字段支持点击上传和拖拽上传（无需连接图片节点）
 * - INT/FLOAT 字段支持滑块拖拽调节
 * - 生成结果自动发送到画布
 */

(function() {
'use strict';

// ==================== 创建节点 ====================

function createRhAppNodeAtPos(x, y, config) {
    var id = 'node_' + (++CanvasNodeSystem.nodeIdCounter) + '_' + Date.now();
    var node = {
        id: id, type: NODE_TYPES.RH_APP, x: x, y: y,
        width: 420, height: 380,
        inputImages: [],
        rhAppId: (config && config.rhAppId) || '',
        webappId: (config && config.webappId) || '',
        appName: (config && config.appName) || 'RH应用',
        workflowNodes: (config && config.nodes) || [],
        resultUrl: null,
        resultImages: [],
        currentImageIndex: 0,
        isGenerating: false,
        isLoadingParams: false,
        autoSendToCanvas: true
    };
    pushUndoState(captureCanvasState());
    CanvasNodeSystem.nodes.push(node);
    renderRhAppNode(node);
    hideEmptyHint();
    return id;
}

function createRhAppNodeAtPosWithConnection(x, y) {
    var nodeId = createRhAppNodeAtPos(x, y);
    if (CanvasNodeSystem.pendingConnectionFrom) {
        var info = CanvasNodeSystem.pendingConnectionFrom;
        var fromNode = CanvasNodeSystem.nodes.find(function(n) { return n.id === info.nodeId; });
        var toNode = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
        if (fromNode && toNode) {
            var imageUrl = null;
            if (fromNode.type === NODE_TYPES.IMAGE && fromNode.imageUrl) {
                imageUrl = fromNode.imageUrl;
            } else if (fromNode.resultUrl) {
                imageUrl = fromNode.resultUrl;
            }
            if (imageUrl) {
                CanvasNodeSystem.connections.push({
                    from: info.nodeId, to: nodeId,
                    fromPort: info.fromPort || 'right', toPort: 'left'
                });
                toNode.inputImages.push({ nodeId: info.nodeId, url: imageUrl });
                renderConnections();
                updatePortConnectionStatus();
                updateRhAppRefs(toNode);
            }
        }
        CanvasNodeSystem.pendingConnectionFrom = null;
    }
    return nodeId;
}

// ==================== 图片上传处理 ====================

function _rhHandleImageUpload(nodeId, fieldIndex, file) {
    if (!file || !file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var dataUrl = e.target.result;
        var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
        if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;

        // 存储到字段
        node.workflowNodes[fieldIndex].fieldValue = dataUrl;
        node.workflowNodes[fieldIndex]._localImageData = dataUrl;
        node.workflowNodes[fieldIndex]._localFileName = file.name;

        // 更新预览
        var previewEl = document.getElementById('rh-img-preview-' + nodeId + '-' + fieldIndex);
        if (previewEl) {
            previewEl.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>'
                + '<button onclick="event.stopPropagation();_rhClearImageField(\'' + nodeId + '\',' + fieldIndex + ')" style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>';
        }
        var dropZone = document.getElementById('rh-img-drop-' + nodeId + '-' + fieldIndex);
        if (dropZone) dropZone.style.display = 'none';
        if (previewEl) previewEl.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function _rhClearImageField(nodeId, fieldIndex) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;
    node.workflowNodes[fieldIndex].fieldValue = '';
    node.workflowNodes[fieldIndex]._localImageData = null;
    node.workflowNodes[fieldIndex]._localFileName = null;

    var previewEl = document.getElementById('rh-img-preview-' + nodeId + '-' + fieldIndex);
    var dropZone = document.getElementById('rh-img-drop-' + nodeId + '-' + fieldIndex);
    if (previewEl) { previewEl.innerHTML = ''; previewEl.style.display = 'none'; }
    if (dropZone) dropZone.style.display = 'flex';
}

function _rhTriggerImageInput(nodeId, fieldIndex) {
    var inputId = 'rh-img-input-' + nodeId + '-' + fieldIndex;
    var input = document.getElementById(inputId);
    if (input) input.click();
}

function _rhOnImageInputChange(nodeId, fieldIndex, input) {
    if (input.files && input.files[0]) {
        _rhHandleImageUpload(nodeId, fieldIndex, input.files[0]);
    }
}

// ==================== 拖拽上传初始化 ====================

function _rhInitDragDrop(nodeId, fieldIndex) {
    var dropZone = document.getElementById('rh-img-drop-' + nodeId + '-' + fieldIndex);
    if (!dropZone || dropZone._rhDragInit) return;
    dropZone._rhDragInit = true;

    dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#3b82f6';
        dropZone.style.background = 'rgba(59,130,246,0.08)';
    });
    dropZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#bfdbfe';
        dropZone.style.background = '#f8fafc';
    });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#bfdbfe';
        dropZone.style.background = '#f8fafc';
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
            _rhHandleImageUpload(nodeId, fieldIndex, files[0]);
        }
    });
}

// ==================== 滑块拖拽值调节 ====================

function _rhSliderChange(nodeId, fieldIndex, value, displayId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;
    node.workflowNodes[fieldIndex].fieldValue = value;
    var display = document.getElementById(displayId);
    if (display) display.textContent = value;
}


// ==================== 渲染工作流字段（增强版） ====================

function renderRhAppWorkflowFields(node) {
    if (!node.workflowNodes || node.workflowNodes.length === 0) {
        return '<div style="text-align:center;padding:16px 0;font-size:12px;color:#93c5fd;">'
            + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;display:block;opacity:0.5;"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>'
            + '输入应用ID后点击加载参数</div>';
    }
    var hasLinkedImage = node.inputImages && node.inputImages.length > 0;
    return node.workflowNodes.map(function(field, idx) {
        if (field.fieldType === 'LIST') {
            var opts = parseTryLookOptions(field);
            if (opts.length > 0) {
                var isValid = opts.some(function(o) { return o.value === field.fieldValue; });
                if (!isValid || !field.fieldValue || String(field.fieldValue).startsWith('[')) {
                    field.fieldValue = opts[0].value;
                }
            }
        }
        var val = normalizeTryLookValue(field.fieldValue);
        var nid = node.id;
        var fid = 'rh-field-' + nid + '-' + idx;
        var label = '<div style="font-size:11px;font-weight:600;color:#1e40af;margin-bottom:4px;display:flex;align-items:center;gap:4px;">'
            + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;" title="' + field.nodeName + '">' + field.nodeName + '</span>'
            + '<span style="font-size:9px;color:#93c5fd;font-weight:400;">' + field.fieldType + '</span>'
            + '</div>';

        // === IMAGE 字段：点击/拖拽上传 ===
        if (field.fieldType === 'IMAGE') {
            var hasLocalImg = field._localImageData || (hasLinkedImage && node.inputImages.length > 0);
            var imgSrc = field._localImageData || (hasLinkedImage && node.inputImages[0] ? (node.inputImages[0].previewUrl || node.inputImages[0].url) : '');
            return '<div style="padding:10px;border-radius:10px;background:white;border:1px solid #dbeafe;margin-bottom:2px;">'
                + label
                + '<input type="file" id="rh-img-input-' + nid + '-' + idx + '" accept="image/*" style="display:none;" onchange="_rhOnImageInputChange(\'' + nid + '\',' + idx + ',this)"/>'
                // 拖拽上传区域
                + '<div id="rh-img-drop-' + nid + '-' + idx + '" onclick="_rhTriggerImageInput(\'' + nid + '\',' + idx + ')" style="display:' + (hasLocalImg ? 'none' : 'flex') + ';flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px 12px;border:2px dashed #bfdbfe;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.2s;">'
                    + '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>'
                    + '<span style="font-size:11px;color:#64748b;">点击上传或拖拽图片到此处</span>'
                    + '<span style="font-size:10px;color:#94a3b8;">支持 JPG / PNG / WebP</span>'
                + '</div>'
                // 图片预览区域
                + '<div id="rh-img-preview-' + nid + '-' + idx + '" style="display:' + (hasLocalImg ? 'block' : 'none') + ';position:relative;width:100%;height:80px;border-radius:6px;overflow:hidden;border:1px solid #dbeafe;">'
                    + (imgSrc ? '<img src="' + imgSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/><button onclick="event.stopPropagation();_rhClearImageField(\'' + nid + '\',' + idx + ')" style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>' : '')
                + '</div>'
                + (hasLinkedImage ? '<div style="font-size:10px;color:#3b82f6;margin-top:4px;display:flex;align-items:center;gap:4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>已由连线提供</div>' : '')
                + '</div>';
        }

        // === STRING 字段：文本输入 ===
        if (field.fieldType === 'STRING') {
            var isLong = val.length > 40;
            return '<div style="padding:10px;border-radius:10px;background:white;border:1px solid #e0e7ff;margin-bottom:2px;">'
                + label
                + (isLong
                    ? '<textarea id="' + fid + '" onchange="updateRhAppField(\'' + nid + '\',' + idx + ',this.value)" placeholder="' + (field.description || '输入文本') + '" style="width:100%;min-height:56px;padding:6px 10px;font-size:12px;border:1px solid #bfdbfe;border-radius:6px;outline:none;background:#f8fafc;color:#1e3a5f;resize:vertical;font-family:inherit;box-sizing:border-box;">' + val + '</textarea>'
                    : '<input type="text" id="' + fid + '" value="' + val + '" onchange="updateRhAppField(\'' + nid + '\',' + idx + ',this.value)" placeholder="' + (field.description || '输入文本') + '" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid #bfdbfe;border-radius:6px;outline:none;background:#f8fafc;color:#1e3a5f;box-sizing:border-box;"/>')
                + '</div>';
        }

        // === LIST 字段：下拉选择 ===
        if (field.fieldType === 'LIST') {
            var options = parseTryLookOptions(field);
            var optHtml = options.map(function(o) { return '<option value="' + o.value + '"' + (val === o.value ? ' selected' : '') + '>' + o.label + '</option>'; }).join('');
            return '<div style="padding:10px;border-radius:10px;background:white;border:1px solid #e0e7ff;margin-bottom:2px;">'
                + label
                + '<select id="' + fid + '" onchange="updateRhAppField(\'' + nid + '\',' + idx + ',this.value)" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid #bfdbfe;border-radius:6px;outline:none;background:white;color:#1e3a5f;cursor:pointer;box-sizing:border-box;">' + optHtml + '</select>'
                + '</div>';
        }

        // === INT/FLOAT 字段：滑块 + 数值输入（类似 RunningHub 工作台） ===
        if (field.fieldType === 'INT' || field.fieldType === 'FLOAT') {
            var numVal = parseFloat(val) || 0;
            var isFloat = field.fieldType === 'FLOAT';
            var step = isFloat ? '0.01' : '1';
            // 智能推断范围
            var min = 0, max = 100;
            if (field.fieldData) {
                try {
                    var fd = typeof field.fieldData === 'string' ? JSON.parse(field.fieldData) : field.fieldData;
                    if (fd.min !== undefined) min = fd.min;
                    if (fd.max !== undefined) max = fd.max;
                    if (fd.step !== undefined) step = String(fd.step);
                } catch(e) {}
            }
            if (min === 0 && max === 100) {
                // 根据当前值推断合理范围
                if (numVal > 100) max = Math.ceil(numVal * 2);
                if (numVal < 0) min = Math.floor(numVal * 2);
                if (isFloat && numVal <= 1) { min = 0; max = 1; step = '0.01'; }
                if (!isFloat && numVal > 1000) { max = 10000; }
            }
            var displayId = 'rh-slider-val-' + nid + '-' + idx;
            return '<div style="padding:10px;border-radius:10px;background:white;border:1px solid #e0e7ff;margin-bottom:2px;">'
                + label
                + '<div style="display:flex;align-items:center;gap:8px;">'
                    + '<input type="range" id="rh-slider-' + nid + '-' + idx + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + numVal + '" oninput="_rhSliderChange(\'' + nid + '\',' + idx + ',this.value,\'' + displayId + '\');document.getElementById(\'' + fid + '\').value=this.value;" style="flex:1;min-width:0;height:4px;-webkit-appearance:none;background:linear-gradient(90deg,#3b82f6 ' + (((numVal - min) / (max - min)) * 100) + '%,#e2e8f0 ' + (((numVal - min) / (max - min)) * 100) + '%);border-radius:2px;cursor:pointer;outline:none;"/>'
                    + '<input type="number" id="' + fid + '" value="' + numVal + '" min="' + min + '" max="' + max + '" step="' + step + '" onchange="updateRhAppField(\'' + nid + '\',' + idx + ',this.value);var s=document.getElementById(\'rh-slider-' + nid + '-' + idx + '\');if(s)s.value=this.value;_rhSliderChange(\'' + nid + '\',' + idx + ',this.value,\'' + displayId + '\')" style="width:60px;padding:4px 6px;font-size:11px;border:1px solid #bfdbfe;border-radius:4px;outline:none;background:#f8fafc;color:#1e3a5f;text-align:center;font-family:monospace;"/>'
                + '</div>'
                + '</div>';
        }

        // === SWITCH 字段：开关 ===
        if (field.fieldType === 'SWITCH') {
            var isOn = val === 'true' || val === true;
            return '<div style="padding:10px;border-radius:10px;background:white;border:1px solid #e0e7ff;margin-bottom:2px;">'
                + '<div style="display:flex;align-items:center;justify-content:space-between;">'
                    + '<div style="font-size:11px;font-weight:600;color:#1e40af;">' + field.nodeName + '</div>'
                    + '<label style="position:relative;display:inline-flex;align-items:center;cursor:pointer;">'
                        + '<input type="checkbox" id="' + fid + '" ' + (isOn ? 'checked' : '') + ' onchange="updateRhAppField(\'' + nid + '\',' + idx + ',this.checked?\'true\':\'false\')" style="position:absolute;opacity:0;width:0;height:0;"/>'
                        + '<div style="width:36px;height:20px;background:' + (isOn ? '#3b82f6' : '#cbd5e1') + ';border-radius:10px;position:relative;transition:background 0.2s;cursor:pointer;" onclick="var cb=this.previousElementSibling;cb.checked=!cb.checked;cb.dispatchEvent(new Event(\'change\'));this.style.background=cb.checked?\'#3b82f6\':\'#cbd5e1\';this.querySelector(\'div\').style.transform=cb.checked?\'translateX(16px)\':\'translateX(0)\';">'
                            + '<div style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:white;border-radius:50%;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);transform:' + (isOn ? 'translateX(16px)' : 'translateX(0)') + ';"></div>'
                        + '</div>'
                    + '</label>'
                + '</div>'
                + '</div>';
        }
        return '';
    }).join('');
}


// ==================== 渲染节点（白底蓝色点缀） ====================

function renderRhAppNode(node) {
    var container = document.getElementById('nodes-layer');
    if (!container) return;
    if (!node.resultImages) node.resultImages = [];
    if (!node.currentImageIndex) node.currentImageIndex = 0;
    if (!node.workflowNodes) node.workflowNodes = [];
    if (node.autoSendToCanvas === undefined) node.autoSendToCanvas = true;

    var oldEl = document.getElementById('node-' + node.id);
    if (oldEl) oldEl.remove();

    var pw = Math.max(node.width, 480);
    var curImg = (node.resultImages.length > 0) ? node.resultImages[node.currentImageIndex || 0] : node.resultUrl;
    var imgCnt = node.resultImages.length;
    var fieldCnt = node.workflowNodes.length;
    var nid = node.id;

    var el = document.createElement('div');
    el.id = 'node-' + nid;
    el.className = 'canvas-node rh-app-node absolute';
    el.style.cssText = 'left:' + node.x + 'px;top:' + node.y + 'px;';
    el.dataset.nodeId = nid;
    el.dataset.nodeType = node.type;

    // 预览区域
    var previewHtml = curImg
        ? '<img src="' + curImg + '" style="width:100%;height:100%;object-fit:cover;"/>'
        : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#eff6ff,#dbeafe);">'
            + '<div style="text-align:center;color:#64748b;font-size:13px;">'
            + '<div style="width:48px;height:48px;margin:0 auto 10px;background:white;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(59,130,246,0.15);border:1px solid #dbeafe;">'
            + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>'
            + '</div>'
            + '<div style="color:#475569;font-weight:500;">运行结果预览</div>'
            + '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">' + fieldCnt + ' 个参数</div>'
            + '</div></div>';

    el.innerHTML = ''
        // === 主体（白底蓝色边框） ===
        + '<div class="node-body" style="width:' + node.width + 'px;height:' + node.height + 'px;background:white;border:2px solid #dbeafe;position:relative;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(59,130,246,0.1);">'
            // 标题栏
            + '<div style="position:absolute;top:0;left:0;right:0;height:36px;background:linear-gradient(135deg,#eff6ff,#dbeafe);display:flex;align-items:center;gap:6px;padding:0 10px;z-index:20;border-bottom:1px solid #dbeafe;">'
                + '<div style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;box-shadow:0 1px 4px rgba(59,130,246,0.3);">RH</div>'
                + '<span style="font-size:11px;font-weight:600;color:#1e40af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">' + (node.appName || 'RH应用') + '</span>'
                + '<a href="https://www.runninghub.ai/?inviteCode=rh-v1159" target="_blank" onclick="event.stopPropagation();" style="font-size:9px;color:#f59e0b;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:1px 6px;text-decoration:none;white-space:nowrap;cursor:pointer;display:flex;align-items:center;gap:2px;flex-shrink:0;" title="注册RunningHub获得免费额度">'
                    + '<svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
                    + 'RH注册获得1000RH币！</a>'
                + '<div style="flex:1;"></div>'
                + '<div style="display:flex;align-items:center;gap:2px;">'
                    + (node.isLoadingParams ? '<div style="width:14px;height:14px;border:2px solid #93c5fd;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' : '')
                + '</div>'
            + '</div>'
            // 多图按钮
            + '<button id="multi-img-btn-rh-' + nid + '" onclick="event.stopPropagation();showRhAppImagePicker(\'' + nid + '\')" style="position:absolute;top:42px;right:8px;display:' + (imgCnt > 0 ? 'flex' : 'none') + ';align-items:center;gap:4px;padding:2px 8px;background:white;color:#3b82f6;font-size:11px;border-radius:999px;border:1px solid #dbeafe;cursor:pointer;z-index:20;box-shadow:0 1px 4px rgba(0,0,0,0.08);" title="查看所有生成结果">'
                + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
                + '<span id="img-count-rh-' + nid + '">' + imgCnt + '</span>'
            + '</button>'
            // 生成中遮罩
            + '<div id="generating-overlay-rh-' + nid + '" class="generating-overlay" style="display:' + (node.isGenerating ? 'flex' : 'none') + ';"><div class="generating-text">正在运行RH应用...</div><div class="generating-bar"></div></div>'
            // 预览（偏移标题栏高度）
            + '<div style="height:' + node.height + 'px;padding-top:36px;position:relative;overflow:hidden;" id="preview-rh-' + nid + '">'
                + '<div style="height:100%;position:relative;overflow:hidden;">' + previewHtml + '</div>'
            + '</div>'
            // 缩放角
            + '<div class="resize-corner" data-corner="se" style="position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;background:white;border:3px solid #3b82f6;border-radius:50%;cursor:se-resize;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:35;"></div>'
        + '</div>'

        // === 顶部工具栏 ===
        + '<div id="toolbar-panel-rh-' + nid + '" class="ai-toolbar-panel" style="position:absolute;left:50%;top:-50px;transform:translateX(-50%);background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.1);border:1px solid #e5e7eb;display:none;align-items:center;padding:4px 6px;gap:1px;white-space:nowrap;z-index:100;pointer-events:auto;">'
            + _rhToolbarBtn('rhAppFullscreen', nid, '#374151', 'none', '⛶ 全屏', '全屏查看')
            + '<div style="width:1px;height:18px;background:#e5e7eb;"></div>'
            + _rhToolbarBtn('rhAppDownload', nid, '#374151', 'none', '↓ 下载', '下载结果')
            + '<div style="width:1px;height:18px;background:#e5e7eb;"></div>'
            + _rhToolbarBtn('rhAppSendToCanvas', nid, '#3b82f6', 'none', '📤 发送', '发送到画布')
            + '<div style="width:1px;height:18px;background:#e5e7eb;"></div>'
            + '<button onclick="event.stopPropagation();window.deleteNode(\'' + nid + '\')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:#ef4444;background:none;border:none;border-radius:6px;cursor:pointer;" title="删除节点"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> 删除</button>'
        + '</div>'

        // === 底部参数面板（RunningHub 工作台风格） ===
        + '<div id="input-panel-rh-' + nid + '" class="ai-input-panel" style="position:absolute;left:50%;top:' + (node.height + 12) + 'px;transform:translateX(-50%);width:' + pw + 'px;background:white;border:1px solid #dbeafe;border-radius:14px;display:none;max-height:500px;overflow-y:auto;overflow-x:hidden;box-shadow:0 8px 32px rgba(59,130,246,0.12);">'
            + '<div style="padding:14px;">'
                // 参考图区域（连线传入的）
                + '<div style="display:flex;gap:8px;flex-wrap:wrap;min-height:32px;padding:8px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:10px;" id="refs-rh-' + nid + '"></div>'
                // 应用ID输入区
                + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #dbeafe;margin-bottom:12px;">'
                    + '<div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
                        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>'
                    + '</div>'
                    + '<input type="text" id="rh-app-id-' + nid + '" value="' + (node.rhAppId || '') + '" onchange="updateRhAppId(\'' + nid + '\',this.value)" placeholder="输入 RunningHub 应用 ID" style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #bfdbfe;border-radius:6px;outline:none;background:white;color:#1e3a5f;"/>'
                    + '<button onclick="event.stopPropagation();loadRhAppParams(\'' + nid + '\')" style="padding:6px 14px;font-size:12px;font-weight:500;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,0.25);display:flex;align-items:center;gap:4px;white-space:nowrap;" title="加载应用参数">'
                        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'
                        + '加载</button>'
                + '</div>'
                // 加载中
                + '<div id="rh-loading-' + nid + '" style="display:none;text-align:center;padding:12px 0;"><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3b82f6;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70" stroke-linecap="round"/></svg>正在加载应用参数...</span></div>'
                // 参数字段区域（工作台风格）
                + '<div id="rh-workflow-fields-' + nid + '" style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;">' + renderRhAppWorkflowFields(node) + '</div>'
                // 底部操作栏（运行 / 批量运行 / 批量设置）
                + '<div style="display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid #f1f5f9;">'
                    // 应用名称 + 自动发送
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                        + '<div style="flex:1;font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="rh-app-name-' + nid + '">' + (node.appName !== 'RH应用' ? node.appName : '') + '</div>'
                        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:10px;color:#64748b;" title="运行完成后自动发送结果到画布">'
                            + '<input type="checkbox" id="rh-auto-send-' + nid + '" ' + (node.autoSendToCanvas ? 'checked' : '') + ' onchange="var n=CanvasNodeSystem.nodes.find(function(n){return n.id===\'' + nid + '\'});if(n)n.autoSendToCanvas=this.checked;" style="width:14px;height:14px;accent-color:#3b82f6;cursor:pointer;"/>'
                            + '自动发送'
                        + '</label>'
                    + '</div>'
                    // 按钮行
                    + '<div style="display:flex;align-items:center;gap:6px;">'
                        // 运行按钮
                        + '<button onclick="runRhApp(\'' + nid + '\')" style="flex:1;padding:8px 0;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 2px 8px rgba(37,99,235,0.3);transition:all 0.2s;" onmouseover="this.style.boxShadow=\'0 4px 12px rgba(37,99,235,0.4)\'" onmouseout="this.style.boxShadow=\'0 2px 8px rgba(37,99,235,0.3)\'">'
                            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>'
                            + '运行</button>'
                        // 批量运行按钮
                        + '<button onclick="event.stopPropagation();rhBatchRun()" style="flex:1;padding:8px 0;background:white;color:#3b82f6;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'white\'" title="运行画布上所有RH应用节点">'
                            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>'
                            + '批量运行</button>'
                        // 批量设置按钮
                        + '<button onclick="event.stopPropagation();rhBatchSettings(\'' + nid + '\')" style="flex:1;padding:8px 0;background:white;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'white\'" title="将当前参数应用到所有同ID的RH应用节点">'
                            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>'
                            + '批量设置</button>'
                    + '</div>'
                + '</div>'
            + '</div>'
        + '</div>';

    el.addEventListener('mouseenter', function() { toggleNodePorts(nid, true); });
    el.addEventListener('mouseleave', function() { toggleNodePorts(nid, false); });
    el.querySelectorAll('.floating-port').forEach(function(port) {
        port.addEventListener('mouseenter', function() { toggleNodePorts(nid, true); });
        port.addEventListener('mouseleave', function() { toggleNodePorts(nid, false); });
    });
    container.appendChild(el);
    updateRhAppRefs(node);

    // 初始化拖拽上传区域
    setTimeout(function() {
        if (node.workflowNodes) {
            node.workflowNodes.forEach(function(field, idx) {
                if (field.fieldType === 'IMAGE') {
                    _rhInitDragDrop(nid, idx);
                }
            });
        }
        _rhInjectSliderStyles();
    }, 50);
}

function _rhToolbarBtn(fn, nid, color, bg, text, title) {
    return '<button onclick="event.stopPropagation();' + fn + '(\'' + nid + '\')" onmousedown="event.stopPropagation()" style="display:flex;align-items:center;gap:4px;padding:6px 10px;font-size:12px;color:' + color + ';background:' + bg + ';border:none;border-radius:6px;cursor:pointer;" title="' + title + '">' + text + '</button>';
}

// ==================== 滑块样式注入 ====================

function _rhInjectSliderStyles() {
    if (document.getElementById('rh-slider-styles')) return;
    var style = document.createElement('style');
    style.id = 'rh-slider-styles';
    style.textContent = ''
        + '.rh-app-node input[type="range"]::-webkit-slider-thumb {'
        + '  -webkit-appearance:none;width:14px;height:14px;background:white;border:2px solid #3b82f6;border-radius:50%;cursor:pointer;box-shadow:0 1px 4px rgba(59,130,246,0.3);transition:all 0.15s;'
        + '}'
        + '.rh-app-node input[type="range"]::-webkit-slider-thumb:hover {'
        + '  transform:scale(1.2);box-shadow:0 2px 8px rgba(59,130,246,0.4);'
        + '}'
        + '.rh-app-node input[type="range"]::-moz-range-thumb {'
        + '  width:14px;height:14px;background:white;border:2px solid #3b82f6;border-radius:50%;cursor:pointer;box-shadow:0 1px 4px rgba(59,130,246,0.3);'
        + '}'
        + '.rh-app-node input[type="range"]::-webkit-slider-runnable-track {'
        + '  height:4px;border-radius:2px;'
        + '}'
        + '.rh-app-node input[type="range"]:focus { outline:none; }'
        + '@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }';
    document.head.appendChild(style);
}


// ==================== 参考图管理 ====================

function updateRhAppRefs(node) {
    var el = document.getElementById('refs-rh-' + node.id);
    if (!el) return;

    if (!node.inputImages || node.inputImages.length === 0) {
        el.innerHTML = '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8;">'
            + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"/><path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>'
            + '<span>连接图片节点可传入参考图（可选）</span></div>';
    } else {
        el.innerHTML = '<div style="display:flex;align-items:center;gap:6px;margin-right:8px;font-size:11px;color:#64748b;">'
            + '<span>参考图:</span>'
            + '<span style="padding:1px 6px;background:#eff6ff;border-radius:4px;border:1px solid #bfdbfe;font-size:10px;color:#3b82f6;font-weight:500;">' + node.inputImages.length + '</span></div>'
            + node.inputImages.map(function(img, i) {
                var displayUrl = img.previewUrl || img.url;
                return '<div style="position:relative;" class="group">'
                    + '<img src="' + displayUrl + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:2px solid #dbeafe;cursor:pointer;" onclick="event.stopPropagation();openChatMediaFullscreen(\'' + img.url + '\',\'image\')"/>'
                    + '<span style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#3b82f6;color:white;font-size:9px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,0.2);">' + (i+1) + '</span>'
                    + '<button onclick="event.stopPropagation();removeRhAppRef(\'' + node.id + '\',\'' + img.nodeId + '\')" style="position:absolute;top:-4px;left:-4px;width:16px;height:16px;background:rgba(0,0,0,0.7);color:white;font-size:10px;border-radius:50%;border:none;cursor:pointer;display:none;align-items:center;justify-content:center;" onmouseover="this.style.display=\'flex\'" onmouseout="this.style.display=\'none\'">×</button>'
                    + '</div>';
            }).join('');
    }
    updateRhAppImageFieldState(node);
}

function updateRhAppImageFieldState(node) {
    if (!node || !node.workflowNodes) return;
    var hasLinkedImage = node.inputImages && node.inputImages.length > 0;
    node.workflowNodes.forEach(function(field, idx) {
        if (field.fieldType !== 'IMAGE') return;
        // 如果有连线图片且没有本地上传，显示连线图片预览
        if (hasLinkedImage && !field._localImageData) {
            var img = node.inputImages[0];
            if (img) {
                var previewEl = document.getElementById('rh-img-preview-' + node.id + '-' + idx);
                var dropZone = document.getElementById('rh-img-drop-' + node.id + '-' + idx);
                if (previewEl && dropZone) {
                    var imgSrc = img.previewUrl || img.url;
                    previewEl.innerHTML = '<img src="' + imgSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>'
                        + '<div style="position:absolute;bottom:2px;left:2px;font-size:9px;color:white;background:rgba(59,130,246,0.8);padding:1px 6px;border-radius:4px;">连线传入</div>';
                    previewEl.style.display = 'block';
                    dropZone.style.display = 'none';
                }
                if (img.fileName) field.fieldValue = img.fileName;
            }
        }
    });
}

function removeRhAppRef(nodeId, fromId) {
    deleteConnection(fromId, nodeId);
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    node.inputImages = node.inputImages.filter(function(img) { return img.nodeId !== fromId; });
    updateRhAppRefs(node);
}

// ==================== 字段更新 ====================

function updateRhAppField(nodeId, fieldIndex, value) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.workflowNodes || !node.workflowNodes[fieldIndex]) return;
    node.workflowNodes[fieldIndex].fieldValue = value;
}

function updateRhAppId(nodeId, value) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    node.rhAppId = value;
}

// ==================== 加载应用参数 ====================

function loadRhAppParams(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;

    var appId = node.rhAppId || '';
    var idInput = document.getElementById('rh-app-id-' + nodeId);
    if (idInput) appId = idInput.value.trim();
    if (!appId) {
        if (typeof showToast === 'function') showToast('请输入应用ID', 'error');
        return;
    }
    node.rhAppId = appId;

    var rhKey = (typeof apiConfig !== 'undefined' && apiConfig.runninghubApiKey) ? apiConfig.runninghubApiKey : '';
    if (!rhKey) {
        if (typeof showToast === 'function') showToast('请先在设置中配置 RunningHub API Key', 'error');
        return;
    }

    node.isLoadingParams = true;
    var loadingEl = document.getElementById('rh-loading-' + nodeId);
    if (loadingEl) loadingEl.style.display = 'block';

    var url = 'https://www.runninghub.cn/api/webapp/apiCallDemo?apiKey=' + encodeURIComponent(rhKey) + '&webappId=' + encodeURIComponent(appId);

    fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    })
    .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
    })
    .then(function(result) {
        node.isLoadingParams = false;
        if (loadingEl) loadingEl.style.display = 'none';

        if (result.code !== 0 || !result.data || !result.data.nodeInfoList) {
            if (typeof showToast === 'function') showToast(result.msg || '获取应用参数失败', 'error');
            return;
        }

        var nodeInfoList = result.data.nodeInfoList.map(function(item) {
            return {
                nodeId: item.nodeId || '',
                nodeName: item.nodeName || item.fieldName || '',
                fieldName: item.fieldName || '',
                fieldType: item.fieldType || 'STRING',
                fieldValue: item.fieldValue || '',
                description: item.description || '',
                fieldData: item.fieldData || item.field_data || item.options || undefined
            };
        });

        node.workflowNodes = nodeInfoList;
        node.webappId = appId;
        node.appName = result.data.webappName || 'RH应用';

        var nameEl = document.getElementById('rh-app-name-' + nodeId);
        if (nameEl) nameEl.textContent = node.appName;
        var nodeEl = document.getElementById('node-' + nodeId);
        if (nodeEl) {
            var span = nodeEl.querySelector('.node-body > div:first-child span');
            if (span) span.textContent = node.appName;
        }

        var fieldsEl = document.getElementById('rh-workflow-fields-' + nodeId);
        if (fieldsEl) {
            fieldsEl.innerHTML = renderRhAppWorkflowFields(node);
            // 初始化新渲染的拖拽区域
            setTimeout(function() {
                node.workflowNodes.forEach(function(field, idx) {
                    if (field.fieldType === 'IMAGE') {
                        _rhInitDragDrop(nodeId, idx);
                    }
                });
            }, 50);
        }

        if (typeof showToast === 'function') showToast('已加载 ' + node.workflowNodes.length + ' 个参数', 'success');
    })
    .catch(function(err) {
        node.isLoadingParams = false;
        if (loadingEl) loadingEl.style.display = 'none';
        if (typeof showToast === 'function') showToast('加载失败: ' + err.message, 'error');
    });
}

// ==================== 运行应用 ====================

function runRhApp(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;

    if (!node.rhAppId && !node.webappId) {
        if (typeof showToast === 'function') showToast('请先输入应用ID并加载参数', 'error');
        return;
    }

    node.isGenerating = true;
    var overlay = document.getElementById('generating-overlay-rh-' + nodeId);
    if (overlay) overlay.style.display = 'flex';

    var rhKey = (typeof apiConfig !== 'undefined' && apiConfig.runninghubApiKey) ? apiConfig.runninghubApiKey : '';

    // 收集字段值
    var nodes = (node.workflowNodes || []).map(function(field, idx) {
        var inputEl = document.getElementById('rh-field-' + nodeId + '-' + idx);
        if (inputEl) {
            if (inputEl.type === 'checkbox') {
                field.fieldValue = inputEl.checked ? 'true' : 'false';
            } else if (inputEl.tagName === 'SELECT' || inputEl.value !== '') {
                field.fieldValue = inputEl.value;
            }
        }
        return Object.assign({}, field);
    });

    // 处理图片字段：优先使用本地上传的图片，其次使用连线传入的
    var localUploadImages = [];
    nodes.forEach(function(field, idx) {
        if (field.fieldType === 'IMAGE') {
            var origField = node.workflowNodes[idx];
            if (origField && origField._localImageData) {
                localUploadImages.push({
                    fieldIndex: idx,
                    url: origField._localImageData,
                    name: origField._localFileName || 'input_' + idx + '.png'
                });
            }
        }
    });

    // 连线传入的图片
    if (node.inputImages && node.inputImages.length > 0) {
        var imageFields = nodes.filter(function(n) { return n.fieldType === 'IMAGE'; });
        node.inputImages.forEach(function(img, i) {
            if (imageFields[i] && !imageFields[i]._localImageData) {
                imageFields[i].fieldValue = img.fileName || img.url;
            }
        });
    }

    var inputData = {
        webappId: node.webappId || node.rhAppId,
        nodes: nodes,
        inputImages: (node.inputImages || []).map(function(img) { return img.url; }),
        apiKey: rhKey
    };

    // 收集需要上传的本地图片（包括直接上传的和连线传入的blob/data图片）
    var allLocalImages = localUploadImages.slice();
    (node.inputImages || []).forEach(function(img) {
        if (typeof img.url === 'string' && (img.url.startsWith('blob:') || img.url.startsWith('data:'))) {
            allLocalImages.push({ url: img.url, name: img.fileName || 'input.png' });
        }
    });

    function doRun() {
        var rhIframe = document.getElementById('rh-iframe');
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
        if (typeof showToast === 'function') showToast('已发送运行请求', 'success');
    }

    if (allLocalImages.length > 0 && typeof requestUploadFilesToRunningHub === 'function') {
        var files = allLocalImages.map(function(img) { return { url: img.url, name: img.name }; });
        requestUploadFilesToRunningHub(files).then(function(results) {
            results.forEach(function(r, i) {
                if (r && r.fileName) {
                    // 更新对应字段的值
                    if (i < localUploadImages.length) {
                        var fi = localUploadImages[i].fieldIndex;
                        if (nodes[fi]) nodes[fi].fieldValue = r.fileName;
                    }
                }
            });
            doRun();
        }).catch(function(err) {
            node.isGenerating = false;
            if (overlay) overlay.style.display = 'none';
            if (typeof showToast === 'function') showToast('上传失败: ' + err.message, 'error');
        });
    } else {
        doRun();
    }
}

// ==================== 完成处理 ====================

function handleRhAppComplete(nodeId, results) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;

    node.isGenerating = false;
    var overlay = document.getElementById('generating-overlay-rh-' + nodeId);
    if (overlay) overlay.style.display = 'none';

    if (results && results.length > 0) {
        var imageResults = results.filter(function(r) {
            return r.fileType === 'image' || (r.fileUrl && r.fileUrl.match(/\.(jpg|jpeg|png|gif|webp)/i));
        });
        var videoResults = results.filter(function(r) {
            return r.fileType === 'video' || (r.fileUrl && r.fileUrl.match(/\.(mp4|webm|mov)/i));
        });

        if (imageResults.length > 0) {
            node.resultImages = imageResults.map(function(r) { return r.fileUrl; });
            node.resultUrl = node.resultImages[0];
            node.currentImageIndex = 0;

            // 预加载后更新预览
            var tempImg = new Image();
            tempImg.onload = function() {
                var preview = document.getElementById('preview-rh-' + nodeId);
                if (preview) {
                    preview.innerHTML = '<div style="height:100%;position:relative;overflow:hidden;"><img src="' + node.resultUrl + '" style="width:100%;height:100%;object-fit:cover;"/></div>';
                }
            };
            tempImg.src = node.resultUrl;

            var btn = document.getElementById('multi-img-btn-rh-' + nodeId);
            var count = document.getElementById('img-count-rh-' + nodeId);
            if (btn) btn.style.display = 'flex';
            if (count) count.textContent = node.resultImages.length;

            if (typeof updateConnectedInputImage === 'function') {
                updateConnectedInputImage(nodeId, node.resultUrl);
            }

            // 自动发送到画布
            if (node.autoSendToCanvas) {
                imageResults.forEach(function(r, i) {
                    var newX = node.x + node.width + 80 + (i * 60);
                    var newY = node.y + (i * 40);
                    if (typeof createImageNode === 'function') {
                        createImageNode(r.fileUrl, 'rh_result_' + Date.now() + '_' + i + '.png', newX, newY);
                    }
                });
            }
        }

        // 视频结果也发送到画布
        if (videoResults.length > 0 && node.autoSendToCanvas) {
            videoResults.forEach(function(r, i) {
                var newX = node.x + node.width + 80;
                var newY = node.y + (imageResults.length * 40) + (i * 40);
                if (typeof createImageNode === 'function') {
                    createImageNode(r.fileUrl, 'rh_video_' + Date.now() + '_' + i + '.mp4', newX, newY);
                }
            });
        }

        if (typeof showToast === 'function') showToast('RH应用运行完成！', 'success');
    }
}

// ==================== 工具栏功能 ====================

function rhAppFullscreen(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.resultUrl) return;
    if (typeof openChatMediaFullscreen === 'function') openChatMediaFullscreen(node.resultUrl, 'image');
}

function rhAppDownload(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.resultUrl) return;
    var a = document.createElement('a');
    a.href = node.resultUrl;
    a.download = 'rh_app_' + nodeId + '_' + Date.now() + '.png';
    a.click();
}

function rhAppSendToCanvas(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.resultUrl) return;
    var newX = node.x + node.width + 80;
    var newY = node.y;
    if (typeof createImageNode === 'function') {
        createImageNode(node.resultUrl, 'rh_result_' + Date.now() + '.png', newX, newY);
    }
    if (typeof showToast === 'function') showToast('已发送到画布', 'success');
}

function showRhAppImagePicker(nodeId) {
    var node = CanvasNodeSystem.nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !node.resultImages || node.resultImages.length === 0) return;
    if (typeof showImagePicker === 'function') showImagePicker(nodeId);
}

// ==================== 批量运行 ====================

function rhBatchRun() {
    var rhNodes = CanvasNodeSystem.nodes.filter(function(n) {
        return n.type === NODE_TYPES.RH_APP && !n.isGenerating;
    });
    if (rhNodes.length === 0) {
        if (typeof showToast === 'function') showToast('画布上没有可运行的RH应用节点', 'warning');
        return;
    }
    // 过滤出已配置应用ID的节点
    var readyNodes = rhNodes.filter(function(n) { return n.rhAppId || n.webappId; });
    if (readyNodes.length === 0) {
        if (typeof showToast === 'function') showToast('没有已配置应用ID的RH节点', 'warning');
        return;
    }
    if (typeof showToast === 'function') showToast('⚡ 批量运行 ' + readyNodes.length + ' 个RH应用节点', 'success');
    readyNodes.forEach(function(node) {
        runRhApp(node.id);
    });
}

// ==================== 批量设置 ====================

function rhBatchSettings(sourceNodeId) {
    var sourceNode = CanvasNodeSystem.nodes.find(function(n) { return n.id === sourceNodeId; });
    if (!sourceNode) return;
    if (!sourceNode.workflowNodes || sourceNode.workflowNodes.length === 0) {
        if (typeof showToast === 'function') showToast('当前节点没有参数可同步', 'warning');
        return;
    }

    // 找到所有同应用ID的RH节点（排除自身）
    var appId = sourceNode.rhAppId || sourceNode.webappId;
    var targetNodes = CanvasNodeSystem.nodes.filter(function(n) {
        return n.id !== sourceNodeId
            && n.type === NODE_TYPES.RH_APP
            && (n.rhAppId === appId || n.webappId === appId);
    });

    if (targetNodes.length === 0) {
        // 没有同ID节点，同步到所有RH节点
        targetNodes = CanvasNodeSystem.nodes.filter(function(n) {
            return n.id !== sourceNodeId && n.type === NODE_TYPES.RH_APP;
        });
        if (targetNodes.length === 0) {
            if (typeof showToast === 'function') showToast('画布上没有其他RH应用节点', 'info');
            return;
        }
    }

    // 收集当前节点的字段值
    var fieldValues = {};
    sourceNode.workflowNodes.forEach(function(field, idx) {
        var inputEl = document.getElementById('rh-field-' + sourceNodeId + '-' + idx);
        if (inputEl) {
            if (inputEl.type === 'checkbox') {
                fieldValues[field.nodeName] = inputEl.checked ? 'true' : 'false';
            } else {
                fieldValues[field.nodeName] = inputEl.value;
            }
        } else {
            fieldValues[field.nodeName] = field.fieldValue;
        }
    });

    // 同步到目标节点
    var syncCount = 0;
    targetNodes.forEach(function(target) {
        if (!target.workflowNodes) return;
        target.workflowNodes.forEach(function(field, idx) {
            if (fieldValues[field.nodeName] !== undefined && field.fieldType !== 'IMAGE') {
                field.fieldValue = fieldValues[field.nodeName];
                syncCount++;
            }
        });
        // 同步应用ID和名称
        if (!target.rhAppId && appId) {
            target.rhAppId = appId;
            target.webappId = sourceNode.webappId;
            target.appName = sourceNode.appName;
            target.workflowNodes = JSON.parse(JSON.stringify(sourceNode.workflowNodes));
        }
        // 重新渲染字段
        var fieldsEl = document.getElementById('rh-workflow-fields-' + target.id);
        if (fieldsEl) fieldsEl.innerHTML = renderRhAppWorkflowFields(target);
        // 更新标题
        var nodeEl = document.getElementById('node-' + target.id);
        if (nodeEl) {
            var titleSpan = nodeEl.querySelector('.node-body > div:first-child span');
            if (titleSpan) titleSpan.textContent = target.appName || 'RH应用';
        }
    });

    if (typeof showToast === 'function') showToast('已同步参数到 ' + targetNodes.length + ' 个节点', 'success');
}

// ==================== 窗口导出 ====================

window.createRhAppNodeAtPos = createRhAppNodeAtPos;
window.createRhAppNodeAtPosWithConnection = createRhAppNodeAtPosWithConnection;
window.renderRhAppNode = renderRhAppNode;
window.renderRhAppWorkflowFields = renderRhAppWorkflowFields;
window.updateRhAppRefs = updateRhAppRefs;
window.removeRhAppRef = removeRhAppRef;
window.updateRhAppField = updateRhAppField;
window.updateRhAppId = updateRhAppId;
window.loadRhAppParams = loadRhAppParams;
window.runRhApp = runRhApp;
window.handleRhAppComplete = handleRhAppComplete;
window.rhAppFullscreen = rhAppFullscreen;
window.rhAppDownload = rhAppDownload;
window.rhAppSendToCanvas = rhAppSendToCanvas;
window.showRhAppImagePicker = showRhAppImagePicker;
window._rhHandleImageUpload = _rhHandleImageUpload;
window._rhClearImageField = _rhClearImageField;
window._rhTriggerImageInput = _rhTriggerImageInput;
window._rhOnImageInputChange = _rhOnImageInputChange;
window._rhSliderChange = _rhSliderChange;
window.rhBatchRun = rhBatchRun;
window.rhBatchSettings = rhBatchSettings;

})();
