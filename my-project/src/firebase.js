// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// .env 파일에 숨겨둔 정보들을 import.meta.env를 통해 안전하게 불러옵니다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// 선생님께서 새로 만드신 데이터베이스 이름 'my2026web'을 명시합니다.
const db = getFirestore(app, "my2026web");
const auth = getAuth(app);

// Firestore 보안 규칙(request.auth != null)이 실제로 걸리려면 로그인 화면에서
// 이 auth로 진짜 Firebase 로그인을 해야 함 (localStorage 플래그만으로는 규칙을 통과 못 함).
// 아이디는 이메일 형식이 아니므로 가짜 도메인을 붙여 이메일 형식으로 변환해서 사용.
const LOGIN_EMAIL_DOMAIN = "@2026myweb.local";
const toLoginEmail = (id) => `${id}${LOGIN_EMAIL_DOMAIN}`;

export { db, auth, toLoginEmail };