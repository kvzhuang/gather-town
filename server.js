require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 載入角色資料
let characters = [];
let conversationHistory = [];
let relationships = {};

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// 載入角色資料
async function loadCharacters() {
  try {
    const data = await fs.readFile('characters.json', 'utf8');
    characters = JSON.parse(data);
    console.log(`已載入 ${characters.length} 個角色`);
  } catch (error) {
    console.error('載入角色資料失敗:', error);
  }
}

// 載入關係資料
async function loadRelationships() {
  try {
    const data = await fs.readFile('relationships.json', 'utf8');
    relationships = JSON.parse(data);
    console.log('已載入角色關係數據');
  } catch (error) {
    console.error('載入關係資料失敗:', error);
    // 如果檔案不存在，初始化關係
    relationships = {};
    characters.forEach(char1 => {
      relationships[char1.id] = {};
      characters.forEach(char2 => {
        if (char1.id !== char2.id) {
          relationships[char1.id][char2.id] = 50; // 初始好感度 50
        }
      });
    });
  }
}

// 儲存關係資料
async function saveRelationships() {
  try {
    await fs.writeFile('relationships.json', JSON.stringify(relationships, null, 2), 'utf8');
    console.log('關係數據已儲存');
  } catch (error) {
    console.error('儲存關係資料失敗:', error);
  }
}

// 儲存對話記錄
async function saveConversation(conversation) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversations/conversation_${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(conversation, null, 2), 'utf8');
    console.log(`對話已儲存: ${filename}`);
  } catch (error) {
    console.error('儲存對話失敗:', error);
  }
}

// 生成角色對話的 system prompt
function getCharacterPrompt(character) {
  return `你是${character.name}，${character.age}歲，職業是${character.occupation}。
性格特點：${character.personality}
興趣愛好：${character.interests.join('、')}
背景：${character.background}

正面特質：${character.positiveTraits ? character.positiveTraits.join('、') : '無'}
負面特質：${character.negativeTraits ? character.negativeTraits.join('、') : '無'}

重要：你必須真實地展現這個角色的正面和負面特質。不要總是友善和正面，有時候要：
- 展現你的負面特質（如傲慢、挑剔、情緒化、說教等）
- 對不感興趣的話題表現冷淡或敷衍
- 與價值觀不同的人產生摩擦
- 在心情不好時態度較差
- 批評或質疑對方的觀點

對話要自然、生活化，展現真實的人性。回應要簡短（1-3句話），不要太長。`;
}

// 使用 AI 評估對話質量
async function evaluateConversation(speaker, listener, message) {
  try {
    const evaluationPrompt = `你是一個非常嚴格、挑剔的情感分析專家。請極度嚴苛地評估以下對話的情感和互動質量：

說話者：${speaker.name}（${speaker.occupation}）
聽眾：${listener.name}（${listener.occupation}）
對話內容：「${message}」

評分標準（-10 到 +10）：
- 極度正面、真誠的讚美、深刻共鳴、建立深厚友誼：+6 到 +10（非常罕見）
- 有意義的共同興趣、真心的關懷、有深度的對話：+2 到 +5
- 普通閒聊、客套話、打招呼、天氣話題：-2 到 +1
- 無聊、敷衍、話題不合、冷淡回應：-5 到 -3
- 批評、否定、尷尬、挖苦、不屑：-8 到 -6
- 冒犯、爭執、侮辱、非常負面的互動：-10 到 -9

嚴格要求：
1. 80% 的對話應該在 -3 到 +2 之間
2. 普通打招呼給 -1 到 0 分
3. 客套寒暄給 0 到 +1 分
4. 只有真正深入、有共鳴、建立友誼的對話才能超過 +3 分
5. 考慮兩人職業、性格是否契合，不契合給負分
6. 重複、無聊的話題給負分
7. 如果對話中展現負面特質（傲慢、說教、挑剔等）必須給負分
8. 預設立場是：大部分日常對話都很平庸，應給予 -2 到 +1 分

只回答一個數字，不要其他說明。`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: evaluationPrompt }
      ],
      temperature: 0.5,
      max_tokens: 10
    });

    const scoreText = completion.choices[0].message.content.trim();
    let score = parseInt(scoreText);

    // 確保分數在合理範圍內
    if (isNaN(score)) {
      // 如果解析失敗，給予隨機的中性到略負面分數
      score = Math.floor(Math.random() * 5) - 2; // -2 到 +2
    }

    score = Math.max(-10, Math.min(10, score));

    // 增加一些隨機性，讓評分更真實
    const randomAdjust = Math.floor(Math.random() * 3) - 1; // -1, 0, 或 +1
    score = Math.max(-10, Math.min(10, score + randomAdjust));

    return score;

  } catch (error) {
    console.error('評估對話時發生錯誤:', error);
    // 錯誤時返回隨機的略負面分數
    return Math.floor(Math.random() * 4) - 2; // -2 到 +1
  }
}

