/**
 * 认证模块 - 处理用户登录、注册、Token 管理
 * 集成到 AI 创意工坊
 */

// ==================== 配置 ====================
// 后端 API 地址 - 生产环境请修改为实际地址
const AUTH_API_BASE = localStorage.getItem('auth_api_base') || 'http://3.141.28.191:8000';

// ==================== 认证状态 ====================
let authState = {
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
    user: null,
    email: null,
    balance: null,
    isLoggedIn: false
};

// ==================== API 请求工具 ====================
async function authApiRequest(endpoint, options = {}) {
    const url = `${AUTH_API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authState.accessToken) {
        headers['Authorization'] = `Bearer ${authState.accessToken}`;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail?.message || data.detail || '请求失败');
        }
        
        return data;
    } catch (error) {
        if (error.message.includes('令牌') || error.message.includes('token')) {
            // Token 过期，尝试刷新
            const refreshed = await refreshAuthToken();
            if (refreshed) {
                return authApiRequest(endpoint, options);
            } else {
                authLogout(false);
            }
        }
        throw error;
    }
}

async function refreshAuthToken() {
    if (!authState.refreshToken) return false;
    
    try {
        const response = await fetch(`${AUTH_API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: authState.refreshToken })
        });
        
        if (response.ok) {
            const data = await response.json();
            authState.accessToken = data.access_token;
            authState.refreshToken = data.refresh_token;
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            return true;
        }
    } catch (e) {
        console.error('[Auth] Token 刷新失败:', e);
    }
    return false;
}

// ==================== 认证功能 ====================
async function authLogin(email, password) {
    const data = await authApiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    
    authState.accessToken = data.access_token;
    authState.refreshToken = data.refresh_token;
    authState.isLoggedIn = true;
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    
    await loadAuthUserInfo();
    return authState.user;
}

async function authRegister(email, password) {
    const data = await authApiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    
    authState.accessToken = data.access_token;
    authState.refreshToken = data.refresh_token;
    authState.isLoggedIn = true;
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    
    await loadAuthUserInfo();
    return authState.user;
}

function authLogout(showMessage = true) {
    authState.accessToken = null;
    authState.refreshToken = null;
    authState.user = null;
    authState.email = null;
    authState.balance = null;
    authState.isLoggedIn = false;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // 显示登录页面
    showAuthPage();
    
    // 更新画布上的积分显示（显示为 --）
    if (typeof updateCanvasPointsDisplay === 'function') {
        updateCanvasPointsDisplay();
    }
    
    if (showMessage) {
        showAuthToast('已退出登录', 'info');
    }
}

// ==================== 用户信息 ====================
async function loadAuthUserInfo() {
    try {
        authState.user = await authApiRequest('/auth/me');
        authState.isLoggedIn = true;
        authState.email = authState.user?.email || null;
        
        // 更新界面上的用户信息
        updateAuthUI();
        
        // 加载余额并更新画布显示
        await loadUserBalance();
        updateCanvasPointsDisplay();
        
        return authState.user;
    } catch (error) {
        console.error('[Auth] 加载用户信息失败:', error);
        authState.isLoggedIn = false;
        authState.email = null;
        throw error;
    }
}

async function loadUserBalance() {
    try {
        const data = await authApiRequest('/account/balance');
        authState.balance = data.points_balance;
        return data.points_balance;
    } catch (error) {
        console.error('[Auth] 加载余额失败:', error);
        authState.balance = 0;
        return 0;
    }
}

// ==================== UI 更新 ====================
function updateAuthUI() {
    // 更新导航栏用户信息
    const userEmailEl = document.getElementById('auth-user-email');
    const userPointsEl = document.getElementById('auth-user-points');
    const userAvatarEl = document.getElementById('auth-user-avatar');
    
    if (authState.user) {
        if (userEmailEl) userEmailEl.textContent = authState.user.email;
        if (userAvatarEl) userAvatarEl.textContent = authState.user.email.charAt(0).toUpperCase();
        
        // 加载积分
        loadUserBalance().then(balance => {
            if (userPointsEl) userPointsEl.textContent = balance.toLocaleString();
        });
    }
}

function showAuthPage() {
    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) {
        authOverlay.classList.remove('hidden');
        authOverlay.classList.add('active');
    }
}

function hideAuthPage() {
    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) {
        authOverlay.classList.add('hidden');
        authOverlay.classList.remove('active');
    }
}

