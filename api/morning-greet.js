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

  // ตรวจสอบรอบ 3 วัน (3-Day Cycle) หรือบังคับโหมดผ่าน Query ?full=true / ?mode=full
  const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  const isThreeDayCycle = (daysSinceEpoch % 3 === 0) || (req.query && (req.query.full === 'true' || req.query.mode === 'full'));

  // ดึงรายการงานจริงของครูที่บันทึกไว้ในระบบเพื่อสรุปสั้นๆ ยามเช้า (ตามข้อ 4)
  let realTasksText = "";
  if (db) {
    try {
      const bkkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now); // 'YYYY-MM-DD'
      
      const snap = await db.collection('tasks').where('completed', '==', false).get();
      const dueToday = [];
      const overdue = [];
      const upcoming = [];

      snap.forEach(doc => {
        const t = doc.data();
        const due = t.dueDate || '';
        if (due === bkkDateStr) {
          dueToday.push(`[🚨 ส่งวันนี้] ${t.title}`);
        } else if (due && due < bkkDateStr && due !== 'ไม่ระบุวัน') {
          overdue.push(`[⚠️ ค้างส่ง] ${t.title}`);
        } else {
          upcoming.push(`[📌 คิวงาน] ${t.title}`);
        }
      });

      if (dueToday.length > 0 || overdue.length > 0 || upcoming.length > 0) {
        realTasksText = 
          (dueToday.length > 0 ? "🔥 ส่งวันนี้:\n" + dueToday.slice(0, 3).map(x => `• ${x}`).join("\n") + "\n" : "") +
          (overdue.length > 0 ? "⚠️ เลยกำหนด:\n" + overdue.slice(0, 2).map(x => `• ${x}`).join("\n") + "\n" : "") +
          (upcoming.length > 0 ? "📋 เร็วๆ นี้:\n" + upcoming.slice(0, 3).map(x => `• ${x}`).join("\n") : "");
      }
    } catch (taskErr) {
      console.error("Fetch tasks for morning greet error:", taskErr);
    }
  }

  // กำหนด Prompt ตามรอบ 3 วัน หรือ วันทั่วไป (บังคับระบุแหล่งข้อมูลและลิงก์จริงที่เข้าศึกษาต่อได้)
  let prompt = "";
  if (isThreeDayCycle) {
    // รอบ 3 วัน: มีข่าว 5 มิติ และการสอนแบบใหม่ๆ สากล/ไทย
    prompt = `คุณคือผู้ช่วยส่วนตัวระดับหัวกะทิของครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
(วันนี้เป็นรอบแจ้งเตือนพิเศษรอบ 3 วัน: มีสรุปข่าว 5 มิติ และการสอนแบบใหม่ๆ เพิ่มเติม)
ให้จัดเตรียมเนื้อหาแยกเป็น 5 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น (ห้ามใส่สิ่งอื่นในบรรทัดคั่น):

กฎสำคัญที่สุดด้านแหล่งข้อมูล (Mandatory Source Links):
- ทุกหัวข้อ ทุกข่าว และทุกนวัตกรรม "ต้องแนบลิงก์แหล่งข้อมูลจริงที่สามารถคลิกเข้าไปศึกษาต่อได้ (Real URL https://...)" 
- ให้ดึง URL ข่าว เว็บไซต์ทางการ หรือสถาบันการศึกษาจริงจากผลการสืบค้น Google Search ห้ามใส่ลิงก์ปลอมหรือเว้นว่างเด็ดขาด
- สรุปให้กระชับ ชัดเจน ลึกซึ้ง เน้นเฉพาะส่วนที่สำคัญ ไม่เยิ่นเย้อ ทุกมิติอ่านเข้าใจง่ายและนำไปใช้จริงได้ทันที

ส่วนที่ 1: คำทักทายยามเช้าและพลังใจครู
- บรรทัดแรกสุด: "☀️ อรุณสวัสดิ์ยามเช้า ${thaiDateFull}"
- ตามด้วยข้อความทักทายและส่งมอบพลังใจครู 1 ย่อหน้าสั้นๆ กระชับ

[SPLIT]

ส่วนที่ 2: 📋 สรุปภารกิจและคิวงานประจำวัน (Daily Priorities)
- สรุปภารกิจสั้นๆ กระชับ เน้นสิ่งที่ต้องทำ/ส่งวันนี้ ไม่ต้องยาวมาก:
${realTasksText ? realTasksText : "• เตรียมการจัดการเรียนรู้วันนี้\n• ตรวจเช็กงานนักเรียนและภาระงานธุรการ\n• จัดสรรเวลาค้นคว้างานวิจัย ป.โท"}

[SPLIT]

ส่วนที่ 3: 💡 นวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติประจำวัน (Trending EdTech & Innovations)
นำเสนอนวัตกรรมการศึกษายอดฮิต 1 นวัตกรรม (คัดสรรทั้งของไทยหรือต่างประเทศที่เป็นกระแสและมีประโยชน์สูง):
- 🎯 นวัตกรรมยอดฮิต: [ชื่อนวัตกรรม พร้อมระบุว่าไทยหรือต่างประเทศ]
- 🔍 แก่นสำคัญ: [อธิบายแนวคิดสั้นกระชับ 2-3 บรรทัด]
- 🏫 นำไปใช้จริงในห้องเรียน: [วิธีสอนหรือกิจกรรมเป็นรูปธรรม 2-3 ข้อ]
- 🛠️ การสร้างสื่อ/เครื่องมือ: [เครื่องมือที่ครูนำไปใช้ได้ทันที]
- 🔗 แหล่งข้อมูลศึกษาต่อ: [ระบุชื่อหน่วยงาน/แพลตฟอร์ม พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]

[SPLIT]

ส่วนที่ 4: 🌍 ข่าวเด่นรอบโลกและประเด็นร่วมสมัย 5 มิติ (รอบ 3 วัน)
สรุปประเด็นข่าวสถานการณ์จริงล่าสุด 5 มิติแบบกระชับ ได้ใจความสำคัญ พร้อมแนบลิงก์ข่าวจริงทุกมิติ:
1. ด้านเทคโนโลยี/AI: [หัวข้อและสรุปสั้น] - 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] https://...
2. ด้านสิ่งแวดล้อม: [หัวข้อและสรุปสั้น] - 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] https://...
3. ด้านเศรษฐกิจ: [หัวข้อและสรุปสั้น] - 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] https://...
4. ด้านสังคมและสิทธิมนุษยชน: [หัวข้อและสรุปสั้น] - 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] https://...
5. ด้านนวัตกรรมการศึกษา: [หัวข้อและสรุปสั้น] - 🔗 แหล่งข่าวศึกษาต่อ: [ชื่อสำนักข่าว] https://...

[SPLIT]

ส่วนที่ 5: 🌐 การสอนแบบใหม่ ๆ ทั้งไทยและสากล (รอบ 3 วัน)
นำเสนอโมเดลการสอนหรือแนวคิดการสอนสมัยใหม่ระดับสากลหรือของไทย 1 รูปแบบ:
1. แนวคิด: [ชื่อแนวคิดการสอน และประเทศ/องค์กรต้นแบบ]
🎯 ชื่อแนวคิด/งานวิจัย: [ชื่อเต็ม]
🔍 แก่นสำคัญ: [อธิบายสั้นกระชับ]
🏫 ไอเดียนำไปสอนจริง (กระบวนการ 4 คิด):
- คิดตั้งคำถาม: [1 บรรทัด]
- คิดวิเคราะห์: [1 บรรทัด]
- คิดสังเคราะห์: [1 บรรทัด]
- คิดนำไปใช้: [1 บรรทัด]
🛠️ แนวทางการนำไปสร้างสื่อ: [คำแนะนำการสร้างสื่อ]
📚 แหล่งค้นคว้าและงานวิจัยศึกษาต่อ: [ระบุชื่อสถาบัน/วารสาร พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]`;
  } else {
    // วันทั่วไป (2 ใน 3 วัน): เน้นภารกิจสั้นกระชับ และนวัตกรรมการศึกษายอดฮิต พร้อมลิงก์ศึกษาต่อจริง
    prompt = `คุณคือผู้ช่วยส่วนตัวระดับหัวกะทิของครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
(วันทั่วไป: เน้นภารกิจสั้นกระชับ และนวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติ)
ให้จัดเตรียมเนื้อหาแยกเป็น 3 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น:

กฎสำคัญด้านแหล่งข้อมูล: ต้องแนบลิงก์แหล่งข้อมูลจริงที่สามารถคลิกเข้าไปศึกษาต่อได้จริง (Real URL https://...) จากสถาบันหรือแพลตฟอร์มทางการ

ส่วนที่ 1: คำทักทายยามเช้าและพลังใจครู
- บรรทัดแรกสุด: "☀️ อรุณสวัสดิ์ยามเช้า ${thaiDateFull}"
- ตามด้วยข้อความทักทายและส่งมอบพลังใจครู 1 ย่อหน้าสั้นๆ กระชับ

[SPLIT]

ส่วนที่ 2: 📋 สรุปภารกิจและคิวงานประจำวัน (Daily Priorities)
- สรุปภารกิจสั้นๆ กระชับ เน้นสิ่งที่ต้องทำ/ส่งวันนี้ ไม่ต้องยาวมาก:
${realTasksText ? realTasksText : "• เตรียมการจัดการเรียนรู้วันนี้\n• ตรวจเช็กงานนักเรียนและภาระงานธุรการ\n• จัดสรรเวลาค้นคว้างานวิจัย ป.โท"}

[SPLIT]

ส่วนที่ 3: 💡 นวัตกรรมการศึกษายอดฮิตทั้งไทยและต่างชาติประจำวัน (Trending EdTech & Innovations)
นำเสนอนวัตกรรมการศึกษายอดฮิต 1 นวัตกรรม (คัดสรรทั้งของไทยหรือต่างประเทศที่เป็นกระแสและมีประโยชน์สูง เช่น AI เพื่อการสอน, Gamification, Active Learning ฯลฯ):
- 🎯 นวัตกรรมยอดฮิต: [ชื่อนวัตกรรม พร้อมระบุว่าไทยหรือต่างประเทศ]
- 🔍 แก่นสำคัญ: [อธิบายแนวคิดสั้นกระชับ 2-3 บรรทัด]
- 🏫 นำไปใช้จริงในห้องเรียน: [วิธีสอนหรือกิจกรรมเป็นรูปธรรม 2-3 ข้อ]
- 🛠️ การสร้างสื่อ/เครื่องมือ: [เครื่องมือที่ครูนำไปใช้ได้ทันที]
- 🔗 แหล่งข้อมูลศึกษาต่อ: [ระบุชื่อหน่วยงาน/แพลตฟอร์ม พร้อม URL จริง https:// ที่คลิกเข้าไปศึกษาต่อได้จริง]
- 💬 ข้อความส่งท้าย: สรุปพลังใจและพร้อมเป็นผู้ช่วยคุณครูเสมอ`;
  }

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  try {
    let geminiData = null;
    let selectedModel = '';

    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 6000
            }
          })
        });

        if (geminiRes.ok) {
          geminiData = await geminiRes.json();
          selectedModel = model;
          break;
        } else {
          console.warn(`Morning greet model ${model} failed with status ${geminiRes.status}`);
        }
      } catch (mErr) {
        console.warn(`Morning greet model ${model} error:`, mErr.message);
      }
    }

    if (!geminiData) {
      throw new Error("All Gemini models failed in morning-greet");
    }
    
    // ดึงเฉพาะเนื้อหาข้อความจริงครบทุก Part (คัดแยก thinking ออก)
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

    // สร้างรายการข้อความที่จะส่งเข้า LINE (ไม่ตัดทิ้งด้วย ... หากยาวเกินจะแบ่งย่อหน้าอย่างฉลาด)
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

    // บันทึกลง Firestore ใน collection "daily_summaries" พร้อม sources
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'morning_news',
          cycle: isThreeDayCycle ? '3day_full' : 'daily_regular',
          title: isThreeDayCycle ? 'สรุปข่าว 5 มิติ & นวัตกรรมการสอนสากล (รอบ 3 วัน)' : 'นวัตกรรมการศึกษายอดฮิต & ภารกิจประจำวัน',
          rawContent: fullText,
          sections: rawSections,
          sources: uniqueSources,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id, sourcesCount: uniqueSources.length };
        console.log('Successfully saved to Firestore with sources:', docRef.id, uniqueSources);
      } catch (dbErr) {
        firestoreStatus = { saved: false, error: dbErr.message };
        console.error('Firestore save error:', dbErr);
      }
    } else {
      firestoreStatus = { 
        saved: false, 
        reason: "ยังไม่ได้ตั้งค่าตัวแปร FIREBASE_PROJECT_ID หรือ FIREBASE_PRIVATE_KEY บน Vercel" 
      };
    }

    // ยิงส่งข้อความ Push แจ้งเตือนเข้า LINE (ยิงเป็นชุด Batch ละไม่เกิน 5 ข้อความตามโควตา LINE)
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
        console.error("LINE Push Error:", lineError);
      }
    }

    // ส่งผลลัพธ์ตอบกลับ
    return res.status(200).json({ 
      success: true, 
      message: isThreeDayCycle 
        ? "ส่งข้อความสรุปข่าวเช้า 5 มิติและนวัตกรรมการสอนสากล (รอบ 3 วัน) สำเร็จเรียบร้อยแล้วครับ!" 
        : "ส่งนวัตกรรมการศึกษายอดฮิตและภารกิจประจำวันเข้า LINE สำเร็จเรียบร้อยแล้วครับ!",
      cycle: isThreeDayCycle ? '3day_full' : 'daily_regular',
      model: selectedModel,
      sectionsCount: splitMessages.length,
      firestore: firestoreStatus 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
}