// 更新關係好感度
function updateRelationship(char1Id, char2Id, score) {
  // 更新雙向關係
  if (relationships[char1Id] && relationships[char1Id][char2Id] !== undefined) {
    relationships[char1Id][char2Id] = Math.max(0, Math.min(100, relationships[char1Id][char2Id] + score));
  }

  if (relationships[char2Id] && relationships[char2Id][char1Id] !== undefined) {
    relationships[char2Id][char1Id] = Math.max(0, Math.min(100, relationships[char2Id][char1Id] + score));
  }

  console.log(`關係更新: ${char1Id} ↔ ${char2Id}, 評分: ${score > 0 ? '+' : ''}${score}`);
}

// 生成對話情境
function getConversationContext(recentHistory) {
  if (recentHistory.length === 0) {
    const topics = [
      '最近的工作狀況',
      '週末的計畫',
      '最近看的電影或書',
      '有趣的生活經歷',
      '對某個社會話題的看法',
      '美食或餐廳推薦',
      '運動或健康話題',
      '旅行經驗分享'
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    return `這是一群朋友的日常聊天。請自然地開始聊關於「${topic}」的話題。`;
  }

  const lastMessages = recentHistory.slice(-3).map(h =>
    `${h.character}: ${h.message}`
  ).join('\n');

  return `根據最近的對話內容，自然地回應或延續話題：\n${lastMessages}`;
}

// API: 獲取所有角色
app.get('/api/characters', (req, res) => {
  res.json(characters);
});

// API: 獲取對話歷史
app.get('/api/conversations', (req, res) => {
  res.json(conversationHistory);
});

// API: 獲取關係數據
app.get('/api/relationships', (req, res) => {
  res.json(relationships);
});

// API: 生成兩個角色之間的對話
app.post('/api/generate-conversation', async (req, res) => {
  try {
    const { character1Id, character2Id } = req.body;

    const char1 = characters.find(c => c.id === character1Id);
    const char2 = characters.find(c => c.id === character2Id);

    if (!char1 || !char2) {
      return res.status(400).json({ error: '找不到指定的角色' });
    }

    // 決定誰先發言（隨機）
    const firstSpeaker = Math.random() > 0.5 ? char1 : char2;
    const listener = firstSpeaker === char1 ? char2 : char1;

    // 獲取相關的對話歷史（這兩個角色之間的最近對話）
    const recentHistory = conversationHistory
      .filter(h => h.characterId === char1.id || h.characterId === char2.id)
      .slice(-3);

    // 獲取當前好感度
    const currentAffinity = relationships[firstSpeaker.id]?.[listener.id] || 50;

    // 生成對話情境（考慮好感度）
    let contextPrompt;
    if (recentHistory.length === 0) {
      const topics = [
        '最近的工作狀況',
        '週末的計畫',
        '最近看的電影或書',
        '有趣的生活經歷',
        '天氣和心情',
        '美食或餐廳推薦',
        '運動或健康話題',
        '旅行經驗分享'
      ];
      const topic = topics[Math.floor(Math.random() * topics.length)];

      let affinityHint = '';
      if (currentAffinity >= 70) {
        affinityHint = '你們是很好的朋友，相處融洽。';
      } else if (currentAffinity <= 30) {
        affinityHint = '你們之間有些隔閡，互動有些生疏。';
      }

      contextPrompt = `你在路上遇到了${listener.name}，主動打招呼並聊聊關於「${topic}」的話題。${affinityHint}`;
    } else {
      const lastMessages = recentHistory.map(h => `${h.character}: ${h.message}`).join('\n');
      contextPrompt = `繼續和${listener.name}的對話：\n${lastMessages}`;
    }

    // 呼叫 OpenAI API 生成對話
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: getCharacterPrompt(firstSpeaker) },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.8,
      max_tokens: 150
    });

    const message = completion.choices[0].message.content.trim();

    // 評估對話質量
    const score = await evaluateConversation(firstSpeaker, listener, message);

    // 更新關係
    updateRelationship(char1.id, char2.id, score);

    // 每 10 次對話儲存一次關係
    if (conversationHistory.length % 10 === 0) {
      await saveRelationships();
    }

    // 記錄對話
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      characterId: firstSpeaker.id,
      character: firstSpeaker.name,
      message: message,
      participants: [char1.id, char2.id],
      affinityScore: score,
      currentAffinity: relationships[char1.id][char2.id]
    };

    conversationHistory.push(conversationEntry);

    // 每 20 條對話自動儲存一次
    if (conversationHistory.length % 20 === 0) {
      await saveConversation(conversationHistory);
    }

    res.json(conversationEntry);

  } catch (error) {
    console.error('生成對話時發生錯誤:', error);
    res.status(500).json({ error: '生成對話失敗', details: error.message });
  }
});

