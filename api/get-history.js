import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (err) {
    console.error('Firebase initialization error:', err);
  }
}

const db = admin.firestore();

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection('daily_summaries')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();

    const data = snapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        ...docData,
        createdAt: docData.createdAt ? docData.createdAt.toDate().toISOString() : null,
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
 
