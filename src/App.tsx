/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, memo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  Timestamp,
  setDoc,
  getDoc,
  getDocs,
  arrayUnion,
  increment,
  limit,
  deleteDoc,
  where
} from "firebase/firestore";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signInWithPhoneNumber,
  RecaptchaVerifier,
  User as FirebaseUser 
} from "firebase/auth";
import { db, auth } from "./firebase";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getSafetyInsights, summarizeDistrictRisk } from "./services/gemini";
import Markdown from "react-markdown";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --- TYPES ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getUserDistrict(pos: { lat: number, lng: number } | null) {
  if (!pos) return null;
  let closestDist = null;
  let minDist = Infinity;
  for (const [name, coords] of Object.entries(DISTRICT_COORDS)) {
    const d = getDistance(pos.lat, pos.lng, (coords as any).lat, (coords as any).lng);
    if (d < minDist) {
      minDist = d;
      closestDist = name;
    }
  }
  return closestDist;
}

function VerifiedBadge() {
  return (
    <span style={{ 
      display: "inline-flex", 
      alignItems: "center", 
      gap: 4, 
      background: "linear-gradient(135deg, #E8C547 0%, #FFD700 100%)", 
      borderRadius: 20, 
      padding: "2px 8px",
      boxShadow: "0 2px 8px rgba(232,197,71,0.3)",
      border: "1px solid #fff",
      flexShrink: 0
    }}>
      <span style={{ color: "#0A1628", fontSize: 10, fontWeight: 900 }}>★</span>
      <span style={{ fontSize: 9, fontWeight: 900, color: "#0A1628", letterSpacing: "0.02em" }}>VERIFIED BUDGET</span>
    </span>
  );
}

function checkVerifiedStatus(uid: string, incidents: any[], userProfile: any) {
  if (!uid) return false;
  const userReports = incidents.filter(r => r.uid === uid);
  
  // 1. Must report more than 10 incidents
  if (userReports.length <= 10) return false;
  
  // 2. Must report in 10 different days
  const uniqueDays = new Set(userReports.map(r => {
    const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date();
    return d.toISOString().split('T')[0];
  }));
  if (uniqueDays.size < 10) return false;
  
  // 3. Must have 3 emergency contacts
  const contacts = userProfile?.sosContacts || [];
  if (contacts.length < 3) return false;
  
  // 4. Must get 3 confirms in at least 5 reports
  const reportsWith3Confirms = userReports.filter(r => (r.confirms || []).length >= 3);
  if (reportsWith3Confirms.length < 5) return false;
  
  return true;
}

