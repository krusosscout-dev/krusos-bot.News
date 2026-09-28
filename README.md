# 🏛️ KruSos Cortex (The Intelligent Core for Next-Gen Teaching)

ระบบสารสนเทศนวัตกรรมการจัดการเรียนรู้และผู้ช่วยอัจฉริยะเพื่อครูสังคมศึกษาร่วมสมัย  
พร้อมระบบแจ้งเตือนสรุปข่าวเช้าและการสอนระดับสากลอัตโนมัติผ่าน LINE Official Account & Firebase Cloud Sync

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
krusos_cortex/
├── index.html            # เว็บแอปพลิเคชันหลัก KruSos Cortex (Single-Page App)
├── vercel.json           # การตั้งค่า Vercel Cron Job (ตั้งเวลาเตือนอัตโนมัติ)
├── package.json          # ไฟล์จัดการไลบรารีและ Dependencies (firebase-admin)
├── .env.example          # ตัวอย่างการตั้งค่า Environment Variables บน Vercel
├── README.md             # คู่มือการติดตั้งและใช้งานระบบ
└── api/
    ├── morning-greet.js  # Serverless Function: ดึงข่าวล่าสุด + สังเคราะห์การสอนสากล + ส่ง LINE + บันทึก Firestore
    └── get-history.js    # Serverless Function: ดึงข้อมูลสรุปย้อนหลังเพื่อซิงก์เข้าสู่หน้าเว็บ index.html (เปิด CORS)
```

---

## 🌟 ฟังก์ชันเด่นของระบบ

1. **หน้าระบบ KruSos Cortex (`index.html`):**
   - 📱 รองรับการใช้งานทั้งคอมพิวเตอร์ (แถบเมนูด้านข้าง) และมือถือ (ไอคอนลอยด้านล่าง)
   - 📰 จัดการข่าวเด่น 5 มิติ และนวัตกรรมการสอน (เพิ่ม ลบ แก้ไข บันทึกรายการโปรด และส่งออกไฟล์ภาพ/Word/PDF)
   - ✂️ ระบบแก้ไขโปรไฟล์ครู พร้อมเครื่องมือครอบตัดรูปภาพอิสระ (Cropper.js)
   - 🤖 สนทนากับ Cortex AI (Gemini 3.8 Flash) ในตัว ตอบตรงประเด็นโดยไม่ยัดเยียดแผนการสอน
   - 🟢 ซิงก์ข้อมูลแจ้งเตือนยามเช้าจาก LINE & Firebase มาแสดงบนหน้าเว็บได้ในคลิกเดียว

2. **ระบบแจ้งเตือนเช้าเข้า LINE (`api/morning-greet.js`):**
   - ส่งข้อความอัตโนมัติ 5 ฟองสบู่:
     1. ☀️ คำทักทายยามเช้าและพลังใจครู
     2. 📋 ตารางคิวงานและภารกิจสำคัญประจำวัน
     3. 🌍 เจาะลึกข่าวเด่น 5 มิติ (เนื้อหาละเอียด บริบทครบถ้วน พร้อมคำถามชวนคิด)
     4. 🌐 นวัตกรรมการสอนระดับสากลและกรณีศึกษาจากต่างประเทศ (Global Pedagogy)
     5. 💬 สรุปปิดท้าย
   - ใช้โมเดล **Gemini 3.8 Flash** พร้อมเครื่องมือค้นหาข่าวสดใหม่ผ่าน **Google Search**
   - บันทึกประวัติการส่งลง **Firebase Firestore** (`daily_summaries`) อัตโนมัติ

3. **API ดึงประวัติเข้าหน้าเว็บ (`api/get-history.js`):**
   - รองรับการเรียกดูข้อมูลข้ามโดเมน (CORS Enabled)
   - ดึงข้อมูลย้อนหลัง 30 รายการเพื่อนำไปแสดงผลบนหน้าเว็บ

---

## ⚙️ การตั้งค่า Environment Variables บน Vercel

| ตัวแปร | รายละเอียด |
| :--- | :--- |
| `LINE_ACCESS_TOKEN` | Channel Access Token (long-lived) จาก LINE Developers Console |
| `LINE_USER_ID` | Your user ID (ขึ้นต้นด้วยตัว `U` เช่น `U4af49806...`) จาก Basic settings |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `FIREBASE_PROJECT_ID` | Project ID ของ Firebase |
| `FIREBASE_CLIENT_EMAIL` | Client Email ของ Firebase Service Account |
| `FIREBASE_PRIVATE_KEY` | Private Key ของ Firebase Service Account |

---

## ⏰ การตั้งเวลา Cron บน Vercel (`vercel.json`)

* `"schedule": "0 0 * * *"` ➡️ ทำงานเวลา **07:00 น. (เช้าไทย)**
* `"schedule": "0 23 * * *"` ➡️ ทำงานเวลา **06:00 น. (เช้าไทย)**

---
*จบด้วยเพจตามติดชีวิต KruSos • Modern Heritage Edition*