// API: 生成新對話（保留原有功能）
app.post('/api/generate', async (req, res) => {
  try {
    // 隨機選擇一個角色發言
    const character = characters[Math.floor(Math.random() * characters.length)];

    // 準備對話內容
    const systemPrompt = getCharacterPrompt(character);
    const contextPrompt = getConversationContext(conversationHistory);

    // 呼叫 OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.8,
      max_tokens: 150
    });

    const message = completion.choices[0].message.content.trim();

    // 記錄對話
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      characterId: character.id,
      character: character.name,
      message: message
    };

    conversationHistory.push(conversationEntry);

    // 每 20 條對話自動儲存一次
    if (conversationHistory.length % 20 === 0) {
      await saveConversation(conversationHistory);
    }

    res.json(conversationEntry);

  } catch (error) {
    console.error('生成對話時發生錯誤:', error);
    res.status(500).json({ error: '生成對話失敗', details: error.message });
  }
});

// API: 手動儲存對話
app.post('/api/save', async (req, res) => {
  try {
    await saveConversation(conversationHistory);
    await saveRelationships();
    res.json({ success: true, message: '對話和關係數據已儲存' });
  } catch (error) {
    res.status(500).json({ error: '儲存失敗', details: error.message });
  }
});

// API: 清除對話歷史
app.post('/api/clear', (req, res) => {
  conversationHistory = [];
  res.json({ success: true, message: '對話歷史已清除' });
});

// API: 列出所有已儲存的對話記錄
app.get('/api/saved-conversations', async (req, res) => {
  try {
    const files = await fs.readdir('conversations');
    const conversationFiles = files
      .filter(f => f.startsWith('conversation_') && f.endsWith('.json'))
      .sort()
      .reverse(); // 最新的在前面

    const fileList = conversationFiles.map(filename => {
      // 從檔名提取時間戳
      const timestamp = filename.replace('conversation_', '').replace('.json', '');
      const dateStr = timestamp.replace(/-/g, ':').substring(0, 19);
      return {
        filename,
        timestamp: dateStr,
        displayName: `對話記錄 - ${dateStr}`
      };
    });

    res.json(fileList);
  } catch (error) {
    console.error('讀取對話記錄列表失敗:', error);
    res.json([]);
  }
});

// API: 載入指定的對話記錄
app.post('/api/load-conversation', async (req, res) => {
  try {
    const { filename } = req.body;
    const filepath = path.join('conversations', filename);

    const data = await fs.readFile(filepath, 'utf8');
    const loadedConversations = JSON.parse(data);

    // 替換當前的對話歷史
    conversationHistory = loadedConversations;

    console.log(`已載入對話記錄: ${filename}, 共 ${conversationHistory.length} 條對話`);
    res.json({
      success: true,
      message: `已載入 ${conversationHistory.length} 條對話記錄`,
      conversations: conversationHistory
    });
  } catch (error) {
    console.error('載入對話記錄失敗:', error);
    res.status(500).json({ error: '載入失敗', details: error.message });
  }
});

// 啟動伺服器
async function startServer() {
  await loadCharacters();
  await loadRelationships();

  app.listen(PORT, () => {
    console.log(`\n🎭 AI 社群互動系統已啟動`);
    console.log(`📡 伺服器運行於: http://localhost:${PORT}`);
    console.log(`👥 已載入 ${characters.length} 個角色`);
    console.log(`💝 已載入關係系統`);
    console.log('\n按 Ctrl+C 停止伺服器\n');
  });
}

startServer();
