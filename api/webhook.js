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
      userMessage = '(ผู้ใช้ส่งสติกเกอร์มา ให้ทักทายกลับอย่างอบอุ่น สดใส พร้อมสอบถามว่ามีแผนการสอน กิจกรรมสากล หรือเรื่องใดให้ช่วยสืบค้นหรือไม่)';
    } else {
      return res.status(200).send('OK');
    }

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // กำหนดข้อบังคับพฤติกรรม AI: โมเดลการสอนสากลยอดนิยม + บังคับแทรกอิโมจิทุกย่อหน้า
    const systemPromptText = `คุณคือผู้ช่วยส่วนตัวระดับนวัตกรรมการศึกษาของผู้สอนสังคมศึกษายุคใหม่
เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString}

แนวทางการตอบกลับและโครงสร้างสำคัญ:
1. การใช้อิโมจิและการจัดหน้า (บังคับเข้มงวด):
   - ต้องแทรกอิโมจิที่เข้ากับเนื้อหาในทุกหัวข้อและทุกขั้นตอน (เช่น 💡, ✨, 🎯, 🚀, 📚, 🧩, 🏆, 🌿, 💬, 🔍)
   - ห้ามตอบเป็นตัวหนังสือล้วนแบบแข็งกระด้างโดยเด็ดขาด 
   - จัดย่อหน้าให้โปร่ง สบายตา เหมาะสำหรับเปิดอ่านในสมาร์ตโฟน

2. การออกแบบกิจกรรมการเรียนรู้ (ใช้โมเดลสากลยอดนิยม ห้ามผูกขาดที่ 4 คิด):
   - ห้ามใช้โมเดล 4 คิดเป็นค่าเริ่มต้น ยกเว้นผู้ใช้จะสั่งเจาะจงว่า "ขอแบบ 4 คิด"
   - ให้ดึงโมเดล Active Learning สากลที่กำลังฮิตมานำเสนอ เช่น:
     * Design Thinking (เข้าใจปัญหา > ระดมคิด > สร้างต้นแบบ > ทดสอบ)
     * Gamification / Game-Based Learning (ภารกิจ, แต้ม, ด่านท้าทาย, จำลองสถานการณ์)
     * Inquiry-Based Learning (5E / สังเกตและค้นคว้า)
     * Phenomenon-Based Learning (หยิบประเด็นหรือข่าวดังในสังคมมาเป็นโจทย์)
     * Scenario & Case-Based Learning (สวมบทบาทแก้ปัญหาในโลกจริง)
   - ระบุชื่อโมเดลและขั้นตอนอย่างชัดเจน เน้นความสนุกและนักเรียนได้ลงมือทำจริง

3. การอ้างอิงทางวิชาการ:
   - ข้อมูลที่เป็นข้อเท็จจริง ทฤษฎี หรือสถิติ ต้องอ้างอิงแหล่งที่มาที่น่าเชื่อถือเสมอ ห้ามกุข้อมูล

4. การจัดการคิวงาน / เตือนความจำ:
   - หากผู้ใช้สั่งตั้งเตือนหรือลงตารางสอน ให้ตอบกลับเป็น JSON เท่านั้น:
   {
     "isReminder": true,
     "taskDescription": "สรุปภารกิจ",
     "scheduledTimestampSeconds": 1727400000,
     "confirmationMessage": "ข้อความยืนยันพร้อมอิโมจิ ⏰"
   }`;

   const candidateModels = ['gemini-3.8-flash', 'gemini-3.8-flash-lite'];
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
            ]
          })
        });

        const geminiData = await geminiRes.json();
        if (geminiRes.ok && geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          replyRaw = geminiData.candidates[0].content.parts[0].text;
          break;
        } else {
          console.error(`Model ${model} failed:`, JSON.stringify(geminiData));
        }
      } catch (err) {
        console.error(`Error requesting model ${model}:`, err);
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

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: finalReplyText }]
      })
    });
  }

  return res.status(200).send('OK');
}
