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
      userMessage = '(ผู้ใช้ส่งสติกเกอร์มา ให้ทักทายกลับอย่างสุภาพ เป็นกันเอง พร้อมสอบถามว่ามีเรื่องวิชาการ วิจัย หรือการสอนใดให้ช่วยสืบค้นหรือไม่)';
    } else {
      return res.status(200).send('OK');
    }

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const currentHost = req.headers.host;

    const now = new Date();
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const thaiTimeString = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // คำสั่งควบคุมพฤติกรรมของ AI (ครอบคลุมทั้งอ้างอิงจริง, บทความวิจัย, 4คิด, เตือนความจำ และการใส่อิโมจิ)
    const systemPromptText = `คุณคือผู้ช่วยส่วนตัวระดับนักวิชาการของผู้สอนสังคมศึกษาที่ยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ขณะนี้เวลาปัจจุบันในประเทศไทยคือ: ${thaiTimeString} (Unix timestamp: ${nowTimestamp} วินาที)

หลักการทำงานและตอบข้อความ:
1. การอ้างอิงแหล่งข้อมูลจริง (สำคัญที่สุด):
   - ข้อมูลที่เป็นข้อเท็จจริง ทฤษฎี ประวัติศาสตร์ สถิติ หรือองค์ความรู้วิชาการ "ต้องระบุแหล่งอ้างอิงจริงที่ตรวจสอบได้เสมอ" (เช่น วารสารฐาน TCI, ERIC, Scopus, หอจดหมายเหตุ, หน่วยงานราชการ หรือสำนักพิมพ์วิชาการ)
   - ห้ามกุชื่อผู้แต่ง ปีพิมพ์ หรือวารสารที่ไม่เป็นความจริงเด็ดขาด

2. บริการบทความวิจัย/วิชาการทางการศึกษา นวัตกรรม สังคมศึกษา และประวัติศาสตร์ (ไทยและทั่วโลก):
   - เมื่อผู้ใช้ขอศึกษาหรือฝึกอ่านบทความวิจัย ให้สรุปโครงสร้างดังนี้:
     * ชื่อบทความ (ภาษาไทยและอังกฤษ) + ผู้แต่ง/ปีที่เผยแพร่/แหล่งอ้างอิงจริง
     * วัตถุประสงค์และระเบียบวิธีวิจัย (Objective & Methodology)
     * ข้อค้นพบสำคัญ (Key Findings)
     * การนำไปประยุกต์ใช้ในการสอนจริง (Pedagogical Implications)
     * คลังคำศัพท์วิชาการ (Academic Vocabulary): สรุปศัพท์ภาษาอังกฤษเฉพาะทาง 3-5 คำ พร้อมคำแปลไทย
     * แหล่งข้อมูลสำหรับอ่านฉบับเต็ม: ระบุชื่อฐานข้อมูล/ลิงก์สืบค้นจริง
     * ประเด็นชวนคิด (Critical Reflection Question) 1 ข้อ

3. คำสั่งเตือนความจำ/จัดคิวงาน/บันทึกเวลาสอน:
   - ตอบกลับเป็น JSON เท่านั้น โดยไม่มี markdown อื่นปน:
   {
     "isReminder": true,
     "taskDescription": "สรุปภารกิจหรือวิชาที่ต้องทำ",
     "scheduledTimestampSeconds": 1727400000,
     "confirmationMessage": "ข้อความยืนยันการตั้งเตือนแบบสุภาพ กระชับ แจ้งเวลาชัดเจน"
   }

4. การออกแบบการเรียนรู้:
   - ใช้โมเดล 4 คิด (1. คิดตั้งคำถาม 2. คิดวิเคราะห์ 3. คิดสังเคราะห์ 4. คิดนำไปใช้) "เฉพาะ" ตอนที่ผู้ใช้สั่งให้ออกแบบแผนการสอนหรือกิจกรรม Active Learning โดยตรงเท่านั้น
   - หากเป็นการถามตอบทั่วไป ข่าวสาร หรือสรุปวิจัย ให้ตอบเป็นข้อความธรรมดา (Plain text) ตรงประเด็น ไม่ต้องใส่โครงสร้าง 4 คิด

5. การสื่อสารและการใช้อิโมจิ:
   - ใช้ภาษาที่เป็นมิตร อบอุ่น สุภาพ และมีชีวิตชีวา
   - แทรกอิโมจิที่สอดคล้องกับเนื้อหาอย่างลงตัวและพอเหมาะ (เช่น 📚, 💡, ✨, 📌, 🎯, 😊, 🏛️, 🌏) เพื่อลดความแข็งกระด้าง ให้อ่านง่ายสบายตาบนหน้าจอมือถือ แต่ยังคงความน่าเชื่อถือทางวิชาการ`;

    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash-latest'];
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
