export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook is active');
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  const events = req.body.events;
  if (!events || events.length === 0) {
    return res.status(200).send('OK');
  }

  const event = events[0];
  // ตรวจสอบว่าผู้ใช้ส่งข้อความตัวอักษรเข้ามาหรือไม่
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text;
    const replyToken = event.replyToken;

    // ตั้งค่าบทบาทให้ Gemini เป็นผู้ช่วยส่วนตัวของคุณครู
    const prompt = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่กำลังเรียน ป.โท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
จงตอบคำถามหรือให้คำปรึกษาแก่ครูอย่างสุภาพ มีความเป็นวิชาการ เข้าใจง่าย กระชับ และพร้อมประยุกต์ใช้ในการสอนจริงได้ทันที

ข้อความจากครู: "${userMessage}"`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }] // รองรับการค้นข้อมูลสดหากครูถามเจาะลึกข่าว
        })
      });

      const geminiData = await geminiRes.json();
      const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยครับ ระบบไม่สามารถประมวลผลข้อความได้ในขณะนี้";

      // ส่งข้อความตอบกลับไปยัง LINE (Reply Message)
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
      console.error(error);
    }
  }

  return res.status(200).send('OK');
}
