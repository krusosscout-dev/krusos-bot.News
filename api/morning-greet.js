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

  // ดึงรายการงานจริงของครูที่บันทึกไว้ในระบบเพื่อนำมาเตือนความจำใน LINE เมื่อถึงวันส่ง
  let realTasksText = "";
  if (db) {
    try {
      const now = new Date();
      const bkkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now); // 'YYYY-MM-DD'
      
      const snap = await db.collection('tasks').where('completed', '==', false).get();
      const dueToday = [];
      const overdue = [];
      const upcoming = [];

      snap.forEach(doc => {
        const t = doc.data();
        const due = t.dueDate || '';
        if (due === bkkDateStr) {
          dueToday.push(`• [🚨 ครบกำหนดส่งวันนี้!] ${t.title} (${t.category || 'ทั่วไป'})`);
        } else if (due && due < bkkDateStr && due !== 'ไม่ระบุวัน') {
          overdue.push(`• [⚠️ ค้างส่ง/เลยกำหนด] ${t.title} (กำหนดเดิม: ${due})`);
        } else if (due && due !== 'ไม่ระบุวัน') {
          upcoming.push(`• [📌 กำหนดส่ง: ${due}] ${t.title} (${t.category || 'ทั่วไป'})`);
        } else {
          upcoming.push(`• [📌 ภารกิจค้าง] ${t.title} (${t.category || 'ทั่วไป'})`);
        }
      });

      if (dueToday.length > 0 || overdue.length > 0 || upcoming.length > 0) {
        realTasksText = 
          (dueToday.length > 0 ? "🔥 รายการงานที่ครบกำหนดส่งวันนี้:\n" + dueToday.join("\n") + "\n\n" : "") +
          (overdue.length > 0 ? "⚠️ รายการงานที่เลยกำหนดส่งแล้ว:\n" + overdue.join("\n") + "\n\n" : "") +
          (upcoming.length > 0 ? "📋 คิวงานที่กำลังจะมาถึง:\n" + upcoming.join("\n") : "");
      }
    } catch (taskErr) {
      console.error("Fetch tasks for morning greet error:", taskErr);
    }
  }

  const prompt = `คุณคือผู้ช่วยส่วนตัวระดับหัวกะทิของครูสังคมศึกษาที่กำลังศึกษาระดับปริญญาโท และยึดมั่นในอุดมการณ์ 'ครูเพื่อศิษย์'
ให้จัดเตรียมเนื้อหาแยกเป็น 5 ส่วน โดยคั่นระหว่างแต่ละส่วนด้วยคำว่า "[SPLIT]" เพียงคำเดียวเท่านั้น (ห้ามใส่สิ่งอื่นในบรรทัดคั่น):

กฎสำคัญด้านความละเอียดของเนื้อหา:
- ทุกหัวข้อต้องอธิบายอย่างละเอียด มีข้อมูลเชิงลึก บริบท ที่มาที่ไป และการวิเคราะห์อย่างสมบูรณ์
- ห้ามย่อความสั้นๆ แค่ 2-3 บรรทัดเด็ดขาด ผู้อ่านต้องอ่านแล้วเข้าใจแจ่มแจ้งและเห็นภาพการนำไปใช้จริง

ส่วนที่ 1: คำทักทายยามเช้าและพลังใจครู
เขียนข้อความทักทายยามเช้า 1-2 ย่อหน้า เพื่อสร้างแรงบันดาลใจและให้พลังบวกในการเริ่มต้นวันใหม่ของการจัดการเรียนการสอน

[SPLIT]

ส่วนที่ 2: หมวดที่ 1: 📋 ตารางคิวงานและภารกิจสำคัญประจำวัน (Daily Priorities)
${realTasksText ? `นำรายการคิวงานจริงของครูต่อไปนี้ มาจัดทำเป็นตาราง Check-list แจ้งเตือนยามเช้าอย่างชัดเจน เน้นย้ำภารกิจที่ต้องทำหรือส่งวันนี้เป็นอันดับแรก:\n\n${realTasksText}` : `เนื่องจากวันนี้ยังไม่มีบันทึกคิวงานค้างส่งในระบบ ให้เขียนสรุปเตือนความจำภารกิจสำคัญทั่วไป (เตรียมการสอน, งานธุรการ/ภาระงานโรงเรียน, การค้นคว้าวิจัย ป.โท) ในรูปแบบ Action List สั้น กระชับ ชวนให้เริ่มต้นวันใหม่อย่างมีระบบ`}

[SPLIT]

ส่วนที่ 3: หมวดที่ 2: 🌍 เจาะลึกข่าวเด่นรอบโลกและประเด็นร่วมสมัย 5 มิติ (Detailed World Currents)
สรุปข่าวสถานการณ์จริงล่าสุด 5 มิติ (1. เทคโนโลยี/AI 2. สิ่งแวดล้อม 3. เศรษฐกิจ 4. สังคม/สิทธิมนุษยชน 5. นวัตกรรมการศึกษา)
เขียนอธิบายแต่ละเรื่องอย่างละเอียดตามโครงสร้าง:
- 📌 หัวข้อข่าว: [ระบุชื่อหัวข้อข่าวชัดเจน]
- 📖 ที่มาและบริบทสถานการณ์ (Context & Background): [เล่าที่มา สาเหตุ และความเป็นมาของเหตุการณ์อย่างละเอียดและมีมิติข้อมูล]
- 🔍 ผลกระทบและการวิเคราะห์ (Impact & Analysis): [วิเคราะห์ผลกระทบต่อสังคม เศรษฐกิจ หรือการศึกษาว่าส่งผลอย่างไรบ้าง]
- 💬 ประเด็นชวนคิดในชั้นเรียน: [คำถามปลายเปิดหรือประเด็นกระตุ้นการคิดสำหรับนำไปชวนนักเรียนถกแถลง]
- 🔗 แหล่งข้อมูลอ่านต่อ: [ระบุชื่อสำนักข่าว พร้อม URL เต็ม https:// ห้ามใส่ markdown link]

[SPLIT]

ส่วนที่ 4: หมวดที่ 3: 🌐 นวัตกรรมการสอนระดับสากลและกรณีศึกษาจากต่างประเทศ (Global Pedagogy & Best Practices)
นำเสนอแนวทางการจัดการเรียนรู้และเทรนด์การสอนสมัยใหม่ที่ต่างประเทศ/สากลใช้จริง (เช่น ฟินแลนด์, สิงคโปร์, ญี่ปุ่น, สหรัฐอเมริกา, สหราชอาณาจักร หรือกรอบการเรียนรู้ของ OECD/UNESCO) จำนวน 1-2 โมเดลที่น่าสนใจ
เขียนอธิบายอย่างลึกซึ้งและละเอียดตามโครงสร้าง:
- 🎯 ชื่อแนวคิด/โมเดลการสอนระดับสากล: [ระบุชื่อโมเดล พร้อมระบุประเทศหรือองค์กรต้นแบบ]
- 💡 ปรัชญาและหลักการสำคัญ (Core Principles): [อธิบายแนวคิด ที่มา และทฤษฎีการศึกษาเบื้องหลังอย่างละเอียด]
- 🏫 กรณีศึกษาการสอนในห้องเรียนจริง (Classroom Case Study): [อธิบายขั้นตอน วิธีการ หรือกิจกรรมที่ครูในต่างประเทศใช้สอนในห้องเรียนจริงอย่างเป็นรูปธรรม ให้เห็นภาพชัดเจน]
- 🛠️ การประยุกต์ใช้ในบริบทห้องเรียนไทย: [ข้อเสนอแนะว่าครูไทยสามารถนำเทคนิคหรือแนวคิดนี้มาปรับใช้ในวิชาสังคมศึกษาอย่างไรได้บ้าง]
- 📚 แหล่งค้นคว้าเพิ่มเติม: [ระบุชื่อสถาบัน/วารสาร พร้อม URL จริง https://]

[SPLIT]

ส่วนที่ 5: ข้อความลงท้าย
พิมพ์ข้อความสรุปสั้นๆ ว่า:
"หากครูสนใจรายละเอียดข่าวประเด็นไหนเป็นพิเศษ หรือต้องการให้ช่วยออกแบบกิจกรรมการเรียนรู้สไตล์สากลเรื่องใด พิมพ์บอกผมได้ตลอดเวลาเลยนะครับ!"`;

  // เรียกใช้โมเดล Gemini 3.8 Flash พร้อมเปิดเครื่องมือค้นหา Google Search ล่าสุด
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
    
    // ดึงเฉพาะเนื้อหาข้อความจริง (คัดแยก thinking ออก)
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought) || parts[parts.length - 1];
    const fullText = textPart?.text;

    if (!fullText) {
      throw new Error("No response from Gemini: " + JSON.stringify(geminiData));
    }

    // หั่นข้อความเป็น 5 กล่องข้อความตามสัญลักษณ์ [SPLIT] (ไม่เกิน 5 ฟองสบู่ตามโควตา LINE)
    const splitMessages = fullText
      .split("[SPLIT]")
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0)
      .slice(0, 5)
      .map(text => ({ 
        type: "text", 
        text: text.length > 4900 ? text.substring(0, 4900) + '...' : text 
      }));

    // บันทึกลง Firestore ใน collection "daily_summaries"
    let firestoreStatus = { saved: false, reason: "ไม่ได้เชื่อมต่อฐานข้อมูล" };

    if (db) {
      try {
        const today = new Date();
        const docRef = await db.collection('daily_summaries').add({
          date: today.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
          type: 'morning_news',
          title: 'สรุปข่าวและสาระการเรียนรู้สากลประจำวัน',
          rawContent: fullText,
          sections: splitMessages.map(m => m.text),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreStatus = { saved: true, docId: docRef.id };
        console.log('Successfully saved to Firestore:', docRef.id);
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
      message: "ส่งข้อความสรุปข่าวเช้าและการสอนระดับสากลเข้า LINE สำเร็จเรียบร้อยแล้วครับ!",
      firestore: firestoreStatus 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
