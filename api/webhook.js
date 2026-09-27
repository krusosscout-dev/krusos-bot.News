export const config = {
  maxDuration: 60,
};

// ฟังก์ชันช่วยอ่าน Raw Body กรณี Vercel ไม่ได้ parse อัตโนมัติ
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

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await getRawBody(req);
      body = JSON.parse(raw);
    } catch (e) {
      console.error('Body parse error:', e);
    }
  }

  const events = body?.events;
  if (!events || events.length === 0) {
    console.log('No events found in payload');
    return res.status(200).send('OK');
  }

  const event = events[0];
  if (event.type === 'message' && event.message?.type === 'text') {
    const userMessage = event.message.text.trim();
    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const systemInstruction = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่ยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ขณะนี้เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString} (Unix timestamp ปัจจุบัน: ${nowTimestamp} วินาที)

หากข้อความของผู้ใช้เป็นการสั่งให้ "เตือนความจำ", "จัดคิวงาน", หรือ "บันทึกเวลาสอน/ตารางสอน" (เช่น เตือนในอีก 2 นาที, เตือนพรุ่งนี้ 08:30):
ให้ตอบกลับเป็นรูปแบบ JSON เพียงอย่างเดียวเท่านั้น โดยไม่มี markdown หรือข้อความอื่นปน ดังนี้:
{
  "isReminder": true,
  "taskDescription": "สรุปภารกิจหรือวิชาที่ต้องทำ",
  "scheduledTimestampSeconds": 1727400000,
  "confirmationMessage": "ข้อความยืนยันการตั้งเตือนแบบสุภาพ กระชับ แจ้งเวลาที่จะเตือนชัดเจน"
}

หากไม่ใช่การสั่งเตือนความจำ (เป็นการสอบถามข้อมูล ปรึกษาแผนการสอน พูดคุยทั่วไป):
ให้ตอบกลับเป็นข้อความสนทนาปกติ ตอบเป็นข้อความธรรมดา (Plain text) เค้าโครงชัดเจน พร้อมนำไปใช้งานได้ทันที`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }]
        })
      });

      const geminiData = await geminiRes.json();
      const replyRaw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
              finalReplyText = parsed.confirmationMessage || `⏰ บันทึกคิวงานเรียบร้อยแล้ว: ${parsed.taskDescription}`;
            } else {
              const qstashErr = await qstashRes.text();
              console.error('QStash error:', qstashErr);
              finalReplyText = `รับทราบภารกิจ: "${parsed.taskDescription}" แต่ระบบส่งคิวเตือนขัดข้องชั่วคราวครับ`;
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
    } catch (error) {
      console.error('Webhook error:', error);
    }
  }

  return res.status(200).send('OK');
}
