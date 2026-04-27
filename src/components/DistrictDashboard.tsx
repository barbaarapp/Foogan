import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  Shield, 
  CheckCircle2, 
  Clock, 
  Activity, 
  MessageSquare, 
  Send, 
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Filter,
  BarChart3,
  Calendar,
  User,
  MapPin,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { db } from "../firebase";

export const DistrictDashboard = memo(({ districtName, incidents, user, userProfile, onDone, t }: any) => {
  const [filter, setFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [selIncident, setSelIncident] = useState<any>(null);
  const [msgContent, setMsgContent] = useState("");
  const [msgType, setMsgType] = useState<"ALERT" | "UPDATE" | "COMMUNITY">("UPDATE");
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return incidents.filter((i: any) => {
      const statusMatch = filter === "all" || i.status === filter || (filter === "reported" && (!i.status || i.status === "reported"));
      const catMatch = catFilter === "all" || i.type === catFilter;
      return statusMatch && catMatch;
    });
  }, [incidents, filter, catFilter]);
  
  const stats = useMemo(() => ({
    total: incidents.length,
    reported: incidents.filter((i: any) => !i.status || i.status === "reported").length,
    processing: incidents.filter((i: any) => i.status === "processing").length,
    solved: incidents.filter((i: any) => i.status === "resolved").length,
  }), [incidents]);

  const handleUpdateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await updateDoc(doc(db, "incidents", id), { 
        status, 
        solved: status === "resolved",
        updatedAt: serverTimestamp()
      });
      if (selIncident?.id === id) {
        setSelIncident({ ...selIncident, status, solved: status === "resolved" });
      }
    } catch (e) {
      console.error("Update failed", e);
    } finally {
      setUpdating(null);
    }
  };

  const handlePostMessage = async () => {
    if (!msgContent.trim()) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "news"), {
        cat: msgType,
        title: `${districtName} Official Update`,
        content: msgContent,
        district: districtName,
        urgent: msgType === "ALERT",
        timestamp: serverTimestamp(),
        reads: 0,
        likes: 0,
        authorName: userProfile?.displayName || districtName + " Admin",
        authorRole: "District Admin"
      });
      setMsgContent("");
      alert("Official message posted!");
    } catch (e) {
      console.error("Post failed", e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ background: "#F9F9F7", minHeight: "100%", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: "#0A1628", padding: "24px 20px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#E8C547", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>District Administration</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{districtName}</div>
          </div>
          <button onClick={onDone} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>Exit Dashboard</button>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          {[
            { label: "Total", val: stats.total, color: "#fff" },
            { label: "New", val: stats.reported, color: "#E53935" },
            { label: "Active", val: stats.processing, color: "#FB8C00" },
            { label: "Solved", val: stats.solved, color: "#43A047" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* News Composer */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #F3F4F6", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8C547", display: "flex", alignItems: "center", justifyContent: "center", color: "#0A1628" }}><Send size={16} /></div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628" }}>Post Official Update</div>
          </div>
          <textarea 
            placeholder="Inform your followers or share safety updates..."
            value={msgContent}
            onChange={(e) => setMsgContent(e.target.value)}
            style={{ width: "100%", borderRadius: 12, border: "1px solid #ECEBE6", padding: 12, fontSize: 14, minHeight: 80, resize: "none", background: "#FBFBFA", outline: "none", marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select 
              value={msgType}
              onChange={(e: any) => setMsgType(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ECEBE6", background: "#fff", fontSize: 11, fontWeight: 700 }}
            >
              <option value="UPDATE">Standard Update</option>
              <option value="ALERT">🚨 Critical Alert</option>
              <option value="COMMUNITY">Community Info</option>
            </select>
            <button 
              onClick={handlePostMessage}
              disabled={posting || !msgContent.trim()}
              style={{ flex: 1, background: "#0A1628", color: "#fff", border: "none", borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: posting ? 0.7 : 1 }}
            >
              {posting ? "Posting..." : "Broadcast Message"}
            </button>
          </div>
        </div>

        {/* Incident Monitor */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0A1628", display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={16} color="#E53935" />
              LIVE INCIDENT MONITOR
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "reported", "processing", "resolved"].map(t => (
                <button 
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{ 
                    background: filter === t ? "#0A1628" : "#fff", 
                    color: filter === t ? "#fff" : "#666",
                    border: "1px solid",
                    borderColor: filter === t ? "#0A1628" : "#ECEBE6",
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase"
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {["all", "security", "injustice", "hazards", "welfare", "health", "market"].map(c => (
              <button 
                key={c}
                onClick={() => setCatFilter(c)}
                style={{ 
                  background: catFilter === c ? "#E8C547" : "#fff", 
                  color: "#0A1628",
                  border: "1px solid",
                  borderColor: catFilter === c ? "#E8C547" : "#ECEBE6",
                  borderRadius: 10,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "capitalize",
                  whiteSpace: "nowrap"
                }}
              >
                {c === "all" ? "All Categories" : t(`type_${c}`)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", background: "#fff", borderRadius: 20, border: "1px dashed #DDD" }}>
              <div style={{ fontSize: 13, color: "#999" }}>No incidents found for this filter.</div>
            </div>
          ) : (
            filtered.sort((a,b) => (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0)).map((r: any) => (
              <motion.div 
                layout
                key={r.id}
                onClick={() => setSelIncident(selIncident?.id === r.id ? null : r)}
                style={{ 
                  background: selIncident?.id === r.id ? "rgba(10, 22, 40, 0.02)" : "#fff", 
                  borderRadius: 12, 
                  border: `1px solid ${selIncident?.id === r.id ? "#0A1628" : "transparent"}`, 
                  overflow: "hidden", cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ padding: "3px 8px", background: "#F5F4F0", borderRadius: 6, fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: "#666" }}>
                        {r.type}
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    <div style={{ fontSize: 10, color: "#999", fontWeight: 700 }}>
                      {r.timestamp?.toDate ? r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0A1628", marginBottom: 4, lineHeight: 1.4 }}>
                    {r.desc.substring(0, 60)}{r.desc.length > 60 ? "..." : ""}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#999", fontSize: 10 }}>
                    <MapPin size={10} />
                    <span>{r.district}</span>
                    {r.bloodType && <span style={{ color: "#E53935", fontWeight: 800, marginLeft: 6 }}>• NEED: {r.bloodType}</span>}
                  </div>
                </div>

                <AnimatePresence>
                  {selIncident?.id === r.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ borderTop: "1px solid #F0F0EE", background: "#FAFAF8" }}
                    >
                      <div style={{ padding: 16 }}>
                        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 16 }}>{r.desc}</div>
                        
                        {r.img && (
                          <div style={{ width: "100%", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                            <img src={r.img} alt="Incident" referrerPolicy="no-referrer" style={{ width: "100%", display: "block" }} />
                          </div>
                        )}

                        <div style={{ fontSize: 10, fontWeight: 800, color: "#0A1628", marginBottom: 10, letterSpacing: "0.05em" }}>UPDATE STATUS</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[
                            { id: "seen", label: "Mark Seen", icon: <Eye size={14} />, color: "#1E88E5" },
                            { id: "processing", label: "In Process", icon: <Clock size={14} />, color: "#FB8C00" },
                            { id: "resolved", label: "Resolved", icon: <CheckCircle2 size={14} />, color: "#43A047" },
                          ].map(s => (
                            <button 
                              key={s.id}
                              disabled={updating === r.id}
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(r.id, s.id); }}
                              style={{ 
                                flex: 1, 
                                background: r.status === s.id ? s.color : "#fff",
                                color: r.status === s.id ? "#fff" : "#666",
                                border: `1.5px solid ${r.status === s.id ? s.color : "#ECEBE6"}`,
                                borderRadius: 10,
                                padding: "10px 4px",
                                fontSize: 10,
                                fontWeight: 800,
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 4
                              }}
                            >
                              {s.icon}
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

const StatusPill = memo(({ status }: { status: string }) => {
  let label = "Reported";
  let color = "#E53935";
  let bg = "#FFEBEE";

  if (status === "seen") { label = "Seen"; color = "#1E88E5"; bg = "#E3F2FD"; }
  if (status === "processing") { label = "Processing"; color = "#FB8C00"; bg = "#FFF3E0"; }
  if (status === "resolved") { label = "Solved"; color = "#43A047"; bg = "#E8F5E9"; }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: bg, color, padding: "2px 6px", borderRadius: 6, fontSize: 9, fontWeight: 800, textTransform: "uppercase" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
});

function Eye({ size }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}
