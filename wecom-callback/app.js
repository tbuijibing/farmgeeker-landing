const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// === 企业微信配置 ===
const CORP_ID = 'ww7de88d14a05ac318';
const AGENT_ID = '1000006';
const SECRET = 'h3rgT8dO5HbJGuW3XikxCM1GsC9BXWdqOF6W_FF491M';
const TOKEN = 'FGK2026NeverClose';
const ENCODING_AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

// === AI 配置 ===
const AI_BASE_URL = 'yunyi.cfd';
const AI_API_KEY = 'R26H5VQQ-06NH-EUUX-X28R-U9FGP7JH28XV';
const AI_MODEL = 'claude-sonnet-4-5';

// === 数据目录 ===
const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_DIR = path.join(DATA_DIR, 'customers');
const CHAT_DIR = path.join(DATA_DIR, 'chats');
[DATA_DIR, CUSTOMERS_DIR, CHAT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// === 客户档案管理 ===
function getCustomerPath(userId) { return path.join(CUSTOMERS_DIR, userId + '.json'); }
function getChatPath(userId) { return path.join(CHAT_DIR, userId + '.json'); }

function loadCustomer(userId) {
  const p = getCustomerPath(userId);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { console.error('[Customer] load error:', e.message); }
  }
  return {
    id: userId, name: '', phone: '', address: '',
    shopName: '', shopType: '',
    preferences: [], dislike: [],
    purchaseHistory: [], frequentItems: [],
    tags: [], notes: '',
    firstContact: new Date().toISOString(),
    lastContact: new Date().toISOString(),
    contactCount: 0, sentiment: 'neutral',
    proactiveOk: true
  };
}

function saveCustomer(userId, data) {
  data.lastContact = new Date().toISOString();
  data.contactCount = (data.contactCount || 0) + 1;
  fs.writeFileSync(getCustomerPath(userId), JSON.stringify(data, null, 2), 'utf8');
}

function loadChat(userId) {
  const p = getChatPath(userId);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return []; }
  }
  return [];
}

function saveChat(userId, messages) {
  const keep = messages.slice(-40);
  fs.writeFileSync(getChatPath(userId), JSON.stringify(keep, null, 2), 'utf8');
}

// === 构建 System Prompt（带客户档案）===
function buildSystemPrompt(customer) {
  let prompt = '你是小不，一个水果店的AI店员。你记得每个老顾客，像真正的店员一样热情但不过分。\n\n';
  prompt += '说话风格：\n';
  prompt += '- 像街坊邻居聊天，自然随意\n';
  prompt += '- 简短回复，3-5句话，别写小作文\n';
  prompt += '- 偶尔用emoji，别轰炸\n';
  prompt += '- 记住客户说过的话，下次聊天时自然提起\n\n';

  prompt += '你的核心能力：\n';
  prompt += '1. 记住客户喜好（爱吃什么水果、口味偏好、家里几口人）\n';
  prompt += '2. 根据季节和库存主动推荐（比如"草莓季到了，上次你买的那种又有了"）\n';
  prompt += '3. 帮客户下单、查价格、推荐搭配\n';
  prompt += '4. 记住特殊日期（生日、纪念日）提前提醒送果篮\n\n';

  if (customer.name || customer.preferences.length > 0 || customer.purchaseHistory.length > 0) {
    prompt += '=== 这位客户的档案 ===\n';
    if (customer.name) prompt += '称呼：' + customer.name + '\n';
    if (customer.address) prompt += '地址：' + customer.address + '\n';
    if (customer.preferences.length) prompt += '喜好：' + customer.preferences.join('、') + '\n';
    if (customer.dislike.length) prompt += '不喜欢：' + customer.dislike.join('、') + '\n';
    if (customer.frequentItems.length) prompt += '常买：' + customer.frequentItems.join('、') + '\n';
    if (customer.purchaseHistory.length) {
      prompt += '最近购买：\n';
      customer.purchaseHistory.slice(-5).forEach(p => {
        prompt += '  - ' + p.date + ': ' + p.items + (p.amount ? ' ¥' + p.amount : '') + '\n';
      });
    }
    if (customer.tags.length) prompt += '标签：' + customer.tags.join('、') + '\n';
    if (customer.notes) prompt += '备注：' + customer.notes + '\n';
    prompt += '联系次数：' + customer.contactCount + '次\n';
    prompt += '首次联系：' + customer.firstContact.slice(0, 10) + '\n';
    prompt += '========================\n\n';
    prompt += '利用这些信息自然地聊天，比如"上次你买的XX怎么样"，但别一上来就背档案。\n';
  } else {
    prompt += '这是新客户，还不了解ta。自然地聊天，顺便了解ta的需求。\n';
  }

  prompt += '\n重要：每次对话后，你需要在回复最后用一个隐藏标记更新客户信息。\n';
  prompt += '格式：在回复正文之后，另起一行写 [UPDATE] 然后跟JSON，例如：\n';
  prompt += '[UPDATE]{"name":"张姐","preferences":["草莓","车厘子"],"frequentItems":["草莓"],"tags":["价格敏感","住附近"],"notes":"家里有小孩，喜欢甜的"}\n';
  prompt += '只在获取到新信息时才加[UPDATE]，没有新信息就不加。\n';
  prompt += 'JSON里只写需要更新的字段，不用写全部。preferences和frequentItems是追加不是覆盖。';

  return prompt;
}

