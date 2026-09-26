export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Method Not Allowed');
  }

  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('OK');
    }

    const event = events[0];
    
    if (event.type !== 'message' || event.message.type !== 'text') {
      return res.status(200).send('OK');
    }

    const userMessage = event.message.text;
    const replyToken = event.replyToken;

    const geminiResponse = await callGemini(userMessage);
    await replyToLine(replyToken, geminiResponse);
    
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).send('Internal Server Error');
  }
}

async function callGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: text }] }],
    systemInstruction: {
      parts: [{ 
        text: "คุณคือผู้ช่วย AI สำหรับครูสังคมศึกษา หน้าที่หลักคือสรุปข่าวและออกแบบการจัดการเรียนรู้ กฎสำคัญ: 1. ให้คำตอบเป็นข้อความธรรมดา (Plain text) เสมอ ห้ามใช้โค้ดบล็อก HTML หรือตาราง เพื่อให้ครูคัดลอกได้ง่าย 2. หากมีการให้ออกแบบกิจกรรมตามรูปแบบ 4 คิด จะต้องมี 4 ขั้นตอน และทุกขั้นตอนต้องขึ้นต้นด้วยคำว่า 'คิด' อย่างชัดเจน" 
      }]
    },
    generationConfig: { temperature: 0.7 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].content.parts[0].text;
  }
  return "ขออภัยครับ ระบบประมวลผลไม่สำเร็จ รบกวนลองพิมพ์คำสั่งใหม่อีกครั้งนะครับ";
}

async function replyToLine(replyToken, message) {
  const lineToken = process.env.LINE_ACCESS_TOKEN; 
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const payload = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: message }]
  };

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': `Bearer ${lineToken}`
    },
    body: JSON.stringify(payload)
  });
}