function VerifiedProgress({ uid, incidents, userProfile }: any) {
  const userReports = incidents.filter((r: any) => r.uid === uid);
  const uniqueDays = new Set(userReports.map((r: any) => {
    const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date();
    return d.toISOString().split('T')[0];
  }));
  const contacts = userProfile?.sosContacts || [];
  const reportsWith3Confirms = userReports.filter((r: any) => (r.confirms || []).length >= 3);

  const criteria = [
    { label: "Report 10+ incidents", current: userReports.length, target: 10 },
    { label: "Report in 10 different days", current: uniqueDays.size, target: 10 },
    { label: "Have 3 emergency contacts", current: contacts.length, target: 3 },
    { label: "Get 3 confirms in 5 reports", current: reportsWith3Confirms.length, target: 5 },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 20, border: "1px solid #F0EFEB", marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: "#0A1628", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 4, height: 14, background: "#E8C547", borderRadius: 2 }} />
        Verified Budget Progress
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {criteria.map((c, i) => {
          const pct = Math.min(100, (c.current / c.target) * 100);
          const done = c.current >= c.target;
          return (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: done ? "#2E7D32" : "#666" }}>
                  {done ? "✓ " : ""}{c.label}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#0A1628" }}>{c.current}/{c.target}</div>
              </div>
              <div style={{ height: 6, background: "#F5F4F0", borderRadius: 3, overflow: "hidden" }}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  style={{ height: "100%", background: done ? "#2E7D32" : "#E8C547" }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- CONSTANTS ---
const GROUPS = [
  { id: "welfare", label: "Medical / Welfare", icon: "♡", color: "#1E88E5", bg: "#E3F2FD", desc: "Medical emergency, missing" },
  { id: "armed", label: "Armed threat", icon: "⚠", color: "#E53935", bg: "#FFEBEE", desc: "Shooting, explosion, attack" },
  { id: "robbery", label: "Robbery / theft", icon: "◈", color: "#F4511E", bg: "#FBE9E7", desc: "Carjacking, burglary, snatch" },
  { id: "suspicious", label: "Suspicious", icon: "◉", color: "#FB8C00", bg: "#FFF3E0", desc: "Person, vehicle, package" },
  { id: "disorder", label: "Disorder", icon: "◎", color: "#8E24AA", bg: "#F3E5F5", desc: "Riot, roadblock, crowd" },
  { id: "hazard", label: "Hazard / Accident", icon: "△", color: "#E65100", bg: "#FFF8E1", desc: "Fire, flood, car accident" },
];

const RISK = {
  critical: { label: "Critical", color: "#E53935", bg: "#FFEBEE", bar: "#E53935" },
  high: { label: "High", color: "#F4511E", bg: "#FBE9E7", bar: "#F4511E" },
  medium: { label: "Medium", color: "#FB8C00", bg: "#FFF8E1", bar: "#FB8C00" },
  low: { label: "Low", color: "#43A047", bg: "#E8F5E9", bar: "#43A047" },
};

// --- ICONS ---
const IcHome = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const IcMap = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
const IcAlert = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
const IcFeed = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" /></svg>;
const IcUser = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IcNews = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>;
const IcBell = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
const IcBack = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IcChev = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
const IcPin = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IcHeart = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>;
const IcCamera = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>;
const IcUp = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 16H4z" /></svg>;
const IcDown = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-16H4z" /></svg>;
const IcShield = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" /></svg>;
const IcSparkle = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707" /></svg>;
const IcChat = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>;
const IcSend = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;

// --- HELPERS ---
const gColor = (id: string) => GROUPS.find(g => g.id === id)?.color || "#888";
const gBg = (id: string) => GROUPS.find(g => g.id === id)?.bg || "#F5F5F5";
const gLabel = (id: string) => GROUPS.find(g => g.id === id)?.label || id;
const gIcon = (id: string) => GROUPS.find(g => g.id === id)?.icon || "◆";

// --- COMPONENTS ---
function TrustedBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#E3F2FD", borderRadius: 20, padding: "2px 7px" }}>
      <span style={{ color: "#1565C0", display: "flex", alignItems: "center" }}><IcShield size={10} /></span>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#1565C0" }}>Trusted</span>
    </span>
  );
}

function RiskPill({ risk, sm }: { risk: string, sm?: boolean }) {
  const r = (RISK as any)[risk] || RISK.low;
  return <span style={{ background: r.bg, color: r.color, fontSize: sm ? 9 : 10, fontWeight: 700, padding: sm ? "1px 5px" : "2px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>{r.label}</span>;
}

function IncidentCard({ r, compact, onEdit, onDelete, currentUid, isAdmin, userPos, incidents = [], userProfile }: { r: any, compact?: boolean, onEdit?: (r: any) => void, onDelete?: (id: string) => void, currentUid?: string, isAdmin?: boolean, userPos?: any, incidents?: any[], userProfile?: any }) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [noteText, setNoteText] = useState("");
  const col = gColor(r.type), bg = gBg(r.type);
  const isOwner = currentUid === r.uid;
  const canResolve = isOwner || isAdmin;

  const watchers = r.watchers || [];
  const confirms = r.confirms || [];
  const notes = r.notes || [];
  const isWatching = currentUid && watchers.includes(currentUid);
  const isConfirmed = currentUid && confirms.includes(currentUid);
  const isHighlyVerified = confirms.length >= 5;

  // For current user, we can check verified status
  const isVerifiedReporter = isOwner ? checkVerifiedStatus(currentUid, incidents, userProfile) : false;

  const userDistrict = getUserDistrict(userPos);
  const canConfirmBtn = userDistrict === r.district;
  const canWatchBtn = !canConfirmBtn;

  const handleWatch = async () => {
    if (!currentUid || isWatching) return;
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        watchers: arrayUnion(currentUid)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleConfirm = async () => {
    if (!currentUid || isConfirmed) return;
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        confirms: arrayUnion(currentUid)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleResolve = async () => {
    if (!canResolve) return;
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        solved: !r.solved
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const newNote = {
      text: noteText,
      user: auth.currentUser?.displayName || "User",
      uid: auth.currentUser?.uid,
      timestamp: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        notes: [...notes, newNote]
      });
      setNoteText("");
      setShowNoteInput(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  return (
    <div style={{ 
      background: isHighlyVerified ? "#FFEBEE" : "#fff", 
      padding: "16px 0",
      borderBottom: "1px solid #F0EFEB",
      position: "relative"
    }}>
      {isHighlyVerified && (
        <div style={{ background: "#E53935", color: "#fff", fontSize: 10, fontWeight: 900, textAlign: "center", padding: "4px 0", letterSpacing: "0.1em" }}>
          HIGHLY VERIFIED REPORT
        </div>
      )}
      {r.img && (
        <div style={{ width: "100%", height: 220, overflow: "hidden", background: "#F0EFEB", position: "relative", marginBottom: 12, borderRadius: 12 }}>
          <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          {!compact && (
            <div style={{ position: "absolute", bottom: 8, left: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "3px 8px" }}>
              <IcPin /><span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{r.district}</span>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "0 4px" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: col, fontWeight: 700, flexShrink: 0 }}>
          {gIcon(r.type)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0A1628" }}>{r.anon ? "Anonymous" : r.user}</span>
              {r.trusted && !r.anon && <TrustedBadge />}
              {isVerifiedReporter && <VerifiedBadge />}
              {r.solved && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#E3F2FD", borderRadius: 20, padding: "2px 8px" }}>
                  <span style={{ color: "#1976D2", fontSize: 10 }}>✓</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#1976D2" }}>Solved</span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: bg, color: col, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>
                {gLabel(r.type).toUpperCase()}
              </span>
              {(isOwner || isAdmin) && (
                <div style={{ position: "relative" }}>
                  <button 
                    onClick={() => setShowMenu(!showMenu)}
                    style={{ background: "none", border: "none", color: "#999", padding: "4px 8px", cursor: "pointer", fontSize: 18, fontWeight: 900 }}
                  >
                    ⋮
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <>
                        <div 
                          style={{ position: "fixed", inset: 0, zIndex: 10 }} 
                          onClick={() => setShowMenu(false)} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          style={{ 
                            position: "absolute", top: "100%", right: 0, zIndex: 11,
                            background: "#fff", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                            minWidth: 120, overflow: "hidden", border: "1px solid #F0EFEB"
                          }}
                        >
                          <button 
                            onClick={() => { onEdit?.(r); setShowMenu(false); }}
                            style={{ width: "100%", padding: "12px 16px", textAlign: "left", background: "none", border: "none", fontSize: 13, fontWeight: 700, color: "#0A1628", cursor: "pointer", borderBottom: "1px solid #F0EFEB" }}
                          >
                            Edit Report
                          </button>
                          <button 
                            onClick={() => { onDelete?.(r.id); setShowMenu(false); }}
                            style={{ width: "100%", padding: "12px 16px", textAlign: "left", background: "none", border: "none", fontSize: 13, fontWeight: 700, color: "#E53935", cursor: "pointer" }}
                          >
                            Delete Report
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <span style={{ color: "#CCC", display: "flex" }}><IcPin /></span>
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{r.district}</span>
            <span style={{ color: "#DDD" }}>·</span>
            <span style={{ fontSize: 11, color: "#BBB" }}>{r.timestamp?.toDate ? r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "8px 4px 12px" }}>
        <p style={{
          fontSize: 14, color: "#333", lineHeight: 1.6, margin: 0,
          display: "-webkit-box", WebkitLineClamp: compact ? 2 : 8, WebkitBoxOrient: "vertical", overflow: "hidden"
        }}>
          {r.desc}
        </p>

        {(r.verified || isHighlyVerified) && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#E8F5E9", borderRadius: 8, padding: "4px 10px", marginTop: 10, marginRight: 8 }}>
            <span style={{ color: "#2E7D32", fontSize: 12 }}>✓</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#2E7D32" }}>{isHighlyVerified ? "Highly Verified Report" : "Verified by Community"}</span>
          </div>
        )}

        {r.bloodType && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#FFEBEE", borderRadius: 8, padding: "4px 10px", marginTop: 10 }}>
            <span style={{ color: "#E53935", fontSize: 12 }}>🩸</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#E53935" }}>Blood Needed: {r.bloodType}</span>
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ marginTop: 12, background: "#F8F9FA", borderRadius: 12, padding: "12px", border: "1px solid #F0EFEB" }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#999", marginBottom: 8, letterSpacing: "0.05em" }}>COMMUNITY NOTES ({notes.length})</div>
            {notes.map((n: any, i: number) => (
              <div key={i} style={{ fontSize: 12, color: "#444", marginBottom: 6, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 800, color: "#0A1628" }}>{n.user}:</span> {n.text}
              </div>
            ))}
          </div>
        )}

        {!compact && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {canWatchBtn && (
                  <button onClick={handleWatch}
                    disabled={isWatching}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, border: "none", background: isWatching ? "#E3F2FD" : "#F5F4F0",
                      borderRadius: 10, padding: "8px 12px",
                      cursor: isWatching ? "default" : "pointer", color: isWatching ? "#1E88E5" : "#666", fontSize: 12, fontWeight: 800
                    }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {watchers.length}
                  </button>
                )}
                {canConfirmBtn && (
                  <button onClick={handleConfirm}
                    disabled={isConfirmed}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, border: "none", background: isConfirmed ? "#E8F5E9" : "#F5F4F0",
                      borderRadius: 10, padding: "8px 12px",
                      cursor: isConfirmed ? "default" : "pointer", color: isConfirmed ? "#2E7D32" : "#0A1628", fontSize: 12, fontWeight: 900
                    }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {confirms.length}
                  </button>
                )}
                <button onClick={() => setShowNoteInput(!showNoteInput)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F4F0", border: "none", borderRadius: 10, padding: "8px 12px", color: "#1E88E5", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Note
                </button>
                {canResolve && (
                  <button onClick={handleResolve} style={{ display: "flex", alignItems: "center", gap: 6, background: r.solved ? "#E8F5E9" : "#F5F4F0", border: "none", borderRadius: 10, padding: "8px 12px", color: r.solved ? "#2E7D32" : "#43A047", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    {r.solved ? "Solved" : "Resolve"}
                  </button>
                )}
              </div>
            </div>
            
            <AnimatePresence>
              {showNoteInput && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ display: "flex", gap: 8, background: "#F8F9FA", padding: 12, borderRadius: 12, border: "1px solid #F0EFEB" }}>
                    <input 
                      value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Add a community note..."
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13 }}
                    />
                    <button onClick={handleAddNote} style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Post</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveAlertCard({ alert, isAdmin }: { alert: any, isAdmin?: boolean }) {
  const handleResolve = async () => {
    try {
      await updateDoc(doc(db, "live_alerts", alert.id), { active: false });
    } catch (e) {
      console.error(e);
    }
  };

  if (!alert.active && !isAdmin) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ 
        background: alert.active ? "#B71C1C" : "#F5F4F0", 
        borderRadius: 16, 
        padding: 16, 
        color: alert.active ? "#fff" : "#666",
        marginBottom: 12,
        border: alert.active ? "none" : "1px solid #EEECEA",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {alert.pinned && alert.active && (
        <div style={{ position: "absolute", top: 12, right: 12, fontSize: 14 }}>📌</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ 
          width: 8, height: 8, borderRadius: "50%", 
          background: alert.active ? "#fff" : "#999",
          animation: alert.active ? "pulse 1.5s infinite" : "none" 
        }} />
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em" }}>LIVE ALERT · {alert.type}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{alert.title}</div>
      <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5, marginBottom: 12 }}>{alert.content}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, opacity: 0.7 }}>{alert.district} · {alert.timestamp?.toDate ? alert.timestamp.toDate().toLocaleTimeString() : "Just now"}</div>
        {isAdmin && alert.active && (
          <button onClick={handleResolve} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            Resolve Alert
          </button>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </motion.div>
  );
}

// --- TABS ---
function HomeTab({ setTab, setDist, incidents, news, liveAlerts, aiInsights, geofences = [], currentUid, isAdmin, onEdit, onDelete, user, userPos, userProfile, activeSosId, onActiveSosId, polls = [], contactSosSignals = [] }: any) {
  const allSignals = useMemo(() => {
    const unique = Array.from(new Map((contactSosSignals || []).map((s: any) => [s.id, s])).values());
    return unique.filter((s: any) => s.status === "active");
  }, [contactSosSignals]);
  const top3 = useMemo(() => {
    const counts: any = {};
    incidents.forEach((i: any) => {
      counts[i.district] = (counts[i.district] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, incidents: count as number }))
      .sort((a, b) => b.incidents - a.incidents)
      .slice(0, 3);
  }, [incidents]);

  const activeAlerts = useMemo(() => {
    return liveAlerts
      .filter((a: any) => a.active)
      .sort((a: any, b: any) => {
        if (a.pinned === b.pinned) {
          const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
          const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
          return tB - tA;
        }
        return a.pinned ? -1 : 1;
      });
  }, [liveAlerts]);

  return (
    <div>
      <div style={{ background: "#0A1628", padding: "16px 16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>Mogadishu Today</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Live safety feed & community reports</div>
          </div>
        </div>

        {activeAlerts.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {activeAlerts.map((a: any) => (
              <LiveAlertCard key={a.id} alert={a} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {top3.map(d => (
            <div key={d.name} onClick={() => setDist(d.name)} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px", minWidth: 110, border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 4 }}>{d.name.toUpperCase()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#E8C547" }}>{d.incidents}</div>
                <div style={{ fontSize: 9, color: "#fff", opacity: 0.6 }}>REPORTS</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 0", background: "#fff" }}>
        <div style={{ padding: "0 16px" }}>
          {user && <SOSButton user={user} userPos={userPos} contacts={userProfile?.sosContacts || []} activeId={activeSosId} onActiveId={onActiveSosId} />}

          {allSignals.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 16, background: "#E53935", borderRadius: 2 }} />
                <div style={{ fontSize: 15, fontWeight: 900, color: "#E53935" }}>Active SOS Alerts</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allSignals.map((s: any) => (
                  <div key={s.id} style={{ background: "#B71C1C", borderRadius: 16, padding: 16, border: "2px solid #E53935", boxShadow: "0 8px 24px rgba(183,28,28,0.2)" }}>
                    <div onClick={() => { setTab("profile"); setTimeout(() => { document.getElementById('sos-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "pulse 1.5s infinite" }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{s.user}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>EMERGENCY: TRACK LIVE LOCATION</div>
                        </div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.2)", padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 900, color: "#fff" }}>VIEW MAP</div>
                    </div>
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await updateDoc(doc(db, "sos_signals", s.id), { status: "resolved" });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.UPDATE, `sos_signals/${s.id}`);
                        }
                      }}
                      style={{ 
                        width: "100%", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", 
                        borderRadius: 10, padding: "8px", fontSize: 11, fontWeight: 800, cursor: "pointer" 
                      }}
                    >
                      Mark as Resolved
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {polls.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 16, background: "#E8C547", borderRadius: 2 }} />
                  Community Polls
                </div>
                <button onClick={() => setTab("news")} style={{ fontSize: 12, fontWeight: 700, color: "#1E88E5", background: "none", border: "none", cursor: "pointer" }}>View All</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {polls.filter((p: any) => p.active).slice(0, 1).map((p: any) => (
                  <PollCard key={p.id} poll={p} isAdmin={isAdmin} />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 4, height: 16, background: "#E8C547", borderRadius: 2 }} />
              Recent Incidents
            </div>
            <button onClick={() => setTab("report")} style={{ fontSize: 12, fontWeight: 700, color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>+ Report New</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "0 16px" }}>
          {incidents.length > 0 ? incidents.map((r: any) => (
            <IncidentCard 
              key={r.id} 
              r={r} 
              currentUid={currentUid} 
              isAdmin={isAdmin}
              onEdit={onEdit} 
              onDelete={onDelete} 
              userPos={userPos}
              incidents={incidents}
              userProfile={userProfile}
            />
          )) : (
            <div style={{ background: "#fff", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #F0EFEB", margin: "0 16px" }}>
              <div style={{ fontSize: 14, color: "#BBB" }}>No incidents reported yet.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DISTRICT_COORDS: any = {
  "Abdiaziz": { lat: 2.0461, lng: 45.3522 },
  "Bondhere": { lat: 2.0431, lng: 45.3402 },
  "Daynile": { lat: 2.0651, lng: 45.2852 },
  "Dharkenley": { lat: 2.0151, lng: 45.2852 },
  "Hamar Jajab": { lat: 2.0321, lng: 45.3352 },
  "Hamar Weyne": { lat: 2.0351, lng: 45.3452 },
  "Heliwa": { lat: 2.0751, lng: 45.3652 },
  "Hodan": { lat: 2.0451, lng: 45.3152 },
  "Howlwadaag": { lat: 2.0421, lng: 45.3252 },
  "Kaxda": { lat: 2.0051, lng: 45.2552 },
  "Karaan": { lat: 2.0651, lng: 45.3752 },
  "Shangani": { lat: 2.0361, lng: 45.3522 },
  "Shibis": { lat: 2.0551, lng: 45.3452 },
  "Waberi": { lat: 2.0251, lng: 45.3252 },
  "Wadajir": { lat: 2.0151, lng: 45.3052 },
  "Warta Nabadda": { lat: 2.0451, lng: 45.3352 },
  "Yaqshid": { lat: 2.0751, lng: 45.3452 },
  "Garasbaley": { lat: 2.0351, lng: 45.2652 },
};

function MapEvents({ onPick }: { onPick: (latlng: { lat: number, lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });
  return null;
}

function MogadishuMap({ districts, incidents, geofences = [], sosSignals = [], onSelect, onPick, mini, center, zoom, layer = "live" }: any) {
  const mapCenter: [number, number] = (center && typeof center.lat === 'number' && typeof center.lng === 'number') 
    ? [center.lat, center.lng] 
    : [2.0469, 45.3182];
  const mapZoom = zoom || (mini ? 12 : 13);
  const now = Date.now();

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc: any) => {
      const timestamp = inc.timestamp?.toMillis ? inc.timestamp.toMillis() : now;
      const ageHours = (now - timestamp) / (1000 * 60 * 60);
      
      if (layer === "live") {
        return ageHours <= 24;
      } else {
        return ageHours <= 24 * 30; // 30 days
      }
    });
  }, [incidents, layer, now]);

  return (
    <div style={{ 
      position: "relative", 
      width: "100%", 
      height: mini ? 180 : 400, 
      borderRadius: mini ? 12 : 20, 
      overflow: "hidden", 
      border: "1px solid rgba(0,0,0,0.1)", 
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
      zIndex: 1
    }}>
      <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom={!mini}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {onPick && <MapEvents onPick={onPick} />}

        {/* Geofences */}
        {geofences.filter((gf: any) => typeof gf.lat === 'number' && typeof gf.lng === 'number').map((gf: any) => (
          <Circle
            key={`gf-${gf.id}`}
            center={[gf.lat, gf.lng]}
            radius={gf.radius}
            pathOptions={{ color: '#E8C547', fillColor: '#E8C547', fillOpacity: 0.2 }}
          >
            <Popup>Safety Zone: {gf.name}</Popup>
          </Circle>
        ))}

        {/* SOS Signals */}
        {sosSignals.filter((s: any) => typeof s.lat === 'number' && typeof s.lng === 'number').map((s: any) => (
          <Circle
            key={`sos-${s.id}`}
            center={[s.lat, s.lng]}
            radius={100}
            pathOptions={{ color: '#E53935', fillColor: '#E53935', fillOpacity: 0.6 }}
          >
            <Popup>SOS: {s.user}</Popup>
          </Circle>
        ))}

        {/* Districts with Dynamic Heatmap Sizing */}
        {!mini && districts.map((d: any) => {
          const coords = DISTRICT_COORDS[d.name];
          if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;
          
          // Calculate district weight based on active incidents and their types
          const distIncidents = filteredIncidents.filter((i: any) => i.district === d.name && !i.solved);
          
          let totalWeight = 0;
          distIncidents.forEach((inc: any) => {
            if (inc.type === 'armed') totalWeight += 5;
            else if (inc.type === 'robbery') totalWeight += 3;
            else if (inc.type === 'suspicious') totalWeight += 2;
            else totalWeight += 1; // welfare, hazard, disorder
          });

          // Dynamic radius and color based on weight
          const radius = 400 + Math.min(totalWeight * 50, 600);
          let riskColor = "#43A047"; // Low
          let opacity = 0.1;
          
          if (totalWeight > 10) {
            riskColor = "#E53935"; // Critical
            opacity = 0.3;
          } else if (totalWeight > 5) {
            riskColor = "#FB8C00"; // High
            opacity = 0.2;
          } else if (totalWeight > 0) {
            riskColor = "#FBC02D"; // Medium
            opacity = 0.15;
          }

          return (
            <Circle
              key={d.id}
              center={[coords.lat, coords.lng]}
              radius={radius}
              pathOptions={{ color: riskColor, fillColor: riskColor, fillOpacity: opacity, weight: 1 }}
              eventHandlers={{
                click: () => onSelect(d.name)
              }}
            >
              <Popup>
                <div style={{ fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 10 }}>{layer === "live" ? "Last 24h" : "Last 30d"} Active Weight: {totalWeight}</div>
              </Popup>
            </Circle>
          );
        })}

        {/* Incidents with Decay Logic */}
        {!mini && filteredIncidents.filter((inc: any) => inc.location && typeof inc.location.lat === 'number' && typeof inc.location.lng === 'number').map((inc: any) => {
          const timestamp = inc.timestamp?.toMillis ? inc.timestamp.toMillis() : now;
          const ageHours = (now - timestamp) / (1000 * 60 * 60);
          
          let color = gColor(inc.type);
          let radius = 50;
          let opacity = 0.8;
          let isPulse = false;

          if (inc.solved) {
            // Resolved: Soft Blue, no heat
            color = "#1976D2";
            radius = 30;
            opacity = 0.4;
          } else if (ageHours < 48) {
            // Active & Recent: Bright Red/Pulsing
            color = inc.type === 'armed' ? "#E53935" : color;
            radius = 60;
            opacity = 0.9;
            isPulse = true;
          } else {
            // Cold Case (Unresolved > 48h): Static Icon (Pin)
            radius = 20;
            opacity = 1;
          }

          return (
            <Circle
              key={inc.id}
              center={[inc.location.lat, inc.location.lng]}
              radius={radius}
              pathOptions={{ 
                color: color, 
                fillColor: color, 
                fillOpacity: opacity,
                className: isPulse ? "pulse-marker" : "" 
              }}
            >
              <Popup>
                <div style={{ fontWeight: 700 }}>{inc.type.toUpperCase()}</div>
                <div style={{ fontSize: 11, color: inc.solved ? "#1976D2" : "#E53935", fontWeight: 800 }}>
                  {inc.solved ? "RESOLVED" : ageHours >= 48 ? "COLD CASE (UNRESOLVED)" : "ACTIVE"}
                </div>
                <div style={{ fontSize: 11 }}>{inc.desc}</div>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
}

function MapTab({ selDistName, setDistName, districts, incidents, geofences, loading, currentUid, isAdmin, onEdit, onDelete, userPos, userProfile, sosSignals = [] }: any) {
  const [mapLayer, setMapLayer] = useState<"live" | "safety">("live");

  const districtData = useMemo(() => {
    const now = Date.now();
    return districts.map((d: any) => {
      const distIncidents = incidents.filter((i: any) => {
        if (i.district !== d.name) return false;
        const timestamp = i.timestamp?.toMillis ? i.timestamp.toMillis() : now;
        const ageHours = (now - timestamp) / (1000 * 60 * 60);
        
        if (mapLayer === "live") return ageHours <= 24;
        return ageHours <= 24 * 30;
      });

      const activeIncidents = distIncidents.filter((i: any) => !i.solved);

      return { 
        ...d, 
        incidents: distIncidents.length, 
        active: activeIncidents.length,
        score: Math.max(0, 100 - (activeIncidents.length * 5) - (activeIncidents.filter((i: any) => i.type === 'armed').length * 10))
      };
    });
  }, [districts, incidents, mapLayer]);

  const selDist = useMemo(() => districtData.find((d: any) => d.name === selDistName), [districtData, selDistName]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  useEffect(() => {
    if (selDist) {
      const distIncidents = incidents.filter((i: any) => i.district === selDist.name);
      summarizeDistrictRisk(selDist.name, distIncidents).then(setAiSummary);
    } else {
      setAiSummary(null);
    }
  }, [selDist, incidents]);

  if (selDist) {
    const rc = (RISK as any)[selDist.risk] || RISK.low;
    const distReps = incidents.filter((r: any) => r.district === selDist.name);
    return (
      <div style={{ background: "#F5F4F0", minHeight: "100vh" }}>
        <div style={{ background: "#0A1628", paddingBottom: 24, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 0", position: "relative", zIndex: 2 }}>
            <button onClick={() => setDistName(null)} style={{
              background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10,
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff"
            }}>
              <IcBack />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>District Profile</span>
          </div>
          <div style={{ padding: "14px 16px 0", position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.1 }}>{selDist.name}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <IcPin /> {selDist.area} · Pop. {selDist.pop?.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: selDist.score > 70 ? "#43A047" : selDist.score > 40 ? "#FB8C00" : "#E53935" }}>{selDist.score}%</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>SAFETY SCORE</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[{ l: "Total", v: selDist.incidents, c: "#E8C547" }, { l: "Active", v: selDist.active, c: "#E53935" }, { l: "Resolved", v: selDist.resolved || 0, c: "#69C47E" }].map(s => (
                <div key={s.l} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, fontWeight: 700, letterSpacing: "0.05em" }}>{s.l.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 0, right: 0, width: "100%", height: "100%", background: `radial-gradient(circle at 90% 10%, ${rc.color}15, transparent)`, pointerEvents: "none" }} />
        </div>

        <div style={{ padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid #F0EFEB", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628" }}>Security Status</div>
              <RiskPill risk={selDist.risk} />
            </div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 14, lineHeight: 1.5 }}>{selDist.desc}</div>
            {aiSummary && (
              <div style={{ background: "#F8F9FA", borderRadius: 12, padding: 12, borderLeft: "4px solid #E8C547" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <IcSparkle />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#0A1628", letterSpacing: "0.05em" }}>AI SAFETY SUMMARY</span>
                </div>
                <div className="markdown-body" style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                  <Markdown>{aiSummary}</Markdown>
                </div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 14, fontWeight: 800, color: "#0A1628", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 4, height: 16, background: "#E53935", borderRadius: 2 }} />
            Recent Reports
          </div>
          {distReps.length ? distReps.map((r: any) => (
            <IncidentCard 
              key={r.id} 
              r={r} 
              currentUid={currentUid} 
              isAdmin={isAdmin} 
              onEdit={onEdit} 
              onDelete={onDelete} 
              userPos={userPos}
              incidents={incidents}
              userProfile={userProfile}
            />
          )) : (
            <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", border: "1px solid #F0EFEB", marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: "#BBB" }}>No reports in this district yet</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: "#0A1628", padding: "16px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 2 }}>District Watch</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Real-time risk heatmap of Mogadishu</div>
          </div>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 3 }}>
            <button 
              onClick={() => setMapLayer("live")}
              style={{ 
                padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 800, 
                background: mapLayer === "live" ? "#E8C547" : "transparent",
                color: mapLayer === "live" ? "#0A1628" : "#fff", cursor: "pointer"
              }}
            >LIVE (24H)</button>
            <button 
              onClick={() => setMapLayer("safety")}
              style={{ 
                padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 800, 
                background: mapLayer === "safety" ? "#E8C547" : "transparent",
                color: mapLayer === "safety" ? "#0A1628" : "#fff", cursor: "pointer"
              }}
            >SAFETY (30D)</button>
          </div>
        </div>
        <MogadishuMap districts={districts} incidents={incidents} geofences={geofences} onSelect={setDistName} sosSignals={sosSignals} layer={mapLayer} />
      </div>
      <div style={{ padding: "18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0A1628", letterSpacing: "0.02em" }}>DISTRICT RANKINGS</div>
          <div style={{ fontSize: 11, color: "#999" }}>Sorted by risk</div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 14 }}>Loading districts...</div>
          </div>
        ) : districtData.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {districtData.sort((a: any, b: any) => b.incidents - a.incidents).map((d: any) => {
              const rc = (RISK as any)[d.risk] || RISK.low;
              const intensity = Math.min(d.incidents * 10, 100);
              return (
                <motion.div 
                  key={d.id} 
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDistName(d.name)} 
                  style={{ 
                    background: "#fff", 
                    borderRadius: 20, 
                    padding: "16px", 
                    border: "1px solid #F0EFEB", 
                    cursor: "pointer", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 16,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                  }}
                >
                  <div style={{ 
                    width: 52, 
                    height: 52, 
                    borderRadius: 16, 
                    background: `${rc.color}10`, 
                    display: "flex", 
                    flexDirection: "column",
                    alignItems: "center", 
                    justifyContent: "center", 
                    color: rc.color,
                    flexShrink: 0,
                    border: `1px solid ${rc.color}20`
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>{d.incidents}</div>
                    <div style={{ fontSize: 8, fontWeight: 800, opacity: 0.7 }}>REPORTS</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#0A1628", letterSpacing: "-0.3px" }}>{d.name}</span>
                      <RiskPill risk={d.risk} sm />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: "#F5F4F0", borderRadius: 3, overflow: "hidden" }}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: intensity + "%" }}
                          style={{ height: "100%", background: rc.color, borderRadius: 3 }} 
                        />
                      </div>
                      <span style={{ fontSize: 11, color: "#999", fontWeight: 700, minWidth: 40, textAlign: "right" }}>{d.area}</span>
                    </div>
                  </div>
                  <div style={{ color: "#DDD" }}><IcChev /></div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 14 }}>No districts found. Please contact admin.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportTab({ user, districts, districtsLoading, onDone, editItem, onCancel, userPos }: any) {
  const [step, setStep] = useState(editItem ? 1 : 0);
  const [sel, setSel] = useState<any>(editItem ? GROUPS.find(g => g.id === editItem.type) : null);
  const [anon, setAnon] = useState(editItem?.anon || false);
  const [dist, setDist] = useState(editItem?.district || "");
  const [desc, setDesc] = useState(editItem?.desc || "");
  const [bloodType, setBloodType] = useState(editItem?.bloodType || "");
  const [img, setImg] = useState<string | null>(editItem?.img || null);
  const [loading, setLoading] = useState(false);
  const [pickedPos, setPickedPos] = useState<any>(editItem?.location || userPos || null);

  const handleImage = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imgElement = new Image();
        imgElement.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = imgElement.width;
          let height = imgElement.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(imgElement, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7); // Compress to 70% quality
          setImg(dataUrl);
        };
        imgElement.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (loading || !dist || !desc || !sel) return;
    setLoading(true);
    try {
      const finalLoc = pickedPos || DISTRICT_COORDS[dist] || { lat: 2.0469, lng: 45.3182 };
      if (editItem) {
        await updateDoc(doc(db, "incidents", editItem.id), {
          type: sel.id,
          anon,
          district: dist,
          desc,
          bloodType: sel.id === "welfare" ? bloodType : null,
          img: img || null,
          location: finalLoc
        });
        onDone();
      } else {
        await addDoc(collection(db, "incidents"), {
          type: sel.id,
          user: anon ? null : user.displayName,
          uid: auth.currentUser?.uid,
          anon,
          trusted: false,
          verified: false,
          solved: false,
          district: dist,
          timestamp: serverTimestamp(),
          likes: 0,
          desc,
          bloodType: sel.id === "welfare" ? bloodType : null,
          img: img || null,
          location: finalLoc
        });
        setStep(3);
      }
    } catch (error) {
      handleFirestoreError(error, editItem ? OperationType.UPDATE : OperationType.CREATE, editItem ? `incidents/${editItem.id}` : "incidents");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "72vh", padding: 32, textAlign: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#43A047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#0A1628", marginBottom: 6 }}>Warbixin la diray!</div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 24, lineHeight: 1.6 }}>Report submitted and under review.</div>
      <button onClick={() => { onDone(); setStep(0); setSel(null); setDesc(""); setDist(""); setImg(null); }} style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Done</button>
    </div>
  );

  return (
    <div>
      <div style={{ background: "#0A1628", padding: "16px 16px 20px" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 2 }}>Report incident</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Ka feejigan qataraha</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["Category", "Details", "Location"].map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: i <= step ? "#E8C547" : "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.06em" }}>{i + 1}. {s}</div>
              <div style={{ height: 3, borderRadius: 2, background: i <= step ? "#E8C547" : "rgba(255,255,255,0.15)" }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {step === 0 && (
          <>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>What are you reporting?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {GROUPS.map(g => (
                <button key={g.id} onClick={() => { setSel(g); setStep(1); }} style={{ background: "#fff", border: sel?.id === g.id ? `2px solid ${g.color}` : "1.5px solid #EEECEA", borderRadius: 14, padding: "14px 12px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: g.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: g.color, fontWeight: 700, marginBottom: 8 }}>{g.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628", marginBottom: 3, lineHeight: 1.2 }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: "#999", lineHeight: 1.3 }}>{g.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && sel && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: "#fff", borderRadius: 12, padding: "10px 12px", border: `1.5px solid ${sel.color}20` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: sel.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: sel.color, fontWeight: 700, flexShrink: 0 }}>{sel.icon}</div>
              <div><div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628" }}>{sel.label}</div><div style={{ fontSize: 11, color: "#999" }}>{sel.desc}</div></div>
            </div>
            
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#0A1628", display: "block", marginBottom: 6 }}>Add Photo (Optional)</label>
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ flex: 1, height: 80, border: "2px dashed #EEECEA", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fff" }}>
                  <IcCamera />
                  <span style={{ fontSize: 10, color: "#999", marginTop: 4 }}>Upload/Take</span>
                  <input type="file" accept="image/*" onChange={handleImage} style={{ display: "none" }} />
                </label>
                {img && (
                  <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => setImg(null)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                )}
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#0A1628", display: "block", marginBottom: 6 }}>Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What did you see?" rows={3}
              style={{ width: "100%", borderRadius: 12, border: "1.5px solid #EEECEA", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", background: "#FAFAF8", color: "#0A1628", marginBottom: 14 }} />
            
            {sel.id === "welfare" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#E53935", display: "block", marginBottom: 6 }}>Blood Type Needed? (Optional)</label>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map(bt => (
                    <button key={bt} onClick={() => setBloodType(bloodType === bt ? "" : bt)} style={{ padding: "8px 12px", borderRadius: 10, border: bloodType === bt ? "none" : "1.5px solid #EEECEA", background: bloodType === bt ? "#E53935" : "#fff", color: bloodType === bt ? "#fff" : "#666", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      {bt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F5F4F0", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <div onClick={() => setAnon(!anon)} style={{ width: 22, height: 22, borderRadius: 6, border: "2px solid", borderColor: anon ? "#E53935" : "#CCC", background: anon ? "#E53935" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                {anon && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628" }}>Report anonymously</div><div style={{ fontSize: 11, color: "#888" }}>Your name will not be shown</div></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => editItem ? onCancel() : setStep(0)} style={{ flex: 1, background: "#F5F4F0", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" }}>{editItem ? "Cancel" : "Back"}</button>
              <button onClick={() => setStep(2)} style={{ flex: 2, background: "#0A1628", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Next →</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#0A1628", display: "block", marginBottom: 6 }}>Pick precise location on map</label>
            <div style={{ marginBottom: 16 }}>
              <MogadishuMap 
                mini 
                districts={districts} 
                incidents={[]} 
                onPick={(pos: any) => setPickedPos(pos)}
                center={pickedPos || userPos}
                zoom={15}
              />
              {pickedPos && (
                <div style={{ fontSize: 10, color: "#43A047", marginTop: 4, fontWeight: 700 }}>
                  ✓ Location picked: {pickedPos.lat.toFixed(4)}, {pickedPos.lng.toFixed(4)}
                </div>
              )}
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: "#0A1628", display: "block", marginBottom: 6 }}>Select district</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 300, overflowY: "auto", padding: 2, marginBottom: 14 }}>
              {districtsLoading ? (
                <div style={{ gridColumn: "1 / -1", padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
                  Loading districts...
                </div>
              ) : districts.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
                  No districts found. Please contact admin.
                </div>
              ) : (
                districts.map((d: any) => (
                  <button 
                    key={d.id} 
                    onClick={() => setDist(d.name)}
                    style={{ 
                      padding: "10px 8px", 
                      borderRadius: 10, 
                      border: dist === d.name ? "2px solid #0A1628" : "1.5px solid #EEECEA",
                      background: dist === d.name ? "#0A162808" : "#fff",
                      fontSize: 12,
                      fontWeight: dist === d.name ? 700 : 500,
                      color: "#0A1628",
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    {d.name}
                  </button>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, background: "#F5F4F0", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, color: "#666", cursor: "pointer" }}>Back</button>
              <button onClick={handleSubmit} disabled={!dist || loading} style={{ flex: 2, background: dist ? "#0A1628" : "#CCC", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, color: "#fff", cursor: dist ? "pointer" : "not-allowed" }}>
                {loading ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeedTab({ incidents, currentUid, isAdmin, onEdit, onDelete, userPos, userProfile }: any) {
  const [filter, setFilter] = useState("all");
  const types = ["all", ...new Set(incidents.map((r: any) => r.type))];
  const shown = filter === "all" ? incidents : incidents.filter((r: any) => r.type === filter);

  return (
    <div>
      <div style={{ background: "#0A1628", padding: "16px 16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Community reports</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Warbixinnada bulshada · Citizens on the ground</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
          {(types as string[]).map(t => {
            const g = GROUPS.find(x => x.id === t);
            const act = filter === t;
            return (
              <button key={t} onClick={() => setFilter(t)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, flexShrink: 0, border: act ? "none" : "1px solid rgba(255,255,255,0.15)", background: act ? (t === "all" ? "#E8C547" : g?.color || "#E8C547") : "rgba(255,255,255,0.07)", color: act ? (t === "all" ? "#0A1628" : "#fff") : "rgba(255,255,255,0.6)", cursor: "pointer", whiteSpace: "nowrap" }}>
                {t === "all" ? "All" : g?.label || t}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        {shown.map((r: any) => (
          <IncidentCard 
            key={r.id} 
            r={r} 
            currentUid={currentUid} 
            isAdmin={isAdmin}
            onEdit={onEdit} 
            onDelete={onDelete} 
            userPos={userPos}
            incidents={incidents}
            userProfile={userProfile}
          />
        ))}
      </div>
    </div>
  );
}

function PollCard({ poll, isAdmin, onEdit }: { poll: any, isAdmin?: boolean, onEdit?: () => void }) {
  const [voted, setVoted] = useState<number | null>(null);
  
  const isExpired = useMemo(() => {
    if (!poll.expiresAt) return false;
    const expiry = poll.expiresAt.toMillis ? poll.expiresAt.toMillis() : poll.expiresAt;
    return Date.now() > expiry;
  }, [poll.expiresAt]);

  const handleVote = async (idx: number) => {
    if (voted !== null || isExpired) return;
    setVoted(idx);
    const newOpts = [...poll.opts];
    newOpts[idx].v += 1;
    try {
      await updateDoc(doc(db, "polls", poll.id), {
        opts: newOpts,
        total: increment(1)
      });
    } catch (error) {
      console.error("Vote failed", error);
    }
  };

  const colors = ["#E8C547", "#1E88E5", "#43A047", "#E53935", "#8E24AA", "#FB8C00"];

  const timeLeft = useMemo(() => {
    if (!poll.expiresAt || isExpired) return null;
    const expiry = poll.expiresAt.toMillis ? poll.expiresAt.toMillis() : poll.expiresAt;
    const diff = expiry - Date.now();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  }, [poll.expiresAt, isExpired]);

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 20, border: "1px solid #F0EFEB", boxShadow: "0 4px 20px rgba(0,0,0,0.05)", opacity: isExpired ? 0.8 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: isExpired ? "#999" : "#E8C547", animation: isExpired ? "none" : "pulse 2s infinite" }} />
          <div style={{ fontSize: 11, fontWeight: 900, color: "#999", letterSpacing: "0.1em" }}>COMMUNITY POLL</div>
        </div>
        {timeLeft && <div style={{ fontSize: 10, fontWeight: 800, color: "#E8C547", background: "#E8C54715", padding: "4px 8px", borderRadius: 6 }}>{timeLeft}</div>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628", marginBottom: 6, lineHeight: 1.4 }}>{poll.q}</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 20, fontStyle: "italic" }}>{poll.en}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {poll.opts.map((o: any, i: number) => {
          const pct = poll.total > 0 ? Math.round((o.v / poll.total) * 100) : 0;
          const isV = voted === i;
          const color = colors[i % colors.length];
          const canVote = voted === null && !isExpired;
          return (
            <div key={i} onClick={() => canVote && handleVote(i)}
              style={{ 
                borderRadius: 16, overflow: "hidden", 
                border: isV ? `2px solid ${color}` : "1.5px solid #F0EFEB", 
                cursor: canVote ? "pointer" : "default", 
                position: "relative", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                background: voted === null ? "#fff" : "transparent"
              }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: voted !== null || isExpired ? pct + "%" : "0%" }}
                style={{ position: "absolute", top: 0, left: 0, height: "100%", background: (voted !== null || isExpired) ? `${color}20` : "transparent", transition: "width 1s cubic-bezier(0.65, 0, 0.35, 1)" }} 
              />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {(voted !== null || isExpired) && (
                    <motion.div 
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} 
                    />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 800, color: isV ? color : "#0A1628" }}>{o.l}</span>
                </div>
                {(voted !== null || isExpired) && (
                  <motion.div 
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#999", opacity: 0.7 }}>{o.v}</div>
                    <span style={{ fontSize: 16, fontWeight: 900, color: color }}>{pct}%</span>
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#BBB", marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>{poll.total?.toLocaleString()} total participants</span>
          {isAdmin && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onEdit} style={{ background: "transparent", border: "none", color: "#1E88E5", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Edit</button>
              <button onClick={() => deleteDoc(doc(db, "polls", poll.id))} style={{ background: "transparent", border: "none", color: "#E53935", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          )}
        </div>
        <span style={{ background: (poll.active && !isExpired) ? "#E8F5E9" : "#F5F4F0", color: (poll.active && !isExpired) ? "#2E7D32" : "#999", padding: "4px 8px", borderRadius: 6, fontWeight: 800, fontSize: 10 }}>{(poll.active && !isExpired) ? "LIVE" : "CLOSED"}</span>
      </div>
    </div>
  );
}

function NewsTab({ news, polls, sosSignals, isAdmin, onEnter, incidents = [] }: any) {
  const [sub, setSub] = useState("news");
  const [showAdmin, setShowAdmin] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const catColors: any = { ALERT: "#E53935", UPDATE: "#1E88E5", COMMUNITY: "#43A047", NOTICE: "#888" };

  const trendingTags = useMemo(() => {
    const tags: any = {};
    incidents.forEach((r: any) => {
      // Extract hashtags
      const hashtags = r.desc.match(/#\w+/g) || [];
      hashtags.forEach((t: string) => {
        const tag = t.substring(1).toLowerCase();
        tags[tag] = (tags[tag] || 0) + 1;
      });
      // Extract keywords (simple version: words > 4 chars)
      const words = r.desc.split(/\s+/);
      words.forEach((w: string) => {
        const word = w.replace(/[^\w]/g, '').toLowerCase();
        if (word.length > 4 && !['there', 'their', 'about', 'would', 'could', 'should'].includes(word)) {
          tags[word] = (tags[word] || 0) + 1;
        }
      });
    });
    return Object.entries(tags)
      .map(([tag, count]) => ({ tag, count: count as number, trend: "up" }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [incidents]);

  useEffect(() => {
    onEnter?.();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F4F0" }}>
      <div style={{ background: "#0A1628", padding: "16px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8C547" }} />
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>Foogan News</div>
          </div>
          {isAdmin && (
            <button onClick={() => { setShowAdmin(!showAdmin); setEditItem(null); }} style={{ background: "rgba(232,197,71,0.15)", color: "#E8C547", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {showAdmin ? "Close Admin" : "Admin Tools"}
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Official updates & announcements</div>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {[["news", "News"], ["polls", "Polls"], ["trends", "Trends"]].map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)} style={{ flex: 1, padding: "10px 4px", border: "none", background: "transparent", fontSize: 13, fontWeight: 700, cursor: "pointer", color: sub === k ? "#E8C547" : "rgba(255,255,255,0.4)", borderBottom: sub === k ? "2px solid #E8C547" : "2px solid transparent" }}>{l}</button>
          ))}
        </div>
      </div>

      {showAdmin && isAdmin && <AdminPanel editItem={editItem} sosSignals={sosSignals} onClose={() => { setShowAdmin(false); setEditItem(null); }} />}

      <div style={{ padding: "14px 16px" }}>
        {sub === "news" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {news.length > 0 ? news.map((n: any) => {
              const cc = catColors[n.cat] || "#888";
              return (
                <div key={n.id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F0EFEB", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" }}>
                  {n.img && <img src={n.img} alt="" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} referrerPolicy="no-referrer" />}
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      {n.urgent && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E53935", flexShrink: 0 }} />}
                      <span style={{ fontSize: 10, fontWeight: 800, color: cc, letterSpacing: "0.08em" }}>{n.cat}</span>
                      <span style={{ color: "#DDD", fontSize: 10 }}>·</span>
                      <span style={{ fontSize: 10, color: "#999" }}>{n.district}</span>
                      <span style={{ fontSize: 10, color: "#CCC", marginLeft: "auto" }}>{n.timestamp?.toDate ? n.timestamp.toDate().toLocaleDateString() : ""}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0A1628", lineHeight: 1.4, marginBottom: 8 }}>{n.title}</div>
                    <div className="markdown-body" style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
                      <Markdown>{n.content}</Markdown>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, borderTop: "1px solid #F0EFEB", paddingTop: 8 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: "#BBB" }}>{n.reads?.toLocaleString() || 0} reads</div>
                        {isAdmin && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => { setEditItem({ ...n, type: "news" }); setShowAdmin(true); }} style={{ background: "transparent", border: "none", color: "#1E88E5", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                            <button onClick={() => deleteDoc(doc(db, "news", n.id))} style={{ background: "transparent", border: "none", color: "#E53935", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await updateDoc(doc(db, "news", n.id), {
                              likes: increment(1)
                            });
                          } catch (e) {
                            handleFirestoreError(e, OperationType.UPDATE, `news/${n.id}`);
                          }
                        }}
                        style={{ background: "transparent", border: "none", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: n.likes > 0 ? "#E53935" : "#666", fontSize: 12, fontWeight: 700 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={n.likes > 0 ? "#E53935" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        {n.likes || 0}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", border: "1px solid #F0EFEB" }}>
                <div style={{ fontSize: 14, color: "#BBB" }}>No news updates yet.</div>
              </div>
            )}
          </div>
        )}

        {sub === "polls" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {polls.length ? polls.map((p: any) => (
              <PollCard 
                key={p.id} 
                poll={p} 
                isAdmin={isAdmin} 
                onEdit={() => { setEditItem({ ...p, type: "poll" }); setShowAdmin(true); }} 
              />
            )) : (
              <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", border: "1px solid #F0EFEB" }}>
                <div style={{ fontSize: 14, color: "#BBB" }}>No active polls</div>
              </div>
            )}
          </div>
        )}

        {sub === "trends" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F0EFEB", boxShadow: "0 2px 12px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0A1628", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 4, height: 16, background: "#E8C547", borderRadius: 2 }} />
                Trending in Mogadishu
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {trendingTags.length > 0 ? trendingTags.map((t, i) => (
                  <div key={t.tag} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#CCC", width: 20 }}>{i + 1}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0A1628" }}>{t.tag.startsWith('#') ? t.tag : `#${t.tag}`}</div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{t.count} mentions in reports</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#E53935", fontSize: 12, fontWeight: 800 }}>
                      ▲ <span style={{ fontSize: 9 }}>HOT</span>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>No trends detected yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



function NearbyAlertsModal({ userPos, incidents, liveAlerts, isAdmin, onClose, currentUid, onEdit, onDelete, userProfile }: any) {
  const nearbyIncidents = useMemo(() => {
    if (!userPos) return [];
    return incidents.filter((i: any) => {
      if (!i.location) return false;
      const dist = getDistance(userPos.lat, userPos.lng, i.location.lat, i.location.lng);
      return dist <= 500;
    });
  }, [userPos, incidents]);

  const activeAlerts = useMemo(() => liveAlerts.filter((a: any) => a.active), [liveAlerts]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end" }}>
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        style={{ background: "#F5F4F0", width: "100%", maxWidth: 430, margin: "0 auto", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 16px 40px", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628" }}>Safety Alerts</div>
            <div style={{ fontSize: 12, color: "#999" }}>Personalized for your current location</div>
          </div>
          <button onClick={onClose} style={{ background: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: 20, color: "#666" }}>×</span>
          </button>
        </div>

        {!userPos && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", border: "1px solid #EEECEA" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628", marginBottom: 4 }}>Location Access Required</div>
            <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5 }}>Please enable location services to receive alerts for incidents within 500 meters of you.</div>
          </div>
        )}

        {userPos && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeAlerts.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#E53935", marginBottom: 10, letterSpacing: "0.05em" }}>OFFICIAL LIVE ALERTS</div>
                {activeAlerts.map((a: any) => <LiveAlertCard key={a.id} alert={a} isAdmin={isAdmin} />)}
              </div>
            )}
            
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#0A1628", marginBottom: 10, letterSpacing: "0.05em" }}>NEARBY COMMUNITY REPORTS (500M)</div>
              {nearbyIncidents.length > 0 ? nearbyIncidents.map((r: any) => (
                <IncidentCard 
                  key={r.id} 
                  r={r} 
                  compact 
                  currentUid={currentUid}
                  isAdmin={isAdmin}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  userPos={userPos}
                  incidents={incidents}
                  userProfile={userProfile}
                />
              )) : (
                <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", border: "1px solid #EEECEA" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628", marginBottom: 4 }}>Area Secure</div>
                  <div style={{ fontSize: 12, color: "#999" }}>No incidents reported within 500m of your position.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function AdminPanel({ editItem, sosSignals, onClose }: any) {
  const [type, setType] = useState(editItem?.type || "news");
  const [title, setTitle] = useState(editItem?.title || "");
  const [cat, setCat] = useState(editItem?.cat || "UPDATE");
  const [dist, setDist] = useState(editItem?.district || "Mogadishu");
  const [content, setContent] = useState(editItem?.content || "");
  const [alertType, setAlertType] = useState("SECURITY");
  const [pinned, setPinned] = useState(true);
  const [q, setQ] = useState(editItem?.q || "");
  const [opts, setOpts] = useState(editItem?.opts?.map((o: any) => o.l).join("\n") || "Yes\nNo");
  const [pollDuration, setPollDuration] = useState("24"); // hours
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (type === "news") {
        const data = { title, cat, district: dist, content, urgent: cat === "ALERT" };
        if (editItem?.id) {
          await updateDoc(doc(db, "news", editItem.id), data);
        } else {
          await addDoc(collection(db, "news"), { ...data, reads: 0, likes: 0, timestamp: serverTimestamp() });
        }
      } else if (type === "live") {
        const data = { title, content, district: dist, type: alertType, active: true, pinned, timestamp: serverTimestamp() };
        await addDoc(collection(db, "live_alerts"), data);
      } else if (type === "poll") {
        const options = opts.split("\n").filter(o => o.trim()).map(o => ({ l: o.trim(), v: 0 }));
        const expiresAt = new Date(Date.now() + parseInt(pollDuration) * 60 * 60 * 1000);
        const data = { 
          q, 
          en: "", 
          opts: options, 
          active: true, 
          expiresAt: Timestamp.fromDate(expiresAt) 
        };
        if (editItem?.id) {
          await updateDoc(doc(db, "polls", editItem.id), data);
        } else {
          await addDoc(collection(db, "polls"), { ...data, total: 0, timestamp: serverTimestamp() });
        }
      }
      onClose();
    } catch (e) {
      handleFirestoreError(e, editItem?.id ? OperationType.UPDATE : OperationType.CREATE, type === "news" ? "news" : type === "live" ? "live_alerts" : "polls");
    } finally {
      setLoading(false);
    }
  };

  const resolveSOS = async (id: string) => {
    try {
      await updateDoc(doc(db, "sos_signals", id), { status: "resolved" });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sos_signals/${id}`);
    }
  };

  return (
    <div style={{ background: "#F5F4F0", padding: 16, borderBottom: "1px solid #EEECEA" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => setType("news")} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: type === "news" ? "none" : "1px solid #CCC", background: type === "news" ? "#0A1628" : "#fff", color: type === "news" ? "#fff" : "#666", fontSize: 11, fontWeight: 700 }}>News</button>
        <button onClick={() => setType("live")} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: type === "live" ? "none" : "1px solid #CCC", background: type === "live" ? "#B71C1C" : "#fff", color: type === "live" ? "#fff" : "#666", fontSize: 11, fontWeight: 700 }}>Live Alert</button>
        <button onClick={() => setType("poll")} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: type === "poll" ? "none" : "1px solid #CCC", background: type === "poll" ? "#0A1628" : "#fff", color: type === "poll" ? "#fff" : "#666", fontSize: 11, fontWeight: 700 }}>Poll</button>
      </div>

      {type === "news" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="News Title" style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }} />
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }}>
            <option value="ALERT">ALERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="COMMUNITY">COMMUNITY</option>
            <option value="NOTICE">NOTICE</option>
          </select>
          <input value={dist} onChange={e => setDist(e.target.value)} placeholder="District" style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }} />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="News Content (Markdown supported)" rows={4} style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA", resize: "none" }} />
        </div>
      )}

      {type === "live" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Alert Title (e.g. Road Blocked)" style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }} />
          <select value={alertType} onChange={e => setAlertType(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }}>
            <option value="SECURITY">SECURITY</option>
            <option value="TRAFFIC">TRAFFIC</option>
            <option value="WEATHER">WEATHER</option>
            <option value="OTHER">OTHER</option>
          </select>
          <input value={dist} onChange={e => setDist(e.target.value)} placeholder="District" style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }} />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Alert Description" rows={3} style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA", resize: "none" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            Pin this alert to top
          </label>
        </div>
      )}

      {type === "poll" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Poll Question" style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }} />
          <textarea value={opts} onChange={e => setOpts(e.target.value)} placeholder="Options (one per line)" rows={3} style={{ padding: 10, borderRadius: 8, border: "1px solid #EEECEA", resize: "none" }} />
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "#999", display: "block", marginBottom: 6 }}>DURATION (HOURS)</label>
            <select value={pollDuration} onChange={e => setPollDuration(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #EEECEA" }}>
              <option value="1">1 Hour</option>
              <option value="6">6 Hours</option>
              <option value="12">12 Hours</option>
              <option value="24">24 Hours</option>
              <option value="48">48 Hours</option>
              <option value="72">72 Hours</option>
            </select>
          </div>
        </div>
      )}

      {type !== "news" && type !== "poll" && type !== "live" && (
        <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>Select a tool above.</div>
      )}

      {type !== "sos" && (
        <button onClick={handleSave} disabled={loading} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10, background: type === "live" ? "#B71C1C" : "#E53935", color: "#fff", border: "none", fontWeight: 700 }}>
          {loading ? "Saving..." : editItem ? "Update" : "Publish"}
        </button>
      )}
    </div>
  );
}

// --- MAIN APP ---
function NotificationToast({ msg, onClose }: { msg: any, onClose: () => void }) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 20, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      style={{
        position: "fixed", top: 0, left: 16, right: 16, zIndex: 9999,
        background: "#0A1628", borderRadius: 16, padding: "14px 16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)", display: "flex", gap: 12, alignItems: "center",
        border: "1px solid rgba(255,255,255,0.1)"
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: msg.type === "alert" ? "#E53935" : "#E8C547", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {msg.type === "alert" ? <IcAlert /> : <IcNews />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 2 }}>{msg.title}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.3 }}>{msg.body}</div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>×</button>
    </motion.div>
  );
}

function SOSButton({ user, userPos, contacts = [], activeId, onActiveId }: { user: any, userPos: any, contacts: any[], activeId: string | null, onActiveId?: (id: string | null) => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSOS = async () => {
    if (!user || !userPos) {
      alert("Location access required for SOS.");
      return;
    }
    setSending(true);
    try {
      const contactEmails = contacts.map(c => c.email.toLowerCase()).filter(e => !!e);
      const signalRef = await addDoc(collection(db, "sos_signals"), {
        uid: user.uid,
        user: user.displayName,
        email: user.email,
        lat: userPos.lat,
        lng: userPos.lng,
        timestamp: serverTimestamp(),
        status: "active",
        contactEmails: contactEmails
      });

      onActiveId?.(signalRef.id);

      // Notify contacts
      for (const contact of contacts) {
        if (contact.email) {
          await addDoc(collection(db, "notifications"), {
            toEmail: contact.email.toLowerCase(),
            fromName: user.displayName,
            fromUid: user.uid,
            type: "sos",
            signalId: signalRef.id,
            lat: userPos.lat,
            lng: userPos.lng,
            timestamp: serverTimestamp(),
            read: false
          });
        }
      }

      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!activeId) return;
    try {
      await updateDoc(doc(db, "sos_signals", activeId), { status: "resolved" });
      onActiveId?.(null);
    } catch (e) {
      console.error(e);
    }
  };

  if (activeId) {
    return (
      <div style={{ background: "#FFEBEE", borderRadius: 20, padding: 20, marginBottom: 20, border: "2px solid #E53935", textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#B71C1C", marginBottom: 8 }}>🚨 SOS ACTIVE</div>
        <div style={{ fontSize: 13, color: "#B71C1C", marginBottom: 16 }}>Your location is being shared with emergency contacts.</div>
        <button onClick={handleCancel} style={{ background: "#B71C1C", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cancel SOS
        </button>
      </div>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleSOS}
      disabled={sending}
      style={{
        width: "100%", height: 60, borderRadius: 16,
        background: sent ? "#43A047" : "#B71C1C",
        color: "#fff", border: "none",
        boxShadow: "0 8px 24px rgba(183,28,28,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontWeight: 900, fontSize: 16, gap: 12,
        marginBottom: 20
      }}
    >
      <IcAlert />
      {sending ? "SENDING SOS..." : sent ? "SOS SIGNAL SENT!" : "EMERGENCY SOS"}
    </motion.button>
  );
}

function SOSContactsManager({ contacts, onUpdate }: { contacts: any[], onUpdate: (c: any[]) => void }) {
  const [name, setName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    if (contacts.length >= 3) {
      alert("Maximum 3 SOS contacts allowed.");
      return;
    }
    if (!name || !contactValue) return;
    
    const isEmail = contactValue.includes("@");
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(contactValue.replace(/\s+/g, ''));

    if (!isEmail && !isPhone) {
      alert("Please enter a valid email or phone number (with country code).");
      return;
    }

    onUpdate([...contacts, { 
      name, 
      value: contactValue.toLowerCase(),
      type: isEmail ? 'email' : 'phone'
    }]);
    setName("");
    setContactValue("");
    setShowAdd(false);
  };

  const handleRemove = (idx: number) => {
    onUpdate(contacts.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ background: "#F9F9F7", borderRadius: 20, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0A1628" }}>Emergency Contacts</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: contacts.length >= 3 ? "#E53935" : "#43A047" }}>
          {contacts.length}/3
        </div>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: contacts.length > 0 ? 16 : 0 }}>
        {contacts.map((c, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "12px 14px", borderRadius: 14, border: "1px solid #F0EFEB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F4F0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#0A1628" }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{c.value || c.email}</div>
              </div>
            </div>
            <button onClick={() => handleRemove(i)} style={{ background: "#FFEBEE", border: "none", color: "#E53935", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        ))}
      </div>

      {contacts.length < 3 && !showAdd && (
        <button 
          onClick={() => setShowAdd(true)}
          style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1.5px dashed #DDD", background: "transparent", color: "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <span style={{ fontSize: 18 }}>+</span> Add Emergency Contact
        </button>
      )}

      {showAdd && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: "#fff", padding: 16, borderRadius: 16, border: "1px solid #E8C547", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0A1628" }}>New Contact Details</div>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Contact Name" 
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #EEECEA", fontSize: 14 }} 
          />
          <input 
            value={contactValue} 
            onChange={e => setContactValue(e.target.value)} 
            placeholder="Email or Phone (+252...)" 
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #EEECEA", fontSize: 14 }} 
          />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#F5F4F0", color: "#666", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={handleAdd} style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: "#0A1628", color: "#fff", fontWeight: 700, fontSize: 13 }}>Save Contact</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function GeofenceManager({ geofences, userPos, onAdd, onDelete, districts, incidents }: any) {
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(500);
  const [adding, setAdding] = useState(false);
  const [selectedDist, setSelectedDist] = useState("Hodan");
  const [pickedPos, setPickedPos] = useState<{ lat: number, lng: number } | null>(null);

  const handleAdd = () => {
    const pos = pickedPos || userPos;
    if (!pos) {
      alert("Please select a location on the map or enable GPS.");
      return;
    }
    if (!name) return;
    
    onAdd({ 
      name, 
      radius, 
      lat: pos.lat, 
      lng: pos.lng, 
      district: selectedDist 
    });
    setName("");
    setPickedPos(null);
    setAdding(false);
  };

  return (
    <div style={{ marginTop: 24, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628", letterSpacing: "0.05em" }}>GEOFENCE ALERTS</div>
        <button 
          onClick={() => setAdding(!adding)} 
          style={{ background: adding ? "#F5F4F0" : "#0A1628", color: adding ? "#0A1628" : "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          {adding ? "Cancel" : "+ Add Zone"}
        </button>
      </div>

      {adding && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #EEECEA", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Tap on the map to set zone location.</div>
          <div style={{ height: 180, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            <MogadishuMap 
              districts={districts} 
              incidents={incidents} 
              onPick={setPickedPos} 
              mini 
              geofences={pickedPos ? [{ id: 'temp', lat: pickedPos.lat, lng: pickedPos.lng, radius }] : []}
            />
          </div>
          <input 
            placeholder="Zone Name (e.g. Home, Work)" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #EEE", fontSize: 13 }} 
          />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#999", fontWeight: 700, marginBottom: 4 }}>RADIUS (METERS)</div>
              <select 
                value={radius} 
                onChange={(e) => setRadius(Number(e.target.value))} 
                style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #EEE", fontSize: 13 }}
              >
                <option value={200}>200m</option>
                <option value={500}>500m</option>
                <option value={1000}>1km</option>
                <option value={2000}>2km</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#999", fontWeight: 700, marginBottom: 4 }}>DISTRICT</div>
              <select 
                value={selectedDist} 
                onChange={(e) => setSelectedDist(e.target.value)} 
                style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #EEE", fontSize: 13 }}
              >
                {districts.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <button 
            onClick={handleAdd} 
            style={{ width: "100%", background: "#E8C547", color: "#0A1628", border: "none", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4 }}
          >
            Save Safety Zone
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {geofences.length === 0 ? (
          <div style={{ padding: 20, background: "#F9F9F9", borderRadius: 12, border: "1px dashed #DDD", textAlign: "center", color: "#999", fontSize: 12 }}>
            No safety zones defined yet.
          </div>
        ) : (
          geofences.map((gf: any) => (
            <div key={gf.id} style={{ background: "#fff", borderRadius: 14, padding: "12px 16px", border: "1px solid #F0EFEB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>{gf.name}</div>
                <div style={{ fontSize: 11, color: "#999" }}>{gf.district} • {gf.radius}m radius</div>
              </div>
              <button onClick={() => onDelete(gf.id)} style={{ background: "none", border: "none", color: "#E53935", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SafetySettings({ user, userProfile, geofences, userPos, districts, incidents, onUpdateContacts, onAddGeofence, onDeleteGeofence, contactSosSignals }: any) {
  const allSignals = useMemo(() => {
    const unique = Array.from(new Map((contactSosSignals || []).map((s: any) => [s.id, s])).values());
    return unique;
  }, [contactSosSignals]);

  return (
    <div id="sos-section" style={{ background: "#fff", borderRadius: 24, padding: 20, border: "1px solid #F0EFEB", marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 4, height: 18, background: "#E53935", borderRadius: 2 }} />
        Safety & Emergency
      </div>

      {allSignals.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#E53935", marginBottom: 12, letterSpacing: "0.05em" }}>ACTIVE SOS ALERTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {allSignals.map((s: any) => (
              <div key={s.id} style={{ background: "#FFEBEE", borderRadius: 16, padding: 16, border: "1px solid #FFCDD2" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#B71C1C" }}>{s.user}</div>
                  <div style={{ fontSize: 10, color: "#E57373" }}>{s.timestamp?.toDate ? s.timestamp.toDate().toLocaleTimeString() : ""}</div>
                </div>
                <div style={{ fontSize: 12, color: "#D32F2F", marginBottom: 12 }}>Emergency signal active! View location on map.</div>
                <div style={{ height: 120, background: "#0A1628", borderRadius: 12, overflow: "hidden", position: "relative", marginBottom: 12 }}>
                   <MogadishuMap 
                     districts={[]} 
                     incidents={[]} 
                     geofences={[]} 
                     sosSignals={[s]} 
                     mini 
                   />
                </div>
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, "sos_signals", s.id), { status: "resolved" });
                    } catch (e) {
                      handleFirestoreError(e, OperationType.UPDATE, `sos_signals/${s.id}`);
                    }
                  }}
                  style={{ 
                    width: "100%", background: "#B71C1C", color: "#fff", border: "none", 
                    borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 800, 
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                  }}
                >
                  <span>Cancel SOS for {s.user}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <SOSContactsManager contacts={userProfile?.sosContacts || []} onUpdate={onUpdateContacts} />
      
      <div style={{ height: 1, background: "#F0EFEB", margin: "20px 0" }} />
      
      <GeofenceManager 
        geofences={geofences} 
        userPos={userPos} 
        districts={districts}
        incidents={incidents}
        onAdd={onAddGeofence}
        onDelete={onDeleteGeofence}
      />
    </div>
  );
}

function ProfileTab({ user, userRole, userProfile, incidents, geofences, districts, contactSosSignals, userPos, onEdit, onDelete, onOpenAdmin }: any) {
  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [volunteerBloodType, setVolunteerBloodType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (showSettings && userProfile) {
      setNewName(userProfile.displayName || user?.displayName || "");
      setNewPhoto(userProfile.photoURL || user?.photoURL || "");
      setIsVolunteer(userProfile.isVolunteer || false);
      setVolunteerBloodType(userProfile.volunteerBloodType || "");
    }
  }, [showSettings, userProfile, user]);

  const isVerified = checkVerifiedStatus(user.uid, incidents, userProfile);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: newName,
        photoURL: newPhoto,
        isVolunteer,
        volunteerBloodType: isVolunteer ? volunteerBloodType : null
      });
      setShowSettings(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imgElement = new Image();
        imgElement.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 200;
          const MAX_HEIGHT = 200;
          let width = imgElement.width;
          let height = imgElement.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(imgElement, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          setNewPhoto(dataUrl);
        };
        imgElement.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ padding: "0 16px 24px" }}>
      <div style={{ background: "#0A1628", margin: "0 -16px 24px", padding: "24px 16px 40px", borderRadius: "0 0 32px 32px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button 
            onClick={() => setShowSettings(true)}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <span style={{ background: userRole === "admin" ? "#E53935" : "rgba(255,255,255,0.1)", color: "#fff", padding: "6px 14px", borderRadius: 20, fontSize: 10, fontWeight: 900, letterSpacing: "0.05em", border: "1px solid rgba(255,255,255,0.1)" }}>
            {userRole.toUpperCase()}
          </span>
          {isVerified && <VerifiedBadge />}
        </div>
        
        <div style={{ position: "relative", width: 90, height: 90, margin: "0 auto 16px" }}>
          {newPhoto || userProfile?.photoURL ? (
            <img src={newPhoto || userProfile.photoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "4px solid rgba(255,255,255,0.2)" }} referrerPolicy="no-referrer" />
          ) : (
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#0A1628", fontSize: 36, fontWeight: 900, border: "4px solid rgba(255,255,255,0.2)" }}>
              {user.displayName?.[0] || "U"}
            </div>
          )}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 4 }}>{newName || userProfile?.displayName || user.displayName}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{user.email}</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: -32, marginBottom: 24, padding: "0 8px" }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 20, padding: "16px 12px", border: "1px solid #F0EFEB", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0A1628" }}>{incidents.filter((i: any) => i.uid === user.uid).length}</div>
          <div style={{ fontSize: 10, color: "#999", fontWeight: 800, letterSpacing: "0.02em" }}>MY REPORTS</div>
        </div>
        <div style={{ flex: 1, background: "#fff", borderRadius: 20, padding: "16px 12px", border: "1px solid #F0EFEB", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#E8C547" }}>{geofences.length}</div>
          <div style={{ fontSize: 10, color: "#999", fontWeight: 800, letterSpacing: "0.02em" }}>SAFETY ZONES</div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              style={{ background: "#fff", width: "100%", maxWidth: 400, borderRadius: 24, padding: "24px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0A1628" }}>Settings</div>
                <button onClick={() => setShowSettings(false)} style={{ background: "#F5F4F0", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: "#666" }}>×</button>
              </div>
              
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 24 }}>
                  <div style={{ position: "relative", width: 80, height: 80 }}>
                    <img src={newPhoto || userProfile?.photoURL || "https://via.placeholder.com/80"} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "2px solid #F0EFEB" }} />
                    <label style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, background: "#0A1628", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #fff" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                    </label>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>Profile Picture</div>
                    <div style={{ fontSize: 11, color: "#999" }}>Tap the camera to upload</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#999", display: "block", marginBottom: 6, letterSpacing: "0.05em" }}>DISPLAY NAME</label>
                    <input 
                      value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="Your name"
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 14, outline: "none", background: "#FAFAF8" }}
                    />
                  </div>
                  <button 
                    onClick={handleSaveProfile} disabled={saving}
                    style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s" }}
                  >
                    {saving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #F0EFEB", paddingTop: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#E53935", marginBottom: 12, letterSpacing: "0.05em" }}>LIFE-SAVING VOLUNTEER</div>
                <div style={{ background: "#FFEBEE", borderRadius: 16, padding: 16, border: "1px solid #FFCDD2" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#B71C1C" }}>Emergency Volunteer</div>
                      <div style={{ fontSize: 11, color: "#D32F2F" }}>Get priority alerts for medical emergencies.</div>
                    </div>
                    <div onClick={() => setIsVolunteer(!isVolunteer)} style={{ width: 44, height: 24, borderRadius: 12, background: isVolunteer ? "#B71C1C" : "#CCC", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                      <motion.div animate={{ x: isVolunteer ? 22 : 2 }} style={{ position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
                    </div>
                  </div>
                  
                  {isVolunteer && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#B71C1C", marginBottom: 8, marginTop: 12 }}>MY BLOOD TYPE</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map(bt => (
                          <button key={bt} onClick={() => setVolunteerBloodType(volunteerBloodType === bt ? "" : bt)} style={{ padding: "6px 10px", borderRadius: 8, border: volunteerBloodType === bt ? "none" : "1px solid #FFCDD2", background: volunteerBloodType === bt ? "#B71C1C" : "transparent", color: volunteerBloodType === bt ? "#fff" : "#B71C1C", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                            {bt}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: "#D32F2F", marginTop: 10, fontStyle: "italic" }}>
                        * You will be notified if someone nearby needs your blood type.
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #F0EFEB", paddingTop: 24, marginBottom: 24 }}>
                <VerifiedProgress uid={user.uid} incidents={incidents} userProfile={userProfile} />
              </div>

              <button 
                onClick={() => auth.signOut()}
                style={{ width: "100%", background: "#FFF1F0", color: "#E53935", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Sign Out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SafetySettings 
        user={user}
        userProfile={userProfile}
        geofences={geofences}
        userPos={userPos} 
        districts={districts}
        incidents={incidents}
        contactSosSignals={contactSosSignals}
        onUpdateContacts={async (newContacts: any) => {
          try {
            await updateDoc(doc(db, "users", user.uid), { sosContacts: newContacts });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
          }
        }}
        onAddGeofence={async (data: any) => {
          try {
            await addDoc(collection(db, "geofences"), { ...data, uid: user.uid, timestamp: serverTimestamp() });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, "geofences");
          }
        }}
        onDeleteGeofence={async (id: string) => {
          try {
            await deleteDoc(doc(db, "geofences", id));
          } catch (e) {
            handleFirestoreError(e, OperationType.DELETE, `geofences/${id}`);
          }
        }}
      />

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 4, height: 16, background: "#0A1628", borderRadius: 2 }} />
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628" }}>My Recent Reports</div>
        </div>
        
        {incidents.filter((i: any) => i.uid === user.uid).length === 0 ? (
          <div style={{ padding: 32, background: "#fff", borderRadius: 20, border: "1.5px dashed #EEECEA", textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>No reports yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {incidents.filter((i: any) => i.uid === user.uid).slice(0, 5).map((r: any) => (
              <IncidentCard 
                key={r.id} 
                r={r} 
                currentUid={user.uid} 
                isAdmin={userRole === "admin"}
                onEdit={onEdit} 
                onDelete={onDelete} 
                userPos={userPos}
                incidents={incidents}
                userProfile={userProfile}
              />
            ))}
          </div>
        )}
      </div>

      {userRole === "admin" && (
        <div style={{ marginTop: 24, padding: 20, background: "#0A1628", borderRadius: 20, textAlign: "left", boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>System Administrator</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>Access advanced tools and manage reports</div>
          <button 
            onClick={onOpenAdmin}
            style={{ width: "100%", background: "#E8C547", color: "#0A1628", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            Open Admin Control Panel
          </button>
        </div>
      )}

      <button 
        onClick={() => auth.signOut()} 
        style={{ width: "100%", marginTop: 32, background: "#fff", border: "1.5px solid #FFEBEE", borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 800, color: "#E53935", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        Sign Out
      </button>
    </div>
  );
}

// Memoized components for performance
const MemoizedIncidentCard = memo(IncidentCard);
const MemoizedMogadishuMap = memo(MogadishuMap);

function AppContent() {
  const [tab, setTab] = useState("home");
  const [selDistName, setSelDistName] = useState<string | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [incidents, setIncidents] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(true);
  const [news, setNews] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number, lng: number } | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [editIncident, setEditIncident] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [lastViewedNews, setLastViewedNews] = useState(Date.now());
  const [toast, setToast] = useState<any>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [contactSosSignals, setContactSosSignals] = useState<any[]>([]);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const userPosRef = useRef<{ lat: number, lng: number } | null>(null);
  const geofencesRef = useRef<any[]>([]);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    geofencesRef.current = geofences;
  }, [geofences]);

  // Cleanup old news and polls once (v6)
  useEffect(() => {
    const cleanup = async () => {
      const cleaned = localStorage.getItem("ais_cleanup_v6");
      if (cleaned) return;
      try {
        const pollsSnap = await getDocs(collection(db, "polls"));
        for (const d of pollsSnap.docs) {
          await deleteDoc(doc(db, "polls", d.id));
        }
        const newsSnap = await getDocs(collection(db, "news"));
        for (const d of newsSnap.docs) {
          await deleteDoc(doc(db, "news", d.id));
        }
        localStorage.setItem("ais_cleanup_v6", "true");
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };
    cleanup();
  }, []);

  // Sync user profile
  useEffect(() => {
    if (user) {
      const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserProfile(data);
          setUserRole(data.role || "user");
        }
      });
      return unsub;
    } else {
      setUserProfile(null);
      setUserRole("user");
    }
  }, [user]);

  // Sync SOS Signals for contacts
  useEffect(() => {
    if (!user || !user.email) return;
    
    const q = query(
      collection(db, "sos_signals"), 
      where("contactEmails", "array-contains", user.email.toLowerCase()),
      where("status", "==", "active")
    );

    const unsub = onSnapshot(q, (snap) => {
      const signals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Check for new SOS signals to show toast
      if (contactSosSignals.length > 0 && signals.length > contactSosSignals.length) {
        const latest = signals[0] as any;
        setToast({ 
          type: "alert", 
          title: "🚨 SOS EMERGENCY", 
          body: `${latest.user} has triggered an SOS! Track them in your profile.` 
        });
        setTimeout(() => setToast(null), 10000);
      }
      
      setContactSosSignals(signals);
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "sos_signals");
      }
    });
    
    return unsub;
  }, [user]);

  // Sync user's own active SOS signal for persistence
  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, "sos_signals"),
        where("uid", "==", user.uid),
        where("status", "==", "active"),
        limit(1)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setActiveSosId(snap.docs[0].id);
        } else {
          setActiveSosId(null);
        }
      });
      return unsub;
    }
  }, [user]);

  // Simulate location-based alerts
  useEffect(() => {
    if (incidents.length > 0 && user) {
      const latest = incidents[0];
      const isNew = latest.timestamp?.toMillis() > Date.now() - 30000;
      if (isNew) {
        setToast({
          type: "alert",
          title: `New Incident in ${latest.district}`,
          body: latest.desc.substring(0, 60) + "..."
        });
        setTimeout(() => setToast(null), 6000);
      }
    }
  }, [incidents, user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Sync user to Firestore
        const userRef = doc(db, "users", u.uid);
        getDoc(userRef).then((snap) => {
          const isBootstrapAdmin = u.email === "barbaaryp@gmail.com";
          if (!snap.exists()) {
            if (!u.email) {
              console.warn("User has no email, skipping profile creation");
              return;
            }
            const newUser = {
              displayName: u.displayName || "User",
              email: u.email,
              photoURL: u.photoURL || null,
              role: isBootstrapAdmin ? "admin" : "user",
              reportCount: 0
            };
            setDoc(userRef, newUser).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${u.uid}`));
            setUserRole(isBootstrapAdmin ? "admin" : "user");
          } else {
            const data = snap.data();
            setUserRole(data?.role || (isBootstrapAdmin ? "admin" : "user"));
          }
        }).catch(err => handleFirestoreError(err, OperationType.GET, `users/${u.uid}`));
      }
    });
    return unsub;
  }, []);

  // Cleanup old news and polls once
  useEffect(() => {
    const cleanup = async () => {
      const cleaned = localStorage.getItem("ais_cleanup_v2");
      if (cleaned) return;
      try {
        const newsSnap = await getDocs(collection(db, "news"));
        for (const d of newsSnap.docs) {
          await deleteDoc(doc(db, "news", d.id));
        }
        const pollsSnap = await getDocs(collection(db, "polls"));
        for (const d of pollsSnap.docs) {
          await deleteDoc(doc(db, "polls", d.id));
        }
        localStorage.setItem("ais_cleanup_v2", "true");
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };
    cleanup();
  }, []);

  useEffect(() => {
    const qIncidents = query(collection(db, "incidents"), orderBy("timestamp", "desc"));
    const unsubInc = onSnapshot(qIncidents, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sort: Strictly by timestamp desc
      const sorted = [...data].sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return tB - tA;
      });

      // Real-time alert for new incidents and Geofence check
      if (incidents.length > 0 && data.length > incidents.length) {
        const newInc: any = data.find(d => !incidents.find(old => old.id === d.id));
        if (newInc) {
          setToast({ type: "alert", title: "New Report", body: `${newInc.type.toUpperCase()} in ${newInc.district}` });
          setTimeout(() => setToast(null), 5000);

          // Geofence check
          if (newInc.location) {
            geofencesRef.current.forEach(gf => {
              const dist = getDistance(gf.lat, gf.lng, newInc.location.lat, newInc.location.lng);
              if (dist <= gf.radius) {
                setToast({ 
                  type: "alert", 
                  title: `Geofence Alert: ${gf.name}`, 
                  body: `Incident reported within ${gf.radius}m of ${gf.name}!` 
                });
                setTimeout(() => setToast(null), 8000);
              }
            });

            // Current Location check (5500m)
            if (userPosRef.current) {
              const distToUser = getDistance(userPosRef.current.lat, userPosRef.current.lng, newInc.location.lat, newInc.location.lng);
              if (distToUser <= 5500) {
                setToast({ 
                  type: "alert", 
                  title: "Nearby Incident", 
                  body: `An incident was reported within 5500m of your current location!` 
                });
                setTimeout(() => setToast(null), 8000);
              }
            }
          }
        }
      }

      setIncidents(sorted);

      if (data.length > 0) {
        getSafetyInsights(data).then(setAiInsights);
      }
    }, (err) => {
      // Only log error if it's not a permission error for unauthenticated users
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "incidents");
      }
    });

    const unsubDist = onSnapshot(collection(db, "districts"), (snap) => {
      setDistricts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDistrictsLoading(false);
    }, (err) => {
      setDistrictsLoading(false);
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "districts");
      }
    });

    const qNews = query(collection(db, "news"), orderBy("timestamp", "desc"));
    const unsubNews = onSnapshot(qNews, (snap) => {
      setNews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "news");
      }
    });

    const qPolls = query(collection(db, "polls"), orderBy("timestamp", "desc"));
    const unsubPolls = onSnapshot(qPolls, (snap) => {
      setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "polls");
      }
    });

    const qMessages = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(50));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse());
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "messages");
      }
    });

    const qAlerts = query(collection(db, "live_alerts"), orderBy("timestamp", "desc"));
    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      setLiveAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "live_alerts");
      }
    });

    let unsubGeofences = () => {};
    let unsubNotifications = () => {};
    let unsubContactSos = () => {};
    if (user) {
      const qGf = query(collection(db, "geofences"), where("uid", "==", user.uid));
      unsubGeofences = onSnapshot(qGf, (snap) => {
        setGeofences(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      if (user.email) {
        const email = user.email.toLowerCase();
        const qNotif = query(collection(db, "notifications"), where("toEmail", "==", email), orderBy("timestamp", "desc"), limit(10));
        unsubNotifications = onSnapshot(qNotif, (snap) => {
          const newNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Check for new SOS notifications to show toast
          if (notifications.length > 0 && newNotifs.length > notifications.length) {
            const latest = newNotifs[0] as any;
            if (latest.type === "sos" && !latest.read) {
              setToast({ 
                type: "alert", 
                title: "🚨 SOS EMERGENCY", 
                body: `${latest.fromName} has triggered an SOS! Check their location.` 
              });
              setTimeout(() => setToast(null), 10000);
            }
          }
          setNotifications(newNotifs);
        });
      }
    }

    // Get user location (Real-time)
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, (err) => console.warn("Location access denied"), { enableHighAccuracy: true });
    }

    return () => { 
      unsubInc(); unsubDist(); unsubNews(); unsubPolls(); unsubMessages(); unsubAlerts(); unsubGeofences(); unsubNotifications();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [user]); // Removed userPos from dependency

  // Real-time SOS tracking update
  useEffect(() => {
    if (activeSosId && userPos) {
      const updateLocation = async () => {
        try {
          await updateDoc(doc(db, "sos_signals", activeSosId), {
            lat: userPos.lat,
            lng: userPos.lng,
            lastUpdate: serverTimestamp()
          });
        } catch (e) {
          console.error("SOS location update failed", e);
        }
      };
      const interval = setInterval(updateLocation, 5000); // Update every 5 seconds
      return () => clearInterval(interval);
    }
  }, [activeSosId, userPos]);

  useEffect(() => {
    const alerts = news.filter(n => n.urgent && (n.timestamp?.toDate ? n.timestamp.toDate().getTime() : 0) > lastViewedNews);
    setUnreadAlerts(alerts.length);
  }, [news, lastViewedNews]);

  // Volunteer Notification Logic (Reliable)
  const prevIncidentsCount = useRef(incidents.length);
  useEffect(() => {
    if (userProfile?.isVolunteer && incidents.length > prevIncidentsCount.current) {
      const latest = incidents[0] as any;
      if (latest && latest.type === "welfare" && latest.bloodType) {
        const isMatch = latest.bloodType === userProfile.volunteerBloodType || userProfile.volunteerBloodType === "O-";
        if (isMatch) {
          setToast({
            type: "alert",
            title: "🩸 URGENT BLOOD NEEDED",
            body: `A medical emergency in ${latest.district} needs ${latest.bloodType} blood. You are a matching volunteer!`
          });
          setTimeout(() => setToast(null), 15000);
        }
      }
    }
    prevIncidentsCount.current = incidents.length;
  }, [incidents, userProfile]);


  useEffect(() => {
    const isAdmin = user?.email === "barbaaryp@gmail.com" || userRole === "admin";
    if (!user || !isAdmin) return;

    const seedData = async () => {
      // Seed Districts
      if (districts.length < 18) {
        const defaultDistricts = [
          { name: "Abdiaziz", risk: "medium", area: "East", pop: 46000, resolved: 13, active: 3, incidents: 20, trend: 3, desc: "Eastern coastal residential area with growing infrastructure." },
          { name: "Bondhere", risk: "high", area: "East", pop: 72000, resolved: 24, active: 10, incidents: 34, trend: 8, desc: "Busy transit corridor and historic residential hub." },
          { name: "Daynile", risk: "low", area: "Northwest", pop: 43000, resolved: 10, active: 1, incidents: 11, trend: -5, desc: "Peripheral district with large open spaces." },
          { name: "Dharkenley", risk: "low", area: "Southwest", pop: 44000, resolved: 13, active: 2, incidents: 17, trend: 1, desc: "Stable suburban area with active local markets." },
          { name: "Hamar Jajab", risk: "medium", area: "Central", pop: 62000, resolved: 20, active: 6, incidents: 31, trend: -4, desc: "Central residential and market mix near the port." },
          { name: "Hamar Weyne", risk: "high", area: "Central", pop: 85000, resolved: 28, active: 11, incidents: 39, trend: 5, desc: "Historic heart of the city with dense commercial activity." },
          { name: "Heliwa", risk: "medium", area: "Northeast", pop: 64000, resolved: 20, active: 6, incidents: 33, trend: 6, desc: "Mixed residential-commercial zone on the northern edge." },
          { name: "Hodan", risk: "critical", area: "Southwest", pop: 110000, resolved: 31, active: 15, incidents: 46, trend: 12, desc: "Most densely populated and active commercial district." },
          { name: "Howlwadaag", risk: "high", area: "Central", pop: 95000, resolved: 25, active: 12, incidents: 42, trend: 9, desc: "Central commercial hub including Bakara Market area." },
          { name: "Kaxda", risk: "low", area: "Far North", pop: 38000, resolved: 8, active: 1, incidents: 9, trend: -2, desc: "Outlying district with developing residential zones." },
          { name: "Karaan", risk: "medium", area: "North", pop: 59000, resolved: 17, active: 4, incidents: 21, trend: -2, desc: "Stable residential area with a strong community feel." },
          { name: "Shangani", risk: "medium", area: "Coastal", pop: 41000, resolved: 15, active: 4, incidents: 22, trend: 3, desc: "Historic coastal residential district." },
          { name: "Shibis", risk: "high", area: "Southeast", pop: 81000, resolved: 26, active: 11, incidents: 44, trend: 14, desc: "High-traffic residential and commercial area." },
          { name: "Waberi", risk: "low", area: "Central", pop: 55000, resolved: 14, active: 2, incidents: 16, trend: -5, desc: "Improving district near the airport zone." },
          { name: "Wadajir", risk: "high", area: "West", pop: 78000, resolved: 22, active: 9, incidents: 31, trend: 3, desc: "Growing commercial zone with significant traffic." },
          { name: "Warta Nabadda", risk: "medium", area: "Central", pop: 67000, resolved: 18, active: 5, incidents: 29, trend: 2, desc: "Government and institutional area near Villa Somalia." },
          { name: "Yaqshid", risk: "low", area: "North", pop: 48000, resolved: 12, active: 1, incidents: 14, trend: -3, desc: "Quieter northern district with residential focus." },
          { name: "Garasbaley", risk: "medium", area: "West", pop: 52000, resolved: 15, active: 4, incidents: 19, trend: 5, desc: "Rapidly growing district on the western outskirts." },
        ];
        try {
          for (const d of defaultDistricts) {
            await setDoc(doc(db, "districts", d.name.toLowerCase().replace(/\s+/g, '_')), d);
          }
        } catch (err) {
          console.error("District seeding failed", err);
        }
      }

      // Seed News
      // News seeding removed as per user request for "real" news

      // Seed Polls
      // Poll seeding removed as per user request for "real" polls
    };

    seedData();
  }, [user, userRole, districts.length, news.length, polls.length]);
  const handleLogin = async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-closed-by-user') {
        console.error("Login failed", error);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleEdit = (r: any) => {
    setEditIncident(r);
    setTab("report");
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "incidents", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `incidents/${id}`);
    }
  };

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => {}
      });
    }
  };

  const handlePhoneLogin = async () => {
    if (!phoneNumber) return;
    setLoginLoading(true);
    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(confirmation);
    } catch (error) {
      console.error("Phone login failed", error);
      alert("Failed to send code. Please check the number format (e.g. +252...)");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult) return;
    setLoginLoading(true);
    try {
      await confirmationResult.confirm(verificationCode);
    } catch (error) {
      console.error("Verification failed", error);
      alert("Invalid code. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0A1628", color: "#fff" }}>Loading Foogan...</div>;

  const nav = [
    { id: "home", icon: <IcHome />, label: "Home" },
    { id: "map", icon: <IcMap />, label: "Map" },
    { id: "report", icon: <IcAlert />, label: "Report", fab: true },
    { id: "news", icon: <IcNews />, label: "News" },
    { id: "profile", icon: <IcUser />, label: "Profile" },
  ];

  const LoginScreen = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", background: "transparent", color: "#0A1628", padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>Foogan</div>
      <div style={{ fontSize: 14, color: "#E8C547", fontWeight: 700, marginBottom: 24 }}>Ka feejigan qataraha</div>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 32, lineHeight: 1.6 }}>Join the community to report incidents and stay safe in Mogadishu.</p>
      
      {!showPhoneLogin ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <button 
            onClick={handleLogin} 
            disabled={loginLoading}
            style={{ 
              background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: "16px 32px", fontSize: 15, fontWeight: 700, cursor: loginLoading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, opacity: loginLoading ? 0.7 : 1
            }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="" />
            {loginLoading ? "Signing in..." : "Continue with Google"}
          </button>
          
          <button 
            onClick={() => setShowPhoneLogin(true)}
            style={{ background: "#fff", color: "#0A1628", border: "1.5px solid #0A1628", borderRadius: 14, padding: "16px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Continue with Phone
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          {!confirmationResult ? (
            <>
              <input 
                value={phoneNumber} 
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="+252 61..." 
                style={{ width: "100%", padding: 16, borderRadius: 14, border: "1.5px solid #F0EFEB", fontSize: 15, outline: "none" }}
              />
              <button 
                onClick={handlePhoneLogin}
                disabled={loginLoading}
                style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: loginLoading ? 0.7 : 1 }}
              >
                {loginLoading ? "Sending..." : "Send Verification Code"}
              </button>
            </>
          ) : (
            <>
              <input 
                value={verificationCode} 
                onChange={e => setVerificationCode(e.target.value)}
                placeholder="Enter 6-digit code" 
                style={{ width: "100%", padding: 16, borderRadius: 14, border: "1.5px solid #F0EFEB", fontSize: 15, outline: "none" }}
              />
              <button 
                onClick={handleVerifyCode}
                disabled={loginLoading}
                style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: loginLoading ? 0.7 : 1 }}
              >
                {loginLoading ? "Verifying..." : "Verify & Login"}
              </button>
            </>
          )}
          <button 
            onClick={() => { setShowPhoneLogin(false); setConfirmationResult(null); }}
            style={{ background: "none", border: "none", color: "#888", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
          >
            Back to options
          </button>
        </div>
      )}
      <div id="recaptcha-container"></div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',sans-serif", background: "#F5F4F0", minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      <div style={{ background: "#0A1628", padding: "14px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>Foogan</div>
          <div style={{ fontSize: 10, color: "#E8C547", letterSpacing: "0.08em", fontWeight: 600, marginTop: 3 }}>Ka feejigan qataraha</div>
        </div>
        {user ? (
          <button onClick={() => setShowNearby(true)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", position: "relative" }}>
            <IcBell />
            {unreadAlerts > 0 && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#E53935", border: "2px solid #0A1628" }} />}
          </button>
        ) : (
          <button onClick={handleLogin} style={{ background: "#E8C547", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#0A1628" }}>
            Login
          </button>
        )}
      </div>

      <AnimatePresence>
        {showNearby && (
          <NearbyAlertsModal 
            userPos={userPos} 
            incidents={incidents} 
            liveAlerts={liveAlerts} 
            isAdmin={userRole === "admin"} 
            onClose={() => setShowNearby(false)} 
            currentUid={user?.uid}
            onEdit={handleEdit}
            onDelete={handleDelete}
            userProfile={userProfile}
          />
        )}
      </AnimatePresence>

      <div style={{ position: "relative", height: "calc(100vh - 140px)" }}>
        <AnimatePresence>
          {toast && <NotificationToast msg={toast} onClose={() => setToast(null)} />}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab + (selDistName || "") + refreshKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ height: "100%", overflowY: "auto", paddingBottom: 82 }}
          >
            {tab === "home" && <HomeTab setTab={setTab} setDist={(n: string) => { setSelDistName(n); setTab("map"); }} incidents={incidents} news={news} liveAlerts={liveAlerts} aiInsights={aiInsights} geofences={geofences} currentUid={user?.uid} isAdmin={userRole === "admin"} onEdit={handleEdit} onDelete={handleDelete} user={user} userPos={userPos} userProfile={userProfile} activeSosId={activeSosId} onActiveSosId={setActiveSosId} polls={polls} contactSosSignals={contactSosSignals} />}
            {tab === "feed" && <FeedTab incidents={incidents} currentUid={user?.uid} isAdmin={userRole === "admin"} onEdit={handleEdit} onDelete={handleDelete} userPos={userPos} userProfile={userProfile} />}
            {tab === "map" && <MapTab selDistName={selDistName} setDistName={setSelDistName} districts={districts} incidents={incidents} geofences={geofences} loading={districtsLoading} currentUid={user?.uid} isAdmin={userRole === "admin"} onEdit={handleEdit} onDelete={handleDelete} userPos={userPos} userProfile={userProfile} sosSignals={contactSosSignals} />}
            {tab === "report" && (user ? <ReportTab user={user} districts={districts} districtsLoading={districtsLoading} onDone={() => { setTab("home"); setEditIncident(null); }} editItem={editIncident} onCancel={() => { setTab("profile"); setEditIncident(null); }} userPos={userPos} /> : <LoginScreen />)}
            {tab === "news" && <NewsTab news={news} polls={polls} isAdmin={userRole === "admin"} onEnter={() => setLastViewedNews(Date.now())} incidents={incidents} />}
            {tab === "profile" && (user ? (
              <ProfileTab 
                user={user} 
                userRole={userRole} 
                userProfile={userProfile} 
                incidents={incidents} 
                geofences={geofences} 
                districts={districts} 
                contactSosSignals={contactSosSignals} 
                userPos={userPos}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenAdmin={() => {
                  setTab("news");
                  setTimeout(() => {
                    const btn = document.querySelector('[data-admin-tools]') as HTMLButtonElement;
                    if (btn) btn.click();
                  }, 100);
                }} 
              />
            ) : <LoginScreen />)}
          </motion.div>
        </AnimatePresence>
      </div>

      <nav style={{ 
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", 
        width: "100%", maxWidth: 430, background: "#fff", 
        borderTop: "1px solid #E8E8E4", display: "flex", 
        alignItems: "center", zIndex: 100, 
        paddingBottom: "env(safe-area-inset-bottom, 8px)",
        height: 64,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.03)"
      }}>
        {nav.map(n => n.fab ? (
          <div key={n.id} style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
            <button onClick={() => {
              if (tab === n.id) setRefreshKey(k => k + 1);
              else setTab(n.id);
            }} style={{ 
              position: "absolute", top: -32,
              width: 56, height: 56, borderRadius: "50%", 
              background: tab === n.id ? "#B71C1C" : "#E53935", 
              display: "flex", alignItems: "center", justifyContent: "center", 
              color: "#fff", border: "4px solid #fff",
              boxShadow: "0 8px 24px rgba(229,57,53,0.4)",
              cursor: "pointer", transition: "all 0.2s ease"
            }}>
              <IcAlert />
            </button>
            <span style={{ fontSize: 10, fontWeight: 800, color: tab === n.id ? "#E53935" : "#9E9C95", marginTop: 32 }}>{n.label}</span>
          </div>
        ) : (
          <button key={n.id} onClick={() => {
            if (tab === n.id) setRefreshKey(k => k + 1);
            else setTab(n.id);
          }} style={{ 
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", 
            gap: 4, height: "100%", border: "none", background: "transparent", cursor: "pointer", 
            fontSize: 10, fontWeight: 700, letterSpacing: "0.01em", 
            color: tab === n.id ? "#0A1628" : "#9E9C95", position: "relative",
            transition: "all 0.2s ease"
          }}>
            <div style={{ color: tab === n.id ? "#0A1628" : "#9E9C95", transition: "all 0.2s ease" }}>
              {n.icon}
            </div>
            <span>{n.label}</span>
            {n.id === "news" && unreadAlerts > 0 && (
              <div style={{ position: "absolute", top: 10, right: "25%", width: 8, height: 8, borderRadius: "50%", background: "#E53935", border: "2px solid #fff" }} />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
