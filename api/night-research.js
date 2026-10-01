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

  // ตรวจสอบรอบ 3 วันสำหรับสาระวิจัย (3-Day Cycle) หรือบังคับผ่าน Query ?full=true / ?mode=full
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  const isResearchNight = (daysSinceEpoch % 3 === 0) || (req.query && (req.query.full === 'true' || req.query.mode === 'full'));

  let prompt = "";
  if (isResearchNight) {
    prompt = `คุณคือผู้เชี่ยวชาญด้านการวิจัยทางการศึกษาเปรียบเทียบระดับนานาชาติและกวีเอกผู้เข้าใจจิตวิญญาณของครูไทย
ภารกิจของคุณคือ: จัดเตรียมข้อความก่อนนอนเวลา 21:00 น. (รอบ 3 วัน: เจาะลึกบทความวิจัยด้านสังคมศึกษา/ประวัติศาสตร์/การศึกษา)
สำหรับครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และมุ่งมั่นพัฒนาวิชาชีพสู่ผลงานวิชาการ ว.PA

ให้จัดเตรียมเนื้อหาแยกเป็น 2 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น:

กติกาความยาวและคุณภาพ: สรุปให้กระชับ ชัดเจน ลึกซึ้ง เน้นเฉพาะส่วนที่สำคัญ ไม่เยิ่นเย้อ ได้ใจความทางวิชาการครบถ้วน
กฎสำคัญด้านแหล่งข้อมูล: ต้องแนบลิงก์แหล่งข้อมูลจริงหรือ DOI ที่คลิกเข้าไปอ่าน/ศึกษาต่อได้จริง (Real URL https://... เช่น https://doi.org/..., scholar.google.com, eric.ed.gov, jstor.org, unesco.org)

ส่วนที่ 1: 🌙 สาระวิจัยทางการศึกษาสากลก่อนนอน (รอบ 3 วัน)
- บรรทัดแรกสุด: "🌙 สาระวิจัยสากลก่อนนอน • ${thaiDateFull} (เวลา 21:00 น.)"
คัดเลือกงานวิจัยคุณภาพสูงด้านการสอนสังคมศึกษา ประวัติศาสตร์ หรือนวัตกรรมการศึกษา 1 เรื่อง (เช่น Stanford, Harvard, Oxford, UNESCO หรือสแกนดิเนเวีย):
- 📖 ชื่องานวิจัย & แหล่งที่มา: [ชื่อภาษาอังกฤษและไทย ระบุสถาบัน/ปี]
- 🎯 วัตถุประสงค์การวิจัย: [ปัญหาและเป้าหมายสั้นกระชับ 2-3 บรรทัด]
- 🔬 ระเบียบวิธีและกลุ่มตัวอย่าง: [วิธีวิจัยและกลุ่มตัวอย่างสั้นๆ]
- 💡 ข้อค้นพบสำคัญ: [สรุป 3 ข้อสั้นกระชับ คมชัด]
- 🏫 การนำไปใช้สอน & วิจัย ป.โท: [ประโยชน์ต่อการสอนสังคมศึกษาหรือต่อยอดโครงร่างวิจัย ป.โท]
- 🔗 ลิงก์แหล่งข้อมูลจริง/DOI: [ระบุ URL จริง https://... ที่คลิกเข้าไปศึกษาต่อได้จริง]

[SPLIT]

ส่วนที่ 2: ✍️ กลอนกวีพักใจครูก่อนนิทรา
- บรรทัดแรก: "✍️ กลอนกวีพักใจครู • ประจำค่ำคืน ${thaiDateFull}"
ประพันธ์กลอนแปด (กลอนสุภาพ) 1-2 บทที่ไพเราะ สัมผัสนอกในถูกต้อง ปลอบประโลมความเหนื่อยล้า ส่งคุณครูเข้านอนด้วยความสุขใจ หลับฝันดี ราตรีสวัสดิ์`;
  } else {
    prompt = `คุณคือกวีเอกและผู้ช่วยส่วนตัวผู้เข้าใจจิตวิญญาณของครูไทย
ภารกิจของคุณคือ: จัดเตรียมข้อความพักผ่อนก่อนนอนเวลา 21:00 น. สำหรับครูสังคมศึกษา

ให้จัดเตรียมเนื้อหา 1 ส่วนถ้วน:
- บรรทัดแรก: "🌙 ข้อคิด & กลอนพักใจครูก่อนนิทรา • ${thaiDateFull} (21:00 น.)"
- 🌿 ถ้อยคำพักใจ: ข้อคิดสั้นๆ 1 ย่อหน้า ปลอบประโลมความเหนื่อยล้าจากการสอนและสร้างพลังบวก
- ✍️ กลอนสุภาพ: ประพันธ์กลอนแปด 1-2 บทที่ไพเราะ สัมผัสถูกต้อง ส่งคุณครูเข้านอนอย่างผ่อนคลาย หลับฝันดี ราตรีสวัสดิ์`;
  }

  try {
    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
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
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4000
            }
          })
        });

        if (resCandidate.ok) {
          geminiRes = resCandidate;
          selectedModel = model;
          break;
        } else {
          console.warn(`Night research model ${model} returned status ${resCandidate.status}, trying fallback...`);
        }
      } catch (err) {
        console.warn(`Night research model ${model} threw error:`, err.message);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      const errText = geminiRes ? await geminiRes.text() : 'All Gemini models failed';
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    
    // ดึงเฉพาะเนื้อหาข้อความจริงครบทุก Part
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const fullText = parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('\n')
      .trim();

    if (!fullText) {
      throw new Error("No text response from Gemini: " + JSON.stringify(geminiData));
    }

    // หั่นข้อความตามสัญลักษณ์ [SPLIT]
    const rawSections = fullText
      .split("[SPLIT]")
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0);

    const splitMessages = [];
    for (const sec of rawSections) {
      if (sec.length <= 4800) {
        splitMessages.push({ type: "text", text: sec });
      } else {
        const paragraphs = sec.split('\n\n');
        let currentChunk = '';
        for (const p of paragraphs) {
          if ((currentChunk + '\n\n' + p).length <= 4800) {
            currentChunk = currentChunk ? currentChunk + '\n\n' + p : p;
          } else {
            if (currentChunk) splitMessages.push({ type: "text", text: currentChunk });
            currentChunk = p;
          }
        }
        if (currentChunk) splitMessages.push({ type: "text", text: currentChunk });
      }
    }

    // สกัดรายการ URL แหล่งข้อมูลจริงทั้งหมดเพื่อเก็บเป็นคลังอ้างอิง
    const extractedUrls = fullText.match(/(https?:\/\/[^\s\)\"\'\<\>]+)/g) || [];
    const uniqueSources = [...new Set(extractedUrls)];

    // บันทึกลง Firestore ใน collection "daily_summaries" (type: night_research)
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'night_research',
          cycle: isResearchNight ? '3day_research' : 'daily_relaxation',
          title: isResearchNight 
            ? 'สาระวิจัยสากลสังคมศึกษา/ประวัติศาสตร์ & กลอนก่อนนอน (รอบ 3 วัน)' 
            : 'กลอนกวีพักใจครูก่อนนิทรา (21:00 น.)',
          rawContent: fullText,
          sections: rawSections,
          sources: uniqueSources,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id, sourcesCount: uniqueSources.length };
        console.log('Successfully saved night research to Firestore:', docRef.id);
      } catch (dbErr) {
        firestoreStatus = { saved: false, error: dbErr.message };
        console.error('Firestore save night research error:', dbErr);
      }
    }

    // ยิงส่งข้อความ Push แจ้งเตือนเข้า LINE (ยิงเป็นชุด Batch ละไม่เกิน 5 ข้อความ)
    for (let i = 0; i < splitMessages.length; i += 5) {
      const batch = splitMessages.slice(i, i + 5);
      const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          to: LINE_USER_ID,
          messages: batch
        })
      });

      if (!lineRes.ok) {
        const lineError = await lineRes.text();
        console.error("LINE Push Error in night-research:", lineError);
      }
    }

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
