const http = require('http');
const https = require('https');
const crypto = require('crypto');
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

const SYSTEM_PROMPT = '你是小不，不打烊AI助手的营销顾问。你不是客服机器人，你是一个真正懂生鲜生意的朋友。\n\n' +
'你的说话风格：\n' +
'- 像朋友聊天一样自然，不要用模板化的格式\n' +
'- 别动不动就列清单、加emoji轰炸，正常说话就行\n' +
'- 可以偶尔用1-2个emoji，但别每句话都加\n' +
'- 说人话，别说官话。比如别说"为您提供"，说"帮你搞定"\n' +
'- 如果对方就是随便聊聊，你也随便聊，别急着推销\n' +
'- 回复简短，一般3-5句话就够了，别写小作文\n\n' +
'你知道的产品信息（别人问了才说，别主动背书）：\n' +
'- 不打烊AI助手帮小商户24小时自动回复、智能营销、数据分析\n' +
'- 基础版初装800+年费2880，标准版初装1200+年费5760，专业版初装1800+年费9600\n' +
'- 免费试用7天，不满意退款\n' +
'- 官网 ai.frulia.top\n\n' +
'你能帮老板做的事：\n' +
'- 写朋友圈文案、促销活动方案\n' +
'- 分析经营问题给建议\n' +
'- 回答产品问题\n\n' +
'关键：像个真人朋友一样聊天，不要像个AI。';

// === 对话历史管理（简单内存存储）===
const chatHistory = {};
const MAX_HISTORY = 10;

function getUserHistory(userId) {
  if (!chatHistory[userId]) chatHistory[userId] = [];
  return chatHistory[userId];
}

function addToHistory(userId, role, content) {
  const history = getUserHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) {
    chatHistory[userId] = history.slice(-MAX_HISTORY * 2);
  }
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); } });
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
  const data = await httpGet(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${SECRET}`);
  if (data.errcode === 0) {
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('[Token] refreshed');
  } else {
    console.error('[Token] error:', data);
  }
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
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
    { touser: userId, msgtype: 'text', agentid: parseInt(AGENT_ID), text: { content } }
  );
  if (data.errcode !== 0) console.error('[Send] error:', data);
  return data;
}

// === 调用 AI ===
async function getAIReply(userMsg, userId) {
  addToHistory(userId, 'user', userMsg);
  const messages = getUserHistory(userId);

  try {
    const data = await httpPost(`https://${AI_BASE_URL}/claude/v1/messages`, {
      model: AI_MODEL,
      max_tokens: 500,
      system: [{ type: 'text', text: SYSTEM_PROMPT }],
      messages: messages
    }, {
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01'
    });

    if (data.content && data.content[0]) {
      const reply = data.content[0].text;
      addToHistory(userId, 'assistant', reply);
      return reply;
    } else {
      console.error('[AI] unexpected response:', JSON.stringify(data).slice(0, 300));
      return getFallbackReply(userMsg);
    }
  } catch (e) {
    console.error('[AI] error:', e.message);
    return getFallbackReply(userMsg);
  }
}

// === 降级回复（AI不可用时）===
function getFallbackReply(msg) {
  const m = msg.trim().toLowerCase();
  if (m === '1' || m.includes('方案')) return '🤖 不打烊AI助手\n\n基础版：初装¥800+年费¥2,880\n标准版：初装¥1,200+年费¥5,760 ⭐\n专业版：初装¥1,800+年费¥9,600\n\n🎁 免费试用7天！回复"试用"体验';
  if (m.includes('试用')) return '🎉 请告诉我您的店铺名称和主营品类，24小时内为您配置！';
  if (m === '2' || m.includes('案例')) return '📊 杭州王老板漏单率降70%，成都李姐营业额+35%\n回复"方案"了解详情';
  if (m.includes('合伙人')) return '🤝 推荐1个客户年赚¥1,400-4,260\n详情：https://ai.frulia.top/partner.html';
  if (m.includes('价格')) return '💰 基础¥240/月 标准¥480/月 专业¥800/月\n回复"试用"免费体验7天';
  return '你好！我是不打烊AI助手 🤖\n回复"1"方案 "2"案例 "价格"收费 "试用"体验 "合伙人"招募';
}

// === XML 解析 ===
function parseXML(xml) {
  const get = (tag) => {
    const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[(.+?)\\]\\]></${tag}>`)) ||
              xml.match(new RegExp(`<${tag}>(.+?)</${tag}>`));
    return m ? m[1] : '';
  };
  return { ToUserName: get('ToUserName'), FromUserName: get('FromUserName'),
    MsgType: get('MsgType'), Content: get('Content'), Encrypt: get('Encrypt') };
}

// === HTTP 服务器 ===
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString(), users: Object.keys(chatHistory).length }));
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
          console.log(`[Msg] ${msg.FromUserName}: ${msg.Content}`);
          if (msg.MsgType === 'text' && msg.Content) {
            const reply = await getAIReply(msg.Content, msg.FromUserName);
            console.log(`[Reply] ${reply.slice(0, 50)}...`);
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
  console.log('[NeverClose] AI mode running on port 8787');
  getAccessToken().then(() => console.log('[NeverClose] Ready!')).catch(e => console.error('[Token]', e.message));
});
