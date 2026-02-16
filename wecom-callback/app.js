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
    source: '', referrer: '',
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
  let prompt = '你是小不，"不打烊NeverClose"公司的AI商务顾问。\n';
  prompt += '"不打烊"是一家做AI智能助手的科技公司，帮生鲜店、水果店等小商户实现24小时自动回复、智能营销、客户管理。\n\n';
  prompt += '你面对的人有两类：\n';
  prompt += '1. 生鲜店/水果店老板 — 来咨询产品的潜在客户\n';
  prompt += '2. 想做城市合伙人的人 — 来了解代理加盟的\n\n';
  prompt += '说话风格：\n';
  prompt += '- 像朋友聊天，自然随意，不要客服腔\n';
  prompt += '- 简短回复，3-5句话\n';
  prompt += '- 懂行，能聊生鲜行业的痛点和解决方案\n';
  prompt += '- 不急着推销，先了解对方需求\n\n';

  prompt += '产品信息：\n';
  prompt += '- 不打烊AI助手：帮小商户24小时自动回复客户、智能营销、数据分析\n';
  prompt += '- 基础版：初装¥800+年费¥2,880（月均¥240）— AI自动回复+基础报表\n';
  prompt += '- 标准版：初装¥1,200+年费¥5,760（月均¥480）— +智能营销+客户画像 推荐\n';
  prompt += '- 专业版：初装¥1,800+年费¥9,600（月均¥800）— +多店管理+供应链\n';
  prompt += '- 免费试用7天，不满意退款\n';
  prompt += '- 官网：ai.frulia.top\n\n';

  prompt += '合伙人计划：\n';
  prompt += '- 分润：初装费50% + 首年年费35% + 续费年费30%\n';
  prompt += '- 举例：推荐1个标准版客户，初装费赚600+首年年费赚2016=首年赚¥2,616\n';
  prompt += '- 每月推荐5个标准版，年收入¥15万+（初装费3.6万+年费12万）\n';
  prompt += '- 客户续费你持续拿30%，躺赚\n';
  prompt += '- 银牌¥5,000保证金 → 金牌¥2万(区域独家) → 钻石¥5万(地级市独家)\n';
  prompt += '- 4个月回本，认真做6个月月入过万\n';
  prompt += '- 详情：ai.frulia.top/partner.html\n\n';

  prompt += '成功案例（可以提但别编新的）：\n';
  prompt += '- 杭州王老板(水果店)：漏单率从30%降到5%\n';
  prompt += '- 成都李姐(生鲜超市)：AI写朋友圈，营业额+35%\n';
  prompt += '- 武汉张哥(社区菜店)：每天省2小时回消息\n\n';

  if (customer.name || customer.tags.length > 0 || customer.notes) {
    prompt += '=== 这位咨询者的档案 ===\n';
    if (customer.name) prompt += '称呼：' + customer.name + '\n';
    if (customer.shopName) prompt += '店铺：' + customer.shopName + '\n';
    if (customer.shopType) prompt += '行业：' + customer.shopType + '\n';
    if (customer.address) prompt += '地区：' + customer.address + '\n';
    if (customer.preferences.length) prompt += '关注点：' + customer.preferences.join('、') + '\n';
    if (customer.tags.length) prompt += '标签：' + customer.tags.join('、') + '\n';
    if (customer.notes) prompt += '备注：' + customer.notes + '\n';
    prompt += '联系次数：' + customer.contactCount + '次\n';
    prompt += '首次联系：' + customer.firstContact.slice(0, 10) + '\n';
    prompt += '========================\n\n';
    prompt += '利用这些信息自然地聊天，但别一上来就背档案。\n';
  } else {
    prompt += '这是新的咨询者，还不了解ta。先了解对方是开店的还是想做合伙人。\n';
  }

  prompt += '\n每次对话后，如果获取到新信息，在回复最后另起一行写：\n';
  prompt += '[UPDATE]{"name":"张老板","shopName":"鲜果坊","shopType":"水果店","address":"杭州","tags":["潜在客户","对标准版感兴趣"],"notes":"3家连锁店，月营业额10万"}\n';
  prompt += '只在有新信息时才加[UPDATE]，没有就不加。tags可选：潜在客户、意向客户、合伙人意向、价格敏感、决策者、已试用等。';

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
  if (m.includes('价格') || m.includes('多少钱') || m.includes('收费')) return '基础版月均240，标准版月均480（推荐），专业版月均800。免费试用7天，详情看 ai.frulia.top';
  if (m.includes('合伙人') || m.includes('代理') || m.includes('加盟')) return '合伙人推荐1个客户年赚1400-4260，续费持续分润。详情：ai.frulia.top/partner.html';
  if (m.includes('试用') || m.includes('体验')) return '可以免费试用7天！告诉我你的店铺名称和主营品类，我帮你安排~';
  return '你好！我是不打烊AI助手的商务顾问小不，你是想了解产品还是合伙人计划？';
}