// === HTTP 工具 ===
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(body);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }, headers || {})
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('JSON parse: ' + data.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(postData);
    req.end();
  });
}

// === Access Token ===
let accessToken = '';
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  const data = await httpGet('https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' + CORP_ID + '&corpsecret=' + SECRET);
  if (data.errcode === 0) {
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('[Token] refreshed');
  } else { console.error('[Token] error:', data); }
  return accessToken;
}

// === 消息加解密 ===
function decodeAESKey(k) { return Buffer.from(k + '=', 'base64'); }

function decrypt(encrypted) {
  const aesKey = decodeAESKey(ENCODING_AES_KEY);
  const iv = aesKey.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  let dec = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const pad = dec[dec.length - 1];
  dec = dec.slice(0, dec.length - pad);
  const msgLen = dec.readUInt32BE(16);
  return dec.slice(20, 20 + msgLen).toString('utf8');
}

function getSignature(token, timestamp, nonce, encrypted) {
  return crypto.createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex');
}

// === 发送企微消息 ===
async function sendMessage(userId, content) {
  const token = await getAccessToken();
  const data = await httpPost(
    'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + token,
    { touser: userId, msgtype: 'text', agentid: parseInt(AGENT_ID), text: { content } }
  );
  if (data.errcode !== 0) console.error('[Send] error:', data);
  return data;
}

// === 解析AI回复中的客户更新 ===
function parseAIResponse(text, customer) {
  const updateMatch = text.match(/\[UPDATE\](.*?)$/s);
  let reply = text;
  if (updateMatch) {
    reply = text.replace(/\n?\[UPDATE\].*$/s, '').trim();
    try {
      const updates = JSON.parse(updateMatch[1].trim());
      if (updates.name) customer.name = updates.name;
      if (updates.phone) customer.phone = updates.phone;
      if (updates.address) customer.address = updates.address;
      if (updates.shopName) customer.shopName = updates.shopName;
      if (updates.shopType) customer.shopType = updates.shopType;
      if (updates.notes) customer.notes = updates.notes;
      if (updates.tags) customer.tags = [...new Set([...customer.tags, ...updates.tags])];
      if (updates.preferences) customer.preferences = [...new Set([...customer.preferences, ...updates.preferences])];
      if (updates.dislike) customer.dislike = [...new Set([...customer.dislike, ...updates.dislike])];
      if (updates.frequentItems) customer.frequentItems = [...new Set([...customer.frequentItems, ...updates.frequentItems])];
      if (updates.purchase) {
        customer.purchaseHistory.push({ date: new Date().toISOString().slice(0, 10), ...updates.purchase });
      }
      console.log('[Profile] updated:', customer.name || customer.id, JSON.stringify(updates).slice(0, 100));
    } catch(e) { console.error('[Profile] parse error:', e.message); }
  }
  return reply;
}

// === 调用 AI ===
async function getAIReply(userMsg, userId) {
  const customer = loadCustomer(userId);
  const chatMessages = loadChat(userId);
  chatMessages.push({ role: 'user', content: userMsg });

  const systemPrompt = buildSystemPrompt(customer);
  const recentMessages = chatMessages.slice(-20);

  try {
    const data = await httpPost('https://' + AI_BASE_URL + '/claude/v1/messages', {
      model: AI_MODEL,
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt }],
      messages: recentMessages
    }, {
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01'
    });

    if (data.content && data.content[0]) {
      const rawReply = data.content[0].text;
      const reply = parseAIResponse(rawReply, customer);
      chatMessages.push({ role: 'assistant', content: reply });
      saveChat(userId, chatMessages);
      saveCustomer(userId, customer);
      return reply;
    } else {
      console.error('[AI] unexpected:', JSON.stringify(data).slice(0, 200));
      return getFallbackReply(userMsg);
    }
  } catch (e) {
    console.error('[AI] error:', e.message);
    return getFallbackReply(userMsg);
  }
}

