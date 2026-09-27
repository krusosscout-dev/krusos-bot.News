export default async function handler(req, res) {
  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  const prompt = `เขียนข้อความทักทายยามเช้าสั้นๆ 1 ย่อหน้า เพื่อให้กำลังใจครูสังคมศึกษาที่มีอุดมการณ์ 'ครูเพื่อศิษย์'

จากนั้น ให้สรุปเหตุการณ์หรือประเด็นความรู้เด่นระดับโลกล่าสุด มาทั้งหมด 5 เรื่อง โดยทั้ง 5 เรื่องต้องเป็นคนละประเด็นกันอย่างชัดเจน:
1. ประเด็นเทคโนโลยีและปัญญาประดิษฐ์
2. ประเด็นสิ่งแวดล้อมและการเปลี่ยนแปลงสภาพภูมิอากาศ
3. ประเด็นเศรษฐกิจและการพัฒนาโลก
4. ประเด็นสังคมและสิทธิมนุษยชน
5. ประเด็นนวัตกรรมการศึกษาและการจัดการเรียนรู้

ในแต่ละข่าว ให้เขียนแยกบรรทัดตามโครงสร้างนี้:
- 📌 หัวข้อข่าว: [ระบุหัวข้อ]
- 📝 สรุปสาระสำคัญ: [สรุปสั้นกระชับ พร้อมระบุประเด็นชวนคิดสำหรับนำไปคุยกับนักเรียนในห้องเรียน]
- 🔗 แหล่งข้อมูลอ่านต่อ: [ใส่ URL ข่าวจริง]

ปิดท้ายด้วยประโยคว่า:
"หากครูสนใจรายละเอียดข่าวไหน พิมพ์โต้ตอบถามผมต่อได้เลยครับ!"`;

  // เปลี่ยนชื่อโมเดลเป็น gemini-1.5-pro ซึ่งเป็นโมเดลหลักที่รองรับตลอดเวลา
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

  let geminiData = null;
  let isSuccess = false;

  // ระบบ Auto-Retry: ลองดึงข้อมูลใหม่สูงสุด 3 ครั้ง หากเซิร์ฟเวอร์ยุ่ง (Error 503 หรือ 429)
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
      
      // ถ้าระบบไม่ได้ฟ้อง Error 503 (เซิร์ฟเวอร์ยุ่ง) หรือ 429 (เรียกใช้งานถี่เกินไป) ให้ออกจากลูป
      if (!geminiData.error || (geminiData.error.code !== 503 && geminiData.error.code !== 429)) {
        isSuccess = true;
        break; 
      }
      
      // หากเซิร์ฟเวอร์ยุ่ง ระบบจะหน่วงเวลา 2 วินาที (2000 ms) ก่อนวนลูปไปดึงใหม่
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
    }
  }

  // หากพยายามครบ 3 ครั้งแล้วยังไม่ได้ผล ให้แจ้ง Error กลับไป
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

    res.status(200).json({ success: true, message: "Sent successfully with gemini-1.5-pro" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
}
