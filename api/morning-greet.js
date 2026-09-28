import admin from 'firebase-admin';

// ฟังก์ชันเชื่อมต่อ Firebase Admin อย่างปลอดภัย (ไม่ทำให้ Serverless แครช)
function getFirestoreDb() {
  if (!admin.apps.length) {
    try {
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      }
    } catch (err) {
      console.error('Firebase initialization error:', err);
      return null;
    }
  }
  try {
    return admin.apps.length ? admin.firestore() : null;
  } catch (e) {
    return null;
  }
}

export const config = {
  maxDuration: 60, // ขยายเวลาทำงานสูงสุด 60 วินาทีสำหรับประมวลผล AI
};

export default async function handler(req, res) {
  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  // ตรวจสอบความพร้อมของตัวแปร Environment Variables
  if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY || !LINE_USER_ID) {
    return res.status(500).json({ 
      success: false, 
      error: "Missing Environment Variables (ตรวจสอบ LINE_ACCESS_TOKEN, GEMINI_API_KEY หรือ LINE_USER_ID บน Vercel)" 
    });
  }

  const prompt = `คุณคือผู้ช่วยส่วนตัวของครูสังคมศึกษาที่กำลังศึกษาต่อระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ให้จัดเตรียมเนื้อหาแยกเป็น 5 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น (ห้ามใส่สิ่งอื่นในบรรทัดคั่น):

ส่วนที่ 1: คำทักทายยามเช้า
เขียนข้อความทักทายยามเช้า 1 ย่อหน้าสั้นๆ เพื่อให้กำลังใจครูก่อนเริ่มการสอนและการทำหน้าที่ในโรงเรียน

[SPLIT]

ส่วนที่ 2: หมวดที่ 1: 📋 ตารางคิวงานและภารกิจประจำวัน (Daily Tasks)
สรุปเตือนความจำภารกิจสำคัญของวัน (เตรียมสอน, งานโรงเรียน/เวร, ภารกิจวิจัยหรือการบ้าน ป.โท) ในรูปแบบ Check-list สั้น กระชับ

[SPLIT]

ส่วนที่ 3: หมวดที่ 2: 🌍 สรุปข่าวเด่นรอบโลกและประเด็นร่วมสมัย (5 ด้าน)
สรุปข่าวเหตุการณ์จริงล่าสุด 5 เรื่อง 5 ด้าน (1. เทคโนโลยี/AI 2. สิ่งแวดล้อม 3. เศรษฐกิจ 4. สังคม/สิทธิมนุษยชน 5. นวัตกรรมการศึกษา)
แต่ละเรื่องเขียนตามโครงสร้าง:
- 📌 หัวข้อข่าว: [ระบุหัวข้อ]
- 📝 สรุปสาระสำคัญ: [สรุปสั้นกระชับ พร้อมคำถามชวนคิดเพื่อนำไปคุยกับนักเรียน]
- 🔗 แหล่งข้อมูลอ่านต่อ: [ระบุชื่อสำนักข่าว พร้อมใส่ URL จริงแบบเต็ม https:// ห้ามใส่แบบ markdown link เพื่อให้กดใน LINE ได้ทันที]

[SPLIT]

ส่วนที่ 4: หมวดที่ 3: 💡 นวัตกรรมการเรียนรู้และงานวิจัยเพื่อการประยุกต์ใช้ (Pedagogy & Research Trends)
นำเสนอเทรนด์การสอนสังคมศึกษา/ประวัติศาสตร์ หรือนวัตกรรมการจัดการเรียนรู้สมัยใหม่ 2-3 นวัตกรรม แต่ละเรื่องต้องมี:
- 🎯 ชื่อแนวคิด/งานวิจัย: [ระบุชื่อ]
- 🔍 แก่นสำคัญ: [อธิบายแนวคิดสั้นๆ]
- 🏫 ไอเดียนำไปสอนจริง (กระบวนการ 4 คิด): [ระบุแนวทางการสอนตาม 4 ขั้นตอน: 1. คิดตั้งคำถาม, 2. คิดวิเคราะห์, 3. คิดสังเคราะห์, 4. คิดนำไปใช้]
- 🛠️ แนวทางการนำไปสร้างสื่อการสอนเชิงประยุกต์: [ระบุตัวอย่างสื่อที่ครูนำไปสร้างใช้จริงได้ เช่น ใบงานสืบสวน, สไลด์ Interactive, การ์ดสถานการณ์จำลอง, บอร์ดเกม]
- 📚 แหล่งอ้างอิง/อ่านเพิ่มเติม: [ระบุชื่อสถาบัน/วารสาร พร้อม URL จริง https://]

[SPLIT]

ส่วนที่ 5: ข้อความลงท้าย
พิมพ์ข้อความสั้นๆ ว่า:
"หากครูสนใจรายละเอียดข่าว ไอเดียกิจกรรม หรือต้องการปรับคิวงานเรื่องไหน พิมพ์บอกผมได้เลยครับ!"`;

  // อัปเกรดเป็น gemini-3.8-flash ที่เปิดบริการจริงและรองรับค้นหาข่าวล่าสุดผ่าน Google Search
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    });

    const geminiData = await geminiRes.json();
    
    // ดึงเฉพาะเนื้อหาข้อความจริง (กรองส่วน thinking ออก)
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought) || parts[parts.length - 1];
    const fullText = textPart?.text;

    if (!fullText) {
      throw new Error("No response from Gemini: " + JSON.stringify(geminiData));
    }

    // หั่นข้อความเป็น 5 ฟองสบู่ตามสัญลักษณ์ [SPLIT] พร้อมป้องกันข้อความยาวเกินลิมิต LINE (4,900 ตัวอักษร)
    const splitMessages = fullText
      .split("[SPLIT]")
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0)
      .slice(0, 5)
      .map(text => ({ 
        type: "text", 
        text: text.length > 4900 ? text.substring(0, 4900) + '...' : text 
      }));

    // บันทึกลง Firestore (ถ้ามีการเชื่อมต่อไว้)
    const db = getFirestoreDb();
    if (db) {
      try {
        const today = new Date();
        await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'morning_news',
          title: 'สรุปข่าวและสาระการเรียนรู้ประจำวัน',
          rawContent: fullText,
          sections: splitMessages.map(m => m.text),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('Successfully saved to Firestore');
      } catch (dbErr) {
        console.error('Firestore save error:', dbErr);
      }
    }

    // ยิงส่งข้อความ Push แจ้งเตือนเข้า LINE
    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: LINE_USER_ID,
        messages: splitMessages
      })
    });

    if (!lineRes.ok) {
      const lineError = await lineRes.text();
      throw new Error("LINE Push Error: " + lineError);
    }

    return res.status(200).json({ 
      success: true, 
      message: "ส่งข้อความสรุปข่าวเช้าเข้า LINE สำเร็จเรียบร้อยแล้วครับ!" 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
