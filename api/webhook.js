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

  // ตรวจจับข้อความและสติกเกอร์
  if (event.type === 'message') {
    let userMessage = '';

    if (event.message?.type === 'text') {
      userMessage = event.message.text.trim();
    } else if (event.message?.type === 'sticker') {
      userMessage = '(ผู้ใช้ส่งสติกเกอร์มา ให้ทักทายกลับอย่างสุภาพ เป็นกันเอง และพร้อมให้ความช่วยเหลือ)';
    } else {
      // ข้ามกรณีส่งรูปภาพ หรือไฟล์ประเภทอื่นที่ยังไม่รองรับ
      return res.status(200).send('OK');
    }

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const systemPromptText = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่ยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ขณะนี้เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString} (Unix timestamp ปัจจุบัน: ${nowTimestamp} วินาที)

คำแนะนำในการตอบ:
1. หากเป็นการสั่ง "เตือนความจำ", "จัดคิวงาน", หรือ "บันทึกเวลาสอน":
ให้ตอบกลับเป็น JSON เท่านั้น โดยไม่มี markdown หรือข้อความอื่นปน ดังนี้:
{
  "isReminder": true,
  "taskDescription": "สรุปภารกิจหรือวิชาที่ต้องทำ",
  "scheduledTimestampSeconds": 1727400000,
  "confirmationMessage": "ข้อความยืนยันการตั้งเตือนแบบสุภาพ กระชับ แจ้งเวลาที่จะเตือนชัดเจน"
}

2. หากเป็นการสั่ง "ออกแบบแผนการสอน" หรือ "ออกแบบกิจกรรมการเรียนรู้ Active Learning" โดยตรง:
ให้จัดกระบวนการเรียนรู้ตามโมเดล 4 คิด (1. คิดตั้งคำถาม 2. คิดวิเคราะห์ 3. คิดสังเคราะห์ 4. คิดนำไปใช้)

3. สำหรับคำถามทั่วไป ข่าวสาร ความรู้ การทักทาย หรือการช่วยงานอื่นๆ:
ให้ตอบตรงประเด็น ชัดเจน กระชับ เป็นข้อความธรรมดา (Plain text) โดยไม่ต้องนำรูปแบบ 4 คิดมาใส่เด็ดขาด`;

    // โมเดลที่ใช้งานตามลำดับ
    const candidateModels = ['gemini-3.1-pro-preview', 'gemini-2.5-flash'];
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
      replyRaw = "ขออภัยครับ ระบบกำลังประมวลผลข้อมูล กรุณาลองส่งข้อความใหม่อีกครั้งครับ";
    }

    let finalReplyText = replyRaw;

    // ตรวจสอบกรณีเป็นคำสั่งตั้งเตือนผ่าน QStash
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

    // ส่งข้อความตอบกลับไปยัง LINE
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