function showAuthToast(message, type = 'info') {
    // 创建 toast 元素
    let container = document.getElementById('auth-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'auth-toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `auth-toast auth-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'authSlideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== 初始化检查 ====================
async function checkAuthStatus() {
    if (authState.accessToken) {
        try {
            await loadAuthUserInfo();
            console.log('[Auth] 用户已登录:', authState.user.email);
            hideAuthPage();
            return true;
        } catch (error) {
            console.log('[Auth] Token 无效，需要重新登录');
            authLogout(false);
            return false;
        }
    } else {
        console.log('[Auth] 未登录，显示登录页面');
        showAuthPage();
        return false;
    }
}

// ==================== 事件绑定 ====================
function initAuthEvents() {
    // 登录/注册标签切换
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-form-panel').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`auth-${btn.dataset.tab}-form`).classList.add('active');
        });
    });
    
    // 登录表单
    const loginForm = document.getElementById('auth-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-login-email').value;
            const password = document.getElementById('auth-login-password').value;
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            try {
                submitBtn.disabled = true;
                submitBtn.textContent = '登录中...';
                await authLogin(email, password);
                hideAuthPage();
                showAuthToast('登录成功！', 'success');
                // 登录后加载管理员配置的全局 API Key
                if (typeof loadGlobalApiConfig === 'function') {
                    loadGlobalApiConfig();
                }
            } catch (error) {
                showAuthToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '登录';
            }
        });
    }
    
    // 注册表单
    const registerForm = document.getElementById('auth-register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-register-email').value;
            const password = document.getElementById('auth-register-password').value;
            const confirm = document.getElementById('auth-register-confirm').value;
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            
            if (password !== confirm) {
                showAuthToast('两次密码输入不一致', 'error');
                return;
            }
            
            if (password.length < 8) {
                showAuthToast('密码至少需要8位', 'error');
                return;
            }
            
            try {
                submitBtn.disabled = true;
                submitBtn.textContent = '注册中...';
                await authRegister(email, password);
                hideAuthPage();
                showAuthToast('注册成功！', 'success');
            } catch (error) {
                showAuthToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '注册';
            }
        });
    }
    
    // 退出登录按钮
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => authLogout());
    }
    
    // 跳过登录（开发模式）
    const skipBtn = document.getElementById('auth-skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            hideAuthPage();
            showAuthToast('已跳过登录（开发模式）', 'info');
        });
    }
    
    // API 设置
    const apiSettingsBtn = document.getElementById('auth-api-settings-btn');
    if (apiSettingsBtn) {
        apiSettingsBtn.addEventListener('click', () => {
            const newUrl = prompt('请输入后端 API 地址:', AUTH_API_BASE || 'http://localhost:8000');
            if (newUrl !== null) {
                localStorage.setItem('auth_api_base', newUrl);
                showAuthToast('API 地址已更新，请刷新页面', 'info');
            }
        });
    }
}

// ==================== 积分消费系统 ====================

// 价格配置缓存
let pricingCache = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 获取所有模型价格配置
async function loadPricingConfig(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && pricingCache && (now - pricingCacheTime) < PRICING_CACHE_TTL) {
        return pricingCache;
    }
    
    try {
        const data = await authApiRequest('/pricing/list');
        // 后端直接返回数组，不是 { items: [...] }
        pricingCache = Array.isArray(data) ? data : (data.items || []);
        pricingCacheTime = now;
        console.log('[Points] 价格配置已加载:', pricingCache.length, '条');
        return pricingCache;
    } catch (error) {
        console.error('[Points] 加载价格配置失败:', error);
        return pricingCache || [];
    }
}

// 获取指定模型的价格
function getModelPrice(modelId, paramKey = 'default') {
    if (!pricingCache) return null;
    
    // 先精确匹配
    let pricing = pricingCache.find(p => 
        p.model_id === modelId && p.param_key === paramKey && p.enabled
    );
    
    // 如果没找到，尝试默认参数
    if (!pricing && paramKey !== 'default') {
        pricing = pricingCache.find(p => 
            p.model_id === modelId && p.param_key === 'default' && p.enabled
        );
    }
    
    return pricing;
}

// 检查余额是否充足
async function checkBalanceSufficient(modelId, paramKey = 'default') {
    if (!authState.isLoggedIn) {
        return { sufficient: true, message: '未登录，跳过检查', required: 0, balance: 0, skipBilling: true };
    }
    
    try {
        const data = await authApiRequest('/pricing/check', {
            method: 'POST',
            body: JSON.stringify({ model_id: modelId, param_key: paramKey })
        });
        return {
            sufficient: data.sufficient !== false,
            required: data.required || 0,
            balance: data.balance || authState.balance || 0,
            shortfall: data.shortfall || 0,
            model_name: data.model_name || modelId
        };
    } catch (error) {
        console.error('[Points] 检查余额失败:', error);
        // 如果是"价格配置不存在"的错误，说明这个功能不需要扣费
        if (error.message && error.message.includes('价格配置不存在')) {
            return { 
                sufficient: true, 
                message: error.message,
                required: 0, 
                balance: authState.balance || 0,
                skipBilling: true
            };
        }
        // 其他错误，默认允许（避免影响用户使用）
        return { 
            sufficient: true, 
            message: error.message || '检查余额失败，默认允许', 
            required: 0, 
            balance: authState.balance || 0,
            skipBilling: true
        };
    }
}

// 消费积分（生成成功后调用）
async function consumePoints(modelId, paramKey = 'default', requestId = null, note = null) {
    if (!authState.isLoggedIn) {
        return { success: false, message: '请先登录' };
    }
    
    // 生成唯一的请求ID
    const finalRequestId = requestId || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const data = await authApiRequest('/pricing/consume', {
            method: 'POST',
            body: JSON.stringify({
                model_id: modelId,
                param_key: paramKey,
                request_id: finalRequestId,
                note: note
            })
        });
        
        // 更新本地余额
        authState.balance = data.balance;
        updateCanvasPointsDisplay();
        updateAuthUI();
        
        console.log('[Points] 消费成功:', data.cost, '积分，余额:', data.balance);
        return { success: true, ...data };
    } catch (error) {
        console.error('[Points] 消费失败:', error);
        return { success: false, message: error.message || '积分扣除失败', request_id: finalRequestId };
    }
}

// 退款积分（生成失败后调用）
async function refundPoints(requestId, reason = '生成失败') {
    if (!authState.isLoggedIn || !requestId) {
        return { success: false, message: '无法退款' };
    }
    
    try {
        const data = await authApiRequest('/pricing/refund', {
            method: 'POST',
            body: JSON.stringify({
                request_id: requestId,
                reason: reason
            })
        });
        
        // 更新本地余额
        authState.balance = data.balance;
        updateCanvasPointsDisplay();
        updateAuthUI();
        
        console.log('[Points] 退款成功:', data.refunded, '积分，余额:', data.balance);
        showAuthToast(`生成失败，已退还 ${data.refunded} 积分`, 'info');
        return { success: true, ...data };
    } catch (error) {
        console.error('[Points] 退款失败:', error);
        return { success: false, message: error.message || '退款失败' };
    }
}

// 生成前检查（综合检查函数）
async function preGenerationCheck(modelId, paramKey = 'default') {
    // 跳过登录的用户不检查积分
    if (!authState.isLoggedIn) {
        console.log('[Points] 用户未登录，跳过积分检查');
        return { allowed: true, skipBilling: true };
    }
    
    // 映射模型ID（统一小写）
    const mappedModelId = mapModelId(modelId);
    console.log('[Points] 积分检查:', { original: modelId, mapped: mappedModelId, paramKey });
    
    // 确保价格配置已加载
    await loadPricingConfig();
    
    // 检查余额
    const check = await checkBalanceSufficient(mappedModelId, paramKey);
    
    // 如果后端返回错误（比如找不到价格配置），默认允许（不扣费）
    if (check.message && check.message.includes('价格配置不存在')) {
        console.warn('[Points] 未找到价格配置，跳过扣费:', mappedModelId);
        return { allowed: true, skipBilling: true };
    }
    
    // 如果需要0积分，直接允许
    if (check.required === 0) {
        console.log('[Points] 该功能免费，跳过扣费');
        return { allowed: true, skipBilling: true };
    }
    
    if (!check.sufficient) {
        // 余额不足，显示提示
        const shortfall = check.shortfall || Math.max(0, (check.required || 0) - (check.balance || 0));
        const message = `积分不足！生成 ${check.model_name || modelId} 需要 ${check.required || 0} 积分，当前余额 ${check.balance || 0} 积分，还差 ${shortfall} 积分。`;
        showAuthToast(message, 'error');
        
        // 打开积分详情弹窗
        setTimeout(() => openPointsDetailModal(), 500);
        
        return { 
            allowed: false, 
            message, 
            required: check.required || 0, 
            balance: check.balance || 0,
            shortfall: shortfall
        };
    }
    
    return { 
        allowed: true, 
        required: check.required, 
        balance: check.balance,
        model_name: check.model_name
    };
}

// 映射前端模型ID到后端模型ID
function mapModelId(frontendModelId, duration = null) {
    if (!frontendModelId) return 'default';
    
    // 统一转小写进行匹配
    const normalizedId = String(frontendModelId).toLowerCase().trim();
    
    // 模型ID映射（前端可能使用不同的命名）
    const modelMap = {
        // 图片模型
        // nano-banana-pro 系列 → 平台上对应 nano-banana-2 系列
        'nano-banana-pro': 'nano-banana-2',
        'nano-banana-pro-2k': 'nano-banana-2-2k',
        'nano-banana-pro-4k': 'nano-banana-2-4k',
        // nano-banana-2 系列 → 平台上对应 gemini-3.1-flash-image-preview 系列
        'nano-banana-2': 'nano-banana-2',
        'nano-banana-2-2k': 'nano-banana-2-2k',
        'nano-banana-2-4k': 'nano-banana-2-4k',
        'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image-preview',
        'gemini-3.1-flash-image-preview-2k': 'gemini-3.1-flash-image-preview-2k',
        'gemini-3.1-flash-image-preview-4k': 'gemini-3.1-flash-image-preview-4k',
        'flux-1.1-pro': 'flux-1.1-pro',
        'gpt-image-1.5': 'gpt-image-1.5',
        'gemini-imagen': 'gemini-imagen',
        'midjourney': 'midjourney',
        'mj_fast_imagine': 'midjourney',
        'mj_fast_blend': 'midjourney',
        // 视频模型
        'kling-video-o1': 'kling-o1',
        'kling-o1': 'kling-o1',
        'kling-video-v2-5-turbo': 'kling-v2-5-turbo',
        'kling-v2-5-turbo': 'kling-v2-5-turbo',
        'kling2.5-turbo': 'kling-v2-5-turbo',
        'kling-video': 'kling2.6',
        'kling-video-v2-6': 'kling2.6',
        'kling-v2-6': 'kling2.6',
        'kling2.6': 'kling2.6',
        'kling2.1': 'kling2.1',
        'veo3.1': 'veo3.1',
        'veo3': 'veo3',
        'veo2': 'veo2',
        'sora': 'sora',
        'sora-2': 'sora-2',
        'sora-2-pro': 'sora-2-pro',
        // 文本功能
        'ocr': 'text-extract',
        'translate': 'text-translate'
    };
    
    return modelMap[normalizedId] || normalizedId;
}

// 映射视频时长到参数键
function mapDurationToParamKey(duration, modelId) {
    if (!duration) return 'default';
    
    // 将秒数转为参数键
    const durationSec = parseInt(duration);
    if (isNaN(durationSec)) return 'default';
    
    // Veo 系列统一8秒
    if (modelId && modelId.startsWith('veo')) {
        return '8s';
    }
    
    return `${durationSec}s`;
}

// ==================== 生成任务管理 ====================

// 创建任务记录
async function createGenerationTask(taskData) {
    if (!authState.isLoggedIn) return null;
    
    try {
        const data = await authApiRequest('/tasks/create', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
        console.log('[Task] 任务创建成功:', data.id);
        return data;
    } catch (error) {
        console.error('[Task] 创建任务失败:', error);
        return null;
    }
}

// 更新任务状态
async function updateGenerationTask(taskId, updateData) {
    if (!authState.isLoggedIn || !taskId) return null;
    
    try {
        const data = await authApiRequest(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        console.log('[Task] 任务更新成功:', taskId, updateData);
        return data;
    } catch (error) {
        console.error('[Task] 更新任务失败:', error);
        return null;
    }
}

// 标记任务完成
async function completeGenerationTask(taskId, resultUrl) {
    if (!authState.isLoggedIn || !taskId) return null;
    
    try {
        const data = await authApiRequest(`/tasks/${taskId}/complete?result_url=${encodeURIComponent(resultUrl)}`, {
            method: 'POST'
        });
        console.log('[Task] 任务完成:', taskId);
        return data;
    } catch (error) {
        console.error('[Task] 标记完成失败:', error);
        return null;
    }
}

// 标记任务超时（不退款，可稍后刷新）
async function markTaskTimeout(taskId) {
    if (!authState.isLoggedIn || !taskId) return null;
    
    try {
        const data = await authApiRequest(`/tasks/${taskId}/timeout`, {
            method: 'POST'
        });
        console.log('[Task] 任务标记为超时:', taskId);
        showAuthToast('生成超时，请稍后在积分详情中刷新获取结果', 'warning');
        return data;
    } catch (error) {
        console.error('[Task] 标记超时失败:', error);
        return null;
    }
}

// 获取待处理任务列表
async function getPendingTasks() {
    if (!authState.isLoggedIn) return [];
    
    try {
        const data = await authApiRequest('/tasks/pending');
        return data.items || [];
    } catch (error) {
        console.error('[Task] 获取待处理任务失败:', error);
        return [];
    }
}

// 获取任务列表
async function getTaskList(page = 1, pageSize = 10, status = null) {
    if (!authState.isLoggedIn) return { items: [], total: 0 };
    
    try {
        let url = `/tasks/list?page=${page}&page_size=${pageSize}`;
        if (status) url += `&status=${status}`;
        const data = await authApiRequest(url);
        return data;
    } catch (error) {
        console.error('[Task] 获取任务列表失败:', error);
        return { items: [], total: 0 };
    }
}

// 申请任务退款
async function requestTaskRefund(taskId, reason = '用户确认任务失败') {
    if (!authState.isLoggedIn || !taskId) return null;
    
    try {
        const data = await authApiRequest(`/tasks/${taskId}/refund?reason=${encodeURIComponent(reason)}`, {
            method: 'POST'
        });
        
        // 更新本地余额
        if (data.balance !== undefined) {
            authState.balance = data.balance;
            updateCanvasPointsDisplay();
            updateAuthUI();
        }
        
        showAuthToast(`已退还 ${data.refunded} 积分`, 'success');
        return data;
    } catch (error) {
        console.error('[Task] 退款失败:', error);
        showAuthToast(error.message || '退款失败', 'error');
        return null;
    }
}

// ==================== 画布积分显示功能 ====================

// 更新画布上的积分显示
function updateCanvasPointsDisplay() {
    const canvasPointsEl = document.getElementById('canvas-points-value');
    if (canvasPointsEl) {
        if (authState.isLoggedIn && authState.balance != null && typeof authState.balance === 'number') {
            canvasPointsEl.textContent = authState.balance.toLocaleString();
        } else {
            canvasPointsEl.textContent = '--';
        }
    }
}

// 打开积分详情弹窗
async function openPointsDetailModal() {
    const modal = document.getElementById('points-detail-modal');
    const emailEl = document.getElementById('points-modal-email');
    const balanceEl = document.getElementById('points-modal-balance');
    const taskListEl = document.getElementById('points-modal-tasks');
    
    if (modal) {
        // 更新弹窗中的信息
        if (authState.isLoggedIn) {
            if (emailEl) emailEl.textContent = authState.email || '已登录用户';
            if (balanceEl) balanceEl.textContent = authState.balance !== null ? authState.balance.toLocaleString() : '--';
            
            // 刷新余额
            loadUserBalance().then(() => {
                if (balanceEl) balanceEl.textContent = authState.balance !== null ? authState.balance.toLocaleString() : '--';
                updateCanvasPointsDisplay();
            });
            
            // 加载任务列表
            if (taskListEl) {
                taskListEl.innerHTML = '<div class="loading-tasks">加载中...</div>';
                const tasks = await getPendingTasks();
                renderTaskList(taskListEl, tasks);
            }
        } else {
            if (emailEl) emailEl.textContent = '未登录';
            if (balanceEl) balanceEl.textContent = '--';
            if (taskListEl) taskListEl.innerHTML = '<div class="no-tasks">请先登录</div>';
        }
        modal.classList.remove('hidden');
    }
}

// 渲染任务列表
function renderTaskList(container, tasks) {
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="no-tasks">暂无待处理任务</div>';
        return;
    }
    
    const taskHtml = tasks.map(task => {
        const statusText = {
            'pending': '⏳ 等待中',
            'processing': '🔄 处理中',
            'completed': '✅ 已完成',
            'failed': '❌ 失败',
            'timeout': '⚠️ 超时'
        }[task.status] || task.status;
        
        const typeIcon = task.task_type === 'video' ? '🎬' : '📷';
        const time = new Date(task.created_at).toLocaleString('zh-CN', { 
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        });
        
        let actionButtons = '';
        if (task.result_url) {
            actionButtons += `<a href="${task.result_url}" target="_blank" class="task-btn task-download">下载</a>`;
        }
        if (task.can_refresh) {
            actionButtons += `<button class="task-btn task-refresh" onclick="refreshTaskStatus(${task.id})">刷新</button>`;
        }
        if (task.can_refund) {
            actionButtons += `<button class="task-btn task-refund" onclick="requestTaskRefund(${task.id})">退款</button>`;
        }
        
        return `
            <div class="task-item task-status-${task.status}" data-task-id="${task.id}">
                <div class="task-info">
                    <span class="task-type">${typeIcon}</span>
                    <span class="task-model">${task.model_id}</span>
                    <span class="task-status">${statusText}</span>
                    <span class="task-cost">-${task.points_cost}积分</span>
                    <span class="task-time">${time}</span>
                </div>
                <div class="task-prompt" title="${task.prompt || ''}">${task.prompt ? task.prompt.substring(0, 30) + '...' : '-'}</div>
                <div class="task-actions">${actionButtons}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="task-list-header">
            <span>待处理任务 (${tasks.length})</span>
            <button class="task-btn" onclick="refreshAllPendingTasks()">全部刷新</button>
        </div>
        <div class="task-list">${taskHtml}</div>
    `;
}

// 刷新单个任务状态（前端调用后端检查第三方API）
async function refreshTaskStatus(taskId) {
    showAuthToast('正在刷新任务状态...', 'info');
    
    // 这里需要前端自己去轮询第三方API，因为后端不存储第三方API的凭证
    // 我们先获取任务信息，然后根据provider和external_task_id去轮询
    try {
        const task = await authApiRequest(`/tasks/${taskId}`);
        
        if (!task.external_task_id) {
            showAuthToast('该任务没有外部任务ID，无法刷新', 'error');
            return;
        }
        
        // 通知app.js去轮询
        if (typeof window.manualPollTask === 'function') {
            const result = await window.manualPollTask(task.external_task_id, task.provider, task.task_type);
            if (result && result.url) {
                // 更新任务状态
                await completeGenerationTask(taskId, result.url);
                showAuthToast('获取结果成功！', 'success');
                // 刷新列表
                openPointsDetailModal();
            } else {
                showAuthToast('任务仍在处理中，请稍后再试', 'info');
            }
        } else {
            showAuthToast('刷新功能暂不可用', 'error');
        }
    } catch (error) {
        showAuthToast(error.message || '刷新失败', 'error');
    }
}

// 刷新所有待处理任务
async function refreshAllPendingTasks() {
    showAuthToast('正在刷新所有任务...', 'info');
    const tasks = await getPendingTasks();
    
    for (const task of tasks) {
        if (task.can_refresh && task.external_task_id) {
            await refreshTaskStatus(task.id);
            // 间隔1秒避免请求过快
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    // 刷新显示
    openPointsDetailModal();
}

// 关闭积分详情弹窗
function closePointsDetailModal() {
    const modal = document.getElementById('points-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 打开完整积分系统弹窗（不跳转页面）
function openPointsSystemPage() {
    closePointsDetailModal();
    openFullPointsModal();
}

// 完整积分系统弹窗
async function openFullPointsModal() {
    // 检查是否已存在弹窗
    let modal = document.getElementById('full-points-modal');
    if (!modal) {
        // 创建弹窗
        modal = document.createElement('div');
        modal.id = 'full-points-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]';
        modal.onclick = (e) => { if (e.target === modal) closeFullPointsModal(); };
        modal.innerHTML = getFullPointsModalHTML();
        document.body.appendChild(modal);
        
        // 绑定事件
        bindFullPointsModalEvents();
    }
    
    modal.classList.remove('hidden');
    
    // 加载数据
    await loadFullPointsData();
}

function closeFullPointsModal() {
    const modal = document.getElementById('full-points-modal');
    if (modal) modal.classList.add('hidden');
}

function getFullPointsModalHTML() {
    return `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            <!-- 头部 -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center gap-4">
                    <h2 class="text-xl font-bold text-gray-800">💰 积分系统</h2>
                    <div class="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-1.5 rounded-full">
                        <span class="text-sm text-gray-600">余额：</span>
                        <span id="full-modal-balance" class="text-lg font-bold text-blue-600">--</span>
                        <span class="text-sm text-gray-500">积分</span>
                    </div>
                </div>
                <button onclick="closeFullPointsModal()" class="text-gray-400 hover:text-gray-600 p-2">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
            
            <!-- 标签页 -->
            <div class="flex border-b border-gray-100 px-6 flex-shrink-0">
                <button class="full-modal-tab active" data-tab="tasks">📋 生成任务</button>
                <button class="full-modal-tab" data-tab="ledger">📜 账单明细</button>
            </div>
            
            <!-- 内容区 -->
            <div class="flex-1 overflow-y-auto p-6">
                <!-- 生成任务 -->
                <div id="full-modal-tasks" class="full-modal-panel active">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex gap-2">
                            <select id="task-status-filter" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                                <option value="">全部状态</option>
                                <option value="completed">已完成</option>
                                <option value="processing">处理中</option>
                                <option value="pending">等待中</option>
                                <option value="timeout">超时</option>
                                <option value="failed">失败</option>
                            </select>
                            <select id="task-type-filter" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
                                <option value="">全部类型</option>
                                <option value="image">图片</option>
                                <option value="video">视频</option>
                            </select>
                        </div>
                        <button onclick="loadTasksList()" class="text-sm bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:bg-blue-600">
                            🔄 刷新
                        </button>
                    </div>
                    <div id="tasks-table-container" class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">提交时间</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">类型</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">模型</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">任务ID</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">状态</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">费用</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                                </tr>
                            </thead>
                            <tbody id="tasks-tbody">
                                <tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="tasks-pagination" class="flex justify-center gap-2 mt-4"></div>
                </div>
                
                <!-- 账单明细 -->
                <div id="full-modal-ledger" class="full-modal-panel hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">时间</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">类型</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">功能/备注</th>
                                    <th class="px-4 py-3 text-left font-medium text-gray-600">关联任务</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-600">金额</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-600">余额</th>
                                </tr>
                            </thead>
                            <tbody id="ledger-tbody">
                                <tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="ledger-pagination" class="flex justify-center gap-2 mt-4"></div>
                </div>
            </div>
        </div>
        
        <!-- 任务详情弹窗 -->
        <div id="task-detail-modal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[300] hidden" onclick="if(event.target===this)closeTaskDetailModal()">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
                <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 class="font-semibold flex items-center gap-2">
                        <span class="text-blue-500">ℹ️</span>
                        详情
                    </h3>
                    <button onclick="closeTaskDetailModal()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div id="task-detail-content" class="flex-1 overflow-y-auto p-5">
                    <pre class="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono text-gray-700"></pre>
                </div>
                <div class="px-5 py-3 border-t border-gray-100 flex justify-end">
                    <button onclick="closeTaskDetailModal()" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                        OK
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            .full-modal-tab {
                padding: 12px 20px;
                font-size: 14px;
                color: #666;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                transition: all 0.2s;
            }
            .full-modal-tab:hover { color: #333; }
            .full-modal-tab.active {
                color: #3b82f6;
                border-bottom-color: #3b82f6;
                font-weight: 500;
            }
            .full-modal-panel { display: none; }
            .full-modal-panel.active { display: block; }
            #tasks-tbody tr:hover, #ledger-tbody tr:hover { background: #f9fafb; }
            .task-id-link {
                color: #3b82f6;
                cursor: pointer;
                font-family: monospace;
                font-size: 12px;
            }
            .task-id-link:hover { text-decoration: underline; }
            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
            }
            .status-completed { background: #d1fae5; color: #065f46; }
            .status-processing { background: #dbeafe; color: #1e40af; }
            .status-pending { background: #f3f4f6; color: #4b5563; }
            .status-timeout { background: #fef3c7; color: #92400e; }
            .status-failed { background: #fee2e2; color: #991b1b; }
            .pagination-btn {
                padding: 6px 12px;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                font-size: 13px;
                cursor: pointer;
            }
            .pagination-btn:hover { background: #f3f4f6; }
            .pagination-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }
            .pagination-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        </style>
    `;
}

function bindFullPointsModalEvents() {
    // 标签页切换
    document.querySelectorAll('.full-modal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.full-modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.full-modal-panel').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            const panel = document.getElementById(`full-modal-${tab.dataset.tab}`);
            if (panel) {
                panel.classList.remove('hidden');
                panel.classList.add('active');
            }
            // 加载对应数据
            if (tab.dataset.tab === 'tasks') loadTasksList();
            else if (tab.dataset.tab === 'ledger') loadLedgerList();
        });
    });
    
    // 筛选器变化
    const statusFilter = document.getElementById('task-status-filter');
    const typeFilter = document.getElementById('task-type-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => loadTasksList());
    if (typeFilter) typeFilter.addEventListener('change', () => loadTasksList());
}

async function loadFullPointsData() {
    // 加载余额
    await loadUserBalance();
    const balanceEl = document.getElementById('full-modal-balance');
    if (balanceEl) balanceEl.textContent = authState.balance?.toLocaleString() || '--';
    
    // 加载任务列表
    await loadTasksList();
}

// 当前分页状态
let tasksPage = 1;
let ledgerPage = 1;

async function loadTasksList(page = 1) {
    tasksPage = page;
    const tbody = document.getElementById('tasks-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">加载中...</td></tr>';
    
    const status = document.getElementById('task-status-filter')?.value || '';
    const taskType = document.getElementById('task-type-filter')?.value || '';
    
    try {
        let url = `/tasks/list?page=${page}&page_size=10`;
        if (status) url += `&status=${status}`;
        if (taskType) url += `&task_type=${taskType}`;
        
        const data = await authApiRequest(url);
        const tasks = data.items || [];
        
        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">暂无任务记录</td></tr>';
        } else {
            tbody.innerHTML = tasks.map(task => {
                const statusClass = `status-${task.status}`;
                const statusText = {
                    'pending': '⏳ 等待中',
                    'processing': '🔄 处理中',
                    'completed': '✅ 成功',
                    'failed': '❌ 失败',
                    'timeout': '⚠️ 超时'
                }[task.status] || task.status;
                
                const typeIcon = task.task_type === 'video' ? '🎬 视频' : '📷 图片';
                const time = formatDateTime(task.created_at);
                const taskIdShort = task.external_task_id ? task.external_task_id.substring(0, 16) + '...' : '-';
                
                let actions = '';
                if (task.result_url) {
                    actions += `<a href="${task.result_url}" target="_blank" class="text-blue-500 hover:underline text-xs mr-2">下载</a>`;
                }
                if (task.can_refresh) {
                    actions += `<button onclick="refreshTaskStatus(${task.id})" class="text-green-500 hover:underline text-xs mr-2">刷新</button>`;
                }
                if (task.can_refund) {
                    actions += `<button onclick="requestTaskRefund(${task.id})" class="text-orange-500 hover:underline text-xs">退款</button>`;
                }
                
                return `
                    <tr class="border-b border-gray-50">
                        <td class="px-4 py-3 text-gray-600">${time}</td>
                        <td class="px-4 py-3">${typeIcon}</td>
                        <td class="px-4 py-3 font-medium">${task.model_id}</td>
                        <td class="px-4 py-3">
                            ${task.external_task_id ? 
                                `<span class="task-id-link" onclick="showTaskDetail(${task.id})" title="${task.external_task_id}">${taskIdShort}</span>` : 
                                '<span class="text-gray-400">-</span>'}
                        </td>
                        <td class="px-4 py-3"><span class="status-badge ${statusClass}">${statusText}</span></td>
                        <td class="px-4 py-3 text-red-500 font-medium">-${task.points_cost}</td>
                        <td class="px-4 py-3">${actions || '<span class="text-gray-400">-</span>'}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // 渲染分页
        renderPagination('tasks-pagination', data.total, page, 10, loadTasksList);
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-red-400">加载失败: ${error.message}</td></tr>`;
    }
}

async function loadLedgerList(page = 1) {
    ledgerPage = page;
    const tbody = document.getElementById('ledger-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">加载中...</td></tr>';
    
    try {
        const data = await authApiRequest(`/account/ledger?page=${page}&page_size=15`);
        const items = data.items || [];
        
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">暂无账单记录</td></tr>';
        } else {
            tbody.innerHTML = items.map(item => {
                const time = formatDateTime(item.created_at);
                const typeClass = item.entry_type === 'MANUAL_TOPUP' ? 'bg-green-100 text-green-700' : 
                                  item.entry_type === 'CONSUME' ? 'bg-red-100 text-red-700' : 
                                  item.entry_type === 'REFUND' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-700';
                const typeText = {
                    'MANUAL_TOPUP': '充值',
                    'CONSUME': '消费',
                    'ADJUST': '调整',
                    'REFUND': '退款'
                }[item.entry_type] || item.entry_type;
                
                const amountClass = item.amount >= 0 ? 'text-green-600' : 'text-red-600';
                const amountText = item.amount >= 0 ? `+${item.amount}` : item.amount;
                
                // 关联任务ID
                const refId = item.reference_id || '';
                const hasTaskRef = refId.startsWith('vid_') || refId.startsWith('img_');
                
                return `
                    <tr class="border-b border-gray-50">
                        <td class="px-4 py-3 text-gray-600">${time}</td>
                        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs ${typeClass}">${typeText}</span></td>
                        <td class="px-4 py-3 text-gray-700">${item.feature || item.note || '-'}</td>
                        <td class="px-4 py-3">
                            ${hasTaskRef ? 
                                `<span class="task-id-link" onclick="showTaskDetailByRef('${refId}')">${refId.substring(0, 20)}...</span>` : 
                                '<span class="text-gray-400">-</span>'}
                        </td>
                        <td class="px-4 py-3 text-right font-medium ${amountClass}">${amountText}</td>
                        <td class="px-4 py-3 text-right text-gray-500">${item.balance_after}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // 渲染分页
        renderPagination('ledger-pagination', data.total, page, 15, loadLedgerList);
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-red-400">加载失败: ${error.message}</td></tr>`;
    }
}

function renderPagination(containerId, total, currentPage, pageSize, loadFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${loadFn.name}(${currentPage - 1})">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="${loadFn.name}(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += '<span class="px-2">...</span>';
        }
    }
    
    // 下一页
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${loadFn.name}(${currentPage + 1})">下一页</button>`;
    
    container.innerHTML = html;
}

// 显示任务详情
async function showTaskDetail(taskId) {
    const modal = document.getElementById('task-detail-modal');
    const content = document.querySelector('#task-detail-content pre');
    if (!modal || !content) return;
    
    content.textContent = '加载中...';
    modal.classList.remove('hidden');
    
    try {
        const task = await authApiRequest(`/tasks/${taskId}`);
        
        // 格式化为类似图2的JSON格式
        const detailObj = {
            created_at: task.created_at,
            updated_at: task.updated_at,
            task_id: task.external_task_id,
            task_type: task.task_type,
            model_id: task.model_id,
            param_key: task.param_key,
            provider: task.provider,
            status: task.status,
            result_url: task.result_url,
            error_message: task.error_message,
            points_cost: task.points_cost,
            refunded: task.refunded,
            prompt: task.prompt,
            billing_request_id: task.billing_request_id
        };
        
        content.textContent = JSON.stringify(detailObj, null, 2);
    } catch (error) {
        content.textContent = `加载失败: ${error.message}`;
    }
}

// 通过关联ID显示任务详情
async function showTaskDetailByRef(refId) {
    const modal = document.getElementById('task-detail-modal');
    const content = document.querySelector('#task-detail-content pre');
    if (!modal || !content) return;
    
    content.textContent = '加载中...';
    modal.classList.remove('hidden');
    
    try {
        const task = await authApiRequest(`/tasks/by-billing/${encodeURIComponent(refId)}`);
        
        const detailObj = {
            created_at: task.created_at,
            updated_at: task.updated_at,
            task_id: task.external_task_id,
            task_type: task.task_type,
            model_id: task.model_id,
            param_key: task.param_key,
            provider: task.provider,
            status: task.status,
            result_url: task.result_url,
            error_message: task.error_message,
            points_cost: task.points_cost,
            refunded: task.refunded,
            prompt: task.prompt,
            billing_request_id: task.billing_request_id
        };
        
        content.textContent = JSON.stringify(detailObj, null, 2);
    } catch (error) {
        content.textContent = `未找到关联任务或加载失败: ${error.message}`;
    }
}

function closeTaskDetailModal() {
    const modal = document.getElementById('task-detail-modal');
    if (modal) modal.classList.add('hidden');
}

// 格式化日期时间
function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 设置积分系统页面 URL（可供外部调用）
function setPointsSystemUrl(url) {
    if (url) {
        localStorage.setItem('points_system_url', url);
        console.log('[Auth] 积分系统页面 URL 已设置:', url);
    } else {
        localStorage.removeItem('points_system_url');
        console.log('[Auth] 积分系统页面 URL 已清除');
    }
}

// 增强版用户余额加载 - 同时更新画布显示
const originalLoadUserBalance = loadUserBalance;
async function enhancedLoadUserBalance() {
    const result = await originalLoadUserBalance();
    updateCanvasPointsDisplay();
    return result;
}

// 重新定义 loadUserBalance，使其同时更新画布积分
window.loadUserBalance = enhancedLoadUserBalance;

// ==================== 导出 ====================
window.authState = authState;
window.authLogin = authLogin;
window.authRegister = authRegister;
window.authLogout = authLogout;
window.checkAuthStatus = checkAuthStatus;
window.initAuthEvents = initAuthEvents;
window.showAuthToast = showAuthToast;
window.updateCanvasPointsDisplay = updateCanvasPointsDisplay;
window.openPointsDetailModal = openPointsDetailModal;
window.closePointsDetailModal = closePointsDetailModal;
window.openPointsSystemPage = openPointsSystemPage;
window.setPointsSystemUrl = setPointsSystemUrl;

// 积分消费相关
window.loadPricingConfig = loadPricingConfig;
window.getModelPrice = getModelPrice;
window.checkBalanceSufficient = checkBalanceSufficient;
window.consumePoints = consumePoints;
window.refundPoints = refundPoints;
window.preGenerationCheck = preGenerationCheck;
window.mapModelId = mapModelId;
window.mapDurationToParamKey = mapDurationToParamKey;

// 任务管理相关
window.createGenerationTask = createGenerationTask;
window.updateGenerationTask = updateGenerationTask;
window.completeGenerationTask = completeGenerationTask;
window.markTaskTimeout = markTaskTimeout;
window.getPendingTasks = getPendingTasks;
window.getTaskList = getTaskList;
window.requestTaskRefund = requestTaskRefund;
window.refreshTaskStatus = refreshTaskStatus;
window.refreshAllPendingTasks = refreshAllPendingTasks;

// 完整积分系统弹窗
window.openFullPointsModal = openFullPointsModal;
window.closeFullPointsModal = closeFullPointsModal;
window.loadTasksList = loadTasksList;
window.loadLedgerList = loadLedgerList;
window.showTaskDetail = showTaskDetail;
window.showTaskDetailByRef = showTaskDetailByRef;
window.closeTaskDetailModal = closeTaskDetailModal;

console.log('[Auth] 认证模块已加载（含积分消费系统和任务管理）');

