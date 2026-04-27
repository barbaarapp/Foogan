/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, memo, useRef, Suspense, lazy } from "react";
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
import { 
  Eye, 
  Bookmark, 
  Star, 
  Activity, 
  Radar, 
  Shield, 
  ShieldPlus,
  HeartPulse,
  Bell, 
  CheckCircle2, 
  MessageSquare,
  Share2,
  MoreHorizontal,
  Clock,
  MapPin,
  AlertTriangle,
  Flame,
  Heart,
  User,
  Home,
  Map as MapIcon,
  Newspaper,
  Settings,
  LogOut,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Users,
  Gavel,
  Stethoscope,
  Store,
  Zap
} from "lucide-react";
import { db, auth } from "./firebase";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DistrictDashboard } from "./components/DistrictDashboard";
import { getSafetyInsights, summarizeDistrictRisk } from "./services/gemini";
import Markdown from "react-markdown";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents, useMap } from 'react-leaflet';
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

const TRANSLATIONS: Record<string, any> = {
  en: {
    app_name: "Foogan",
    tagline: "Stay Alert, Stay Safe",
    home: "Home",
    map: "Map",
    report: "Report",
    news: "News",
    profile: "Profile",
    mogadishu_today: "Foogan",
    live_feed: "Live safety feed & community reports",
    my_reports: "REPORTS",
    safety_zones: "ZONES",
    recent_reports: "My Recent Reports",
    no_reports_yet: "No reports yet",
    safety_emergency: "Safety & Emergency",
    settings: "Settings",
    language: "Language",
    english: "English",
    somali: "Somali",
    sign_out: "Sign Out",
    watch_my_back: "WATCH MY BACK",
    system_admin: "System Administrator",
    content_editor: "Content Editor",
    open_panel: "Open Panel",
    edit_profile: "Edit Profile",
    team_mgmt: "Team Management",
    volunteer: "Volunteer Status",
    save: "Save Changes",
    display_name: "DISPLAY NAME",
    home_district: "HOME DISTRICT",
    residence_verify: "Residents can verify incidents in their district.",
    admin_desc: "Access advanced tools and manage reports",
    editor_desc: "Manage news, polls, and live alerts",
    buddy_requests: "Buddy Requests",
    pulse: "Send Pulse",
    stop: "Stop Session",
    safety_title: "SOS & Safety",
    settings_title: "General Settings",
    app_language: "App Language",
    emergency_contacts: "Emergency Contacts",
    safety_geofences: "Safe Area Geofences",
    active_sos: "Active SOS Alerts",
    emergency_track: "EMERGENCY: TRACK LIVE LOCATION",
    view_map: "VIEW MAP",
    mark_resolved: "Mark as Resolved",
    community_polls: "Community Polls",
    view_all: "View All",
    recent_incidents: "Recent Incidents",
    report_new: "+ Report New",
    no_incidents: "No incidents reported yet.",
    login: "Login",
    ka_feejigan: "Ka feejigan qataraha",
    cat_security: "Security",
    cat_injustice: "Injustice",
    cat_hazards: "Hazards",
    cat_welfare: "Welfare",
    cat_health: "Health",
    cat_market: "Market",
    desc_security: "Armed threats, drugs, robbery, or shootings.",
    desc_injustice: "Abuse, corruption, or exploitation.",
    desc_hazards: "Fires, road damage, waste, or utility failures.",
    desc_welfare: "Missing persons, blood needs, or homelessness.",
    desc_health: "Disease, extreme heat, or sanitation issues.",
    desc_market: "Price inflation or business closures.",
    submit_report: "Submit Report",
    desc_placeholder: "Describe what happened...",
    anon_report: "Report anonymously",
    change_cat: "Change category",
    report_title: "Report Incident"
  },
  so: {
    app_name: "Foogan",
    tagline: "Feejignow, Nabada Hel",
    home: "Hoyga",
    map: "Khariidada",
    report: "Warbixi",
    news: "Wararka",
    profile: "Profile-ka",
    mogadishu_today: "Foogan",
    live_feed: "Warbixinnada badbaadada & bulshada",
    my_reports: "WARBIXIN",
    safety_zones: "GOOBAHA",
    recent_reports: "Warbixinnadayda",
    no_reports_yet: "Wali warbixin ma jirto",
    safety_emergency: "Badbaadada & Gurmadka",
    settings: "Hagaajinta",
    language: "Luqadda",
    english: "Ingiriis",
    somali: "Soomaali",
    sign_out: "Ka Bax",
    watch_my_back: "IILA SOO SOCO",
    system_admin: "Maamulaha Sare",
    content_editor: "Tifatiraha Nuxurka",
    open_panel: "Fur Maamulka",
    edit_profile: "Wax ka baddal profile-ka",
    team_mgmt: "Maamulka Kooxda",
    volunteer: "Heerka Tabaruca",
    save: "Keydi Isbeddelka",
    display_name: "MAGACAAGA",
    home_district: "DEGMODAADA",
    residence_verify: "Dadka deegaanka waxay xaqiijin karaan dhacdooyinka.",
    admin_desc: "Adeegso agabka sare ee maamulka",
    editor_desc: "Maaree wararka iyo digniinaha",
    buddy_requests: "Codsiyada Saaxiibka",
    pulse: "Garaaca Wadnaha",
    stop: "Jooji Shaqada",
    safety_title: "SOS & Badbaadada",
    settings_title: "Hagaajinta Guud",
    app_language: "Luqadda App-ka",
    emergency_contacts: "Xiriirada Gurmadka",
    safety_geofences: "Goobaha Ammaanka ah",
    active_sos: "Digniinaha SOS ee Firfircoon",
    emergency_track: "GURMAD: LA SOCO GOOBTA TOOSKA AH",
    view_map: "EEG KHARIIDADA",
    mark_resolved: "U calaamadee in la xaliyay",
    community_polls: "Cod-bixinta Bulshada",
    view_all: "Eeg Dhammaan",
    recent_incidents: "Dhacdooyinkii u dambeeyay",
    report_new: "+ Warbixi Cusub",
    no_incidents: "Wali ma jiraan dhacdooyin la soo sheegay.",
    login: "Gali",
    ka_feejigan: "Ka feejigan qataraha",
    cat_security: "Amni",
    cat_injustice: "Xaqdarro",
    cat_hazards: "Musiibo",
    cat_welfare: "Gargaarka",
    cat_health: "Caafimaadka",
    cat_market: "Suuqa",
    desc_security: "Hanjabaad hubaysan, maandooriye, dhac, ama rasaas.",
    desc_injustice: "Xadgudub, musuqmaasuq, ama ka faa'iidaysi.",
    desc_hazards: "Dab, burburka waddooyinka, qashinka, ama ciladaha korontada.",
    desc_welfare: "Dadka maqan, baahida dhiigga, ama hoy la'aanta.",
    desc_health: "Cudurada, kuleylka daran, ama arrimaha nadaafadda.",
    desc_market: "Sicir-bararka ama ganacsiyada xiran.",
    submit_report: "Gudbi Warbixinta",
    desc_placeholder: "Sharax waxa dhacay...",
    anon_report: "Warbixi adigoo qarsoon",
    change_cat: "Beddel qaybta",
    report_title: "Warbixi Dhacdo"
  }
};

