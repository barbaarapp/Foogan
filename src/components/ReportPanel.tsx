import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DISTRICTS = [
  "Abdiaziz", "Bondhere", "Daynile", "Dharkenley", "Hamar Jajab", 
  "Hamar Weyne", "Heliwa", "Hodan", "Howl Wadag", "Karan", 
  "Shangani", "Shibis", "Waberi", "Wadajir", "Warta Nabadda", 
  "Yaqshid", "Kahda", "Garasbaley"
];

export function ReportPanel({ incidents = [], sosSignals = [] }: { incidents?: any[], sosSignals?: any[] }) {
  const stats = useMemo(() => {
    const safeIncidents = Array.isArray(incidents) ? incidents : [];
    const safeSOS = Array.isArray(sosSignals) ? sosSignals : [];
    
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const currentIncidents = safeIncidents.filter(i => i.timestamp?.toDate() >= last7Days);
    const previousIncidents = safeIncidents.filter(i => i.timestamp?.toDate() >= prev7Days && i.timestamp?.toDate() < last7Days);
    
    const currentSOS = safeSOS.filter(s => s.timestamp?.toDate() >= last7Days);
    
    const totalIncidents = currentIncidents.length;
    const reportsSubmitted = totalIncidents; // Assuming 1:1 for now
    const solvedCount = currentIncidents.filter(i => i.solved).length;
    const resRate = totalIncidents > 0 ? (solvedCount / totalIncidents) * 100 : 0;
    const activeReporters = new Set(currentIncidents.map(i => i.uid)).size;
    const avgRespTime = 14; // Mocked for now as we don't have acceptedAt field yet
    const sosActivations = currentSOS.length;

    // District Ranking
    const districtStats = DISTRICTS.map(d => {
      const dCurrent = currentIncidents.filter(i => i.district === d);
      const dPrev = previousIncidents.filter(i => i.district === d);
      
      const solved = dCurrent.filter(i => i.solved).length;
      const active = dCurrent.length - solved;
      const trend = dCurrent.length > dPrev.length ? "worsening" : (dCurrent.length < dPrev.length ? "improving" : "stable");
      
      let risk = "low";
      if (dCurrent.length > 10) risk = "critical";
      else if (dCurrent.length > 5) risk = "high";
      else if (dCurrent.length > 2) risk = "medium";

      return {
        name: d,
        count: dCurrent.length,
        prevCount: dPrev.length,
        solved,
        active,
        trend,
        risk
      };
    }).sort((a, b) => b.count - a.count);

    return {
      totalIncidents,
      reportsSubmitted,
      solvedCount,
      resRate,
      activeReporters,
      avgRespTime,
      sosActivations,
      districtStats
    };
  }, [incidents, sosSignals]);

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- HEADER ---
    doc.setFillColor(10, 22, 40); // Dark Blue
    doc.rect(0, 0, pageWidth, 50, 'F');
    
    // Orange Curved Shape (Approximation using a polygon)
    doc.setFillColor(198, 69, 24); // Burnt Orange
    doc.lines(
      [[pageWidth * 0.4, 0], [pageWidth * 0.6, 50], [pageWidth, 50], [pageWidth, 0]], 
      0, 0, [1, 1], 'F'
    );
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("Foogan", 15, 20);
    
    doc.setTextColor(232, 197, 71); // Gold
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Ka feejigan qataraha", 15, 28);
    
    doc.setTextColor(232, 197, 71);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("WEEKLY SAFETY REPORT  |  MOGADISHU", 15, 40);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(`Safety Intelligence Digest — ${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('en-US', {month:'long', day:'numeric'})} – ${new Date().toLocaleDateString('en-US', {day:'numeric', year:'numeric'})}`, 15, 48);

    // Right side header info
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("Vol. 1, Issue 12", pageWidth - 15, 20, { align: "right" });
    doc.setTextColor(232, 197, 71);
    doc.text(`Published: Sunday, ${new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})}`, pageWidth - 15, 28, { align: "right" });

    // --- KPI STRIP ---
    doc.setFillColor(232, 197, 71); // Gold
    doc.rect(0, 55, pageWidth, 25, 'F');
    
    const kpis = [
      { l: "Total incidents", v: stats.totalIncidents },
      { l: "Reports submitted", v: stats.reportsSubmitted },
      { l: "Resolution rate", v: `${stats.resRate.toFixed(0)}%` },
      { l: "Active reporters", v: stats.activeReporters },
      { l: "Avg. response", v: `${stats.avgRespTime} min` },
      { l: "SOS activations", v: stats.sosActivations }
    ];

    doc.setTextColor(10, 22, 40);
    kpis.forEach((k, i) => {
      const x = 15 + (i * (pageWidth - 20) / 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(String(k.v), x + 10, 68, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(k.l, x + 10, 75, { align: "center" });
      if (i < 5) {
        doc.setDrawColor(10, 22, 40);
        doc.setLineWidth(0.2);
        doc.line(x + 28, 60, x + 28, 75);
      }
    });

    // --- SECTION 01: DISTRICT RANKINGS ---
    doc.setTextColor(198, 69, 24);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("01  DISTRICT RANKINGS — THIS WEEK", 15, 95);
    doc.setDrawColor(230, 230, 230);
    doc.line(15, 98, pageWidth - 15, 98);

    const tableData = stats.districtStats.map((d, i) => [
      i + 1,
      d.name,
      "", // Bar placeholder
      `${d.count}  ${d.count > d.prevCount ? '+' : ''}${d.count - d.prevCount}`,
      d.solved,
      d.active,
      d.risk.toUpperCase()
    ]);

    autoTable(doc, {
      startY: 102,
      head: [['Rank', 'District', 'Incidents', 'vs Last Wk', 'Resolved', 'Active', 'Risk']],
      body: tableData,
      theme: 'plain',
      headStyles: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [10, 22, 40], cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { fontStyle: 'bold', cellWidth: 40 },
        2: { cellWidth: 40 },
        3: { halign: 'center' },
        4: { halign: 'center', textColor: [46, 125, 50] },
        5: { halign: 'center', textColor: [183, 28, 28] },
        6: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.cell.section === 'body') {
          data.cell.styles.fillColor = [245, 244, 240];
        }
        if (data.column.index === 3 && data.cell.section === 'body') {
          const val = String(data.cell.text[0]);
          if (val.includes('+')) data.cell.styles.textColor = [183, 28, 28];
          else if (val.includes('-')) data.cell.styles.textColor = [46, 125, 50];
        }
      },
      didDrawCell: (data) => {
        if (data.column.index === 2 && data.cell.section === 'body') {
          const district = stats.districtStats[data.row.index];
          const maxCount = Math.max(...stats.districtStats.map(d => d.count), 1);
          const barWidth = (district.count / maxCount) * 30;
          
          let barColor = [76, 175, 80]; // Green
          if (district.risk === 'critical') barColor = [183, 28, 28];
          else if (district.risk === 'high') barColor = [229, 57, 53];
          else if (district.risk === 'medium') barColor = [255, 152, 0];

          doc.setFillColor(barColor[0], barColor[1], barColor[2]);
          doc.rect(data.cell.x + 5, data.cell.y + 4, barWidth, 3, 'F');
        }
        if (data.column.index === 6 && data.cell.section === 'body') {
          const risk = String(data.cell.text[0]);
          let bgColor = [232, 245, 233];
          let textColor = [46, 125, 50];
          if (risk === 'CRITICAL') { bgColor = [255, 235, 238]; textColor = [183, 28, 28]; }
          else if (risk === 'HIGH') { bgColor = [255, 243, 224]; textColor = [230, 81, 0]; }
          else if (risk === 'MEDIUM') { bgColor = [255, 253, 231]; textColor = [245, 127, 23]; }
          
          doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4, 3, 3, 'F');
          doc.setTextColor(textColor[0], textColor[1], textColor[2]);
          doc.text(risk, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    });

    // --- SECTION 02: KEY INCIDENTS ---
    const finalY = (doc as any).lastAutoTable.finalY || 200;
    doc.setTextColor(198, 69, 24);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("02  KEY INCIDENTS THIS WEEK", 15, finalY + 15);
    doc.setDrawColor(230, 230, 230);
    doc.line(15, finalY + 18, pageWidth - 15, finalY + 18);

    const keyIncidents = incidents.slice(0, 4);
    keyIncidents.forEach((inc, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 15 + (col * (pageWidth / 2 - 10));
      const y = finalY + 25 + (row * 35);
      
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(240, 240, 240);
      doc.roundedRect(x, y, pageWidth / 2 - 20, 30, 2, 2, 'FD');
      doc.setFillColor(183, 28, 28);
      doc.rect(x, y, 2, 30, 'F'); // Left accent

      doc.setTextColor(183, 28, 28);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(inc.type.toUpperCase(), x + 6, y + 6);
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${inc.district}  ·  ${inc.timestamp?.toDate().toLocaleString()}`, x + 6, y + 12);
      
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(7);
      doc.text(inc.desc.substring(0, 80) + (inc.desc.length > 80 ? '...' : ''), x + 6, y + 18, { maxWidth: pageWidth / 2 - 35 });

      // Status Badge
      const status = inc.solved ? "RESOLVED" : "ACTIVE";
      doc.setFillColor(inc.solved ? 232 : 255, inc.solved ? 245 : 243, inc.solved ? 233 : 224);
      doc.roundedRect(x + pageWidth / 2 - 45, y + 22, 20, 5, 1, 1, 'F');
      doc.setTextColor(inc.solved ? 46 : 230, inc.solved ? 125 : 81, inc.solved ? 50 : 0);
      doc.setFontSize(6);
      doc.text(status, x + pageWidth / 2 - 35, y + 25.5, { align: 'center' });
    });

    // --- SECTION 03 & 04 ---
    const bottomY = finalY + 100;
    doc.setTextColor(198, 69, 24);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("03  COMMUNITY PARTICIPATION", 15, bottomY);
    doc.text("04  EDITOR'S NOTE", pageWidth / 2 + 5, bottomY);
    doc.setDrawColor(230, 230, 230);
    doc.line(15, bottomY + 3, pageWidth - 15, bottomY + 3);

    // Progress Bars
    doc.setTextColor(10, 22, 40);
    doc.setFontSize(8);
    doc.text("Reports submitted", 15, bottomY + 10);
    doc.text(String(stats.reportsSubmitted), pageWidth / 2 - 20, bottomY + 10, { align: "right" });
    doc.setFillColor(10, 22, 40);
    doc.roundedRect(15, bottomY + 12, pageWidth / 2 - 35, 3, 1.5, 1.5, 'F');

    doc.text("Verified reports", 15, bottomY + 22);
    doc.text(String(stats.solvedCount), pageWidth / 2 - 20, bottomY + 22, { align: "right" });
    doc.setFillColor(46, 125, 50);
    doc.roundedRect(15, bottomY + 24, (stats.solvedCount / (stats.reportsSubmitted || 1)) * (pageWidth / 2 - 35), 3, 1.5, 1.5, 'F');

    // Editorial Box
    doc.setFillColor(229, 57, 53);
    doc.rect(pageWidth / 2 + 5, bottomY + 8, pageWidth / 2 - 20, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text("FOOGAN EDITORIAL — WEEK 12", pageWidth / 2 + 8, bottomY + 12);
    
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const topDistrict = stats.districtStats[0];
    const editorial = topDistrict && topDistrict.count > 0 
      ? `${topDistrict.name} district recorded ${topDistrict.count} incidents this week — a ${Math.abs(((topDistrict.count - topDistrict.prevCount) / (topDistrict.prevCount || 1)) * 100).toFixed(0)}% ${topDistrict.count > topDistrict.prevCount ? 'increase' : 'decrease'} from last week. This data highlights a critical need for targeted intervention in the northern sectors.`
      : "Safety levels remained stable across all monitored districts this week. Community reporting remains high, and resolution rates are within expected parameters. No critical clusters were identified in the last 7 days.";
    doc.text(editorial, pageWidth / 2 + 5, bottomY + 20, { maxWidth: pageWidth / 2 - 20 });

    // --- FOOTER ---
    doc.setFillColor(10, 22, 40);
    doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Foogan  ·  Ka feejigan qataraha", 15, pageHeight - 7);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(`Data sourced from ${stats.reportsSubmitted} citizen reports  ·  18 districts monitored  ·  foogan.so`, pageWidth / 2, pageHeight - 7, { align: "center" });
    
    doc.setFontSize(7);
    doc.text(`Vol. 1, Issue 12  ·  ${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString()} - ${new Date().toLocaleDateString()}`, pageWidth - 15, pageHeight - 7, { align: "right" });

    doc.save(`Foogan_Weekly_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #EEECEA", marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0A1628", marginBottom: 8 }}>Weekly Performance Summary</div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>Last 7 days data analysis for all 18 districts.</div>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "#F5F4F0", padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 4 }}>TOTAL INCIDENTS</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0A1628" }}>{stats.totalIncidents}</div>
          </div>
          <div style={{ background: "#F5F4F0", padding: 16, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, marginBottom: 4 }}>RESOLUTION RATE</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#43A047" }}>{stats.resRate.toFixed(1)}%</div>
          </div>
        </div>

        <button 
          onClick={downloadPDF}
          style={{ 
            width: "100%", background: "#E8C547", color: "#0A1628", border: "none", 
            borderRadius: 12, padding: "16px", fontSize: 14, fontWeight: 900, 
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          DOWNLOAD PDF REPORT
        </button>
      </div>

      <div style={{ background: "#0A1628", borderRadius: 16, padding: 20, color: "#fff" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#E8C547", marginBottom: 12 }}>DISTRICT RANKING (TOP 5)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stats.districtStats.slice(0, 5).map((d, i) => (
            <div key={d.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}. {d.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{d.active} active cases</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: d.risk === 'critical' ? '#E53935' : '#fff' }}>{d.count}</div>
                <div style={{ fontSize: 10, color: d.trend === 'worsening' ? '#E53935' : '#43A047' }}>
                  {d.trend === 'worsening' ? '▲ worsening' : '▼ improving'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
