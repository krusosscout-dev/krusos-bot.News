export default async function handler(req, res) {
  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  // คำสั่งที่ระบุ 5 ประเด็น และบังคับแนบลิงก์ข่าวจริง
  const prompt = `เขียนข้อความทักทายยามเช้าสั้นๆ 1 ย่อหน้า เพื่อให้กำลังใจครูสังคมศึกษาที่กำลังเรียนปริญญาโท และมีอุดมการณ์ 'ครูเพื่อศิษย์' ก่อนเริ่มการสอน

จากนั้น ให้ค้นหาและสรุป "ข่าวเด่นระดับโลกที่เป็นเหตุการณ์จริงล่าสุด" มาทั้งหมด 5 เรื่อง โดยทั้ง 5 เรื่องต้องเป็นคนละประเด็นกันอย่างชัดเจน:
1. ประเด็นเทคโนโลยีและปัญญาประดิษฐ์
2. ประเด็นสิ่งแวดล้อมและการเปลี่ยนแปลงสภาพภูมิอากาศ
3. ประเด็นเศรษฐกิจและการพัฒนา
4. ประเด็นสังคมและสิทธิมนุษยชน
5. ประเด็นนวัตกรรมการศึกษาและการจัดการเรียนรู้

ในแต่ละข่าว ให้เขียนแยกบรรทัดตามโครงสร้างนี้อย่างชัดเจน:
- 📌 หัวข้อข่าว: [ระบุหัวข้อข่าว]
- 📝 สรุปสาระสำคัญ: [สรุปสั้นกระชับ พร้อมระบุประเด็นชวนคิด/คำถามสำหรับนำไปคุยกับนักเรียนในห้องเรียน]
- 🔗 แหล่งข้อมูลอ่านต่อ: [ระบุชื่อสำนักข่าวต้นทาง เช่น BBC, Reuters, AP พร้อมใส่ลิงก์ URL จริงแบบเต็ม https:// ห้ามใส่แบบ markdown hyperlink เพื่อให้กดลิงก์ใน LINE ได้ทันที]

ปิดท้ายข้อความด้วยประโยคว่า:
"หากครูสนใจรายละเอียดข่าวไหน พิมพ์โต้ตอบถามผมต่อได้เลยครับ!"`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // เปิดระบบค้นหาข้อมูลจริงจาก Google Search
        tools: [{ google_search: {} }]
      })
    });
    const geminiData = await geminiRes.json();
    
    // รวมข้อความผลลัพธ์
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const greetingMessage = parts.map(p => p.text).filter(Boolean).join('\n');

    if (!greetingMessage) {
      throw new Error("No response generated from Gemini");
    }

    // ส่งเข้า LINE ของครู
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

    res.status(200).json({ success: true, message: "Sent successfully with news sources" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
}