const getT = (lang: string) => (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en"][key] || key;

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

import { ReportPanel } from './components/ReportPanel';

// --- CONSTANTS ---
const GROUPS = [
  { id: "security", labelKey: "cat_security", icon: <Shield size={20} />, color: "#E53935", bg: "#FFEBEE", descKey: "desc_security" },
  { id: "injustice", labelKey: "cat_injustice", icon: <Gavel size={20} />, color: "#8E24AA", bg: "#F3E5F5", descKey: "desc_injustice" },
  { id: "hazards", labelKey: "cat_hazards", icon: <Flame size={20} />, color: "#E65100", bg: "#FFF8E1", descKey: "desc_hazards" },
  { id: "welfare", labelKey: "cat_welfare", icon: <Heart size={20} />, color: "#1E88E5", bg: "#E3F2FD", descKey: "desc_welfare" },
  { id: "health", labelKey: "cat_health", icon: <Stethoscope size={20} />, color: "#43A047", bg: "#E8F5E9", descKey: "desc_health" },
  { id: "market", labelKey: "cat_market", icon: <Store size={20} />, color: "#FB8C00", bg: "#FFF3E0", descKey: "desc_market" },
];

const RISK = {
  critical: { label: "Critical", color: "#E53935", bg: "#FFEBEE", bar: "#E53935" },
  high: { label: "High", color: "#F4511E", bg: "#FBE9E7", bar: "#F4511E" },
  medium: { label: "Medium", color: "#FB8C00", bg: "#FFF8E1", bar: "#FB8C00" },
  low: { label: "Low", color: "#43A047", bg: "#E8F5E9", bar: "#43A047" },
};

// --- ICONS ---
const IcHome = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const IcMap = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>;
const IcAlert = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
const IcFeed = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" /></svg>;
const IcUser = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IcNews = ({ size = 22 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" /><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>;
const IcBell = ({ size = 20 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
const IcBack = ({ size = 20 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IcChev = ({ size = 14 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
const IcPin = ({ size = 12 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IcHeart = ({ size = 14 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>;
const IcCamera = ({ size = 18 }: any) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>;
const IcUp = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 16H4z" /></svg>;
const IcDown = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20l8-16H4z" /></svg>;
const IcShield = ({ size = 12 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" /></svg>;
const IcSparkle = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707" /></svg>;
const IcChat = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>;
const IcSend = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;

// --- UTILS ---
function useViewCounter(id: string, collectionName: string) {
  const ref = useRef<HTMLDivElement>(null);
  const lastUpdate = useRef<number>(0);

  useEffect(() => {
    if (!id) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting) {
          const now = Date.now();
          // Cooldown of 10 seconds to prevent spamming but allow re-counting
          if (now - lastUpdate.current > 10000) {
            lastUpdate.current = now;
            try {
              await updateDoc(doc(db, collectionName, id), {
                reads: increment(1)
              });
            } catch (e) {
              // Silent fail
            }
          }
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [id, collectionName]);

  return ref;
}

// --- HELPERS ---
const gColor = (id: string) => GROUPS.find(g => g.id === id)?.color || "#888";
const gBg = (id: string) => GROUPS.find(g => g.id === id)?.bg || "#F5F5F5";
const gLabel = (id: string, t: any) => {
  const group = GROUPS.find(g => g.id === id);
  return group ? t(group.labelKey) : id;
};
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

const IncidentCard = React.memo(({ r, compact, onEdit, onDelete, currentUid, isAdmin, userPos, incidents = [], userProfile, userRole, assignedDistrict, t }: { r: any, compact?: boolean, onEdit?: (r: any) => void, onDelete?: (id: string) => void, currentUid?: string, isAdmin?: boolean, userPos?: any, incidents?: any[], userProfile?: any, userRole?: string, assignedDistrict?: string | null, t: any }) => {
  const viewRef = useViewCounter(r.id, "incidents");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const col = gColor(r.type), bg = gBg(r.type);
  const isOwner = currentUid === r.uid;
  const isSuperAdmin = isAdmin;
  const isDistrictAdmin = (userRole === "district_admin" || userProfile?.role === "district_admin") && (assignedDistrict === r.district || userProfile?.assignedDistrict === r.district);
  const canManageStatus = isSuperAdmin || isDistrictAdmin;
  const canResolve = (isOwner && !r.solved) || canManageStatus;

  const watchers = r.watchers || [];
  const confirms = r.confirms || [];
  const notes = r.notes || [];
  const isWatching = currentUid && watchers.includes(currentUid);
  const isConfirmed = currentUid && confirms.includes(currentUid);
  const isHighlyVerified = confirms.length >= 5;

  // For current user, we can check verified status
  const isVerifiedReporter = isOwner ? checkVerifiedStatus(currentUid, incidents, userProfile) : false;

  const userDistrict = getUserDistrict(userPos);
  const homeDistrict = userProfile?.homeDistrict;
  const distToUser = userPos && r.location ? getDistance(userPos.lat, userPos.lng, r.location.lat, r.location.lng) : 999999;
  const isNear = distToUser <= 5000; // 5km
  const canConfirmBtn = userDistrict === r.district || homeDistrict === r.district || isNear;
  const canWatchBtn = !canConfirmBtn;

  const isVolunteer = userProfile?.isVolunteer;
  const isWithin1km = distToUser <= 1000;
  const showVolunteerBtn = isVolunteer && isWithin1km && !r.acceptedBy && !isOwner;
  const isAcceptedByMe = r.acceptedBy === currentUid;

  const handleAccept = async () => {
    if (!currentUid || r.acceptedBy) return;
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        acceptedBy: currentUid,
        acceptedByName: userProfile?.displayName || "Volunteer"
      });
      
      // Notify reporter
      await addDoc(collection(db, "notifications"), {
        toEmail: r.email || "", // We might need to ensure email is on incident or fetch it
        fromName: userProfile?.displayName || "Volunteer",
        fromUid: currentUid,
        type: "alert",
        title: "Volunteer Responding",
        body: `${userProfile?.displayName || "A volunteer"} is responding to your report!`,
        timestamp: serverTimestamp(),
        read: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };
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

  const handleResolve = async (newStatus?: string) => {
    if (!canResolve) return;
    
    // Permission Enforcement
    if (newStatus && !canManageStatus) return; // Only admins set specific statuses
    if (!newStatus && !isOwner) return; // Toggle is only for owners if no status provided
    
    try {
      const updates: any = {};
      
      if (newStatus) {
        updates.status = newStatus;
        if (newStatus === "resolved") updates.solved = true;
        else if (newStatus === "processing" || newStatus === "seen") updates.solved = false;
      } else {
        // Toggle solved for owner (Only to resolved)
        if (r.solved) return; // Can't undo resolution if not admin? User says "allow users to resolve their reports"
        updates.solved = true;
        updates.status = "resolved";
      }

      await updateDoc(doc(db, "incidents", r.id), updates);

      // Notify watchers
      if (watchers.length > 0) {
        for (const watcherUid of watchers) {
          if (watcherUid === currentUid) continue;
          const watcherDoc = await getDoc(doc(db, "users", watcherUid));
          const watcherEmail = watcherDoc.data()?.email;
          if (watcherEmail) {
            await addDoc(collection(db, "notifications"), {
              toEmail: watcherEmail.toLowerCase(),
              fromName: "System",
              type: "alert",
              title: `Incident Status Update`,
              body: `The incident you are watching in ${r.district} is now ${updates.status || (updates.solved ? 'solved' : 'pending')}.`,
              timestamp: serverTimestamp(),
              read: false,
              incidentId: r.id
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const newNote = {
      text: noteText,
      user: userProfile?.displayName || auth.currentUser?.displayName || "User",
      uid: auth.currentUser?.uid,
      timestamp: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, "incidents", r.id), {
        notes: [...notes, newNote]
      });

      // Notify watchers
      if (watchers.length > 0) {
        for (const watcherUid of watchers) {
          if (watcherUid === currentUid) continue;
          const watcherDoc = await getDoc(doc(db, "users", watcherUid));
          const watcherEmail = watcherDoc.data()?.email;
          if (watcherEmail) {
            await addDoc(collection(db, "notifications"), {
              toEmail: watcherEmail.toLowerCase(),
              fromName: userProfile?.displayName || "User",
              type: "alert",
              title: "New Community Note",
              body: `${userProfile?.displayName || "Someone"} added a note to an incident you are watching in ${r.district}.`,
              timestamp: serverTimestamp(),
              read: false,
              incidentId: r.id
            });
          }
        }
      }

      setNoteText("");
      setShowNoteInput(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleDeleteNote = async (idx: number) => {
    const newNotes = notes.filter((_: any, i: number) => i !== idx);
    try {
      await updateDoc(doc(db, "incidents", r.id), { notes: newNotes });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  const handleUpdateNote = async () => {
    if (editingNoteIdx === null || !editingNoteText.trim()) return;
    const newNotes = [...notes];
    newNotes[editingNoteIdx] = { ...newNotes[editingNoteIdx], text: editingNoteText, edited: true };
    try {
      await updateDoc(doc(db, "incidents", r.id), { notes: newNotes });
      setEditingNoteIdx(null);
      setEditingNoteText("");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${r.id}`);
    }
  };

  return (
    <div ref={viewRef} style={{ 
      background: isHighlyVerified ? "rgba(229,57,53,0.02)" : "transparent", 
      padding: "16px 0",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
      position: "relative",
      transition: "background 0.2s ease",
      contain: "content",
      willChange: "transform"
    }}>
      {isHighlyVerified && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#E53935", zIndex: 1 }} />
      )}
      {r.img && (
        <div style={{ width: "100%", height: compact ? 160 : 200, overflow: "hidden", background: "#F3F4F6", position: "relative", marginBottom: 10, borderRadius: 12 }}>
          <img src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          {!compact && (
            <div style={{ position: "absolute", bottom: 8, left: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.5)", borderRadius: 20, padding: "3px 8px", backdropFilter: "blur(4px)" }}>
              <IcPin /><span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{r.district}</span>
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
              {r.status && r.status !== "pending" && (
                <span style={{ 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: 3, 
                  background: r.status === "resolved" ? "#E8F5E9" : r.status === "processing" ? "#FFF3E0" : "#E3F2FD", 
                  borderRadius: 20, 
                  padding: "2px 8px" 
                }}>
                  <span style={{ 
                    color: r.status === "resolved" ? "#2E7D32" : r.status === "processing" ? "#E65100" : "#1976D2", 
                    fontSize: 8,
                    fontWeight: 900
                  }}>●</span>
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 900, 
                    color: r.status === "resolved" ? "#2E7D32" : r.status === "processing" ? "#E65100" : "#1976D2",
                    textTransform: "uppercase",
                    letterSpacing: "0.02em"
                  }}>{r.status.replace("-", " ")}</span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: bg, color: col, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.04em" }}>
                {gLabel(r.type, t).toUpperCase()}
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
      <div style={{ padding: "4px 4px 8px" }}>
        <p style={{
          fontSize: 14, color: "#333", lineHeight: 1.5, margin: 0,
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#FFEBEE", borderRadius: 8, padding: "4px 10px" }}>
              <span style={{ color: "#E53935", fontSize: 12 }}>🩸</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#E53935" }}>Blood Needed: {r.bloodType}</span>
            </div>
            {userProfile?.volunteerBloodType === r.bloodType && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#E8F5E9", borderRadius: 8, padding: "4px 10px", border: "1.5px solid #43A047" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#2E7D32" }}>🔥 YOU ARE A MATCH</span>
              </div>
            )}
          </div>
        )}

        {r.acceptedBy && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#E3F2FD", borderRadius: 12, padding: "10px 14px", marginTop: 12, border: "1px solid #BBDEFB" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1976D2", animation: "pulse 2s infinite" }} />
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1976D2" }}>
              {isAcceptedByMe ? "You are responding to this" : `${r.acceptedByName} is responding`}
            </div>
          </div>
        )}

        {isAcceptedByMe && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#E3F2FD", borderRadius: 12, padding: "12px 14px", marginTop: 12, border: "1px solid #BBDEFB" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1976D2", animation: "pulse 2s infinite" }} />
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1976D2" }}>
              ACTION: RESPONDING TO THIS REPORT
            </div>
          </div>
        )}

        {showVolunteerBtn && !r.bloodType && (
          <button 
            onClick={handleAccept}
            style={{ 
              width: "100%", background: "#E53935", color: "#fff", border: "none", 
              borderRadius: 12, padding: "12px", marginTop: 12, fontSize: 13, fontWeight: 900, 
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(229,57,53,0.2)"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            RESPOND TO EMERGENCY
          </button>
        )}

        {r.bloodType && !r.solved && (
          <div style={{ marginTop: 12, background: "rgba(229, 57, 53, 0.05)", borderRadius: 12, padding: "16px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#C62828", marginBottom: 6 }}>HOW TO HELP</div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, marginBottom: 8 }}>
              If you have this blood type or can assist, please <b>leave a community note</b> below to coordinate.
            </div>
            <button 
              onClick={() => setShowNoteInput(true)}
              style={{ background: "#C62828", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
            >
              Collaborate / Coordinate Help
            </button>
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ marginTop: 14, background: "#F9FAFB", borderRadius: 16, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#9CA3AF", marginBottom: 10, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8C547" }} />
              Community Updates ({notes.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {notes.slice(0, 3).map((n: any, i: number) => (
                <div key={i} style={{ 
                  fontSize: 12, 
                  color: "#4B5563", 
                  lineHeight: 1.4, 
                  paddingBottom: i === Math.min(notes.length, 3) - 1 ? 0 : 8,
                  borderBottom: i === Math.min(notes.length, 3) - 1 ? "none" : "1px solid rgba(0,0,0,0.03)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontWeight: 800, color: "#0A1628" }}>{n.user}</span>
                    {n.uid === currentUid && (
                      <div style={{ display: "flex", gap: 10 }}>
                        <button 
                          onClick={() => { setShowNotesModal(true); setEditingNoteIdx(i); setEditingNoteText(n.text); }}
                          style={{ background: "none", border: "none", color: "#1E88E5", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                        >
                          EDIT
                        </button>
                        <button 
                          onClick={() => handleDeleteNote(i)}
                          style={{ background: "none", border: "none", color: "#E53935", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                        >
                          DELETE
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ color: "#444" }}>{n.text}</div>
                </div>
              ))}
            </div>
            {notes.length > 3 && (
              <button 
                onClick={() => setShowNotesModal(true)}
                style={{ 
                  width: "100%", background: "#fff", border: "1px solid #EEE", borderRadius: 10, 
                  color: "#0A1628", fontSize: 11, fontWeight: 900, cursor: "pointer", 
                  padding: "8px", marginTop: 12, transition: "all 0.2s"
                }}
              >
                VIEW {notes.length - 3} MORE UPDATE{notes.length - 3 > 1 ? 'S' : ''}
              </button>
            )}
          </div>
        )}

        <AnimatePresence>
          {showNotesModal && (
            <div 
              style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
              onClick={() => setShowNotesModal(false)}
            >
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={e => e.stopPropagation()}
                style={{ 
                  position: "relative", width: "100%", maxWidth: 400, maxHeight: "80vh", 
                  background: "#fff", borderRadius: 24, padding: 24, overflowY: "auto",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.2)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628" }}>Community Notes</div>
                  <button onClick={() => setShowNotesModal(false)} style={{ background: "#F5F4F0", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>×</button>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {notes.map((n: any, i: number) => (
                    <div key={i} style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{n.user}</div>
                        {n.uid === currentUid && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button 
                              onClick={() => { setEditingNoteIdx(i); setEditingNoteText(n.text); }}
                              style={{ background: "none", border: "none", color: "#1E88E5", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteNote(i)}
                              style={{ background: "none", border: "none", color: "#E53935", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {editingNoteIdx === i ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <textarea 
                            value={editingNoteText}
                            onChange={e => setEditingNoteText(e.target.value)}
                            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #DDD", fontSize: 12, minHeight: 60, outline: "none" }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setEditingNoteIdx(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#EEE", fontSize: 11, fontWeight: 700 }}>Cancel</button>
                            <button onClick={handleUpdateNote} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: "#0A1628", color: "#fff", fontSize: 11, fontWeight: 700 }}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>
                          {n.text}
                          {n.edited && <span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>(edited)</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: "#BBB", marginTop: 8 }}>
                        {n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {!compact && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {/* Stats Bar - Redesigned */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderTop: "1px solid rgba(0,0,0,0.03)", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#999" }}>
                <Radar size={14} strokeWidth={2.5} />
                <span style={{ fontSize: 11, fontWeight: 800 }}>{watchers.length} watching</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#1E88E5" }}>
                <Activity size={14} strokeWidth={2.5} />
                <span style={{ fontSize: 11, fontWeight: 800 }}>{r.reads || 0} ayes on</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#2E7D32", marginLeft: "auto" }}>
                <CheckCircle2 size={14} strokeWidth={2.5} />
                <span style={{ fontSize: 11, fontWeight: 800 }}>{confirms.length} verified</span>
              </div>
            </div>

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
                    <ShieldPlus size={16} strokeWidth={2.5} fill={isWatching ? "currentColor" : "none"} />
                    {isWatching ? "Watching" : "Watch"}
                  </button>
                )}
        {canConfirmBtn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <button onClick={handleConfirm}
              disabled={isConfirmed}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", background: isConfirmed ? "#E8F5E9" : "#F5F4F0",
                borderRadius: 10, padding: "8px 12px",
                cursor: isConfirmed ? "default" : "pointer", color: isConfirmed ? "#2E7D32" : "#0A1628", fontSize: 12, fontWeight: 900
              }}>
              <CheckCircle2 size={16} strokeWidth={2.5} />
              Verified
            </button>
            {homeDistrict === r.district && (
              <div style={{ fontSize: 8, color: "#2E7D32", fontWeight: 800, textAlign: "center" }}>RESIDENT VERIFICATION</div>
            )}
          </div>
        )}
                <button onClick={() => setShowNoteInput(!showNoteInput)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F4F0", border: "none", borderRadius: 10, padding: "8px 12px", color: "#1E88E5", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  <MessageSquare size={16} strokeWidth={2.5} />
                  Note
                </button>
                {canManageStatus ? (
                  <div style={{ display: "flex", gap: 4, width: "100%", marginTop: 8 }}>
                    {[
                      { id: "seen", label: "SEEN", bg: "#E3F2FD", col: "#1976D2" },
                      { id: "processing", label: "PROCESS", bg: "#FFF3E0", col: "#E65100" },
                      { id: "resolved", label: "RESOLVE", bg: "#E8F5E9", col: "#2E7D32" }
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => handleResolve(st.id)}
                        style={{
                          flex: 1,
                          background: r.status === st.id ? st.col : "#F5F4F0",
                          color: r.status === st.id ? "#fff" : st.col,
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 2px",
                          fontSize: 9,
                          fontWeight: 900,
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  canResolve && (
                    <button onClick={() => handleResolve()} style={{ display: "flex", alignItems: "center", gap: 6, background: r.solved ? "#E8F5E9" : "#F5F4F0", border: "none", borderRadius: 10, padding: "8px 12px", color: r.solved ? "#2E7D32" : "#43A047", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      <Shield size={16} strokeWidth={2.5} />
                      {r.solved ? "Solved" : "Resolve"}
                    </button>
                  )
                )}
              </div>
            </div>
            
            <AnimatePresence>
              {showNoteInput && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ background: "#F9FAFB", padding: 16, borderRadius: 12, marginTop: 12 }}>
                    <textarea 
                      value={noteText} onChange={e => setNoteText(e.target.value.slice(0, 280))}
                      placeholder="Add a community note (max 280 chars)..."
                      style={{ width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 13, minHeight: 60, resize: "none", color: "#333" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ fontSize: 10, color: noteText.length >= 280 ? "#E53935" : "#999", fontWeight: 700 }}>{noteText.length}/280</span>
                      <button 
                        onClick={handleAddNote} 
                        disabled={!noteText.trim()}
                        style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: noteText.trim() ? 1 : 0.5 }}
                      >
                        Post Note
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
});

function LiveAlertCard({ alert, isAdmin }: { alert: any, isAdmin?: boolean }) {
  const viewRef = useViewCounter(alert.id, "live_alerts");
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
      ref={viewRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{ 
        background: alert.active ? "#B71C1C" : "#F9FAFB", 
        borderRadius: 16, 
        padding: 18, 
        color: alert.active ? "#fff" : "#6B7280",
        border: alert.active ? "none" : "1px solid #F3F4F6",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 10 }}>
        <Radar size={10} color="#fff" />
        <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{alert.reads || 0} watching</span>
      </div>
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

function SponsorCard({ sponsor }: { sponsor: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#0A1628",
        borderRadius: 16,
        padding: "16px",
        margin: "12px 0",
        border: "1px solid rgba(232, 197, 71, 0.4)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        position: "relative",
        overflow: "hidden",
        willChange: "transform"
      }}
    >
      <div style={{ position: "absolute", top: 0, right: 0, padding: "4px 10px", background: "#E8C547", color: "#0A1628", fontSize: 9, fontWeight: 900, borderBottomLeftRadius: 10 }}>
        COMMUNITY INVESTOR
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {sponsor.logo ? (
          <img src={sponsor.logo} alt={sponsor.name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(232,197,71,0.2)" }} referrerPolicy="no-referrer" />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(232, 197, 71, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            🏢
          </div>
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#E8C547", letterSpacing: "0.02em" }}>{sponsor.name}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>Official Community Sponsor</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#FFF", lineHeight: 1.6, fontStyle: "italic", opacity: 0.9 }}>
        "{sponsor.message}"
      </div>
      {sponsor.link && (
        <a 
          href={sponsor.link} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: 6, 
            marginTop: 14, 
            fontSize: 11, 
            color: "#E8C547", 
            fontWeight: 800, 
            textDecoration: "none", 
            padding: "6px 12px", 
            background: "rgba(232,197,71,0.1)", 
            borderRadius: 8,
            transition: "all 0.2s"
          }}
        >
          Visit Website
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      )}
    </motion.div>
  );
}

// --- TABS ---
const HomeTab = memo(({ setTab, setDist, incidents, news, liveAlerts, aiInsights, geofences = [], currentUid, isAdmin, onEdit, onDelete, user, userPos, userProfile, activeSosId, onActiveSosId, polls = [], contactSosSignals = [], sponsors = [], onWatchMyBack, userRole, assignedDistrict, t }: any) => {
  const allSignals = useMemo(() => {
    const unique = Array.from(new Map((contactSosSignals || []).map((s: any) => [s.id, s])).values());
    return unique.filter((s: any) => s.status === "active");
  }, [contactSosSignals]);

  const feedItems = useMemo(() => {
    // Merge incidents and all news
    const baseItems: any[] = [
      ...incidents.map(i => ({ ...i, _isIncident: true })), 
      ...news.map(n => ({ ...n, _isNews: true }))
    ];

    const userDistrict = userProfile?.homeDistrict || getUserDistrict(userPos);

    // Sorting algorithm: Recency, district audience, and type importance
    baseItems.sort((a, b) => {
      const getMs = (ts: any) => safeGetMs(ts);

      // Score components
      const getScore = (item: any) => {
        const itemMs = getMs(item.timestamp);
        
        // 1. Recency (scaled to be meaningful against other weights)
        // Every hour is -10 points roughly? Let's just use absolute time / constant
        const recencyScore = itemMs / (1000 * 60 * 60); // Hours since epoch

        // 2. District relevance
        const districtScore = (item.district === userDistrict) ? 50 : 0;

        // 3. Type importance
        let typeWeight = 0;
        if (item._isNews) {
          if (item.urgent) typeWeight = 100; // Critical alerts
          else if (item.authorRole === "District Admin") typeWeight = 40; // Official updates
          else typeWeight = 10; // General news
        } else {
          // Incidents
          typeWeight = 25;
        }

        return recencyScore + districtScore + typeWeight;
      };

      return getScore(b) - getScore(a);
    });

    const items: any[] = [...baseItems];
    if (sponsors.length > 0) {
      // Inject sponsors every 3-5 items
      let sponsorIdx = 0;
      // Ensure at least one sponsor if any exist and there are some items
      const interval = items.length > 5 ? 5 : 3;
      for (let i = 2; i < items.length; i += interval) {
        if (sponsorIdx < sponsors.length) {
          items.splice(i, 0, { ...sponsors[sponsorIdx], _isSponsor: true });
          sponsorIdx++;
          i++; // Skip the newly inserted sponsor
        }
      }
      // If no sponsor was injected because feed is too short, add one at the end
      if (sponsorIdx === 0 && items.length > 0) {
        items.push({ ...sponsors[0], _isSponsor: true });
      }
    }
    return items;
  }, [incidents, news, sponsors]);

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
          const tA = safeGetMs(a.timestamp);
          const tB = safeGetMs(b.timestamp);
          return tB - tA;
        }
        return a.pinned ? -1 : 1;
      });
  }, [liveAlerts]);

  const notificationPermission = "Notification" in window ? Notification.permission : "granted";

  return (
    <div>
          <div style={{ background: "#0A1628", padding: "16px 16px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(252, 211, 77, 0.6)", letterSpacing: "0.15em", marginBottom: 4 }}>FOOGAN FEED</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{t('mogadishu_today')}</div>
              </div>
          {notificationPermission === "default" && (
            <button 
              onClick={() => requestNotificationPermission()}
              style={{ background: "#E8C547", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 10, fontWeight: 900, cursor: "pointer", display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Bell size={14} /> {t('enable_alerts') || 'ENABLE ALERTS'}
            </button>
          )}
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
            <div key={d.name} onClick={() => setDist(d.name)} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "12px 16px", minWidth: 120, cursor: "pointer" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 800, marginBottom: 4, letterSpacing: "0.05em" }}>{d.name.toUpperCase()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#E8C547" }}>{d.incidents}</div>
                <div style={{ fontSize: 9, color: "#fff", opacity: 0.5 }}>reports</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 0", background: "#fff" }}>
        <div style={{ padding: "0 16px" }}>
          {user && (
            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <SOSButton user={user} userPos={userPos} contacts={userProfile?.sosContacts || []} activeId={activeSosId} onActiveId={onActiveSosId} />
              </div>
            </div>
          )}

          {allSignals.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ width: 4, height: 16, background: "#E53935", borderRadius: 2 }} />
                <div style={{ fontSize: 15, fontWeight: 900, color: "#E53935" }}>{t('active_sos')}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allSignals.map((s: any) => (
                  <div key={s.id} style={{ background: "#B71C1C", borderRadius: 16, padding: 16, border: "2px solid #E53935", boxShadow: "0 8px 24px rgba(183,28,28,0.2)" }}>
                    <div onClick={() => { setTab("profile"); setTimeout(() => { document.getElementById('sos-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "pulse 1.5s infinite" }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>{s.user}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>EMERGENCY SIGNAL ACTIVE</div>
                        </div>
                      </div>
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
                      {t('mark_resolved')}
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
                  {t('community_polls')}
                </div>
                <button onClick={() => setTab("news")} style={{ fontSize: 12, fontWeight: 700, color: "#1E88E5", background: "none", border: "none", cursor: "pointer" }}>{t('view_all')}</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {polls.filter((p: any) => p.active).slice(0, 1).map((p: any) => (
                  <PollCard key={p.id} poll={p} isAdmin={isAdmin} currentUid={currentUid} />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 4, height: 16, background: "#E8C547", borderRadius: 2 }} />
              {t('recent_incidents')}
            </div>
            <button onClick={() => setTab("report")} style={{ fontSize: 12, fontWeight: 700, color: "#E53935", background: "none", border: "none", cursor: "pointer" }}>{t('report_new')}</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "0 16px", gap: 0 }}>
          {feedItems.length > 0 ? feedItems.map((item: any) => (
            item._isSponsor ? (
              <SponsorCard key={item.id} sponsor={item} />
            ) : item._isNews ? (
              <div key={item.id}>
                <NewsCard 
                  n={item} 
                  catColors={{ UPDATE: "#1E88E5", ALERT: "#E53935", COMMUNITY: "#43A047", TRENDS: "#FB8C00", HEALTH: "#43A047" }} 
                  isAdmin={isAdmin} 
                  setEditItem={() => {}} 
                  setShowAdmin={() => {}} 
                />
              </div>
            ) : (
              <div key={item.id}>
                <IncidentCard 
                  r={item} 
                  currentUid={currentUid} 
                  isAdmin={isAdmin}
                  userRole={userRole}
                  assignedDistrict={assignedDistrict}
                  onEdit={onEdit} 
                  onDelete={onDelete} 
                  userPos={userPos}
                  incidents={incidents}
                  userProfile={userProfile}
                  t={t}
                />
              </div>
            )
          )) : (
            <div style={{ background: "#fff", borderRadius: 20, padding: 40, textAlign: "center", border: "1px solid #F0EFEB", margin: "0 16px" }}>
              <div style={{ fontSize: 14, color: "#BBB" }}>{t('no_incidents')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

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

function MogadishuMap({ districts, incidents, geofences = [], sosSignals = [], onSelect, onPick, mini, center, zoom, layer = "live", userPos }: any) {
  const mapCenter: [number, number] = (center && typeof center.lat === 'number' && !isNaN(center.lat) && typeof center.lng === 'number' && !isNaN(center.lng)) 
    ? [center.lat, center.lng] 
    : (userPos && typeof userPos.lat === 'number' && !isNaN(userPos.lat) && typeof userPos.lng === 'number' && !isNaN(userPos.lng))
      ? [userPos.lat, userPos.lng]
      : [2.0469, 45.3182];
  const mapZoom = zoom || (mini ? 12 : 13);
  const now = Date.now();

  const filteredIncidents = useMemo(() => {
    return (incidents || []).filter((inc: any) => {
      const timestamp = safeGetMs(inc.timestamp);
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
      height: mini ? 180 : 450, 
      borderRadius: mini ? 12 : 24, 
      overflow: "hidden", 
      border: "1.5px solid rgba(0,0,0,0.08)", 
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      zIndex: 1,
      background: "#f0f0f0"
    }}>
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        style={{ height: "100%", width: "100%" }} 
        scrollWheelZoom={true}
        zoomControl={!mini}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap lat={mapCenter[0]} lng={mapCenter[1]} />
        
        {onPick && <MapEvents onPick={onPick} />}

        {/* User Location Pulse */}
        {userPos && typeof userPos.lat === 'number' && (
          <Circle 
            center={[userPos.lat, userPos.lng]} 
            radius={80} 
            pathOptions={{ color: '#1E88E5', fillColor: '#1E88E5', fillOpacity: 0.2, weight: 1 }}
          />
        )}

        {/* SOS Signals - High Priority */}
        {sosSignals.filter((s: any) => typeof s.lat === 'number' && !isNaN(s.lat) && typeof s.lng === 'number' && !isNaN(s.lng)).map((s: any) => (
          <React.Fragment key={`sos-group-${s.id}`}>
            <Circle
              center={[s.lat, s.lng]}
              radius={200}
              pathOptions={{ color: '#EF5350', fillColor: '#EF5350', fillOpacity: 0.15, weight: 1, dashArray: '5,5' }}
            />
            <Circle
              center={[s.lat, s.lng]}
              radius={40}
              pathOptions={{ color: '#D32F2F', fillColor: '#D32F2F', fillOpacity: 0.8, weight: 2 }}
            >
              <Popup>
                <div style={{ padding: 4 }}>
                  <div style={{ color: '#D32F2F', fontWeight: 900, fontSize: 13, marginBottom: 4 }}>🚨 EMERGENCY SIGNAL</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{s.user}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>Active tracking enabled</div>
                </div>
              </Popup>
            </Circle>
          </React.Fragment>
        ))}

        {/* Districts with Analysis Overlays */}
        {!mini && districts.map((d: any) => {
          const coords = DISTRICT_COORDS[d.name];
          if (!coords || typeof coords.lat !== 'number') return null;
          
          const distIncidents = filteredIncidents.filter((i: any) => i.district === d.name && !i.solved);
          let securityWeight = distIncidents.filter((i: any) => i.type === 'security').length;
          let totalWeight = distIncidents.length;

          const radius = 600 + (totalWeight * 40);
          let riskColor = d.risk === 'critical' ? "#D32F2F" : d.risk === 'high' ? "#F57C00" : d.risk === 'medium' ? "#FBC02D" : "#388E3C";
          
          return (
            <Circle
              key={d.id}
              center={[coords.lat, coords.lng]}
              radius={radius}
              pathOptions={{ color: riskColor, fillColor: riskColor, fillOpacity: 0.12, weight: 1 }}
              eventHandlers={{ click: () => onSelect(d.name) }}
            >
              <Popup>
                <div style={{ minWidth: 140 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, borderBottom: "1px solid #eee", paddingBottom: 6, marginBottom: 6 }}>{d.name}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Active reports:</span>
                      <span style={{ fontWeight: 800 }}>{totalWeight}</span>
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Security alerts:</span>
                      <span style={{ fontWeight: 800, color: '#D32F2F' }}>{securityWeight}</span>
                    </div>
                    <div style={{ fontSize: 10, marginTop: 4, color: '#1E88E5', fontWeight: 700 }}>Click to view full analysis →</div>
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* High-Impact Incident Markers */}
        {!mini && filteredIncidents.filter((inc: any) => inc.location).map((inc: any) => (
          <Circle
            key={inc.id}
            center={[inc.location.lat, inc.location.lng]}
            radius={inc.type === 'security' ? 60 : 40}
            pathOptions={{ 
              color: inc.solved ? "#455A64" : gColor(inc.type), 
              fillColor: inc.solved ? "#90A4AE" : gColor(inc.type), 
              fillOpacity: 0.6,
              weight: 2
            }}
          >
            <Popup>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 800, color: gColor(inc.type) }}>{inc.type.toUpperCase()}</div>
                <div>{inc.desc}</div>
              </div>
            </Popup>
          </Circle>
        ))}
      </MapContainer>
      
      {/* Dynamic Map Legend Overlay */}
      {!mini && (
        <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1000, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", padding: "10px 14px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#0A1628", marginBottom: 8, letterSpacing: "0.05em" }}>OPERATIONAL HEATMAP</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[{ l: "Critical Risk", c: "#D32F2F" }, { l: "High Risk", c: "#F57C00" }, { l: "Stable Area", c: "#388E3C" }].map(item => (
              <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.c }} />
                <span style={{ fontSize: 10, color: "#555", fontWeight: 700 }}>{item.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const MapTab = memo(({ selDistName, setDistName, districts, incidents, geofences, loading, currentUid, isAdmin, onEdit, onDelete, userPos, userProfile, sosSignals = [], userRole, assignedDistrict, t }: any) => {
  const [mapLayer, setMapLayer] = useState<"live" | "safety">("live");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  const districtData = useMemo(() => {
    const now = Date.now();
    return districts.map((d: any) => {
      const distIncidents = incidents.filter((i: any) => {
        if (i.district !== d.name) return false;
        const timestamp = safeGetMs(i.timestamp);
        const ageHours = (now - timestamp) / (1000 * 60 * 60);
        
        if (mapLayer === "live") return ageHours <= 24;
        return ageHours <= 24 * 30;
      });

      const activeIncidents = distIncidents.filter((i: any) => !i.solved);

      return { 
        ...d, 
        incidents: distIncidents.length, 
        active: activeIncidents.length,
        score: Math.max(0, 100 - (activeIncidents.length * 5) - (activeIncidents.filter((i: any) => i.type === 'security').length * 10))
      };
    });
  }, [districts, incidents, mapLayer]);

  const selDist = useMemo(() => districtData.find((d: any) => d.name === selDistName), [districtData, selDistName]);

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
    const allDistReps = incidents.filter((r: any) => r.district === selDist.name);
    const distReps = activeCategory === "all" ? allDistReps : allDistReps.filter((r: any) => r.type === activeCategory);
    
    // Performance analytics simulation
    const securityReps = allDistReps.filter((r: any) => r.type === 'security').length;
    const resolvedRate = allDistReps.length > 0 ? Math.round(((selDist.resolved || 0) / (allDistReps.length + (selDist.resolved || 0))) * 100) : 100;

    return (
      <div style={{ background: "#FDFDFB", minHeight: "100vh" }}>
        <div style={{ background: "#0A1628", paddingBottom: 60, position: "relative", overflow: "hidden" }}>
          {/* Top Nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", position: "relative", zIndex: 5 }}>
            <button onClick={() => setDistName(null)} style={{
              background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 12,
              width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", backdropFilter: "blur(10px)"
            }}>
              <IcBack />
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 12, padding: "0 14px", height: 40, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>SHARE INFO</button>
            </div>
          </div>

          <div style={{ padding: "10px 24px", position: "relative", zIndex: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em", marginBottom: 4 }}>DISTRICT COMMAND</div>
                <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>{selDist.name}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IcPin /> {selDist.area} Area</div>
                   <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                   <div>{selDist.pop?.toLocaleString()} Population</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: selDist.score > 70 ? "#81C784" : selDist.score > 40 ? "#FFB74D" : "#E57373", lineHeight: 1 }}>{selDist.score}</div>
                <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginTop: 2 }}>STABILITY INDEX</div>
              </div>
            </div>

            {/* Core Metrics Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { l: "Reports", v: selDist.incidents, c: "#FFD54F", sub: "Global" }, 
                { l: "Security", v: securityReps, c: "#E57373", sub: "Critical" }, 
                { l: "Success", v: `${resolvedRate}%`, c: "#81C784", sub: "Res. Rate" }
              ].map(s => (
                <div key={s.l} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 12px", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(4px)" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.c, lineHeight: 1, marginBottom: 4 }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 800, letterSpacing: "0.05em" }}>{s.l.toUpperCase()}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Abstract Background Design Element */}
          <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,197,71,0.08), transparent)", filter: "blur(40px)" }} />
        </div>

        <div style={{ padding: "20px 16px", marginTop: -40, position: "relative", zIndex: 10 }}>
          {/* Safety Status Block */}
          <div style={{ background: "#fff", borderRadius: 24, padding: 20, marginBottom: 20, border: "1px solid #F0EFEB", boxShadow: "0 10px 25px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628", display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14} /> District Intelligence
              </div>
              <RiskPill risk={selDist.risk} />
            </div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 18, lineHeight: 1.6, letterSpacing: '0.01em' }}>{selDist.desc}</div>
            
            {aiSummary ? (
              <div style={{ background: "#F9FAFB", borderRadius: 20, padding: 16, border: "1.5px solid #F0EFEB", position: 'relative' }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ transform: 'rotate(5deg)' }}><IcSparkle /></div>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "#1E88E5", letterSpacing: "0.1em" }}>AI INSIGHTS</span>
                </div>
                <div className="markdown-body" style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
                  <Markdown>{aiSummary}</Markdown>
                </div>
              </div>
            ) : (
              <div style={{ background: "#F5F5F5", borderRadius: 16, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#999' }}>
                Analyzing security patterns...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, background: "#E53935", borderRadius: 3, boxShadow: '0 0 10px rgba(229,57,53,0.3)' }} />
                Live Incidents
              </div>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 700 }}>SHOWING {distReps.length} REPORTS</div>
            </div>
            
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: "4px 0", scrollbarWidth: 'none' }}>
              {[
                { id: 'all', label: 'ALL', icon: '🛡️' },
                { id: 'security', label: 'SECURITY', icon: '🔴' },
                { id: 'fire', label: 'FIRE', icon: '🔥' },
                { id: 'welfare', label: 'WELFARE', icon: '🏥' },
                { id: 'traffic', label: 'TRAFFIC', icon: '🚗' },
                { id: 'infrastructure', label: 'UTILITY', icon: '⚡' }
              ].map(cat => {
                const isActive = activeCategory === cat.id;
                return (
                  <button 
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    style={{ 
                      flexShrink: 0,
                      background: isActive ? "#0A1628" : "#fff",
                      color: isActive ? "#fff" : "#666",
                      border: "1px solid",
                      borderColor: isActive ? "#0A1628" : "#F0EFEB",
                      borderRadius: 12,
                      padding: "8px 14px",
                      fontSize: 10,
                      fontWeight: 900,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: isActive ? "0 4px 10px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {distReps.length ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {distReps.map((r: any) => (
                <IncidentCard 
                  key={r.id} 
                  r={r} 
                  currentUid={currentUid} 
                  isAdmin={isAdmin} 
                  userRole={userRole}
                  assignedDistrict={assignedDistrict}
                  onEdit={onEdit} 
                  onDelete={onDelete} 
                  userPos={userPos}
                  incidents={incidents}
                  userProfile={userProfile}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 24, padding: 40, textAlign: "center", border: "1.5px solid #F0EFEB" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0A1628" }}>All Quiet Today</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>No reports found in {selDist.name}.</div>
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
      <div style={{ padding: "24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 950, color: "#0A1628", letterSpacing: "0.08em" }}>SECTOR ANALYSIS</div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700 }}>LIVE STABILITY METRICS</div>
          </div>
          <div style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", fontWeight: 900 }}>SORT: RISK</div>
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
                    borderRadius: 22, 
                    padding: "16px 18px", 
                    border: "1px solid #F0EFEB", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 16,
                    cursor: "pointer",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.02)"
                  }}
                >
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: 14, 
                    background: `${rc.color}12`, 
                    display: "flex", 
                    flexDirection: "column",
                    alignItems: "center", 
                    justifyContent: "center", 
                    color: rc.color,
                    flexShrink: 0
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
});

function ReportTab({ user, districts, districtsLoading, onDone, editItem, onCancel, userPos, t }: any) {
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
          location: finalLoc,
          email: auth.currentUser?.email
        });
        onDone();
      } else {
        await addDoc(collection(db, "incidents"), {
          type: sel.id,
          user: anon ? null : user.displayName,
          uid: auth.currentUser?.uid,
          email: auth.currentUser?.email,
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628", marginBottom: 3, lineHeight: 1.2 }}>{t(g.labelKey)}</div>
                  <div style={{ fontSize: 11, color: "#999", lineHeight: 1.3 }}>{t(g.descKey)}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && sel && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, background: "#fff", borderRadius: 12, padding: "10px 12px", border: `1.5px solid ${sel.color}20` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: sel.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: sel.color, fontWeight: 700, flexShrink: 0 }}>{sel.icon}</div>
              <div><div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628" }}>{t(sel.labelKey)}</div><div style={{ fontSize: 11, color: "#999" }}>{t(sel.descKey)}</div></div>
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

const FeedTab = memo(({ incidents, currentUid, isAdmin, userRole, onEdit, onDelete, userPos, userProfile, assignedDistrict, t }: any) => {
  const [filter, setFilter] = useState("all");
  const types = useMemo(() => ["all", ...new Set(incidents.map((r: any) => r.type))], [incidents]);
  const shown = useMemo(() => filter === "all" ? incidents : incidents.filter((r: any) => r.type === filter), [incidents, filter]);

  return (
    <div>
      <div style={{ background: "#0A1628", padding: "16px 16px 0" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Community reports</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Warbixinnada bulshada · Citizens on the ground</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
          {(types as string[]).map(typeKey => {
            const g = GROUPS.find(x => x.id === typeKey);
            const act = filter === typeKey;
            return (
              <button key={typeKey} onClick={() => setFilter(typeKey)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, flexShrink: 0, border: act ? "none" : "1px solid rgba(255,255,255,0.15)", background: act ? (typeKey === "all" ? "#E8C547" : g?.color || "#E8C547") : "rgba(255,255,255,0.07)", color: act ? (typeKey === "all" ? "#0A1628" : "#fff") : "rgba(255,255,255,0.6)", cursor: "pointer", whiteSpace: "nowrap" }}>
                {typeKey === "all" ? "All" : (g ? t(g.labelKey) : typeKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "6px 16px 16px" }}>
        {shown.map((r: any) => (
          <IncidentCard 
            key={r.id} 
            r={r} 
            currentUid={currentUid} 
            isAdmin={isAdmin}
            userRole={userRole}
            assignedDistrict={assignedDistrict}
            onEdit={onEdit} 
            onDelete={onDelete} 
            userPos={userPos}
            incidents={incidents}
            userProfile={userProfile}
            t={t}
          />
        ))}
      </div>
    </div>
  );
});

function PollCard({ poll, isAdmin, onEdit, currentUid }: { poll: any, isAdmin?: boolean, onEdit?: () => void, currentUid?: string }) {
  const voters = poll.voters || [];
  const hasVoted = currentUid && voters.includes(currentUid);
  
  const isExpired = useMemo(() => {
    if (!poll.expiresAt) return false;
    const expiry = safeGetMs(poll.expiresAt);
    return Date.now() > expiry;
  }, [poll.expiresAt]);

  const handleVote = async (idx: number) => {
    if (hasVoted || isExpired || !currentUid) return;
    const newOpts = [...poll.opts];
    newOpts[idx].v += 1;
    try {
      await updateDoc(doc(db, "polls", poll.id), {
        opts: newOpts,
        total: increment(1),
        voters: arrayUnion(currentUid)
      });
    } catch (error) {
      console.error("Vote failed", error);
    }
  };

  const colors = ["#E8C547", "#1E88E5", "#43A047", "#E53935", "#8E24AA", "#FB8C00"];

  const timeLeft = useMemo(() => {
    if (!poll.expiresAt || isExpired) return null;
    const expiry = safeGetMs(poll.expiresAt);
    const diff = expiry - Date.now();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  }, [poll.expiresAt, isExpired]);

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #F3F4F6", opacity: isExpired ? 0.8 : 1 }}>
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
          const isV = false; // We don't easily know which one the user voted for without more data, but we know they voted
          const color = colors[i % colors.length];
          const canVote = !hasVoted && !isExpired && !!currentUid;
          return (
            <div key={i} onClick={() => canVote && handleVote(i)}
              style={{ 
                borderRadius: 16, overflow: "hidden", 
                border: "1.5px solid #F0EFEB", 
                cursor: canVote ? "pointer" : "default", 
                position: "relative", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                background: !hasVoted ? "#fff" : "transparent"
              }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: hasVoted || isExpired ? pct + "%" : "0%" }}
                style={{ position: "absolute", top: 0, left: 0, height: "100%", background: (hasVoted || isExpired) ? `${color}20` : "transparent", transition: "width 1s cubic-bezier(0.65, 0, 0.35, 1)" }} 
              />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {(hasVoted || isExpired) && (
                    <motion.div 
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 10px ${color}` }} 
                    />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#0A1628" }}>{o.l}</span>
                </div>
                {(hasVoted || isExpired) && (
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

function NewsCard({ n, catColors, isAdmin, setEditItem, setShowAdmin }: { n: any, catColors: any, isAdmin: boolean, setEditItem: any, setShowAdmin: any }) {
  const viewRef = useViewCounter(n.id, "news");
  const cc = catColors[n.cat] || "#888";
  const isOfficial = n.authorRole === "District Admin";

  if (isOfficial) {
    const col = "#E8C547", bg = "rgba(232,197,71,0.15)";
    return (
      <div ref={viewRef} style={{ 
        background: "transparent", 
        padding: "16px 0",
        borderBottom: "1px solid rgba(0,0,0,0.03)",
        position: "relative",
        contain: "content",
        willChange: "transform"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ background: "#E8C547", color: "#0A1628", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.1em" }}>
            OFFICIAL
          </div>
          {n.urgent && <div style={{ background: "#FFEBEE", color: "#E53935", padding: "3px 8px", borderRadius: 6, fontSize: 8, fontWeight: 900 }}>URGENT</div>}
        </div>

        {n.img && (
          <div style={{ width: "100%", height: 220, overflow: "hidden", background: "#F0EFEB", position: "relative", marginBottom: 12, borderRadius: 12 }}>
            <img src={n.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "0 4px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: col, fontWeight: 700, flexShrink: 0 }}>
            <Shield size={20} strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#0A1628" }}>{n.district} Official</span>
                <VerifiedBadge />
              </div>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <span style={{ color: "#CCC", display: "flex" }}><IcPin /></span>
              <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>{n.district} District</span>
              <span style={{ color: "#DDD" }}>·</span>
              <span style={{ fontSize: 11, color: "#BBB" }}>{n.timestamp?.toDate ? n.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "4px 4px 12px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0A1628", lineHeight: 1.4, marginBottom: 8 }}>{n.title}</div>
          <div className="markdown-body" style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>
            <Markdown>{n.content}</Markdown>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 16 }}>
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await updateDoc(doc(db, "news", n.id), { likes: increment(1) });
                } catch (e) {
                  handleFirestoreError(e, OperationType.UPDATE, `news/${n.id}`);
                }
              }}
              style={{ background: "#F9F9F7", border: "1px solid #F0EFEB", borderRadius: 12, padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#666" }}
            >
              <HeartPulse size={16} fill={n.likes > 0 ? "#E53935" : "none"} color={n.likes > 0 ? "#E53935" : "#666"} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>{n.likes || 0}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={viewRef} style={{ background: "transparent", padding: "16px 0", borderBottom: "1px solid rgba(0,0,0,0.03)", contain: "content", willChange: "transform" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Radar size={14} color="#BBB" />
              <span style={{ fontSize: 11, color: "#BBB", fontWeight: 700 }}>{n.reads?.toLocaleString() || 0} watching</span>
            </div>
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
            style={{ background: "transparent", border: "none", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: n.likes > 0 ? "#E8C547" : "#666", fontSize: 12, fontWeight: 700 }}
          >
            <HeartPulse size={14} strokeWidth={2.5} fill={n.likes > 0 ? "#E8C547" : "none"} />
            {n.likes || 0}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewsTab({ news, polls, sosSignals, isAdmin, onEnter, onEdit, onDelete, userPos, userProfile, incidents = [], currentUid, sponsors = [], userRole, t }: any) {
  const [sub, setSub] = useState("news");
  const [showAdmin, setShowAdmin] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const catColors: any = { ALERT: "#E53935", UPDATE: "#1E88E5", COMMUNITY: "#43A047", NOTICE: "#888" };

  const trendingTags = useMemo(() => {
    const tags: any = {};
    incidents.forEach((r: any) => {
      // Extract hashtags
      const hashtags = r.desc.match(/#\w+/g) || [];
      hashtags.forEach((tagStr: string) => {
        const tag = tagStr.substring(1).toLowerCase();
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
          {(isAdmin || userRole === "editor") && (
            <button 
              data-admin-tools
              onClick={() => { setShowAdmin(!showAdmin); setEditItem(null); }} 
              style={{ background: "rgba(232,197,71,0.15)", color: "#E8C547", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {showAdmin ? "Close Panel" : (isAdmin ? "Admin Tools" : "Editor Tools")}
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

      {showAdmin && (isAdmin || userRole === "editor") && <AdminPanel editItem={editItem} sosSignals={sosSignals} incidents={incidents} sponsors={sponsors} userRole={userRole} onClose={() => { setShowAdmin(false); setEditItem(null); }} t={t} currentUid={currentUid} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} userPos={userPos} userProfile={userProfile} />}

      <div style={{ padding: "14px 16px" }}>
        {sub === "news" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {news.length > 0 ? news.map((n: any) => (
              <NewsCard key={n.id} n={n} catColors={catColors} isAdmin={isAdmin} setEditItem={setEditItem} setShowAdmin={setShowAdmin} />
            )) : (
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
                currentUid={currentUid}
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



function NearbyAlertsModal({ userPos, incidents, liveAlerts, isAdmin, userRole, assignedDistrict, onClose, currentUid, onEdit, onDelete, userProfile, notifications = [], t, setTab, setSelDistName }: any) {
  const [sub, setSub] = useState("nearby");

  const nearbyIncidents = useMemo(() => {
    if (!userPos) return [];
    return incidents.filter((i: any) => {
      if (!i.location) return false;
      const dist = getDistance(userPos.lat, userPos.lng, i.location.lat, i.location.lng);
      return dist <= 5000; // Increased to 5km for better visibility
    });
  }, [userPos, incidents]);

  const handleMarkRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const activeAlerts = useMemo(() => liveAlerts.filter((a: any) => a.active), [liveAlerts]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n: any) => !n.read);
    try {
      for (const n of unread) {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end" }}>
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        style={{ background: "#F5F4F0", width: "100%", maxWidth: 430, margin: "0 auto", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 0 40px", maxHeight: "85vh", overflow: "hidden", boxShadow: "0 -10px 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628" }}>Safety Alerts</div>
              <div style={{ fontSize: 12, color: "#999" }}>Personalized for your safety</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {sub === "personal" && notifications.some((n: any) => !n.read) && (
                <button 
                  onClick={handleMarkAllRead}
                  style={{ background: "#E3F2FD", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#1E88E5", cursor: "pointer" }}
                >
                  Mark all read
                </button>
              )}
              <button onClick={onClose} style={{ background: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <span style={{ fontSize: 20, color: "#666" }}>×</span>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", background: "#EAE9E4", borderRadius: 12, padding: 4 }}>
            {[["nearby", "Nearby"], ["personal", "Personal"], ["live", "Live"]].map(([k, l]) => (
              <button 
                key={k} 
                onClick={() => setSub(k)} 
                style={{ 
                  flex: 1, padding: "8px 4px", border: "none", borderRadius: 10,
                  background: sub === k ? "#fff" : "transparent", 
                  fontSize: 12, fontWeight: 800, cursor: "pointer", 
                  color: sub === k ? "#0A1628" : "#888",
                  boxShadow: sub === k ? "0 2px 8px rgba(0,0,0,0.05)" : "none"
                }}
              >
                {l}
                {k === "personal" && notifications.filter((n: any) => !n.read).length > 0 && (
                  <span style={{ marginLeft: 4, background: "#E53935", color: "#fff", fontSize: 8, padding: "2px 5px", borderRadius: 10 }}>
                    {notifications.filter((n: any) => !n.read).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {sub === "nearby" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!userPos && (
                <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", border: "1px solid #EEECEA" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628", marginBottom: 4 }}>Location Access Required</div>
                  <div style={{ fontSize: 12, color: "#999", lineHeight: 1.5 }}>Please enable location services to receive alerts for incidents near you.</div>
                </div>
              )}
              {userPos && (
                <>
                  {nearbyIncidents.length > 0 ? nearbyIncidents.map((r: any) => (
                    <IncidentCard 
                      key={r.id} 
                      r={r} 
                      compact 
                      currentUid={currentUid}
                      isAdmin={isAdmin}
                      userRole={userRole}
                      assignedDistrict={assignedDistrict}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      userPos={userPos}
                      incidents={incidents}
                      userProfile={userProfile}
                      t={t}
                    />
                  )) : (
                    <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", border: "1px solid #EEECEA" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628", marginBottom: 4 }}>Area Secure</div>
                      <div style={{ fontSize: 12, color: "#999" }}>No incidents reported within 5km of your position.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {sub === "personal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* High Priority: Buddy Requests */}
              {notifications.filter(n => n.type === 'buddy_request' && !n.read).map((n: any) => (
                <div key={n.id} style={{ background: "#E8F5E9", border: "2px solid #4CAF50", borderRadius: 16, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <ShieldPlus size={18} color="#4CAF50" />
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#0A1628" }}>New Buddy Request</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#444", marginBottom: 12 }}>{n.fromName} needs a buddy in {n.district || 'their area'}.</div>
                  <button 
                    onClick={() => { 
                      setTab("profile"); 
                      onClose(); 
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{ width: "100%", background: "#4CAF50", color: "#fff", border: "none", borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                  >
                    GO TO PROFILE TO ACCEPT
                  </button>
                </div>
              ))}

              {/* High Priority: Active SOS from Contacts */}
              {notifications.filter(n => n.type === 'sos' && !n.read).map((n: any) => (
                <div key={n.id} style={{ background: "#FFEBEE", border: "2px solid #E53935", borderRadius: 16, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E53935", animation: "pulse 1s infinite" }} />
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#B71C1C" }}>URGENT: {n.fromName} SOS</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#B71C1C", fontWeight: 700, marginBottom: 12 }}>Emergency signal active. Track live location immediately.</div>
                  <button 
                    onClick={() => { 
                      setTab("map");
                      if (n.lat && n.lng) {
                        setSelDistName(n.district || "");
                      }
                      onClose(); 
                    }}
                    style={{ width: "100%", background: "#B71C1C", color: "#fff", border: "none", borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                  >
                    TRACK LIVE LOCATION
                  </button>
                </div>
              ))}

              {notifications.length > 0 ? notifications.map((n: any) => (
                <motion.div 
                  key={n.id} 
                  initial={!n.read ? { scale: 0.98, background: "#FFF9C4" } : {}}
                  animate={!n.read ? { scale: 1, background: "#fff" } : {}}
                  onClick={() => {
                    if (!n.read) handleMarkRead(n.id);
                    if (n.type === 'buddy_request') {
                      setTab("profile");
                      onClose();
                      setTimeout(() => {
                        document.getElementById('buddy-requests-section')?.scrollIntoView({ behavior: 'smooth' });
                      }, 300);
                    } else if (n.incidentId) {
                      setTab("feed");
                      onClose();
                    } else if (n.type === 'sos') {
                      setTab("map");
                      if (n.lat && n.lng) setSelDistName(n.district || "");
                      onClose();
                    }
                  }}
                  style={{ 
                    background: "#fff", 
                    padding: 16, 
                    borderRadius: 16, 
                    border: n.read ? "1px solid #EEECEA" : "2px solid #E8C547", 
                    cursor: "pointer", 
                    position: "relative",
                    boxShadow: n.read ? "none" : "0 4px 12px rgba(232,197,71,0.15)"
                  }}
                >
                  {!n.read && (
                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 8, fontWeight: 900, color: "#E53935", background: "#FFEBEE", padding: "2px 6px", borderRadius: 4 }}>NEW</span>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E53935" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: n.read ? "#F5F4F0" : "#FFF9C4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {n.type === 'alert' ? <MessageSquare size={16} color="#E8C547" /> : <Bell size={16} color="#999" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: "#0A1628", marginBottom: 2 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: "#666", lineHeight: 1.4, marginBottom: 8 }}>{n.body}</div>
                      
                      {n.incidentId && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setTab("feed");
                            onClose();
                          }}
                          style={{ background: "#F5F4F0", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 9, fontWeight: 800, color: "#1E88E5", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          VIEW INCIDENT <ChevronRight size={10} />
                        </button>
                      )}

                      <div style={{ fontSize: 9, fontWeight: 700, color: "#AAA", marginTop: 4 }}>
                        {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString() : "Just now"}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )) : (
                <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🔔</div>
                  <div style={{ fontSize: 14 }}>No personalized notifications yet.</div>
                </div>
              )}
            </div>
          )}

          {sub === "live" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeAlerts.length > 0 ? activeAlerts.map((a: any) => (
                <LiveAlertCard key={a.id} alert={a} isAdmin={isAdmin} />
              )) : (
                <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
                  <div style={{ fontSize: 14 }}>No active live alerts.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AdminPanel({ editItem, sosSignals, incidents, onClose, sponsors = [], userRole, t, currentUid, onEdit, onDelete, userPos, userProfile }: any) {
  const [type, setType] = useState(editItem?.type || "news");
  const isAdmin = userRole === "admin";
  const isEditor = userRole === "editor" || isAdmin;
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

  // Sponsor State
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorLogo, setSponsorLogo] = useState("");
  const [sponsorMessage, setSponsorMessage] = useState("");
  const [sponsorLink, setSponsorLink] = useState("");

  const handleSave = async () => {
    if (type === "sponsors") {
      if (!sponsorName || !sponsorMessage) {
        alert("Name and Message are required");
        return;
      }
      setLoading(true);
      try {
        await addDoc(collection(db, "sponsors"), {
          name: sponsorName,
          logo: sponsorLogo || null,
          message: sponsorMessage,
          link: sponsorLink || null,
          active: true,
          timestamp: serverTimestamp()
        });
        setSponsorName(""); setSponsorLogo(""); setSponsorMessage(""); setSponsorLink("");
        alert("Sponsor card published successfully!");
        onClose();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "sponsors");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!title.trim() && type !== "poll") {
      alert("Please enter a title.");
      return;
    }
    if (type === "poll" && !q.trim()) {
      alert("Please enter a question.");
      return;
    }
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
        {isAdmin && (
          <>
            <button onClick={() => setType("report")} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: type === "report" ? "none" : "1px solid #CCC", background: type === "report" ? "#E8C547" : "#fff", color: type === "report" ? "#0A1628" : "#666", fontSize: 11, fontWeight: 700 }}>Weekly Report</button>
            <button onClick={() => setType("sponsors")} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: type === "sponsors" ? "none" : "1px solid #CCC", background: type === "sponsors" ? "#0A1628" : "#fff", color: type === "sponsors" ? "#fff" : "#666", fontSize: 11, fontWeight: 700 }}>Sponsors</button>
          </>
        )}
        <button onClick={onClose} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, border: "1px solid #CCC", background: "#fff", color: "#666", fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>Close</button>
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

      {type === "report" && (
        <ReportPanel incidents={incidents} sosSignals={sosSignals} t={t} />
      )}

      {type === "sponsors" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#666" }}>Add Community Investor</div>
          <input value={sponsorName} onChange={e => setSponsorName(e.target.value)} placeholder="Company Name (e.g. Hormuud)" style={{ padding: 12, borderRadius: 8, border: "1px solid #DDD" }} />
          <input value={sponsorLogo} onChange={e => setSponsorLogo(e.target.value)} placeholder="Logo URL (optional)" style={{ padding: 12, borderRadius: 8, border: "1px solid #DDD" }} />
          <textarea value={sponsorMessage} onChange={e => setSponsorMessage(e.target.value)} placeholder="Community Support Message" style={{ padding: 12, borderRadius: 8, border: "1px solid #DDD", minHeight: 80 }} />
          <input value={sponsorLink} onChange={e => setSponsorLink(e.target.value)} placeholder="Website Link (optional)" style={{ padding: 12, borderRadius: 8, border: "1px solid #DDD" }} />
          
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#999", marginBottom: 10 }}>ACTIVE SPONSORS</div>
            {sponsors.map((s: any) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EEE" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                <button onClick={() => deleteDoc(doc(db, "sponsors", s.id))} style={{ color: "#E53935", background: "none", border: "none", fontSize: 11, fontWeight: 700 }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {type !== "news" && type !== "poll" && type !== "live" && type !== "report" && type !== "sponsors" && (
        <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>Select a tool above.</div>
      )}

      {type !== "sos" && type !== "report" && (
        <button onClick={handleSave} disabled={loading} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10, background: type === "live" ? "#B71C1C" : (type === "sponsors" ? "#E8C547" : "#E53935"), color: type === "sponsors" ? "#0A1628" : "#fff", border: "none", fontWeight: 700 }}>
          {loading ? "Saving..." : editItem ? "Update" : (type === "sponsors" ? "Publish Sponsor Card" : "Publish")}
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
      const contactValues = contacts.map(c => (c.value || c.email || "").toLowerCase()).filter(e => !!e);
      const signalRef = await addDoc(collection(db, "sos_signals"), {
        uid: user.uid,
        user: user.displayName || "User",
        email: user.email,
        phone: user.phoneNumber || null,
        lat: userPos.lat,
        lng: userPos.lng,
        timestamp: serverTimestamp(),
        status: "active",
        contacts: contacts.map(c => ({ name: c.name, value: (c.value || c.email || "").toLowerCase(), type: c.type || 'email' }))
      });

      onActiveId?.(signalRef.id);

      // Notify contacts
      for (const contact of contacts) {
        const val = (contact.value || contact.email || "").toLowerCase();
        if (val) {
          await addDoc(collection(db, "notifications"), {
            toEmail: val, // Using toEmail as a generic recipient field for now
            toValue: val,
            toType: contact.type || 'email',
            fromName: user.displayName || "User",
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
      <div style={{ background: "#FFEBEE", borderRadius: 24, padding: 18, marginBottom: 24, border: "2px solid #E53935", textAlign: "center", boxShadow: "0 12px 40px rgba(229,57,53,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E53935", animation: "pulse 1s infinite" }} />
          <div style={{ fontSize: 20, fontWeight: 900, color: "#B71C1C", letterSpacing: "-0.02em" }}>SOS SIGNAL ACTIVE</div>
        </div>
        
        <div style={{ height: 200, borderRadius: 16, overflow: "hidden", marginBottom: 16, border: "1.5px solid rgba(229,57,53,0.2)" }}>
          <MapContainer 
            center={[userPos.lat, userPos.lng]} 
            zoom={16} 
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <RecenterMap lat={userPos.lat} lng={userPos.lng} />
            <Marker position={[userPos.lat, userPos.lng]}>
              <Popup>Your Emergency Location</Popup>
            </Marker>
            <Circle 
              center={[userPos.lat, userPos.lng]} 
              radius={300} 
              pathOptions={{ color: '#E53935', fillColor: '#E53935', fillOpacity: 0.1, weight: 1 }} 
            />
          </MapContainer>
        </div>

        <div style={{ fontSize: 13, color: "#B71C1C", fontWeight: 700, marginBottom: 20, lineHeight: 1.5 }}>
          Help is on the way. Your live location is shared with {contacts.length} emergency contacts.
        </div>
        
        <button 
          onClick={handleCancel} 
          style={{ width: "100%", background: "#B71C1C", color: "#fff", border: "none", borderRadius: 14, padding: "14px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 12px rgba(183,28,28,0.2)" }}
        >
          RESOLVE EMERGENCY
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

function SOSContactsManager({ contacts, onUpdate, districts = [] }: { contacts: any[], onUpdate: (c: any[]) => void, districts?: any[] }) {
  const [name, setName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [contactDistrict, setContactDistrict] = useState("");
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
      type: isEmail ? 'email' : 'phone',
      district: contactDistrict || null
    }]);
    setName("");
    setContactValue("");
    setContactDistrict("");
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
            placeholder="Email or Phone (e.g. +25261...)" 
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #EEECEA", fontSize: 14 }} 
          />
          <select 
            value={contactDistrict}
            onChange={e => setContactDistrict(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #EEECEA", fontSize: 14, background: "#fff" }}
          >
            <option value="">Select Contact's District (Optional)</option>
            {districts.map((d: any) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
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
          <div id="sos-section" style={{ background: "#fff", borderRadius: 24, padding: 20, border: "1px solid rgba(0,0,0,0.03)", marginBottom: 24 }}>
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
                <div style={{ fontSize: 12, color: "#D32F2F", marginBottom: 12 }}>Emergency signal active! Respond immediately if possible.</div>
                <div style={{ background: "#B71C1C", borderRadius: 12, padding: "12px", border: "1px solid rgba(255,255,255,0.2)", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 800, marginBottom: 4 }}>COORDINATES</div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 900, fontFamily: "monospace" }}>{s.lat.toFixed(6)}, {s.lng.toFixed(6)}</div>
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

      <SOSContactsManager contacts={userProfile?.sosContacts || []} onUpdate={onUpdateContacts} districts={districts} />
      
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

function TeamManager({ db, user, districts }: { db: any, user: any, districts: any[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [assignedDistrict, setAssignedDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const q = query(collection(db, "team_members"));
    const unsub = onSnapshot(q, (snap) => {
      setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [db]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await setDoc(doc(db, "team_members", email.toLowerCase()), {
        email: email.toLowerCase(),
        role,
        assignedDistrict: assignedDistrict || null,
        addedBy: user.uid,
        timestamp: serverTimestamp()
      });
      setSuccessMsg(`User ${email} invited as ${role}${assignedDistrict ? ' for ' + assignedDistrict : ''}! Share the app link with them.`);
      setEmail("");
      setTimeout(() => setSuccessMsg(""), 10000);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "team_members");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, "team_members", id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `team_members/${id}`);
    }
  };

  return (
    <div style={{ background: "#fff", borderRadius: 24, padding: 20, border: "1px solid #F0EFEB", marginTop: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E3F2FD", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Users size={18} color="#1E88E5" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#0A1628" }}>Team Management</div>
          <div style={{ fontSize: 11, color: "#999" }}>Invite admins and editors by email</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {successMsg && (
          <div style={{ background: "#E8F5E9", color: "#2E7D32", padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "1px solid #C8E6C9", marginBottom: 4 }}>
            {successMsg}
            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8, wordBreak: "break-all" }}>
              {window.location.origin}
            </div>
          </div>
        )}
        <input 
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="User Email Address"
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 14, outline: "none", background: "#FAFAF8" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <select 
            value={role} onChange={e => {
              setRole(e.target.value);
              if (e.target.value === "editor" && districts.length > 0) {
                setAssignedDistrict(districts[0].name);
              } else {
                setAssignedDistrict("");
              }
            }}
            style={{ flex: 1, minWidth: 150, padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 13, outline: "none", background: "#FAFAF8" }}
          >
            <option value="district_admin">District Administrator (Dashboard)</option>
            <option value="editor">Content Editor (News/Polls only)</option>
            <option value="admin">System Admin (Full Access)</option>
          </select>

          {(role === "editor" || role === "district_admin") && (
            <select 
              value={assignedDistrict} onChange={e => setAssignedDistrict(e.target.value)}
              style={{ flex: 1, minWidth: 150, padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 13, outline: "none", background: "#FAFAF8" }}
            >
              <option value="">Select District</option>
              {districts.map((d: any) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          )}

          <button 
            onClick={handleAdd} disabled={loading}
            style={{ padding: "0 24px", background: "#0A1628", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 13, height: 48 }}
          >
            {loading ? "..." : "Invite"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#BBB", fontSize: 12, border: "1.5px dashed #F0EFEB", borderRadius: 12 }}>
            No team members added yet
          </div>
        ) : team.map(m => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "#FAFAF8", borderRadius: 12, border: "1px solid #F0EFEB" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: m.role === "admin" ? "#E53935" : "#1E88E5", fontWeight: 900, background: m.role === "admin" ? "#FFEBEE" : "#E3F2FD", padding: "2px 6px", borderRadius: 4 }}>
                  {m.role.toUpperCase()}
                </span>
                {m.assignedDistrict && (
                  <span style={{ fontSize: 9, color: "#666", fontWeight: 700, background: "#EEE", padding: "2px 6px", borderRadius: 4 }}>
                    {m.assignedDistrict}
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={() => handleRemove(m.id)} 
              style={{ background: "#FFF1F0", border: "none", color: "#E53935", padding: "6px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileTab({ user, userRole, userProfile, incidents, geofences, districts, contactSosSignals, userPos, activeBuddyRequest, incomingBuddyRequests, assignedDistrict, onEdit, onDelete, onOpenAdmin, onOpenDistrictAdmin, onWatchMyBack, language, setLanguage }: any) {
  const [showSettings, setShowSettings] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const [newHomeDistrict, setNewHomeDistrict] = useState("");
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [volunteerBloodType, setVolunteerBloodType] = useState("");
  const [saving, setSaving] = useState(false);
  const t = getT(language);

  useEffect(() => {
    if (showSettings && userProfile) {
      setNewName(userProfile.displayName || user?.displayName || "");
      setNewPhoto(userProfile.photoURL || user?.photoURL || "");
      setNewHomeDistrict(userProfile.homeDistrict || "");
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
        homeDistrict: newHomeDistrict,
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
    <div style={{ padding: "0 16px 80px" }}>
      {/* Reorganized Header with Language Toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", marginBottom: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#0A1628" }}>{t('profile')}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            style={{ 
              background: "#fff", border: "1.5px solid #F0EFEB", borderRadius: 10, 
              padding: "4px 8px", fontSize: 11, fontWeight: 800, color: "#0A1628", outline: "none" 
            }}
          >
            <option value="en">EN</option>
            <option value="so">SO</option>
          </select>
          <button 
            onClick={() => setShowSettings(true)}
            style={{ background: "#fff", border: "1.5px solid #F0EFEB", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0A1628" }}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 24, padding: "20px", border: "1px solid #F0EFEB", marginBottom: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <div style={{ position: "relative", width: 72, height: 72 }}>
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="" style={{ width: "100%", height: "100%", borderRadius: 20, objectFit: "cover", border: "2px solid #F0EFEB" }} referrerPolicy="no-referrer" />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: 20, background: "#0A1628", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, fontWeight: 900 }}>
                {user.displayName?.[0] || "U"}
              </div>
            )}
            {isVerified && (
              <div style={{ position: "absolute", bottom: -4, right: -4, background: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
                <VerifiedBadge />
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#0A1628" }}>{userProfile?.displayName || user.displayName}</div>
              <div style={{ display: "inline-flex", background: userRole === "admin" ? "#E53935" : "#1E88E5", color: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 8, fontWeight: 900, letterSpacing: "0.05em" }}>
                {userRole.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#999" }}>{user.email}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, borderTop: "1px solid #F9FAFB", paddingTop: 16 }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628" }}>{incidents.filter((i: any) => i.uid === user.uid).length}</div>
            <div style={{ fontSize: 9, color: "#999", fontWeight: 800, letterSpacing: "0.02em" }}>REPORTS FILED</div>
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#E8C547" }}>{geofences.length}</div>
            <div style={{ fontSize: 9, color: "#999", fontWeight: 800, letterSpacing: "0.02em" }}>SAFETY ZONES</div>
          </div>
          {userProfile?.homeDistrict && (
            <div style={{ flex: 1.5, textAlign: "left" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#1976D2" }}>{userProfile.homeDistrict}</div>
              <div style={{ fontSize: 9, color: "#999", fontWeight: 800, letterSpacing: "0.02em" }}>HOME ZONE</div>
            </div>
          )}
        </div>
      </div>

      {/* Buddy Requests & Active Sessions - AT TOP NOW */}
      <div id="buddy-requests-section" style={{ marginBottom: 20 }}>
        {incomingBuddyRequests.length > 0 && <div style={{ fontSize: 12, fontWeight: 800, color: "#E53935", marginBottom: 12, letterSpacing: "0.05em", animation: "flash 2s infinite" }}>{t('buddy_requests').toUpperCase()} (NEW)</div>}
        {incomingBuddyRequests.filter((r: any) => r.status === "pending").map((req: any) => (
          <BuddyRequestItem 
            key={req.id} 
            request={req} 
            onAccept={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", req.id), { 
                  status: "active", 
                  buddyUid: user.uid, 
                  buddyName: userProfile?.displayName || user.displayName || "Buddy" 
                });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${req.id}`);
              }
            }}
            onReject={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", req.id), { status: "rejected" });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${req.id}`);
              }
            }}
          />
        ))}

        {activeBuddyRequest && activeBuddyRequest.status === "active" && (
          <BuddyActiveSession 
            request={activeBuddyRequest} 
            user={user} 
            districts={districts}
            incidents={incidents}
            onPulse={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", activeBuddyRequest.id), { 
                  pulses: increment(1),
                  lastPulseAt: serverTimestamp()
                });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${activeBuddyRequest.id}`);
              }
            }}
            onStop={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", activeBuddyRequest.id), { status: "completed" });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${activeBuddyRequest.id}`);
              }
            }}
          />
        )}

        {incomingBuddyRequests.filter((r: any) => r.status === "active").map((activeReq: any) => (
          <BuddyActiveSession 
            key={activeReq.id}
            request={activeReq} 
            user={user} 
            districts={districts}
            incidents={incidents}
            isWatchingRole={true}
            onPulse={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", activeReq.id), { 
                  pulses: increment(1),
                  lastPulseAt: serverTimestamp()
                });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${activeReq.id}`);
              }
            }}
            onStop={async () => {
              try {
                await updateDoc(doc(db, "buddy_requests", activeReq.id), { status: "completed" });
              } catch (e) {
                handleFirestoreError(e, OperationType.UPDATE, `buddy_requests/${activeReq.id}`);
              }
            }}
          />
        ))}
      </div>

      <button 
        onClick={() => onWatchMyBack?.()}
        style={{ 
          width: "100%", background: "#0A1628", color: "#fff", border: "none", 
          borderRadius: 16, padding: "16px", display: "flex", alignItems: "center", 
          justifyContent: "center", gap: 10, cursor: "pointer",
          boxShadow: "0 6px 15px rgba(10,22,40,0.15)",
          marginBottom: 24
        }}
      >
        <ShieldPlus size={20} color="#E8C547" />
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.02em" }}>{t('watch_my_back')}</span>
      </button>

      {/* Emergency Tools & Safety */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ width: 4, height: 16, background: "#E53935", borderRadius: 2 }} />
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628" }}>{t('safety_title')}</div>
        </div>
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
      </div>

      {(userRole === "editor" || userRole === "district_admin" || userRole === "admin") && (
        <button 
          onClick={onOpenDistrictAdmin}
          style={{ width: "100%", background: "#0A1628", color: "#fff", border: "none", borderRadius: 16, padding: "14px", fontSize: 13, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 12px rgba(10,22,40,0.2)", marginBottom: 24 }}>
          <Activity size={18} color="#E8C547" />
          {assignedDistrict ? `MANAGE ${assignedDistrict.toUpperCase()}` : "DISTRICT ADMINISTRATION"}
        </button>
      )}

      {/* Focus on Recent Reports - Prominent Section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 4, height: 16, background: "#0A1628", borderRadius: 2 }} />
            <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628" }}>{t('recent_reports')}</div>
          </div>
        </div>
        
        {incidents.filter((i: any) => i.uid === user.uid).length === 0 ? (
          <div style={{ padding: 40, background: "#fff", borderRadius: 24, border: "1.5px dashed #EEECEA", textAlign: "center", color: "#999" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t('no_reports_yet')}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {incidents.filter((i: any) => i.uid === user.uid).slice(0, 3).map((r: any) => (
              <IncidentCard 
                key={r.id} 
                r={r} 
                currentUid={user.uid} 
                isAdmin={userRole === "admin"}
                userRole={userRole}
                assignedDistrict={assignedDistrict}
                onEdit={onEdit} 
                onDelete={onDelete} 
                userPos={userPos}
                incidents={incidents}
                userProfile={userProfile}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Admin / Tools Section - Push to bottom */}
      {(userRole === "admin" || userRole === "editor") && (
        <div style={{ borderTop: "1px solid #F0EFEB", paddingTop: 28, marginTop: 24 }}>
          <button 
            onClick={() => setShowTools(!showTools)}
            style={{ 
              width: "100%", background: "#F5F4F0", border: "none", 
              borderRadius: 16, color: "#0A1628", padding: "14px", fontSize: 13, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer"
            }}
          >
            <Settings size={18} />
            {showTools ? "Hide Tools" : "Admin & Editor Tools"}
            <ChevronDown size={18} style={{ transform: showTools ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginLeft: "auto" }} />
          </button>

          {showTools && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ marginTop: 16 }}>
              {userRole === "admin" && <TeamManager db={db} user={user} districts={districts} />}
              
              {userRole === "admin" && (
                <div style={{ marginTop: 16, padding: 20, background: "#0A1628", borderRadius: 20, textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{t('system_admin')}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>{t('admin_desc')}</div>
                  <button 
                    onClick={onOpenAdmin}
                    style={{ width: "100%", background: "#E8C547", color: "#0A1628", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t('open_panel')}
                  </button>
                </div>
              )}

              {userRole === "editor" && (
                <div style={{ marginTop: 16, padding: 20, background: "#0A1628", borderRadius: 20, textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{t('content_editor')}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>{t('editor_desc')}</div>
                  <button 
                    onClick={onOpenAdmin}
                    style={{ width: "100%", background: "#1E88E5", color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                  >
                    {t('open_panel')}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      <button 
        onClick={() => auth.signOut()} 
        style={{ width: "100%", marginTop: 40, background: "#fff", border: "1.5px solid #FFEBEE", borderRadius: 18, padding: "16px", fontSize: 14, fontWeight: 800, color: "#E53935", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        {t('sign_out')}
      </button>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              style={{ background: "#fff", width: "100%", maxWidth: 400, borderRadius: 28, padding: "24px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0A1628" }}>{t('settings')}</div>
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
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>{t('edit_profile')}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#999", display: "block", marginBottom: 6, letterSpacing: "0.05em" }}>{t('display_name')}</label>
                    <input 
                      value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="Your name"
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 14, outline: "none", background: "#FAFAF8" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#999", display: "block", marginBottom: 6, letterSpacing: "0.05em" }}>{t('home_district')}</label>
                    <select 
                      value={newHomeDistrict} 
                      onChange={e => setNewHomeDistrict(e.target.value)}
                      style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #F0EFEB", fontSize: 14, outline: "none", background: "#FAFAF8" }}
                    >
                      <option value="">Select your district</option>
                      {districts.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>* {t('residence_verify')}</div>
                  </div>
                  <button 
                    onClick={handleSaveProfile} disabled={saving}
                    style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s" }}
                  >
                    {saving ? "Saving..." : t('save')}
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #F0EFEB", paddingTop: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#E53935", marginBottom: 12, letterSpacing: "0.05em" }}>{t('volunteer').toUpperCase()}</div>
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
                    </motion.div>
                  )}
                </div>
              </div>

              <VerifiedProgress uid={user.uid} incidents={incidents} userProfile={userProfile} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Memoized components for performance
const MemoizedIncidentCard = memo(IncidentCard);
const MemoizedMogadishuMap = memo(MogadishuMap);

function LoginScreen({ 
  showPhoneLogin, 
  setShowPhoneLogin, 
  phoneNumber, 
  setPhoneNumber, 
  verificationCode, 
  setVerificationCode, 
  confirmationResult, 
  setConfirmationResult, 
  handleLogin, 
  handlePhoneLogin, 
  handleVerifyCode, 
  loginLoading 
}: any) {
  return (
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
}

function BuddyRequestModal({ user, userProfile, districts, userPos, onClose }: any) {
  const [selectedBuddy, setSelectedBuddy] = useState<any>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [duration, setDuration] = useState(20);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const currentDistrict = getUserDistrict(userPos);
  const buddies = userProfile?.sosContacts || [];

  const buddyToUse = selectedBuddy || (manualEmail && manualEmail.includes('@') ? { name: manualEmail.split('@')[0], email: manualEmail.trim().toLowerCase() } : null);

  const handleRequest = async () => {
    if (!buddyToUse || !buddyToUse.email || !user) return;
    setSending(true);
    try {
      const expiresAt = new Date(Date.now() + duration * 60000);
      const buddyReqRef = await addDoc(collection(db, "buddy_requests"), {
        uid: user.uid,
        userName: user.displayName || "User",
        buddyEmail: buddyToUse.email.toLowerCase(),
        buddyName: buddyToUse.name || buddyToUse.email.split('@')[0],
        district: currentDistrict || "Unknown",
        lat: userPos?.lat || 2.0469,
        lng: userPos?.lng || 45.3182,
        status: "pending",
        duration,
        timestamp: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        pulses: 0
      });

      // Notify the buddy
      await addDoc(collection(db, "notifications"), {
        toEmail: buddyToUse.email.toLowerCase(),
        fromName: user.displayName || "User",
        fromUid: user.uid,
        type: "buddy_request",
        requestId: buddyReqRef.id,
        district: currentDistrict || "Unknown",
        lat: userPos?.lat || 2.0469,
        lng: userPos?.lng || 45.3182,
        timestamp: serverTimestamp(),
        read: false
      });

      setSent(true);
      setTimeout(() => onClose(), 2500);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "buddy_requests");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(10,22,40,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 20 }}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 320, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E8F5E9", color: "#43A047", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628", marginBottom: 8 }}>Request Sent!</div>
          <div style={{ fontSize: 13, color: "#666" }}>Your buddy will be notified to watch your back.</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 400, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, color: "#0A1628", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldPlus size={24} color="#1E88E5" />
          Watch My Back
        </div>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>
          Request a buddy to digitally walk with you through <strong>{currentDistrict || "this area"}</strong>.
        </p>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10, letterSpacing: "0.05em" }}>SELECT A BUDDY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto", paddingRight: 4, paddingBottom: 10 }}>
            {buddies.map((b: any, i: number) => {
                const email = b.email || b.value || (b.type === 'email' ? b.value : null);
                if (!email || !email.includes('@')) return null;
                const name = b.name || email.split('@')[0];
                
                return (
                  <button 
                    key={i}
                    onClick={() => { setSelectedBuddy({ name, email }); setManualEmail(""); }}
                    style={{ 
                      display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, 
                      border: selectedBuddy?.email === email ? "2px solid #1E88E5" : "1.5px solid #F0EFEB",
                      background: selectedBuddy?.email === email ? "#E3F2FD" : "#fff",
                      textAlign: "left", cursor: "pointer"
                    }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0A1628", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                      {name[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>{name}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{email}</div>
                    </div>
                  </button>
                );
              })}
            
            <div style={{ position: "relative", marginTop: 4 }}>
              <input 
                type="email"
                placeholder="Or enter buddy email manually..."
                value={manualEmail}
                onChange={(e) => {
                  setManualEmail(e.target.value);
                  setSelectedBuddy(null);
                }}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 14, border: manualEmail ? "2px solid #1E88E5" : "1.5px solid #F0EFEB", fontSize: 13, background: manualEmail ? "#E3F2FD" : "#fff" }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10, letterSpacing: "0.05em" }}>DURATION (MINUTES)</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[10, 20, 30, 60].map(d => (
              <button 
                key={d}
                onClick={() => setDuration(d)}
                style={{ 
                  flex: 1, padding: "8px 0", borderRadius: 10, 
                  border: duration === d ? "2px solid #1E88E5" : "1.5px solid #F0EFEB",
                  background: duration === d ? "#1E88E5" : "#fff",
                  color: duration === d ? "#fff" : "#666",
                  fontSize: 12, fontWeight: 800, cursor: "pointer"
                }}
              >
                {d}m
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, borderRadius: 14, border: "none", background: "#F5F4F0", color: "#666", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
          <button 
            onClick={handleRequest}
            disabled={!buddyToUse || sending}
            style={{ 
              flex: 2, padding: 14, borderRadius: 14, border: "none", 
              background: "#0A1628", color: "#fff", fontSize: 14, fontWeight: 800, 
              cursor: "pointer", opacity: (!buddyToUse || sending) ? 0.5 : 1 
            }}
          >
            {sending ? "Sending..." : "Request Buddy"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function RecenterMap({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
}

function BuddyActiveSession({ request, user, districts = [], incidents = [], onPulse, onStop, isWatchingRole }: any) {
  const isBuddy = request.buddyUid === user.uid || request.buddyEmail === user.email?.toLowerCase();
  const isUser = request.uid === user.uid;
  const [timeLeft, setTimeLeft] = useState("");
  const [satellite, setSatellite] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      if (request.expiresAt) {
        const exp = safeGetMs(request.expiresAt);
        const diff = exp - Date.now();
        if (diff <= 0) {
          setTimeLeft("Expired");
          onStop();
        } else {
          const mins = Math.floor(diff / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${mins}m ${secs}s`);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [request.expiresAt, onStop]);

  const nearbySec = incidents.filter((inc: any) => {
    if (!inc.location || !request.lat) return false;
    const d = getDistance(request.lat, request.lng, inc.location.lat, inc.location.lng);
    return d <= 3000;
  });

  return (
    <div style={{ background: "#fff", borderRadius: 24, padding: 16, border: "1px solid #F0EFEB", marginBottom: 24, boxShadow: "0 8px 30px rgba(0,0,0,0.08)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 6, height: "100%", background: "#1E88E5" }} />
      
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", width: 44, height: 44, background: "#E3F2FD", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 2px 4px rgba(30,136,229,0.1)" }}>
            <ShieldPlus size={24} color="#1E88E5" />
            <motion.div 
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ position: "absolute", inset: -4, borderRadius: 18, border: "2px solid #1E88E5" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628", display: "flex", alignItems: "center", gap: 6 }}>
              {isWatchingRole ? `Watching ${request.userName}` : "Buddy Protection"}
              <span style={{ background: "#E8F5E9", color: "#2E7D32", fontSize: 9, padding: "2px 6px", borderRadius: 6, fontWeight: 900, letterSpacing: "0.02em" }}>LIVE</span>
            </div>
            <div style={{ fontSize: 11, color: "#666", fontWeight: 700, marginTop: 2 }}>
              ZONE: <span style={{ color: "#1E88E5" }}>{request.district?.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#1E88E5", fontFamily: "'JetBrains Mono', monospace" }}>{timeLeft}</div>
          <div style={{ fontSize: 9, fontWeight: 900, color: "#999", letterSpacing: "0.08em" }}>STATUS SECURE</div>
        </div>
      </div>

      <div style={{ height: 320, borderRadius: 20, overflow: "hidden", marginBottom: 16, border: "2.5px solid #F0EFEB", position: "relative" }}>
        <MapContainer 
          center={[(request.lat && typeof request.lat === 'number' && !isNaN(request.lat)) ? request.lat : 2.0469, (request.lng && typeof request.lng === 'number' && !isNaN(request.lng)) ? request.lng : 45.3182]} 
          zoom={17} 
          style={{ height: "100%", width: "100%", filter: satellite ? "none" : "grayscale(0.2) contrast(1.1)" }}
        >
          <TileLayer url={satellite ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
          <RecenterMap lat={request.lat} lng={request.lng} />
          
          {request.lat && request.lng && typeof request.lat === 'number' && !isNaN(request.lat) && typeof request.lng === 'number' && !isNaN(request.lng) && (
            <>
              <Marker 
                position={[request.lat, request.lng]} 
                icon={L.divIcon({
                  html: `<div style="background:#1E88E5; width:20px; height:20px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 10px rgba(30,136,229,0.5); position:relative;">
                           <div style="position:absolute; inset:-8px; border-radius:50%; border:2px solid #1E88E5; animation:pulse 2s infinite;"></div>
                         </div>`,
                  className: '',
                  iconSize: [20, 20]
                })}
              />
              <Circle center={[request.lat, request.lng]} radius={100} pathOptions={{ color: '#1E88E5', fillColor: '#1E88E5', fillOpacity: 0.08, weight: 1, dashArray: '5, 5' }} />
            </>
          )}

          {/* Show nearby incidents for safety context */}
          {nearbySec.map((inc: any) => inc.location && (
            <Marker 
              key={inc.id}
              position={[inc.location.lat, inc.location.lng]}
              icon={L.divIcon({
                html: `<div style="background:${gColor(inc.type)}; width:12px; height:12px; border-radius:50%; border:2px solid #fff; opacity:0.8;"></div>`,
                className: '',
                iconSize: [12, 12]
              })}
            >
              <Popup>{inc.type.toUpperCase()}: {inc.district}</Popup>
            </Marker>
          ))}
        </MapContainer>

        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
          <button 
            onClick={() => setSatellite(!satellite)}
            style={{ background: "#fff", border: "1.5px solid #F0EFEB", borderRadius: 10, padding: 8, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", color: "#0A1628" }}
          >
            {satellite ? <IcMap size={16} /> : <div style={{ fontSize: 10, fontWeight: 900 }}>SAT</div>}
          </button>
          <div style={{ background: "rgba(10,22,40,0.9)", padding: "6px 12px", borderRadius: 10, fontSize: 10, fontWeight: 900, color: "#E8C547", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF50", animation: "pulse 1s infinite" }} />
            SECURED TRACKING
          </div>
        </div>

        {nearbySec.length > 0 && (
          <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1000, background: "rgba(229,57,53,0.95)", color: "#fff", padding: "6px 14px", borderRadius: 10, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(229,57,53,0.3)" }}>
            <IcAlert size={12} />
            {nearbySec.length} NEARBY THREATS
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {isBuddy && (
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={onPulse}
            style={{ 
              flex: 2, background: "#0A1628", color: "#E8C547", border: "none", 
              borderRadius: 18, padding: "16px", fontSize: 13, fontWeight: 900, 
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 8px 20px rgba(10,22,40,0.2)"
            }}
          >
            <HeartPulse size={20} />
            CHECK HEARTBEAT
          </motion.button>
        )}
        <button 
          onClick={onStop}
          style={{ 
            flex: 1, background: "#F5F4F0", color: "#E53935", border: "none", 
            borderRadius: 18, padding: "16px", fontSize: 13, fontWeight: 900, 
            cursor: "pointer"
          }}
        >
          {isUser ? "CANCEL" : "END WATCH"}
        </button>
      </div>
    </div>
  );
}

function BuddyRequestItem({ request, onAccept, onReject }: any) {
  return (
    <div style={{ background: "#fff", borderRadius: 24, padding: 20, border: "2.5px solid #1E88E5", marginBottom: 16, boxShadow: "0 10px 25px rgba(30,136,229,0.15)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, padding: "6px 14px", background: "#1E88E5", color: "#fff", borderBottomLeftRadius: 16, fontSize: 10, fontWeight: 900, letterSpacing: "0.05em" }}>LIVE REQUEST</div>
      
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, marginTop: 8 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#E3F2FD", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 2px 4px rgba(30,136,229,0.1)" }}>
          <ShieldPlus size={24} color="#1E88E5" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0A1628" }}>{request.userName} needs a Buddy</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#666", fontWeight: 700 }}>LOCATION:</span>
            <span style={{ background: "#0A1628", color: "#E8C547", padding: "3px 10px", borderRadius: 8, fontSize: 12, fontWeight: 900, letterSpacing: "0.02em" }}>{request.district.toUpperCase()}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onReject} style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1.5px solid #F0EFEB", background: "#fff", color: "#666", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Decline</button>
        <button onClick={onAccept} style={{ flex: 2.2, padding: "12px", borderRadius: 14, border: "none", background: "#1E88E5", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 12px rgba(30,136,229,0.3)" }}>Accept & Watch</button>
      </div>
    </div>
  );
}

// --- HELPERS ---
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

function sendBrowserNotification(title: string, body: string) {
  if (Notification.permission === "granted") {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          vibrate: [100, 50, 100],
          data: { url: '/' }
        } as any);
      });
    } else {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  }
}

function safeGetMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds !== undefined) return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function useCachedState<T>(key: string, initialValue: T): [T, (val: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const cached = localStorage.getItem(`foogan_cache_${key}`);
      return cached ? JSON.parse(cached) : initialValue;
    } catch (e) {
      return initialValue;
    }
  });

  const setCachedState = (val: T) => {
    setState(val);
    try {
      localStorage.setItem(`foogan_cache_${key}`, JSON.stringify(val));
    } catch (e) {}
  };

  return [state, setCachedState];
}

function AppContent() {
  const [tab, setTab] = useState("home");
  const [selDistName, setSelDistName] = useState<string | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Cached states for instant load
  const [rawIncidents, setRawIncidents] = useCachedState<any[]>("incidents", []);
  const [districts, setDistricts] = useCachedState<any[]>("districts", []);
  const [news, setNews] = useCachedState<any[]>("news", []);
  const [polls, setPolls] = useCachedState<any[]>("polls", []);
  const [liveAlerts, setLiveAlerts] = useCachedState<any[]>("live_alerts", []);
  const [geofences, setGeofences] = useCachedState<any[]>("geofences", []);
  const [userProfile, setUserProfile] = useCachedState<any>("user_profile", null);
  const [aiInsights, setAiInsights] = useCachedState<any>("ai_insights", null);

  const [districtsLoading, setDistrictsLoading] = useState(districts.length === 0);

  const [sponsors, setSponsors] = useState<any[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number, lng: number } | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const [messages, setMessages] = useCachedState<any[]>("messages", []);
  const [notifications, setNotifications] = useCachedState<any[]>("notifications", []);
  const [editIncident, setEditIncident] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("user");
  const isSuperAdmin = userRole === "admin" || user?.email === "barbaaryp@gmail.com";
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [lastViewedNews, setLastViewedNews] = useState(Date.now());
  const [toast, setToast] = useState<any>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [contactSosSignals, setContactSosSignals] = useState<any[]>([]);
  const [allSosSignals, setAllSosSignals] = useState<any[]>([]);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [activeBuddyRequest, setActiveBuddyRequest] = useState<any>(null);
  const [incomingBuddyRequests, setIncomingBuddyRequests] = useState<any[]>([]);
  const [language, setLanguage] = useState<"en" | "so">("en");
  const t = getT(language);
  const [showBuddyModal, setShowBuddyModal] = useState(false);
  const [assignedDistrict, setAssignedDistrict] = useState<string | null>(null);
  const [tempDistrict, setTempDistrict] = useState<string | null>(null);
  const activeDistrict = assignedDistrict || tempDistrict;

  const userPosRef = useRef<{ lat: number, lng: number } | null>(null);
  const geofencesRef = useRef<any[]>([]);
  const lastAiFetchRef = useRef<number>(0);

  // Memoized Scoring Algorithm for performance (Instant Updates & Memoized Calculations)
  const incidents = useMemo(() => {
    const userDistrict = getUserDistrict(userPos);
    const scored = rawIncidents.map((incident: any) => {
      let score = 0;
      const now = Date.now();
      const timestamp = safeGetMs(incident.timestamp);
      const ageInHours = (now - timestamp) / (1000 * 60 * 60);

      // Recency (Base score)
      score += Math.max(0, 1000 - ageInHours * 20);

      // Severity/High-level
      if (incident.type === 'security' || incident.type === 'fire') score += 800;
      if (incident.type === 'welfare' && incident.bloodType) {
        score += 600;
        // Blood Type Match Boost
        if (userProfile?.volunteerBloodType === incident.bloodType) {
          score += 2000; // Extreme boost for matching blood donors
        }
      }

      // Verified
      const confirms = incident.confirms?.length || 0;
      score += confirms * 100;
      if (confirms >= 5) score += 400;

      // District Match
      if (userDistrict && incident.district === userDistrict) score += 1000;

      // Proximity to User
      if (userPos && incident.location) {
        const dist = getDistance(userPos.lat, userPos.lng, incident.location.lat, incident.location.lng);
        if (dist <= 2000) score += 1200;
        else if (dist <= 5000) score += 600;
      }

      // Geofences
      geofences.forEach(gf => {
        if (incident.location) {
          const dist = getDistance(gf.lat, gf.lng, incident.location.lat, incident.location.lng);
          if (dist <= gf.radius) score += 1500;
        }
      });

      // Contact Districts (Prioritized Locations)
      userProfile?.sosContacts?.forEach((c: any) => {
        if (c.district && incident.district === c.district) {
          score += 1200;
        }
      });

      // Contact Proximity (Active SOS)
      contactSosSignals.forEach((sig: any) => {
        if (incident.location && sig.lat && sig.lng) {
          const dist = getDistance(sig.lat, sig.lng, incident.location.lat, incident.location.lng);
          if (dist <= 3000) score += 2500;
        }
      });

      // Penalties
      if (incident.solved) score *= 0.4;
      if (ageInHours > 24) score *= 0.6;
      if (ageInHours > 72) score *= 0.4;

      return { ...incident, _score: score };
    });

    return scored.sort((a, b) => b._score - a._score);
  }, [rawIncidents, userPos, geofences, userProfile?.sosContacts, contactSosSignals]);

  // --- NOTIFICATION PERMISSIONS ---
  useEffect(() => {
    // Attempt to request on interaction or just check status
    if ("Notification" in window && Notification.permission === "default") {
      // We'll show a prompt in the UI instead of auto-requesting to avoid browser blockage
    }
  }, []);

  // Sync Buddy Requests (Incoming)
  const initialLoadBuddy = useRef(true);
  useEffect(() => {
    if (!user || !user.email) return;
    const email = user.email.toLowerCase();
    const q = query(
      collection(db, "buddy_requests"),
      where("buddyEmail", "==", email),
      where("status", "in", ["pending", "active"])
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (!initialLoadBuddy.current && reqs.length > incomingBuddyRequests.length) {
        const latest: any = reqs[reqs.length - 1];
        sendBrowserNotification("🛡️ Buddy Request", `${latest.userName} asked you to watch their back!`);
        setToast({
          type: "info",
          title: "Buddy Request",
          body: `${latest.userName} asked you to watch their back. Check your profile.`,
          action: () => setTab("profile")
        });
      }
      
      setIncomingBuddyRequests(reqs);
      initialLoadBuddy.current = false;
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "buddy_requests");
      }
    });
    return unsub;
  }, [user?.email, incomingBuddyRequests.length]);

  // Sync Buddy Requests (Outgoing)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "buddy_requests"),
      where("uid", "==", user.uid),
      where("status", "in", ["pending", "active"])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setActiveBuddyRequest({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveBuddyRequest(null);
      }
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "buddy_requests");
      }
    });
    return unsub;
  }, [user]);

  // Listen for pulses on active buddy request
  useEffect(() => {
    if (activeBuddyRequest && activeBuddyRequest.lastPulseAt) {
      const lastPulse = safeGetMs(activeBuddyRequest.lastPulseAt);
      if (Date.now() - lastPulse < 5000) {
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        // Show a visual pulse too
        setToast({
          type: "info",
          title: "💓 Heartbeat Pulse",
          body: `${activeBuddyRequest.buddyName || 'Your buddy'} is watching your back.`
        });
        setTimeout(() => setToast(null), 3000);
      }
    }
  }, [activeBuddyRequest?.pulses]);

  // Prompt for Buddy Request in High Risk districts
  useEffect(() => {
    const districtName = getUserDistrict(userPos);
    if (districtName && !activeBuddyRequest) {
      const district = districts.find(d => d.name === districtName);
      if (district && (district.risk === 'high' || district.risk === 'critical')) {
        const lastPrompt = localStorage.getItem(`buddy_prompt_${districtName}`);
        if (!lastPrompt || Date.now() - parseInt(lastPrompt) > 3600000) { // Prompt once an hour
          setToast({
            type: "info",
            title: "🛡️ High Risk Area",
            body: `You are in ${districtName}. Would you like to request a Buddy to watch your back?`,
            action: () => setShowBuddyModal(true)
          });
          localStorage.setItem(`buddy_prompt_${districtName}`, Date.now().toString());
        }
      }
    }
  }, [userPos, districts, activeBuddyRequest]);

  // Update requester location in buddy_requests
  useEffect(() => {
    if (activeBuddyRequest && activeBuddyRequest.status === "active" && userPos && activeBuddyRequest.uid === user?.uid) {
      const updateLoc = async () => {
        try {
          await updateDoc(doc(db, "buddy_requests", activeBuddyRequest.id), {
            lat: userPos.lat,
            lng: userPos.lng
          });
        } catch (e) {
          // Silent fail for location updates
        }
      };
      const timeout = setTimeout(updateLoc, 5000); // Update every 5 seconds
      return () => clearTimeout(timeout);
    }
  }, [userPos, activeBuddyRequest?.id, activeBuddyRequest?.status]);

  // Sync user role from team_members if applicable
  useEffect(() => {
    if (user && user.email) {
      const email = user.email.toLowerCase();
      const unsub = onSnapshot(doc(db, "team_members", email), async (snap) => {
        if (snap.exists()) {
          const teamData = snap.data();
          const targetRole = teamData.role;
          setAssignedDistrict(teamData.assignedDistrict || null);
          
          // Update local state immediately for UI responsiveness
          setUserRole(targetRole);
          
          // Sync to users collection if needed
          const isHardcodedAdmin = user.email === "barbaaryp@gmail.com";
          if (!isHardcodedAdmin && (!userProfile || userProfile.role !== targetRole)) {
            try {
              await updateDoc(doc(db, "users", user.uid), { role: targetRole });
            } catch (e) {
              console.error("Failed to sync role to users collection", e);
            }
          }
        }
      }, (err) => {
        if (err.code !== 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `team_members/${email}`);
        }
      });
      return unsub;
    }
  }, [user, userProfile]);

  useEffect(() => {
    const q = query(collection(db, "sponsors"), where("active", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      setSponsors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "sponsors");
    });
    return unsub;
  }, []);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    geofencesRef.current = geofences;
  }, [geofences]);

  // Cleanup old news and polls once (v7 - Optimized)
  useEffect(() => {
    const cleanup = async () => {
      const cleaned = localStorage.getItem("ais_cleanup_v7");
      if (cleaned) return;
      try {
        const pollsSnap = await getDocs(query(collection(db, "polls"), limit(100)));
        for (const d of pollsSnap.docs) {
          await deleteDoc(doc(db, "polls", d.id));
        }
        const newsSnap = await getDocs(query(collection(db, "news"), limit(100)));
        for (const d of newsSnap.docs) {
          await deleteDoc(doc(db, "news", d.id));
        }
        localStorage.setItem("ais_cleanup_v7", "true");
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };
    cleanup();
  }, []);

  // Real-time alert for new incidents and Geofence check
  useEffect(() => {
    if (incidents.length > 0 && user) {
      const latest = incidents[0];
      const timestampMs = safeGetMs(latest.timestamp);
      const isNew = timestampMs > Date.now() - 30000;
      
      if (isNew) {
        // Volunteer check
        if (userProfile?.isVolunteer && (latest.type === 'welfare' || latest.bloodType)) {
          const dist = userPos ? getDistance(userPos.lat, userPos.lng, latest.location?.lat || 0, latest.location?.lng || 0) : 999999;
          if (dist <= 2000) { // 2km for volunteers
            setToast({ 
              type: "alert", 
              title: "🚨 EMERGENCY VOLUNTEER NEEDED", 
              body: `Medical emergency in ${latest.district}! You are nearby. Respond now.` 
            });
            setTimeout(() => setToast(null), 10000);
          }
        }
      }
    }
  }, [incidents, user, userProfile, userPos]);

  // Sync user profile
  useEffect(() => {
    if (user) {
      const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserProfile(data);
          const newRole = data.role || "user";
          setUserRole(prev => {
            // Don't downgrade if we have a privileged role from team_members
            if ((prev === "admin" || prev === "editor") && newRole === "user") {
              return prev;
            }
            return newRole;
          });
        }
      }, (err) => {
        if (err.code !== 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
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
    const email = user.email.toLowerCase();
    
    const q = query(
      collection(db, "sos_signals"), 
      where("contactEmails", "array-contains", email),
      where("status", "==", "active")
    );

    const unsub = onSnapshot(q, (snap) => {
      const signals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Check for new SOS signals
      if (contactSosSignals.length > 0 && signals.length > contactSosSignals.length) {
        const latest = signals[0] as any;
        sendBrowserNotification("🚨 SOS EMERGENCY", `${latest.user} triggered an SOS signal!`);
        setToast({ 
          type: "alert", 
          title: "🚨 SOS EMERGENCY", 
          body: `${latest.user} has triggered an SOS! Track them in your profile.` 
        });
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
        setTimeout(() => setToast(null), 10000);
      }
      
      setContactSosSignals(signals);
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "sos_signals");
      }
    });
    
    return unsub;
  }, [user?.email]);

  // Admin: Sync all SOS signals for reporting
  useEffect(() => {
    if (userRole === "admin") {
      const q = query(collection(db, "sos_signals"), orderBy("timestamp", "desc"), limit(200));
      const unsub = onSnapshot(q, (snap) => {
        setAllSosSignals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        if (err.code !== 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, "sos_signals");
        }
      });
      return unsub;
    }
  }, [userRole]);

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
      }, (err) => {
        if (err.code !== 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, "sos_signals");
        }
      });
      return unsub;
    }
  }, [user]);

  // Simulate location-based alerts
  useEffect(() => {
    if (incidents.length > 0 && user) {
      const latest = incidents[0];
      const timestampMs = safeGetMs(latest.timestamp);
      const isNew = timestampMs > Date.now() - 30000;
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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Sync user to Firestore
        const userRef = doc(db, "users", u.uid);
        try {
          const snap = await getDoc(userRef);
          const isBootstrapAdmin = u.email === "barbaaryp@gmail.com";
          
          // Check team_members first for role
          let initialRole = isBootstrapAdmin ? "admin" : "user";
          if (u.email) {
            const teamSnap = await getDoc(doc(db, "team_members", u.email.toLowerCase()));
            if (teamSnap.exists()) {
              initialRole = teamSnap.data().role;
            }
          }

          if (!snap.exists()) {
            if (!u.email) {
              console.warn("User has no email, skipping profile creation");
              return;
            }
            const newUser = {
              displayName: u.displayName || "User",
              email: u.email,
              photoURL: u.photoURL || null,
              role: initialRole,
              reportCount: 0
            };
            await setDoc(userRef, newUser);
            setUserRole(initialRole);
          } else {
            const data = snap.data();
            // Use team_members role if available, otherwise fallback to user doc role
            setUserRole(initialRole !== "user" ? initialRole : (data?.role || "user"));
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${u?.uid}`);
        }
      }
    });
    return unsub;
  }, []);



  useEffect(() => {
    const qIncidents = query(collection(db, "incidents"), orderBy("timestamp", "desc"), limit(30));
    const unsubInc = onSnapshot(qIncidents, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Real-time alert for new incidents and Geofence check
      if (rawIncidents.length > 0 && data.length > rawIncidents.length) {
        const newInc: any = data.find(d => !rawIncidents.find(old => old.id === d.id));
        if (newInc) {
          let pushNotif = false;
          let notifTitle = "New Report";
          let notifBody = `${newInc.type.toUpperCase()} in ${newInc.district}`;

          // Geofence check
          if (newInc.location) {
            geofencesRef.current.forEach(gf => {
              const dist = getDistance(gf.lat, gf.lng, newInc.location.lat, newInc.location.lng);
              if (dist <= gf.radius) {
                pushNotif = true;
                notifTitle = `🚨 GEOFENCE ALERT: ${gf.name}`;
                notifBody = `Dangerous ${newInc.type} reported near your ${gf.name}!`;
              }
            });

            // Contact check (Active SOS)
            contactSosSignals.forEach((sig: any) => {
              const dist = getDistance(sig.lat, sig.lng, newInc.location.lat, newInc.location.lng);
              if (dist <= 3000) {
                pushNotif = true;
                notifTitle = `⚠️ CONTACT AT RISK: ${sig.user}`;
                notifBody = `Incident reported near ${sig.user}'s active SOS location!`;
              }
            });

            // Contact check (Saved Districts)
            userProfile?.sosContacts?.forEach((c: any) => {
              if (c.district && newInc.district === c.district && (newInc.type === 'security' || newInc.type === 'fire')) {
                pushNotif = true;
                notifTitle = `🚩 CONTACT AREA ALERT: ${c.name}`;
                notifBody = `Dangerous ${newInc.type} reported in ${c.name}'s district (${c.district})!`;
              }
            });

            // Current Location check (5500m)
            if (userPosRef.current) {
              const distToUser = getDistance(userPosRef.current.lat, userPosRef.current.lng, newInc.location.lat, newInc.location.lng);
              if (distToUser <= 5500) {
                pushNotif = true;
                if (notifTitle === "New Report") {
                  notifTitle = "Nearby Incident";
                  notifBody = `A ${newInc.type} was reported within 5.5km of you.`;
                }
              }
            }
          }

          if (pushNotif) {
            sendBrowserNotification(notifTitle, notifBody);
            setToast({ type: "alert", title: notifTitle, body: notifBody });
            setTimeout(() => setToast(null), 10000);

            // Push to personalized notifications if user logged in
            if (user && user.email) {
              const email = user.email.toLowerCase();
              addDoc(collection(db, "notifications"), {
                toEmail: email,
                fromName: "System",
                type: "alert",
                title: notifTitle,
                body: notifBody,
                timestamp: serverTimestamp(),
                read: false,
                incidentId: newInc.id
              });
            }
          } else {
            setToast({ type: "alert", title: "New Report", body: `${newInc.type.toUpperCase()} in ${newInc.district}` });
            setTimeout(() => setToast(null), 5000);
          }
        }
      }

      setRawIncidents(data);

      if (data.length > 0) {
        // Throttled AI Insights (Instant updates but throttled API calls)
        const now = Date.now();
        if (now - lastAiFetchRef.current > 1000 * 60 * 5) { // 5 mins
          lastAiFetchRef.current = now;
          getSafetyInsights(data).then(setAiInsights);
        }
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

    const qNews = query(collection(db, "news"), orderBy("timestamp", "desc"), limit(15));
    const unsubNews = onSnapshot(qNews, (snap) => {
      setNews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        handleFirestoreError(err, OperationType.LIST, "news");
      }
    });

    const qPolls = query(collection(db, "polls"), orderBy("timestamp", "desc"), limit(10));
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

    const qAlerts = query(collection(db, "live_alerts"), orderBy("timestamp", "desc"), limit(10));
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
    const urgentNewsCount = news.filter(n => n.urgent && (n.timestamp?.toDate ? n.timestamp.toDate().getTime() : 0) > lastViewedNews).length;
    const unreadNotifsCount = notifications.filter(n => !n.read).length;
    setUnreadAlerts(urgentNewsCount + unreadNotifsCount);
  }, [news, lastViewedNews, notifications]);

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
      const seeded = localStorage.getItem("ais_districts_seeded_v1");
      if (seeded) return;

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
          localStorage.setItem("ais_districts_seeded_v1", "true");
        } catch (err) {
          console.error("District seeding failed", err);
        }
      }
    };

    seedData();
  }, [user, userRole, districts.length]);
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
    { id: "home", icon: <IcHome />, label: getT(language)('home') },
    { id: "map", icon: <IcMap />, label: getT(language)('map') },
    { id: "report", icon: <IcAlert />, label: getT(language)('report'), fab: true },
    { id: "news", icon: <IcNews />, label: getT(language)('news') },
    { id: "profile", icon: <IcUser />, label: getT(language)('profile') },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',sans-serif", background: "#F5F4F0", minHeight: "100vh", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      <div style={{ background: "#0A1628", padding: "14px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>{getT(language)('app_name')}</div>
          <div style={{ fontSize: 10, color: "#E8C547", letterSpacing: "0.08em", fontWeight: 600, marginTop: 3 }}>{getT(language)('ka_feejigan')}</div>
        </div>
        {user ? (
          <button onClick={() => setShowNearby(true)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", position: "relative" }}>
            <IcBell />
            {unreadAlerts > 0 && <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#E53935", border: "2px solid #0A1628" }} />}
          </button>
        ) : (
          <button onClick={() => setTab("profile")} style={{ background: "#E8C547", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#0A1628" }}>
            {getT(language)('login')}
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
            userRole={userRole}
            assignedDistrict={assignedDistrict}
            onClose={() => setShowNearby(false)} 
            currentUid={user?.uid}
            onEdit={handleEdit}
            onDelete={handleDelete}
            userProfile={userProfile}
            notifications={notifications}
            t={t}
            setTab={setTab}
            setSelDistName={setSelDistName}
          />
        )}
      </AnimatePresence>

      {/* Watch My Back Components */}
      <AnimatePresence>
        {showBuddyModal && (
          <BuddyRequestModal 
            user={user} 
            userProfile={userProfile} 
            districts={districts} 
            userPos={userPos} 
            onClose={() => setShowBuddyModal(false)} 
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
            {tab === "home" && <HomeTab setTab={setTab} setDist={(n: string) => { setSelDistName(n); setTab("map"); }} incidents={incidents} news={news} liveAlerts={liveAlerts} aiInsights={aiInsights} geofences={geofences} currentUid={user?.uid} isAdmin={userRole === "admin"} userRole={userRole} assignedDistrict={assignedDistrict} onEdit={handleEdit} onDelete={handleDelete} user={user} userPos={userPos} userProfile={userProfile} activeSosId={activeSosId} onActiveSosId={setActiveSosId} polls={polls} contactSosSignals={contactSosSignals} sponsors={sponsors} t={t} />}
            {tab === "feed" && <FeedTab incidents={incidents} currentUid={user?.uid} isAdmin={userRole === "admin"} userRole={userRole} assignedDistrict={assignedDistrict} onEdit={handleEdit} onDelete={handleDelete} userPos={userPos} userProfile={userProfile} t={t} />}
            {tab === "admin_district" && (
              activeDistrict && (userRole === "admin" || userRole === "district_admin") ? (
                <DistrictDashboard 
                  districtName={activeDistrict} 
                  incidents={incidents.filter(i => i.district === activeDistrict)}
                  user={user}
                  userProfile={userProfile}
                  onDone={() => { setTab("home"); setTempDistrict(null); }}
                  t={t}
                />
              ) : isSuperAdmin ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                   <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Select District to Manage</div>
                   <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>As a System Admin, you can monitor any district.</div>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                     {districts.map(d => (
                       <button 
                        key={d.name}
                        onClick={() => setTempDistrict(d.name)}
                        style={{ padding: 16, background: "#fff", border: "1.5px solid #F0EFEB", borderRadius: 16, fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                       >
                         {d.name}
                       </button>
                     ))}
                   </div>
                   <button onClick={() => setTab("home")} style={{ marginTop: 24, color: "#999", border: "none", background: "none", fontSize: 13, fontWeight: 700 }}>Cancel</button>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 50, marginBottom: 20 }}>🚫</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628", marginBottom: 8 }}>Access Denied</div>
                  <div style={{ fontSize: 14, color: "#666" }}>You do not have permission to access district administration.</div>
                  <button onClick={() => setTab("home")} style={{ marginTop: 24, background: "#0A1628", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700 }}>Return Home</button>
                </div>
              )
            )}
            {tab === "map" && <MapTab selDistName={selDistName} setDistName={setSelDistName} districts={districts} incidents={incidents} geofences={geofences} loading={districtsLoading} currentUid={user?.uid} isAdmin={userRole === "admin"} userRole={userRole} assignedDistrict={assignedDistrict} onEdit={handleEdit} onDelete={handleDelete} userPos={userPos} userProfile={userProfile} sosSignals={contactSosSignals} t={t} />}
            {tab === "report" && (user ? <ReportTab user={user} districts={districts} districtsLoading={districtsLoading} onDone={() => { setTab("home"); setEditIncident(null); }} editItem={editIncident} onCancel={() => { setTab("profile"); setEditIncident(null); }} userPos={userPos} t={t} /> : <LoginScreen 
              showPhoneLogin={showPhoneLogin}
              setShowPhoneLogin={setShowPhoneLogin}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              verificationCode={verificationCode}
              setVerificationCode={setVerificationCode}
              confirmationResult={confirmationResult}
              setConfirmationResult={setConfirmationResult}
              handleLogin={handleLogin}
              handlePhoneLogin={handlePhoneLogin}
              handleVerifyCode={handleVerifyCode}
              loginLoading={loginLoading}
            />)}
            {tab === "news" && <NewsTab news={news} polls={polls} sosSignals={userRole === "admin" ? allSosSignals : contactSosSignals} isAdmin={userRole === "admin"} userRole={userRole} currentUid={user?.uid} onEnter={() => setLastViewedNews(Date.now())} incidents={incidents} sponsors={sponsors} t={t} onEdit={handleEdit} onDelete={handleDelete} userPos={userPos} userProfile={userProfile} />}
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
                activeBuddyRequest={activeBuddyRequest}
                incomingBuddyRequests={incomingBuddyRequests}
                assignedDistrict={assignedDistrict}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenAdmin={() => {
                  setTab("news");
                  setTimeout(() => {
                    const btn = document.querySelector('[data-admin-tools]') as HTMLButtonElement;
                    if (btn) btn.click();
                  }, 100);
                }} 
                onOpenDistrictAdmin={() => setTab("admin_district")}
                onWatchMyBack={() => setShowBuddyModal(true)}
                language={language}
                setLanguage={setLanguage}
              />
            ) : <LoginScreen 
              showPhoneLogin={showPhoneLogin}
              setShowPhoneLogin={setShowPhoneLogin}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
              verificationCode={verificationCode}
              setVerificationCode={setVerificationCode}
              confirmationResult={confirmationResult}
              setConfirmationResult={setConfirmationResult}
              handleLogin={handleLogin}
              handlePhoneLogin={handlePhoneLogin}
              handleVerifyCode={handleVerifyCode}
              loginLoading={loginLoading}
            />)}
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
