export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook is active');
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  const events = req.body?.events;
  if (!events || events.length === 0) {
    return res.status(200).send('OK');
  }

  const event = events[0];
  if (event.type === 'message' && event.message?.type === 'text') {
    const userMessage = event.message.text;
    const replyToken = event.replyToken;

    const systemInstruction = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่กำลังเรียน ป.โท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
จงตอบคำถามหรือให้คำปรึกษาแก่ครูอย่างสุภาพ มีความเป็นวิชาการ เข้าใจง่าย กระชับ และพร้อมประยุกต์ใช้ในการสอนจริงได้ทันที`;

    // ใช้ชื่อโมเดลตามรุ่นปัจจุบันที่เปิดใช้งาน: gemini-3.8-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage }]
            }
          ]
        })
      });

      const geminiData = await geminiRes.json();
      
      let replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!replyText) {
        console.error("Gemini API Error Detail:", JSON.stringify(geminiData));
        const errDetail = geminiData.error?.message || "ไม่สามารถดึงคำตอบได้";
        replyText = `ระบบขัดข้องชั่วคราว: ${errDetail}`;
      }

      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken: replyToken,
          messages: [{ type: 'text', text: replyText }]
        })
      });
    } catch (error) {
      console.error("Fetch Exception:", error.message);
    }
  }

  return res.status(200).send('OK');
}
