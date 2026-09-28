import admin from 'firebase-admin';

// ฟังก์ชันเชื่อมต่อ Firebase Admin SDK อย่างปลอดภัย
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
  maxDuration: 60, // ขยายเวลาประมวลผลสูงสุด 60 วินาทีสำหรับ Serverless
};

export default async function handler(req, res) {
  // รองรับ CORS สำหรับการทดสอบยิงจากหน้าเว็บ
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const LINE_USER_ID = process.env.LINE_USER_ID;

  // ตรวจสอบความพร้อมของตัวแปร Environment Variables สำคัญ
  if (!LINE_ACCESS_TOKEN || !GEMINI_API_KEY || !LINE_USER_ID) {
    return res.status(500).json({ 
      success: false, 
      error: "Missing Environment Variables (ตรวจสอบ LINE_ACCESS_TOKEN, GEMINI_API_KEY หรือ LINE_USER_ID บน Vercel)" 
    });
  }

  const db = getFirestoreDb();
  const now = new Date();
  const thaiDateFull = now.toLocaleDateString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const prompt = `คุณคือผู้เชี่ยวชาญด้านการวิจัยทางการศึกษาเปรียบเทียบระดับนานาชาติและกวีเอกผู้เข้าใจจิตวิญญาณของครูไทย
ภารกิจของคุณคือ: จัดเตรียมข้อความก่อนนอนเวลา 21:00 น. สำหรับครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และมุ่งมั่นพัฒนาวิชาชีพสู่ผลงานวิชาการ ว.PA

ให้จัดเตรียมเนื้อหาแยกเป็น 2 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น (ห้ามใส่สิ่งอื่นในบรรทัดคั่น):

ส่วนที่ 1: 🌙 สาระวิจัยทางการศึกษาสากลก่อนนอน (ระบุวันที่ชัดเจน)
- ต้องระบุวันที่และเวลาอย่างชัดเจนที่บรรทัดแรกสุด: "🌙 สาระวิจัยสากลก่อนนอน • ${thaiDateFull} (เวลา 21:00 น.)"
คัดเลือกงานวิจัยทางการศึกษาหรือนวัตกรรมการเรียนรู้สังคมศึกษา/ประวัติศาสตร์ระดับสากล 1 เรื่อง ที่มีคุณภาพสูงและน่าสนใจ (เช่น งานวิจัยจาก Stanford Graduate School of Education, Harvard GSE, Oxford Review of Education, UNESCO-IBE, Comparative Education Review หรือ สแกนดิเนเวีย/ฟินแลนด์)
เขียนอธิบายอย่างลึกซึ้ง ลำดับความคิดเป็นระบบ และอ่านง่าย:
- 📖 ชื่องานวิจัย & สถาบันต้นทาง: [ชื่อเต็มภาษาอังกฤษพร้อมแปลไทย ระบุชื่อนักวิจัย สถาบัน และปีตีพิมพ์]
- 🎯 คำถามวิจัยและวัตถุประสงค์ (Research Inquiry & Objective): [อธิบายปัญหา ที่มา และเป้าหมายที่ต้องการค้นหาอย่างชัดเจน]
- 🔬 ระเบียบวิธีวิจัยและกลุ่มตัวอย่าง (Methodology & Sample): [ระบุระเบียบวิธีวิจัย วิธีเก็บข้อมูล และบริบทกลุ่มตัวอย่าง]
- 💡 ข้อค้นพบสำคัญเชิงประจักษ์ (Key Findings): [สรุปสิ่งที่งานวิจัยค้นพบเป็นข้อๆ 3-4 ประเด็นสำคัญอย่างลึกซึ้ง]
- 🏫 การประยุกต์ใช้ในการสอน & แนวคิดต่อยอด ป.โท (Practical Implications): [ข้อเสนอแนะว่าครูไทยสามารถนำแก่นวิจัยนี้ไปปรับใช้ในห้องเรียนจริง หรือนำไปต่อยอดกรอบแนวคิดวิจัย ป.โท ได้อย่างไร]
- 🔗 แหล่งอ้างอิงทางวิชาการ (Citation & Link): [รูปแบบการอ้างอิง APA 7th พร้อม URL หรือ DOI]

[SPLIT]

ส่วนที่ 2: ✍️ กลอนกวีพักใจครูก่อนนิทรา (ระบุวันที่ชัดเจน)
- ต้องระบุหัวข้อและวันที่ที่บรรทัดแรก: "✍️ กลอนกวีพักใจครู • ประจำค่ำคืน${thaiDateFull}"
ประพันธ์กลอนแปด (กลอนสุภาพ) จำนวน 1-2 บท ที่ไพเราะ สัมผัสนอกสัมผัสในถูกต้องตามฉันทลักษณ์
เนื้อหากลอน: ปลอบประโลมความเหนื่อยล้าจากการสอนและการทุ่มเทเพื่อศิษย์ตลอดทั้งวัน สรรเสริญอุดมการณ์ความเสียสละของครู เติมพลังบวกและความสงบในจิตใจ ส่งคุณครูเข้านอนด้วยความสุขใจ หลับฝันดี และพร้อมตื่นมารับวันใหม่อย่างสดใส`;

  try {
    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-flash-latest'
    ];

    let geminiRes = null;
    let selectedModel = '';

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const resCandidate = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 3500
            }
          })
        });

        if (resCandidate.ok) {
          geminiRes = resCandidate;
          selectedModel = model;
          break;
        } else {
          console.warn(`Model ${model} returned status ${resCandidate.status}, trying fallback...`);
        }
      } catch (err) {
        console.warn(`Model ${model} threw error:`, err.message);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      const errText = geminiRes ? await geminiRes.text() : 'All Gemini models failed';
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    
    // ดึงเฉพาะเนื้อหาข้อความจริง
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought) || parts[parts.length - 1];
    const fullText = textPart?.text;

    if (!fullText) {
      throw new Error("No response from Gemini: " + JSON.stringify(geminiData));
    }

    // หั่นข้อความเป็น 2 ส่วนตามสัญลักษณ์ [SPLIT]
    const splitMessages = fullText
      .split("[SPLIT]")
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0)
      .slice(0, 3)
      .map(text => ({ 
        type: "text", 
        text: text.length > 4900 ? text.substring(0, 4900) + '...' : text 
      }));

    // บันทึกลง Firestore ใน collection "daily_summaries" (type: night_research)
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'night_research',
          title: 'สาระวิจัยสากลก่อนนอนและกลอนกวีพักใจครู (21:00 น.)',
          rawContent: fullText,
          sections: splitMessages.map(m => m.text),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id };
        console.log('Successfully saved night research to Firestore:', docRef.id);
      } catch (dbErr) {
        firestoreStatus = { saved: false, error: dbErr.message };
        console.error('Firestore save night research error:', dbErr);
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

    // ส่งผลลัพธ์ตอบกลับ
    return res.status(200).json({ 
      success: true, 
      message: "ส่งสาระวิจัยสากลและกลอนก่อนนอนเข้า LINE สำเร็จเรียบร้อยแล้วครับ! 🌙✨",
      model: selectedModel,
      sectionsCount: splitMessages.length,
      firestore: firestoreStatus 
    });
  } catch (error) {
    console.error("Night research error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
