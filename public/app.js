// ========== 全域變數 ==========
let characters = [];
let conversations = [];
let relationships = {};
let isRunning = false;
let animationFrame = null;

// Canvas 相關
let canvas, ctx;
let canvasWidth, canvasHeight;

// 角色表情符號
const characterAvatars = {
    'alex': '👨🏻‍💻',
    'david': '💪🏻',
    'kevin': '👨🏻‍🎨',
    'sophia': '👩🏻‍💼',
    'emma': '👩🏻‍🏫',
    'olivia': '👩🏻‍💻'
};

// DOM 元素
let startBtn, pauseBtn, resetBtn, saveBtn, clearBtn, viewAllBtn, loadBtn, loadSelect;
let conversationList, messageCount, charactersList, speechBubbles, relationshipsGrid, conversationTabs;
let currentFilter = 'all'; // 當前篩選的對話配對

// 障礙物系統
const obstacles = [
    // 左上角建築
    { x: 10, y: 10, width: 120, height: 100, type: 'building' },
    // 右上角建築
    { x: 0, y: 0, width: 0, height: 0, type: 'building' }, // 會在 canvas 初始化後動態設定
    // 樹木
    { x: 200, y: 150, radius: 25, type: 'tree' },
    { x: 280, y: 120, radius: 25, type: 'tree' },
    { x: 150, y: 400, radius: 25, type: 'tree' },
    { x: 500, y: 200, radius: 25, type: 'tree' },
    { x: 650, y: 450, radius: 25, type: 'tree' },
    { x: 750, y: 150, radius: 25, type: 'tree' },
    { x: 100, y: 550, radius: 25, type: 'tree' },
    { x: 850, y: 580, radius: 25, type: 'tree' }
];

// 草地裝飾點（固定位置，避免閃爍）
let grassDecorations = [];

// 初始化草地裝飾
function initGrassDecorations() {
    grassDecorations = [];
    // 生成固定的草地條紋
    for (let i = 0; i < 50; i++) {
        grassDecorations.push({
            x: Math.random() * 2000, // 使用較大範圍
            y: Math.random() * 300,
            size: Math.random() * 15 + 5,
            type: 'stripe'
        });
    }
    // 生成固定的草地點
    for (let i = 0; i < 30; i++) {
        grassDecorations.push({
            x: Math.random() * 2000,
            y: Math.random() * 300,
            radius: Math.random() * 3 + 1,
            type: 'dot'
        });
    }
}

// ========== 角色類 ==========
class Character {
    constructor(data) {
        Object.assign(this, data);
        this.x = data.position.x;
        this.y = data.position.y;
        this.targetX = this.x;
        this.targetY = this.y;
        this.isTalking = false;
        this.talkingWith = null;
        this.talkingTimer = 0;
        this.moveTimer = 0;
        this.recentTalkedWith = new Map(); // 記錄最近對話過的角色和時間
        this.conversationRounds = 0; // 當前對話輪數
        this.maxConversationRounds = 0; // 目標對話輪數
    }

    // 設定新的移動目標
    setNewTarget() {
        if (this.isTalking) return;

        // 嘗試找到一個不與障礙物碰撞的目標點
        let attempts = 0;
        let validTarget = false;

        while (!validTarget && attempts < 20) {
            const newX = Math.random() * (canvasWidth - 100) + 50;
            const newY = Math.random() * (canvasHeight - 100) + 50;

            if (!checkObstacleCollision(newX, newY, 20)) {
                this.targetX = newX;
                this.targetY = newY;
                validTarget = true;
            }
            attempts++;
        }

        this.moveTimer = 0;
    }

    // 檢查是否可以與某角色對話（冷卻機制）
    canTalkWith(otherCharacterId) {
        if (!this.recentTalkedWith.has(otherCharacterId)) {
            return true;
        }

        const lastTalkTime = this.recentTalkedWith.get(otherCharacterId);
        const cooldown = 15000; // 15 秒冷卻時間
        return Date.now() - lastTalkTime > cooldown;
    }

    // 記錄對話時間
    markTalkedWith(otherCharacterId) {
        this.recentTalkedWith.set(otherCharacterId, Date.now());

        // 清理超過 30 秒的記錄
        for (const [id, time] of this.recentTalkedWith.entries()) {
            if (Date.now() - time > 30000) {
                this.recentTalkedWith.delete(id);
            }
        }
    }

