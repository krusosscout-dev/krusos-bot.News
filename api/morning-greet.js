export default async function handler(req, res) {
  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  const prompt = `เขียนข้อความทักทายยามเช้าสั้นๆ 1 ย่อหน้า เพื่อให้กำลังใจครูสังคมศึกษาที่มีอุดมการณ์ 'ครูเพื่อศิษย์'

จากนั้น ให้สรุปเหตุการณ์หรือประเด็นความรู้เด่นระดับโลกล่าสุด มาทั้งหมด 3 เรื่อง:
1. ประเด็นเทคโนโลยี
2. ประเด็นสิ่งแวดล้อม
3. ประเด็นการศึกษา

ในแต่ละข่าว ให้เขียนแยกบรรทัดตามโครงสร้างนี้:
- 📌 หัวข้อข่าว: [ระบุหัวข้อ]
- 📝 สรุปสาระสำคัญ: [สรุปสั้นกระชับ พร้อมระบุประเด็นชวนคิดสำหรับนำไปคุยกับนักเรียน]
- 🔗 แหล่งข้อมูลอ่านต่อ: [ใส่ URL ข่าวจริง]

ปิดท้ายด้วยประโยคว่า:
"หากสนใจรายละเอียดข่าวไหน พิมพ์โต้ตอบถามผมต่อได้เลยครับ!"`;

  // เปลี่ยนมาใช้โมเดล gemini-pro ซึ่งเป็นรุ่นมาตรฐานที่เสถียรและเข้าถึงได้ทุก API Key
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

  let geminiData = null;
  let isSuccess = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      
      geminiData = await geminiRes.json();
      
      if (!geminiData.error || (geminiData.error.code !== 503 && geminiData.error.code !== 429)) {
        isSuccess = true;
        break; 
      }
      
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
    }
  }

  if (!isSuccess || (geminiData && geminiData.error)) {
    return res.status(500).json({ success: false, error: "API Error", details: geminiData?.error });
  }

  const parts = geminiData.candidates?.[0]?.content?.parts || [];
  const greetingMessage = parts.map(p => p.text).filter(Boolean).join('\n');

  if (!greetingMessage) {
    return res.status(400).json({ success: false, error: "No text generated" });
  }

  try {
    const lineUrl = 'https://api.line.me/v2/bot/message/push';
    await fetch(lineUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: LINE_USER_ID,
        messages: [{ type: 'text', text: greetingMessage }]
      })
    });

    res.status(200).json({ success: true, message: "Sent successfully with gemini-pro" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
}
