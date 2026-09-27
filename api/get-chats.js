import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase init error:', error);
  }
}

export default async function handler(req, res) {
  try {
    if (!admin.apps.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const db = admin.firestore();
    const snapshot = await db.collection('chat_history')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Fetch chats error:', error);
    return res.status(200).json({ success: false, data: [] });
  }
}