    // 更新位置
    update(deltaTime) {
        if (this.isTalking) {
            this.talkingTimer += deltaTime;
            // 不在這裡結束對話，改由多輪對話系統控制
            return;
        }

        // 移動到目標位置
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 2) {
            // 正常移動速度
            const moveSpeed = this.speed * deltaTime / 16;
            const newX = this.x + (dx / distance) * moveSpeed;
            const newY = this.y + (dy / distance) * moveSpeed;

            // 檢查新位置是否會碰到障礙物
            if (!checkObstacleCollision(newX, newY, 20)) {
                this.x = newX;
                this.y = newY;
            } else {
                // 碰到障礙物，設定新目標
                this.setNewTarget();
            }
        } else {
            // 到達目標，等待 1 秒後設定新目標
            this.moveTimer += deltaTime;
            if (this.moveTimer > 1000) {
                this.setNewTarget();
            }
        }
    }

    // 開始對話
    startTalking(otherCharacter, maxRounds) {
        this.isTalking = true;
        this.talkingWith = otherCharacter;
        this.talkingTimer = 0;
        this.conversationRounds = 0;
        this.maxConversationRounds = maxRounds || 6; // 默認 6 輪（每人3次）
        this.markTalkedWith(otherCharacter.id);
    }

    // 結束對話
    stopTalking() {
        this.isTalking = false;
        this.talkingWith = null;
        this.talkingTimer = 0;
        this.conversationRounds = 0;
        this.maxConversationRounds = 0;
        // 立即設定新目標，讓角色快速移動
        this.setNewTarget();
    }

    // 繪製角色
    draw() {
        // 如果正在對話，顯示連線
        if (this.isTalking && this.talkingWith) {
            ctx.strokeStyle = this.gender === 'male' ? '#64b5f6' : '#f48fb1';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.talkingWith.x, this.talkingWith.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 繪製陰影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 30, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // 繪製角色圓圈
        ctx.fillStyle = this.gender === 'male' ? '#e3f2fd' : '#fce4ec';
        ctx.strokeStyle = this.gender === 'male' ? '#64b5f6' : '#f48fb1';
        ctx.lineWidth = 3;

        if (this.isTalking) {
            // 對話時有光暈效果
            ctx.shadowColor = this.gender === 'male' ? '#64b5f6' : '#f48fb1';
            ctx.shadowBlur = 15;
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 繪製表情符號
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(characterAvatars[this.id], this.x, this.y);

        // 繪製名字
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText(this.name, this.x, this.y + 45);

        // 對話指示器
        if (this.isTalking) {
            ctx.fillStyle = '#48bb78';
            ctx.font = '16px Arial';
            ctx.fillText('💬', this.x, this.y - 35);
        }
    }
}

// ========== 障礙物碰撞檢測 ==========
function checkObstacleCollision(x, y, radius) {
    // 更新右上角建築的位置（依賴 canvas 寬度）
    if (canvasWidth > 0) {
        obstacles[1].x = canvasWidth - 130;
        obstacles[1].y = 10;
        obstacles[1].width = 120;
        obstacles[1].height = 120;
    }

    for (const obstacle of obstacles) {
        if (obstacle.type === 'building') {
            // 矩形碰撞檢測
            if (x + radius > obstacle.x &&
                x - radius < obstacle.x + obstacle.width &&
                y + radius > obstacle.y &&
                y - radius < obstacle.y + obstacle.height) {
                return true;
            }
        } else if (obstacle.type === 'tree') {
            // 圓形碰撞檢測
            const dx = x - obstacle.x;
            const dy = y - obstacle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < radius + obstacle.radius) {
                return true;
            }
        }
    }
    return false;
}

