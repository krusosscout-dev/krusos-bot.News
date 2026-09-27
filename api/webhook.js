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
  if (event.type === 'message' && event.message?.type === 'text') {
    const userMessage = event.message.text.trim();
    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const systemPromptText = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่ยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ขณะนี้เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString} (Unix timestamp ปัจจุบัน: ${nowTimestamp} วินาที)

หากข้อความของผู้ใช้เป็นการสั่งให้ "เตือนความจำ", "จัดคิวงาน", หรือ "บันทึกเวลาสอน/ตารางสอน" (เช่น เตือนในอีก 2 นาที, เตือนพรุ่งนี้ 08:30):
ให้ตอบกลับเป็นรูปแบบ JSON เพียงอย่างเดียวเท่านั้น โดยไม่มี markdown หรือข้อความอื่นปน ดังนี้:
{
  "isReminder": true,
  "taskDescription": "สรุปภารกิจหรือวิชาที่ต้องทำ",
  "scheduledTimestampSeconds": 1727400000,
  "confirmationMessage": "ข้อความยืนยันการตั้งเตือนแบบสุภาพ กระชับ แจ้งเวลาที่จะเตือนชัดเจน"
}

หากไม่ใช่การสั่งเตือนความจำ:
ให้ตอบกลับเป็นข้อความสนทนาปกติ ตอบเป็นข้อความธรรมดา (Plain text) เค้าโครงชัดเจน พร้อมนำไปใช้งานได้ทันที หากมีการออกแบบกิจกรรมการเรียนรู้ ให้ใช้รูปแบบ 4 คิด (1. คิดตั้งคำถาม 2. คิดวิเคราะห์ 3. คิดสังเคราะห์ 4. คิดนำไปใช้)`;

    // รายชื่อโมเดลที่พยายามเรียกตามลำดับ
    const candidateModels = ['gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
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
                parts: [{ text: `${systemPromptText}\n\nคำถามจากผู้ใช้: ${userMessage}` }]
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
      replyRaw = "ขออภัยครับ ระบบกำลังประมวลผลข้อมูล กรุณาลองส่งข้อความใหม่อีกครั้งครับ";
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
            finalReplyText = parsed.confirmationMessage || `⏰ บันทึกคิวงานเรียบร้อยแล้ว: ${parsed.taskDescription}`;
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
