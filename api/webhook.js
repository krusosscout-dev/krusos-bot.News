import admin from 'firebase-admin';

// ตรวจสอบและเริ่มต้น Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase init error:', error);
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook is active');
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

  let bodyText = '';
  let bodyJson = {};

  try {
    bodyText = await getRawBody(req);
    bodyJson = JSON.parse(bodyText);
  } catch (err) {
    console.error('Error reading/parsing request body:', err);
    return res.status(200).send('OK');
  }

  const events = bodyJson.events;
  if (!events || events.length === 0) {
    return res.status(200).send('OK');
  }

  const event = events[0];

  if (event.type === 'message') {
    let userMessage = '';

    if (event.message?.type === 'text') {
      userMessage = event.message.text.trim();
    } else if (event.message?.type === 'sticker') {
      userMessage = '(ผู้ใช้ส่งสติกเกอร์มา ให้ทักทายกลับอย่างอบอุ่น สดใส เป็นมิตร พร้อมสอบถามว่ามีประเด็นสาระใดต้องการค้นคว้าหรือพูดคุยหรือไม่)';
    } else {
      return res.status(200).send('OK');
    }

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // กำหนดพฤติกรรม AI ใหม่: เน้นเนื้อหาสาระตรงจุด ห้ามแถมแผนการสอนอัตโนมัติ
    const systemPromptText = `คุณคือผู้ช่วยส่วนตัวระดับนวัตกรรมการศึกษาของผู้สอนสังคมศึกษายุคใหม่
เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString}

แนวทางการตอบกลับและโครงสร้างสำคัญ:
1. การตอบเนื้อหาและสาระสำคัญ (สำคัญที่สุด):
   - ให้เน้นตอบ "เนื้อหาสาระ ข้อเท็จจริง องค์ความรู้ หรือคำตอบตรงจุด" ตามที่ผู้ใช้ถามเป็นหลัก
   - สรุปและอธิบายให้ชัดเจน ลึกซึ้ง ครบถ้วน และเข้าใจง่าย
   - ❌ ห้ามออกแบบกิจกรรมการเรียนรู้, แผนการสอน, หรือยัดเยียดโมเดลการสอน (เช่น 4 คิด, 5E, Design Thinking, Gamification ฯลฯ) มาให้โดยอัตโนมัติเด็ดขาด
   - ✅ จะเสนอแนะแผนการสอนหรือออกแบบกิจกรรม "ก็ต่อเมื่อ" ผู้ใช้สั่งหรือร้องขออย่างชัดเจนเท่านั้น (เช่น พิมพ์ว่า "ขอไอเดียสอน", "ช่วยออกแบบแผนการสอน", "ขอแบบ 4 คิด")

2. การใช้อิโมจิและการจัดหน้า (เพื่อความอ่านง่าย):
   - แทรกอิโมจิที่เข้ากับเนื้อหาอย่างลงตัว (เช่น 💡, ✨, 📌, 📚, 🔍, 🌿, 🏛️) เพื่อให้อ่านสบายตาบนสมาร์ตโฟน
   - จัดย่อหน้าให้โปร่ง ไม่ติดกันเป็นพืดตัวหนังสือ

3. การอ้างอิงทางวิชาการ:
   - ข้อมูลที่เป็นข้อเท็จจริง ประวัติศาสตร์ ทฤษฎี หรือสถิติ ต้องถูกต้องและเชื่อถือได้เสมอ ห้ามกุข้อมูล

4. การจัดการคิวงาน / เตือนความจำ:
   - หากผู้ใช้สั่งตั้งเตือนหรือลงตารางงาน ให้ตอบกลับเป็น JSON เท่านั้น:
   {
     "isReminder": true,
     "taskDescription": "สรุปภารกิจ",
     "scheduledTimestampSeconds": 1727400000,
     "confirmationMessage": "ข้อความยืนยันพร้อมอิโมจิ ⏰"
   }`;

    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest'
    ];
    let replyRaw = '';

    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPromptText}\n\nข้อความจากผู้ใช้: ${userMessage}` }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 3500
            }
          })
        });

        const geminiData = await geminiRes.json();
        const parts = geminiData.candidates?.[0]?.content?.parts || [];
        const fullText = parts
          .filter(p => p.text && !p.thought)
          .map(p => p.text)
          .join('\n')
          .trim();

        if (geminiRes.ok && fullText) {
          replyRaw = fullText;
          break;
        } else {
          console.error(`Model ${model} failed in webhook:`, JSON.stringify(geminiData));
        }
      } catch (err) {
        console.error(`Error requesting model ${model} in webhook:`, err);
      }
    }

    if (!replyRaw) {
      replyRaw = "ขออภัยครับ ระบบกำลังประมวลผลข้อมูล กรุณาลองใหม่อีกครั้งครับ ✨";
    }

    let finalReplyText = replyRaw;

    if (replyRaw.includes('"isReminder": true') || replyRaw.includes('"isReminder":true')) {
      try {
        const cleanedJsonStr = replyRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedJsonStr);

        if (parsed.isReminder && parsed.scheduledTimestampSeconds && QSTASH_TOKEN) {
          const destinationUrl = `https://${currentHost}/api/remind-notify`;
          const qstashUrl = `https://qstash.upstash.io/v2/publish/${destinationUrl}`;

          const qstashRes = await fetch(qstashUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${QSTASH_TOKEN}`,
              'Content-Type': 'application/json',
              'Upstash-Not-Before': parsed.scheduledTimestampSeconds.toString()
            },
            body: JSON.stringify({
              userId: userId,
              taskDescription: parsed.taskDescription
            })
          });

          if (qstashRes.ok) {
            finalReplyText = parsed.confirmationMessage || `⏰ บันทึกคิวงานเรียบร้อยแล้ว: ${parsed.taskDescription} ✨`;
          }
        }
      } catch (jsonErr) {
        console.error('JSON parse error:', jsonErr);
      }
    }

    // บันทึกบทสนทนาลง Firestore (Collection: chat_history)
    if (admin.apps.length) {
      try {
        const db = admin.firestore();
        await db.collection('chat_history').add({
          question: event.message?.type === 'sticker' ? '🎨 (ส่งสติกเกอร์)' : userMessage,
          answer: finalReplyText,
          timestamp: new Date().toISOString(),
          userId: userId,
          source: 'LINE'
        });
      } catch (dbErr) {
        console.error('Error saving chat to Firestore:', dbErr);
      }
    }

    // แบ่งข้อความไม่เกิน 4800 ตัวอักษรต่อฟองสบู่ (ไม่เกิน 5 ฟองสบู่ใน reply)
    const replyMessages = [];
    if (finalReplyText.length <= 4800) {
      replyMessages.push({ type: 'text', text: finalReplyText });
    } else {
      const paras = finalReplyText.split('\n\n');
      let currentChunk = '';
      for (const p of paras) {
        if ((currentChunk + '\n\n' + p).length <= 4800) {
          currentChunk = currentChunk ? currentChunk + '\n\n' + p : p;
        } else {
          if (currentChunk) replyMessages.push({ type: 'text', text: currentChunk });
          currentChunk = p;
        }
      }
      if (currentChunk) replyMessages.push({ type: 'text', text: currentChunk });
    }

    // ตอบกลับผู้ใช้ใน LINE
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: replyMessages.slice(0, 5)
      })
    });
  }

  return res.status(200).send('OK');
}