// ========== 初始化 ==========
async function init() {
    // 獲取 DOM 元素
    canvas = document.getElementById('map-canvas');
    ctx = canvas.getContext('2d');

    startBtn = document.getElementById('start-btn');
    pauseBtn = document.getElementById('pause-btn');
    resetBtn = document.getElementById('reset-btn');
    saveBtn = document.getElementById('save-btn');
    clearBtn = document.getElementById('clear-btn');
    viewAllBtn = document.getElementById('view-all-btn');
    loadBtn = document.getElementById('load-btn');
    loadSelect = document.getElementById('load-select');

    conversationList = document.getElementById('conversation-list');
    messageCount = document.getElementById('message-count');
    charactersList = document.getElementById('characters-list');
    speechBubbles = document.getElementById('speech-bubbles');
    relationshipsGrid = document.getElementById('relationships-grid');
    conversationTabs = document.getElementById('conversation-tabs');

    // 設定 Canvas 尺寸
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 初始化草地裝飾（固定位置，避免閃爍）
    initGrassDecorations();

    // 載入角色和關係
    await loadCharacters();
    await loadRelationships();

    // 載入已儲存的對話記錄列表
    await loadSavedConversationsList();

    // 設定事件監聽
    setupEventListeners();

    // 開始繪製
    draw();
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = 650; // 增加高度
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

// ========== 載入角色 ==========
async function loadCharacters() {
    try {
        const response = await fetch('/api/characters');
        const data = await response.json();

        characters = data.map(char => new Character(char));

        // 渲染角色卡片
        renderCharacterCards();

        console.log(`已載入 ${characters.length} 個角色`);
    } catch (error) {
        console.error('載入角色失敗:', error);
    }
}

function renderCharacterCards() {
    charactersList.innerHTML = '';

    characters.forEach(char => {
        const card = document.createElement('div');
        card.className = `character-card ${char.gender}`;
        card.id = `char-card-${char.id}`;

        // 構建特質 HTML
        let traitsHTML = '';
        if (char.positiveTraits && char.positiveTraits.length > 0) {
            traitsHTML += `<div class="character-traits positive">
                <span class="trait-label">✓</span>
                ${char.positiveTraits.map(t => `<span class="trait">${t}</span>`).join(' ')}
            </div>`;
        }
        if (char.negativeTraits && char.negativeTraits.length > 0) {
            traitsHTML += `<div class="character-traits negative">
                <span class="trait-label">✗</span>
                ${char.negativeTraits.map(t => `<span class="trait">${t}</span>`).join(' ')}
            </div>`;
        }

        card.innerHTML = `
            <div class="character-avatar">${characterAvatars[char.id]}</div>
            <div class="character-name">${char.name}</div>
            <div class="character-occupation">${char.occupation}</div>
            ${traitsHTML}
        `;
        charactersList.appendChild(card);
    });
}

// ========== 載入關係 ==========
async function loadRelationships() {
    try {
        const response = await fetch('/api/relationships');
        relationships = await response.json();

        // 渲染關係網絡
        renderRelationships();

        console.log('已載入關係數據');
    } catch (error) {
        console.error('載入關係數據失敗:', error);
    }
}

function renderRelationships() {
    relationshipsGrid.innerHTML = '';

    // 創建所有關係對的列表（避免重複）
    const relationshipPairs = [];
    const processed = new Set();

    characters.forEach(char1 => {
        characters.forEach(char2 => {
            if (char1.id !== char2.id) {
                const pairKey = [char1.id, char2.id].sort().join('-');
                if (!processed.has(pairKey)) {
                    processed.add(pairKey);
                    const affinity = relationships[char1.id]?.[char2.id] || 50;
                    relationshipPairs.push({
                        char1,
                        char2,
                        affinity
                    });
                }
            }
        });
    });

    // 渲染關係卡片
    relationshipPairs.forEach(pair => {
        const card = document.createElement('div');
        card.className = 'relationship-card';
        card.id = `rel-${pair.char1.id}-${pair.char2.id}`;

        let affinityLevel = 'medium';
        if (pair.affinity >= 70) affinityLevel = 'high';
        else if (pair.affinity <= 30) affinityLevel = 'low';

        card.innerHTML = `
            <div class="relationship-header">
                <div class="relationship-avatars">
                    <span>${characterAvatars[pair.char1.id]}</span>
                    <span>↔</span>
                    <span>${characterAvatars[pair.char2.id]}</span>
                </div>
            </div>
            <div class="relationship-names">${pair.char1.name} & ${pair.char2.name}</div>
            <div class="relationship-score">
                <div class="affinity-bar">
                    <div class="affinity-fill ${affinityLevel}" style="width: ${pair.affinity}%">
                        ${pair.affinity}
                    </div>
                </div>
                <div class="affinity-value ${affinityLevel}">${pair.affinity}</div>
            </div>
        `;

        relationshipsGrid.appendChild(card);
    });
}

function updateRelationshipDisplay(char1Id, char2Id, newAffinity, change) {
    // 找到對應的關係卡片
    const cardId1 = `rel-${[char1Id, char2Id].sort().join('-')}`;
    const card = document.getElementById(cardId1);

    if (!card) return;

    let affinityLevel = 'medium';
    if (newAffinity >= 70) affinityLevel = 'high';
    else if (newAffinity <= 30) affinityLevel = 'low';

    // 更新好感度條和數值
    const fill = card.querySelector('.affinity-fill');
    const value = card.querySelector('.affinity-value');

    fill.className = `affinity-fill ${affinityLevel}`;
    fill.style.width = `${newAffinity}%`;
    fill.textContent = newAffinity;

    value.className = `affinity-value ${affinityLevel}`;
    value.textContent = newAffinity;

    // 顯示變化動畫
    const changeIndicator = document.createElement('div');
    changeIndicator.className = `relationship-change ${change > 0 ? 'positive' : 'negative'}`;
    changeIndicator.textContent = `${change > 0 ? '+' : ''}${change}`;

    card.appendChild(changeIndicator);

    // 3 秒後移除變化指示器
    setTimeout(() => {
        changeIndicator.remove();
    }, 3000);

    // 卡片閃爍效果
    card.style.backgroundColor = change > 0 ? '#e6ffed' : '#ffe6e6';
    setTimeout(() => {
        card.style.backgroundColor = 'white';
    }, 500);
}

// ========== 事件監聽 ==========
function setupEventListeners() {
    startBtn.addEventListener('click', startSimulation);
    pauseBtn.addEventListener('click', pauseSimulation);
    resetBtn.addEventListener('click', resetSimulation);
    saveBtn.addEventListener('click', saveConversations);
    clearBtn.addEventListener('click', clearConversations);
    loadBtn.addEventListener('click', loadSelectedConversation);

    // 「全部」按鈕
    viewAllBtn.addEventListener('click', () => {
        currentFilter = 'all';
        viewAllBtn.classList.add('active');
        document.querySelectorAll('.conversation-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        renderFilteredConversations();
    });
}

function startSimulation() {
    if (isRunning) return;

    isRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = '暫停';
    pauseBtn.classList.remove('paused');

    // 為所有角色設定初始目標
    characters.forEach(char => {
        if (!char.isTalking) {
            char.setNewTarget();
        }
    });

    // 開始動畫循環
    lastTime = Date.now();
    animate();
}

function pauseSimulation() {
    isRunning = !isRunning;

    if (isRunning) {
        pauseBtn.textContent = '暫停';
        pauseBtn.classList.remove('paused');
        lastTime = Date.now();
        animate();
    } else {
        pauseBtn.textContent = '繼續';
        pauseBtn.classList.add('paused');
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    }
}

function resetSimulation() {
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = '暫停';
    pauseBtn.classList.remove('paused');

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }

    // 重置角色位置
    characters.forEach((char, index) => {
        const data = characters[index];
        char.x = char.position.x;
        char.y = char.position.y;
        char.targetX = char.x;
        char.targetY = char.y;
        char.isTalking = false;
        char.talkingWith = null;
        char.talkingTimer = 0;
        char.moveTimer = 0;
    });

    // 清除對話氣泡
    speechBubbles.innerHTML = '';

    draw();
}

// ========== 動畫循環 ==========
let lastTime = Date.now();

function animate() {
    if (!isRunning) return;

    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // 更新所有角色
    characters.forEach(char => char.update(deltaTime));

    // 檢測碰撞
    checkCollisions();

    // 繪製
    draw();

    // 繼續動畫
    animationFrame = requestAnimationFrame(animate);
}

function draw() {
    // 清除畫布 - 使用草地背景
    ctx.fillStyle = '#8BC34A';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 繪製草地紋理（全區域）
    drawGrassTexture();

    // 繪製底部深色草地區域
    drawGrass();

    // 繪製路徑/人行道（增強版）
    drawPaths();

    // 繪製建築物/牆壁
    drawBuildings();

    // 繪製樹木
    drawTrees();

    // 繪製裝飾物
    drawDecorations();

    // 繪製所有角色
    characters.forEach(char => char.draw());
}

// 繪製整個區域的草地紋理
function drawGrassTexture() {
    const vPathX = canvasWidth * 0.3;
    const vPathWidth = canvasWidth * 0.15;
    const hPathY = canvasHeight * 0.45;
    const hPathHeight = canvasHeight * 0.1;

    grassDecorations.forEach(deco => {
        // 繪製在整個畫布上（避開馬路）
        if (deco.x < canvasWidth) {
            // 檢查是否在馬路範圍內
            const onVerticalRoad = deco.x > vPathX && deco.x < vPathX + vPathWidth;

            if (!onVerticalRoad) {
                // 在多個高度繪製以覆蓋整個區域
                for (let yOffset = 0; yOffset < canvasHeight; yOffset += 300) {
                    const y = yOffset + deco.y;
                    const onHorizontalRoad = y > hPathY && y < hPathY + hPathHeight;

                    if (!onHorizontalRoad && y < canvasHeight) {
                        if (deco.type === 'stripe') {
                            ctx.fillStyle = '#7CB342';
                            ctx.fillRect(deco.x, y, deco.size, 2);
                        } else if (deco.type === 'dot') {
                            ctx.fillStyle = '#689F38';
                            ctx.beginPath();
                            ctx.arc(deco.x, y, deco.radius, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
            }
        }
    });
}

// 繪製底部深色草地區域
function drawGrass() {
    // 底部深色草地
    ctx.fillStyle = '#7CB342';
    ctx.fillRect(0, canvasHeight * 0.7, canvasWidth, canvasHeight * 0.3);

    // 繪製固定的草地裝飾（避免閃爍和馬路）
    const grassStartY = canvasHeight * 0.7;
    const vPathX = canvasWidth * 0.3;
    const vPathWidth = canvasWidth * 0.15;

    grassDecorations.forEach(deco => {
        // 只繪製在可見範圍內且不在垂直馬路上的裝飾
        if (deco.x < canvasWidth) {
            // 檢查是否在垂直馬路範圍內
            const onVerticalRoad = deco.x > vPathX && deco.x < vPathX + vPathWidth;

            if (!onVerticalRoad) {
                const y = grassStartY + deco.y;

                if (deco.type === 'stripe') {
                    ctx.fillStyle = '#689F38';
                    ctx.fillRect(deco.x, y, deco.size, 2);
                } else if (deco.type === 'dot') {
                    ctx.fillStyle = '#558B2F';
                    ctx.beginPath();
                    ctx.arc(deco.x, y, deco.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    });
}

// 繪製路徑
function drawPaths() {
    // 垂直路徑
    const vPathX = canvasWidth * 0.3;
    const vPathWidth = canvasWidth * 0.15;

    // 路面
    ctx.fillStyle = '#A9A9A9';
    ctx.fillRect(vPathX, 0, vPathWidth, canvasHeight);

    // 路緣
    ctx.fillStyle = '#696969';
    ctx.fillRect(vPathX, 0, 3, canvasHeight);
    ctx.fillRect(vPathX + vPathWidth - 3, 0, 3, canvasHeight);

    // 虛線
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(vPathX + vPathWidth / 2, 0);
    ctx.lineTo(vPathX + vPathWidth / 2, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // 水平路徑
    const hPathY = canvasHeight * 0.45;
    const hPathHeight = canvasHeight * 0.1;

    // 路面
    ctx.fillStyle = '#A9A9A9';
    ctx.fillRect(0, hPathY, canvasWidth, hPathHeight);

    // 路緣
    ctx.fillStyle = '#696969';
    ctx.fillRect(0, hPathY, canvasWidth, 3);
    ctx.fillRect(0, hPathY + hPathHeight - 3, canvasWidth, 3);

    // 虛線
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, hPathY + hPathHeight / 2);
    ctx.lineTo(canvasWidth, hPathY + hPathHeight / 2);
    ctx.stroke();
    ctx.setLineDash([]);
}

// 繪製建築物
function drawBuildings() {
    // 左上角建築
    // 建築主體
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(10, 10, 120, 100);

    // 建築陰影
    ctx.fillStyle = '#6B5345';
    ctx.fillRect(125, 15, 5, 95);
    ctx.fillRect(15, 105, 115, 5);

    // 屋頂
    ctx.fillStyle = '#5A3A2A';
    ctx.fillRect(10, 10, 120, 15);

    // 屋頂邊緣
    ctx.fillStyle = '#4A2A1A';
    ctx.fillRect(8, 25, 124, 3);

    // 窗戶（帶框）
    for (let i = 0; i < 3; i++) {
        const wx = 20 + i * 35;
        // 窗框
        ctx.fillStyle = '#4A3A2A';
        ctx.fillRect(wx, 38, 30, 30);
        // 玻璃
        ctx.fillStyle = '#ADD8E6';
        ctx.fillRect(wx + 2, 40, 26, 26);
        // 窗格
        ctx.strokeStyle = '#4A3A2A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wx + 15, 40);
        ctx.lineTo(wx + 15, 66);
        ctx.moveTo(wx + 2, 53);
        ctx.lineTo(wx + 28, 53);
        ctx.stroke();
    }

    // 門
    ctx.fillStyle = '#5A3A2A';
    ctx.fillRect(50, 75, 25, 35);
    ctx.fillStyle = '#4A2A1A';
    ctx.fillRect(52, 77, 21, 31);
    // 門把
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(67, 93, 2, 0, Math.PI * 2);
    ctx.fill();

    // 右上角建築
    // 建築主體
    ctx.fillStyle = '#CD853F';
    ctx.fillRect(canvasWidth - 130, 10, 120, 120);

    // 建築陰影
    ctx.fillStyle = '#A0693F';
    ctx.fillRect(canvasWidth - 135, 15, 5, 115);
    ctx.fillRect(canvasWidth - 125, 125, 115, 5);

    // 屋頂
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(canvasWidth - 130, 10, 120, 18);

    // 屋頂邊緣
    ctx.fillStyle = '#6A3313';
    ctx.fillRect(canvasWidth - 132, 28, 124, 3);

    // 窗戶（兩排）
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const wx = canvasWidth - 115 + col * 40;
            const wy = 40 + row * 40;
            // 窗框
            ctx.fillStyle = '#6A3313';
            ctx.fillRect(wx, wy, 30, 30);
            // 玻璃
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(wx + 2, wy + 2, 26, 26);
            // 窗格
            ctx.strokeStyle = '#6A3313';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(wx + 15, wy + 2);
            ctx.lineTo(wx + 15, wy + 28);
            ctx.moveTo(wx + 2, wy + 15);
            ctx.lineTo(wx + 28, wy + 15);
            ctx.stroke();
        }
    }

    // 門
    ctx.fillStyle = '#6A3313';
    ctx.fillRect(canvasWidth - 95, 100, 28, 30);
    ctx.fillStyle = '#5A2313';
    ctx.fillRect(canvasWidth - 93, 102, 24, 26);
    // 門把
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(canvasWidth - 73, 115, 2, 0, Math.PI * 2);
    ctx.fill();
}

// 繪製樹木
function drawTrees() {
    const trees = [
        { x: 200, y: 150 },
        { x: 280, y: 120 },
        { x: 150, y: 400 },
        { x: 500, y: 200 },
        { x: 650, y: 450 },
        { x: 750, y: 150 },
        { x: 100, y: 550 },
        { x: 850, y: 580 }
    ];

    trees.forEach(tree => {
        // 地面陰影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(tree.x, tree.y + 50, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // 樹幹
        ctx.fillStyle = '#6B4423';
        ctx.fillRect(tree.x - 8, tree.y + 20, 16, 30);

        // 樹幹紋理
        ctx.fillStyle = '#5A3313';
        ctx.fillRect(tree.x - 6, tree.y + 25, 2, 20);
        ctx.fillRect(tree.x + 4, tree.y + 28, 2, 18);

        // 樹冠（多層）
        // 底層
        ctx.fillStyle = '#1A661A';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y + 5, 22, 0, Math.PI * 2);
        ctx.fill();

        // 中層
        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.arc(tree.x - 8, tree.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tree.x + 8, tree.y, 20, 0, Math.PI * 2);
        ctx.fill();

        // 頂層
        ctx.fillStyle = '#32CD32';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y - 5, 18, 0, Math.PI * 2);
        ctx.fill();

        // 高光
        ctx.fillStyle = '#90EE90';
        ctx.beginPath();
        ctx.arc(tree.x - 5, tree.y - 10, 8, 0, Math.PI * 2);
        ctx.fill();
    });
}

// 繪製裝飾物
function drawDecorations() {
    // 花叢 - 更多花朵，多種顏色（避開馬路）
    const flowers = [
        { x: 160, y: 480, color: '#FF69B4' },
        { x: 190, y: 490, color: '#FF1493' },
        { x: 220, y: 485, color: '#FFB6C1' },
        { x: 170, y: 495, color: '#FFA07A' },
        { x: 250, y: 500, color: '#FF6347' },   // 調整避開垂直馬路
        { x: 600, y: 520, color: '#9370DB' },
        { x: 630, y: 530, color: '#BA55D3' },
        { x: 615, y: 540, color: '#DA70D6' },
        { x: 520, y: 600, color: '#FF69B4' },   // 調整避開垂直馬路
        { x: 560, y: 595, color: '#FFB6C1' },   // 調整避開垂直馬路
        { x: 800, y: 480, color: '#FF1493' },
        { x: 820, y: 490, color: '#FFA07A' }
    ];

    // 過濾掉在馬路上的花朵
    const visibleFlowers = flowers.filter(flower => {
        const vPathX = canvasWidth * 0.3;
        const vPathWidth = canvasWidth * 0.15;
        const hPathY = canvasHeight * 0.45;
        const hPathHeight = canvasHeight * 0.1;

        // 檢查是否在垂直馬路上
        const onVerticalRoad = flower.x > vPathX && flower.x < vPathX + vPathWidth;
        // 檢查是否在水平馬路上
        const onHorizontalRoad = flower.y > hPathY && flower.y < hPathY + hPathHeight;

        return !onVerticalRoad && !onHorizontalRoad;
    });

    visibleFlowers.forEach(flower => {
        // 莖
        ctx.strokeStyle = '#228B22';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(flower.x, flower.y);
        ctx.lineTo(flower.x, flower.y + 10);
        ctx.stroke();

        // 花瓣
        ctx.fillStyle = flower.color;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(
                flower.x + Math.cos(i * Math.PI * 2 / 5) * 6,
                flower.y + Math.sin(i * Math.PI * 2 / 5) * 6,
                4, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // 花心
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(flower.x, flower.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // 灌木叢（固定位置，避開馬路）
    const bushes = [
        { x: 250, y: 180, offsets: [-1, 2, 0, -2, 1] },   // 調整避開垂直馬路
        { x: 550, y: 600, offsets: [1, -1, 2, 0, -2] },
        { x: 50, y: 250, offsets: [0, 1, -1, 2, -2] }
    ];

    // 過濾掉在馬路上的灌木
    const visibleBushes = bushes.filter(bush => {
        const vPathX = canvasWidth * 0.3;
        const vPathWidth = canvasWidth * 0.15;
        const hPathY = canvasHeight * 0.45;
        const hPathHeight = canvasHeight * 0.1;

        const onVerticalRoad = bush.x > vPathX && bush.x < vPathX + vPathWidth;
        const onHorizontalRoad = bush.y > hPathY && bush.y < hPathY + hPathHeight;

        return !onVerticalRoad && !onHorizontalRoad;
    });

    visibleBushes.forEach(bush => {
        ctx.fillStyle = '#2F4F2F';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(
                bush.x + (i - 2) * 12,
                bush.y + bush.offsets[i],
                10, 0, Math.PI * 2
            );
            ctx.fill();
        }
    });

    // 石頭（避開馬路）
    const rocks = [
        { x: 250, y: 220, size: 15 },   // 調整避開垂直馬路
        { x: 265, y: 225, size: 12 },   // 調整避開垂直馬路
        { x: 700, y: 550, size: 18 },
        { x: 715, y: 555, size: 14 }
    ];

    // 過濾掉在馬路上的石頭
    const visibleRocks = rocks.filter(rock => {
        const vPathX = canvasWidth * 0.3;
        const vPathWidth = canvasWidth * 0.15;
        const hPathY = canvasHeight * 0.45;
        const hPathHeight = canvasHeight * 0.1;

        const onVerticalRoad = rock.x > vPathX && rock.x < vPathX + vPathWidth;
        const onHorizontalRoad = rock.y > hPathY && rock.y < hPathY + hPathHeight;

        return !onVerticalRoad && !onHorizontalRoad;
    });

    visibleRocks.forEach(rock => {
        ctx.fillStyle = '#808080';
        ctx.beginPath();
        ctx.ellipse(rock.x, rock.y, rock.size, rock.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 石頭高光
        ctx.fillStyle = '#A9A9A9';
        ctx.beginPath();
        ctx.ellipse(rock.x - 3, rock.y - 3, rock.size * 0.4, rock.size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
    });

    // 長椅（更詳細）
    const benchX = 550;
    const benchY = 380;

    // 椅腳
    ctx.fillStyle = '#654321';
    ctx.fillRect(benchX + 5, benchY - 15, 5, 20);
    ctx.fillRect(benchX + 70, benchY - 15, 5, 20);

    // 座位
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(benchX, benchY, 80, 8);

    // 椅背支柱
    ctx.fillRect(benchX + 5, benchY - 15, 5, 20);
    ctx.fillRect(benchX + 70, benchY - 15, 5, 20);

    // 椅背
    ctx.fillStyle = '#654321';
    ctx.fillRect(benchX, benchY - 15, 80, 5);

    // 椅背木條
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(benchX + 10 + i * 18, benchY - 12, 3, 10);
    }

    // 柵欄（在草地邊緣，避開馬路）
    const vPathX = canvasWidth * 0.3;
    const vPathWidth = canvasWidth * 0.15;

    for (let i = 0; i < 5; i++) {
        const fenceX = 50 + i * 60;
        const fenceY = canvasHeight * 0.7 + 20;

        // 檢查柵欄是否與垂直馬路重疊
        const fenceEndX = fenceX + 54;
        const overlapsRoad = !(fenceEndX < vPathX || fenceX > vPathX + vPathWidth);

        // 只繪製不與馬路重疊的柵欄段
        if (!overlapsRoad) {
            // 柵欄柱
            ctx.fillStyle = '#8B7355';
            ctx.fillRect(fenceX, fenceY, 4, 40);
            ctx.fillRect(fenceX + 50, fenceY, 4, 40);

            // 橫桿
            ctx.fillRect(fenceX, fenceY + 10, 54, 3);
            ctx.fillRect(fenceX, fenceY + 25, 54, 3);
        }
    }
}

// ========== 碰撞檢測 ==========
function checkCollisions() {
    for (let i = 0; i < characters.length; i++) {
        const char1 = characters[i];

        // 如果角色已在對話中，跳過
        if (char1.isTalking) {
            updateCharacterCard(char1.id, true);
            continue;
        }

        updateCharacterCard(char1.id, false);

        for (let j = i + 1; j < characters.length; j++) {
            const char2 = characters[j];

            // 如果另一個角色也在對話中，跳過
            if (char2.isTalking) continue;

            // 檢查冷卻時間（防止同一對角色短時間內重複對話）
            if (!char1.canTalkWith(char2.id) || !char2.canTalkWith(char1.id)) {
                continue;
            }

            // 計算距離
            const dx = char1.x - char2.x;
            const dy = char1.y - char2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 如果距離小於 70（縮小觸發距離），觸發對話
            if (distance < 70) {
                startConversation(char1, char2);
            }
        }
    }
}

function updateCharacterCard(charId, isTalking) {
    const card = document.getElementById(`char-card-${charId}`);
    if (card) {
        if (isTalking) {
            card.classList.add('talking');
        } else {
            card.classList.remove('talking');
        }
    }
}

// ========== 對話系統 ==========
async function startConversation(char1, char2) {
    // 決定對話輪數（2-4 輪，每輪一人說話）
    const totalRounds = Math.floor(Math.random() * 3) + 2; // 2-4 輪

    // 標記兩個角色正在對話
    char1.startTalking(char2, totalRounds);
    char2.startTalking(char1, totalRounds);

    console.log(`${char1.name} 遇到了 ${char2.name}，將進行 ${totalRounds} 輪對話`);

    // 開始多輪對話
    await conductMultipleRounds(char1, char2, totalRounds);
}

// 進行多輪對話
async function conductMultipleRounds(char1, char2, totalRounds) {
    for (let round = 0; round < totalRounds; round++) {
        // 如果角色不再對話中（被中斷），則停止
        if (!char1.isTalking || !char2.isTalking) {
            break;
        }

        try {
            // 呼叫 API 生成對話
            const response = await fetch('/api/generate-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    character1Id: char1.id,
                    character2Id: char2.id
                })
            });

            if (!response.ok) {
                throw new Error('生成對話失敗');
            }

            const conversation = await response.json();
            conversations.push(conversation);

            // 更新本地關係數據
            if (conversation.affinityScore !== undefined && conversation.currentAffinity !== undefined) {
                relationships[char1.id][char2.id] = conversation.currentAffinity;
                relationships[char2.id][char1.id] = conversation.currentAffinity;

                // 只在最後一輪更新顯示
                if (round === totalRounds - 1) {
                    updateRelationshipDisplay(char1.id, char2.id, conversation.currentAffinity, conversation.affinityScore);
                }

                console.log(`[第 ${round + 1}/${totalRounds} 輪] 好感度更新: ${char1.name} ↔ ${char2.name} = ${conversation.currentAffinity} (${conversation.affinityScore > 0 ? '+' : ''}${conversation.affinityScore})`);
            }

            // 顯示對話氣泡
            showSpeechBubble(char1, char2, conversation);

            // 更新對話記錄
            addConversationMessage(conversation);

            // 更新角色的對話輪數
            char1.conversationRounds++;
            char2.conversationRounds++;

            // 如果不是最後一輪，等待 3-5 秒再繼續
            if (round < totalRounds - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
            }

        } catch (error) {
            console.error('生成對話時發生錯誤:', error);
            // 發生錯誤時結束對話
            char1.stopTalking();
            char2.stopTalking();
            return;
        }
    }

    // 所有輪次完成後，結束對話
    char1.stopTalking();
    char2.stopTalking();
    console.log(`${char1.name} 和 ${char2.name} 的對話結束`);
}

function showSpeechBubble(char1, char2, conversation) {
    const speaker = conversation.characterId === char1.id ? char1 : char2;

    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.textContent = conversation.message;

    // 計算氣泡位置
    const rect = canvas.getBoundingClientRect();
    bubble.style.left = `${speaker.x}px`;
    bubble.style.top = `${speaker.y - 70}px`;

    speechBubbles.appendChild(bubble);

    // 5 秒後移除氣泡
    setTimeout(() => {
        bubble.remove();
    }, 5000);
}

function addConversationMessage(conversation) {
    const char = characters.find(c => c.id === conversation.characterId);
    if (!char) return;

    // 更新對話標籤
    updateConversationTabs();

    // 根據當前篩選器決定是否顯示
    if (!shouldShowConversation(conversation)) {
        return;
    }

    // 如果是第一條訊息，移除空狀態
    const emptyState = conversationList.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const message = document.createElement('div');
    message.className = `message ${char.gender}`;
    message.dataset.participants = conversation.participants ? conversation.participants.sort().join('-') : '';

    const time = new Date(conversation.timestamp).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit'
    });

    message.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${characterAvatars[conversation.characterId]}</span>
            <span class="message-author">${conversation.character}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${conversation.message}</div>
    `;

    conversationList.appendChild(message);
    conversationList.scrollTop = conversationList.scrollHeight;

    // 更新計數
    messageCount.textContent = conversations.length;
}

// 檢查對話是否應該顯示
function shouldShowConversation(conversation) {
    if (currentFilter === 'all') return true;

    if (conversation.participants && conversation.participants.length === 2) {
        const pairKey = conversation.participants.sort().join('-');
        return pairKey === currentFilter;
    }

    return false;
}

// 更新對話標籤
function updateConversationTabs() {
    // 統計每對角色的對話數
    const pairCounts = {};

    conversations.forEach(conv => {
        if (conv.participants && conv.participants.length === 2) {
            const pairKey = conv.participants.sort().join('-');
            pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
        }
    });

    // 清空現有標籤
    conversationTabs.innerHTML = '';

    // 為每對有對話的角色創建標籤
    Object.keys(pairCounts).sort((a, b) => pairCounts[b] - pairCounts[a]).forEach(pairKey => {
        const [id1, id2] = pairKey.split('-');
        const char1 = characters.find(c => c.id === id1);
        const char2 = characters.find(c => c.id === id2);

        if (!char1 || !char2) return;

        const tab = document.createElement('div');
        tab.className = `conversation-tab ${currentFilter === pairKey ? 'active' : ''}`;
        tab.dataset.pairKey = pairKey;
        tab.innerHTML = `
            <span class="tab-avatars">${characterAvatars[id1]} ${characterAvatars[id2]}</span>
            <span class="tab-count">(${pairCounts[pairKey]})</span>
        `;

        tab.addEventListener('click', () => filterConversations(pairKey));
        conversationTabs.appendChild(tab);
    });
}

// 篩選對話
function filterConversations(pairKey) {
    currentFilter = pairKey;

    // 更新標籤狀態
    document.querySelectorAll('.conversation-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.pairKey === pairKey);
    });

    viewAllBtn.classList.remove('active');

    // 重新渲染對話列表
    renderFilteredConversations();
}

// 渲染篩選後的對話
function renderFilteredConversations() {
    conversationList.innerHTML = '';

    const filteredConversations = conversations.filter(conv => shouldShowConversation(conv));

    if (filteredConversations.length === 0) {
        conversationList.innerHTML = '<div class="empty-state"><p>這兩個角色還沒有對話記錄</p></div>';
        return;
    }

    filteredConversations.forEach(conv => {
        const char = characters.find(c => c.id === conv.characterId);
        if (!char) return;

        const message = document.createElement('div');
        message.className = `message ${char.gender}`;

        const time = new Date(conv.timestamp).toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit'
        });

        message.innerHTML = `
            <div class="message-header">
                <span class="message-avatar">${characterAvatars[conv.characterId]}</span>
                <span class="message-author">${conv.character}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${conv.message}</div>
        `;

        conversationList.appendChild(message);
    });

    conversationList.scrollTop = conversationList.scrollHeight;
}

// ========== 儲存/清除對話 ==========
async function saveConversations() {
    if (conversations.length === 0) {
        alert('目前沒有對話記錄可儲存');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';

    try {
        const response = await fetch('/api/save', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            alert('對話記錄已儲存到 conversations 資料夾');
        }
    } catch (error) {
        console.error('儲存失敗:', error);
        alert('儲存對話失敗');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '儲存';
    }
}

async function clearConversations() {
    if (conversations.length === 0) {
        return;
    }

    if (!confirm('確定要清除所有對話記錄嗎？')) {
        return;
    }

    try {
        const response = await fetch('/api/clear', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            conversations = [];
            conversationList.innerHTML = `
                <div class="empty-state">
                    <p>點擊「開始模擬」讓角色們開始互動</p>
                </div>
            `;
            messageCount.textContent = '0';
            speechBubbles.innerHTML = '';
        }
    } catch (error) {
        console.error('清除失敗:', error);
        alert('清除對話記錄失敗');
    }
}

// 載入已儲存的對話記錄列表
async function loadSavedConversationsList() {
    try {
        const response = await fetch('/api/saved-conversations');
        const fileList = await response.json();

        // 清空選單
        loadSelect.innerHTML = '<option value="">選擇對話記錄...</option>';

        // 添加選項
        fileList.forEach(file => {
            const option = document.createElement('option');
            option.value = file.filename;
            option.textContent = file.displayName;
            loadSelect.appendChild(option);
        });

        console.log(`已載入 ${fileList.length} 個對話記錄檔案`);
    } catch (error) {
        console.error('載入對話記錄列表失敗:', error);
    }
}

// 載入選定的對話記錄
async function loadSelectedConversation() {
    const selectedFile = loadSelect.value;

    if (!selectedFile) {
        alert('請先選擇一個對話記錄');
        return;
    }

    if (!confirm('載入對話記錄將替換當前的對話歷史，確定要繼續嗎？')) {
        return;
    }

    try {
        const response = await fetch('/api/load-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: selectedFile
            })
        });

        const result = await response.json();

        if (result.success) {
            // 更新本地對話記錄
            conversations = result.conversations;

            // 重新渲染對話記錄
            renderFilteredConversations();
            updateConversationTabs();
            messageCount.textContent = conversations.length;

            alert(result.message);
            console.log('對話記錄已載入');
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('載入對話記錄失敗:', error);
        alert('載入對話記錄失敗');
    }
}

// ========== 啟動 ==========
document.addEventListener('DOMContentLoaded', init);