// === 降级回复 ===
function getFallbackReply(msg) {
  const m = msg.trim().toLowerCase();
  if (m.includes('草莓')) return '草莓现在正当季呢，丹东99红颜特别甜！要不要来点？';
  if (m.includes('价格') || m.includes('多少钱')) return '你想问哪个水果的价格？告诉我，我帮你查~';
  if (m.includes('送货') || m.includes('配送')) return '3公里内免费送，一般30分钟到。你的地址发我？';
  return '你好呀！我是小不，有什么需要帮忙的吗？';
}

// === 主动营销引擎 ===
function checkProactiveMessages() {
  if (!fs.existsSync(CUSTOMERS_DIR)) return;
  const files = fs.readdirSync(CUSTOMERS_DIR).filter(f => f.endsWith('.json'));
  const now = new Date();
  const hour = now.getHours();
  if (hour < 8 || hour > 21) return;

  files.forEach(file => {
    try {
      const customer = JSON.parse(fs.readFileSync(path.join(CUSTOMERS_DIR, file), 'utf8'));
      if (!customer.proactiveOk) return;
      const lastContact = new Date(customer.lastContact);
      const daysSince = (now - lastContact) / (1000 * 60 * 60 * 24);

      if (daysSince >= 7 && daysSince < 8 && customer.frequentItems.length > 0) {
        const item = customer.frequentItems[Math.floor(Math.random() * customer.frequentItems.length)];
        const name = customer.name || '亲';
        const msg = name + '，好久没来啦！你上次买的' + item + '又到新货了，要不要来点？';
        sendMessage(customer.id, msg).then(() => {
          console.log('[Proactive] sent to', customer.name || customer.id);
          customer.lastContact = now.toISOString();
          fs.writeFileSync(path.join(CUSTOMERS_DIR, file), JSON.stringify(customer, null, 2));
        });
      }
    } catch(e) { /* skip */ }
  });
}

setInterval(checkProactiveMessages, 60 * 60 * 1000);

// === XML 解析 ===
function parseXML(xml) {
  const get = (tag) => {
    const m = xml.match(new RegExp('<' + tag + '><!\\[CDATA\\[(.+?)\\]\\]></' + tag + '>')) ||
              xml.match(new RegExp('<' + tag + '>(.+?)</' + tag + '>'));
    return m ? m[1] : '';
  };
  return { ToUserName: get('ToUserName'), FromUserName: get('FromUserName'),
    MsgType: get('MsgType'), Content: get('Content'), Encrypt: get('Encrypt') };
}

// === HTTP 服务器 ===
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);

  if (url.pathname === '/health') {
    const customerCount = fs.existsSync(CUSTOMERS_DIR) ? fs.readdirSync(CUSTOMERS_DIR).filter(f => f.endsWith('.json')).length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString(), customers: customerCount }));
    return;
  }

  // 查看客户档案 API
  if (url.pathname === '/api/customers' && req.method === 'GET') {
    const files = fs.existsSync(CUSTOMERS_DIR) ? fs.readdirSync(CUSTOMERS_DIR).filter(f => f.endsWith('.json')) : [];
    const customers = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(CUSTOMERS_DIR, f), 'utf8')); } catch(e) { return null; }
    }).filter(Boolean);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(customers, null, 2));
    return;
  }

  if (url.pathname === '/wecom/callback') {
    const msg_signature = url.searchParams.get('msg_signature');
    const timestamp = url.searchParams.get('timestamp');
    const nonce = url.searchParams.get('nonce');

    if (req.method === 'GET') {
      const echostr = url.searchParams.get('echostr');
      const sig = getSignature(TOKEN, timestamp, nonce, echostr);
      if (sig === msg_signature) {
        try { res.writeHead(200); res.end(decrypt(echostr)); console.log('[Verify] OK'); }
        catch(e) { console.error('[Verify] error:', e.message); res.writeHead(500); res.end('error'); }
      } else { res.writeHead(403); res.end('bad sig'); }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        res.writeHead(200); res.end('success');
        try {
          const xml = parseXML(body);
          const sig = getSignature(TOKEN, timestamp, nonce, xml.Encrypt);
          if (sig !== msg_signature) { console.error('[Msg] bad sig'); return; }
          const decXml = decrypt(xml.Encrypt);
          const msg = parseXML(decXml);
          console.log('[Msg] ' + msg.FromUserName + ': ' + msg.Content);
          if (msg.MsgType === 'text' && msg.Content) {
            const reply = await getAIReply(msg.Content, msg.FromUserName);
            console.log('[Reply] ' + reply.slice(0, 80));
            await sendMessage(msg.FromUserName, reply);
          }
        } catch(e) { console.error('[Msg] error:', e.message); }
      });
      return;
    }
  }

  res.writeHead(404); res.end('Not Found');
});

server.listen(8787, '0.0.0.0', () => {
  console.log('[NeverClose] AI+CRM mode running on port 8787');
  getAccessToken().then(() => console.log('[NeverClose] Ready! Data dir: ' + DATA_DIR));
});