// === 主动跟进引擎 ===
function checkProactiveMessages() {
  if (!fs.existsSync(CUSTOMERS_DIR)) return;
  const files = fs.readdirSync(CUSTOMERS_DIR).filter(f => f.endsWith('.json'));
  const now = new Date();
  const hour = now.getHours();
  if (hour < 9 || hour > 20) return;

  files.forEach(file => {
    try {
      const customer = JSON.parse(fs.readFileSync(path.join(CUSTOMERS_DIR, file), 'utf8'));
      if (!customer.proactiveOk) return;
      const lastContact = new Date(customer.lastContact);
      const daysSince = (now - lastContact) / (1000 * 60 * 60 * 24);
      const name = customer.name || '';

      // 3天没回来的意向客户，温和跟进
      if (daysSince >= 3 && daysSince < 4 && customer.tags.includes('意向客户')) {
        const msg = (name ? name + '，' : '') + '上次聊到的AI助手方案，你考虑得怎么样了？有什么顾虑可以随时问我~';
        sendMessage(customer.id, msg).then(() => {
          console.log('[Follow-up] 3day sent to', name || customer.id);
          customer.lastContact = now.toISOString();
          fs.writeFileSync(path.join(CUSTOMERS_DIR, file), JSON.stringify(customer, null, 2));
        });
      }

      // 7天没回来的潜在客户，分享案例
      if (daysSince >= 7 && daysSince < 8 && customer.tags.includes('潜在客户')) {
        const msg = (name ? name + '，' : '老板，') + '最近有个水果店老板用了我们的AI助手，一个月多赚了8000多，要不要了解下？';
        sendMessage(customer.id, msg).then(() => {
          console.log('[Follow-up] 7day sent to', name || customer.id);
          customer.lastContact = now.toISOString();
          fs.writeFileSync(path.join(CUSTOMERS_DIR, file), JSON.stringify(customer, null, 2));
        });
      }
    } catch(e) { /* skip */ }
  });
}

setInterval(checkProactiveMessages, 60 * 60 * 1000);

// === XML 解析（增强版，支持事件）===
function parseXML(xml) {
  const get = (tag) => {
    const m = xml.match(new RegExp('<' + tag + '><!\\[CDATA\\[(.+?)\\]\\]></' + tag + '>')) ||
              xml.match(new RegExp('<' + tag + '>(.+?)</' + tag + '>'));
    return m ? m[1] : '';
  };
  return {
    ToUserName: get('ToUserName'), FromUserName: get('FromUserName'),
    MsgType: get('MsgType'), Content: get('Content'), Encrypt: get('Encrypt'),
    Event: get('Event'), EventKey: get('EventKey'), AgentID: get('AgentID')
  };
}

// === 欢迎消息 ===
async function sendWelcome(userId, source, eventKey) {
  const customer = loadCustomer(userId);
  if (eventKey) {
    customer.source = eventKey;
    const parts = eventKey.split('_');
    if (parts.length > 1) customer.referrer = parts.slice(1).join('_');
    else customer.referrer = eventKey;
  }
  let msg;
  if (source === 'partner') {
    msg = '你好！欢迎了解"不打烊"城市合伙人计划 🤝\n\n';
    msg += '推荐1个标准版客户首年赚¥2,616，续费持续分润30%。\n';
    msg += '每月推荐5个客户，年收入15万+。\n\n';
    msg += '你可以直接问我任何问题，比如：\n';
    msg += '• 怎么赚钱？\n• 需要投入多少？\n• 怎么推广？';
    customer.tags = [...new Set([...customer.tags, '合伙人意向'])];
  } else {
    msg = '你好老板！我是小不，"不打烊"AI助手的商务顾问 👋\n\n';
    msg += '我们帮生鲜店/水果店实现：\n';
    msg += '• 24小时AI自动回复客户\n• 智能营销（朋友圈文案、促销方案）\n• 客户数据分析\n\n';
    msg += '免费试用7天，你可以直接问我，比如：\n';
    msg += '• 怎么用？\n• 多少钱？\n• 适合我的店吗？';
    customer.tags = [...new Set([...customer.tags, '潜在客户'])];
  }
  saveCustomer(userId, customer);
  await sendMessage(userId, msg);
  console.log('[Welcome] sent to', userId, 'source:', source, 'ref:', customer.referrer || 'direct');
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

  // 渠道统计 API
  if (url.pathname === '/api/channels' && req.method === 'GET') {
    const files = fs.existsSync(CUSTOMERS_DIR) ? fs.readdirSync(CUSTOMERS_DIR).filter(f => f.endsWith('.json')) : [];
    const stats = {};
    files.forEach(f => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(CUSTOMERS_DIR, f), 'utf8'));
        const ref = c.referrer || c.source || 'direct';
        if (!stats[ref]) stats[ref] = { count: 0, tags: {}, customers: [] };
        stats[ref].count++;
        stats[ref].customers.push({ id: c.id, name: c.name, tags: c.tags, firstContact: c.firstContact });
        c.tags.forEach(t => { stats[ref].tags[t] = (stats[ref].tags[t] || 0) + 1; });
      } catch(e) {}
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
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
          console.log('[Msg] ' + msg.FromUserName + ' type=' + msg.MsgType + (msg.Event ? ' event=' + msg.Event : '') + (msg.Content ? ' content=' + msg.Content : ''));

          // 事件消息（关注、进入应用等）
          if (msg.MsgType === 'event') {
            if (msg.Event === 'subscribe' || msg.Event === 'enter_agent') {
              const source = (msg.EventKey && msg.EventKey.includes('partner')) ? 'partner' : 'customer';
              await sendWelcome(msg.FromUserName, source, msg.EventKey);
            }
            return;
          }

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
