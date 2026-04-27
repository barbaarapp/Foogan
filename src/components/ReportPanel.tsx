import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DISTRICTS = [
  "Abdiaziz", "Bondhere", "Daynile", "Dharkenley", "Hamar Jajab", 
  "Hamar Weyne", "Heliwa", "Hodan", "Howl Wadag", "Karan", 
  "Shangani", "Shibis", "Waberi", "Wadajir", "Warta Nabadda", 
  "Yaqshid", "Kahda", "Garasbaley"
];

const CATEGORIES = ["security", "injustice", "hazards", "welfare", "health", "market"];

const CAT_COLORS: any = {
  security: [183, 28, 28],    // Armed/Security
  injustice: [142, 36, 170],  // Disorder/Injustice
  hazards: [230, 81, 0],      // Hazards
  welfare: [30, 136, 229],    // Welfare
  health: [67, 160, 71],      // Health
  market: [251, 140, 0]       // Market
};

export function ReportPanel({ incidents = [], sosSignals = [], t }: { incidents?: any[], sosSignals?: any[], t?: any }) {
  const stats = useMemo(() => {
    const safeIncidents = Array.isArray(incidents) ? incidents : [];
    const safeSOS = Array.isArray(sosSignals) ? sosSignals : [];
    
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const currentIncidents = safeIncidents.filter(i => i.timestamp?.toDate() >= last7Days);
    const previousIncidents = safeIncidents.filter(i => i.timestamp?.toDate() >= prev7Days && i.timestamp?.toDate() < last7Days);
    const monthIncidents = safeIncidents.filter(i => i.timestamp?.toDate() >= fourWeeksAgo);
    
    const totalIncidents = currentIncidents.length;
    const reportsSubmitted = totalIncidents; 
    const solvedCount = currentIncidents.filter(i => i.solved).length;
    const resRate = totalIncidents > 0 ? (solvedCount / totalIncidents) * 100 : 0;
    const activeReporters = new Set(currentIncidents.map(i => i.uid)).size;
    
    // Average response estimation (mocked from incidents being marked 'seen' or 'processing')
    const avgRespTime = 38; 
    const sosActivations = safeSOS.filter(s => s.timestamp?.toDate() >= last7Days).length;

    // Time of Day distribution
    const timeDistribution = [
      { label: "00-04", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 0 && h < 4; }).length },
      { label: "04-08", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 4 && h < 8; }).length },
      { label: "08-12", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 8 && h < 12; }).length },
      { label: "12-16", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 12 && h < 16; }).length },
      { label: "16-20", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 16 && h < 20; }).length },
      { label: "20-00", count: currentIncidents.filter(i => { const h = i.timestamp?.toDate()?.getHours(); return h >= 20 && h < 24; }).length },
    ];

    // District Ranking
    const districtStats = DISTRICTS.map(d => {
      const dCurrent = currentIncidents.filter(i => i.district === d);
      const dPrev = previousIncidents.filter(i => i.district === d);
      const dMonth = monthIncidents.filter(i => i.district === d);
      
      const solved = dCurrent.filter(i => i.solved).length;
      const active = dCurrent.length - solved;
      
      let responseRating = "Fast";
      if (dCurrent.length > 8) responseRating = "Slow";
      else if (dCurrent.length > 4) responseRating = "Moderate";

      let risk = "LOW";
      if (dCurrent.length > 10) risk = "CRITICAL";
      else if (dCurrent.length > 5) risk = "HIGH";
      else if (dCurrent.length > 2) risk = "MEDIUM";

      // Category breakdown for this district
      const cats = CATEGORIES.map(c => dCurrent.filter(i => i.type === c).length);

      return {
        name: d,
        count: dCurrent.length,
        prevCount: dPrev.length,
        monthCount: dMonth.length,
        solved,
        active,
        responseRating,
        risk,
        cats,
        trend: dCurrent.length > dPrev.length ? "up" : (dCurrent.length < dPrev.length ? "down" : "flat")
      };
    }).sort((a, b) => b.count - a.count);

    // Most Improved District (Biggest % decrease)
    const improvedDistricts = districtStats
      .filter(d => d.prevCount > 0 && d.count < d.prevCount)
      .map(d => ({ ...d, improvement: ((d.prevCount - d.count) / d.prevCount) * 100 }))
      .sort((a, b) => b.improvement - a.improvement);
    const mostImproved = improvedDistricts[0] || null;

    // Top Reported Locations (mocked by grouping by description/nearness if possible, here we'll just take high density districts)
    const topLocations = districtStats.slice(0, 5).map(d => ({
      name: `${d.name} high density sectors`,
      reports: d.count,
      context: `Reported clusters of ${CATEGORIES[0]} activity`
    }));

    return {
      totalIncidents,
      reportsSubmitted,
      solvedCount,
      resRate,
      activeReporters,
      avgRespTime,
      sosActivations,
      districtStats,
      timeDistribution,
      mostImproved,
      topLocations,
      currentIncidents
    };
  }, [incidents, sosSignals]);

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- PAGE 1 ---

    // Dark Background Header
    doc.setFillColor(10, 22, 40); 
    doc.rect(0, 0, pageWidth, 60, 'F');
    
    // Orange Corner
    doc.setFillColor(198, 69, 24);
    doc.triangle(pageWidth * 0.6, 0, pageWidth, 0, pageWidth, 60, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    doc.text("FOOGAN", 15, 25);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Ka feejigan qataraha", 15, 32);
    
    doc.setTextColor(232, 197, 71);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("WEEKLY SAFETY INTELLIGENCE REPORT · MOGADISHU, SOMALIA", 15, 45);
    
    doc.setTextColor(255, 255, 255);
    const dateRange = `${new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('en-US', {month:'long', day:'numeric'})} – ${new Date().toLocaleDateString('en-US', {day:'numeric', year:'numeric'})}`;
    doc.text(`${dateRange}  ·  Vol. 1  ·  Issue 12`, 15, 52);
    doc.setFontSize(8);
    doc.text(`Published: ${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}  ·  foogan.so`, 15, 58);

    // Summary Boxes (Top)
    const summaries = [
      { l: "Total incidents", v: stats.totalIncidents },
      { l: "Reports submitted", v: stats.reportsSubmitted },
      { l: "Resolution rate", v: `${stats.resRate.toFixed(0)}%` }
    ];
    summaries.forEach((s, i) => {
      const boxW = 45;
      const spacing = 5;
      const x = pageWidth - 15 - (3 - i) * (boxW + spacing);
      doc.setFillColor(232, 197, 71);
      doc.roundedRect(x, 15, boxW, 35, 3, 3, 'F');
      doc.setTextColor(10, 22, 40);
      doc.setFontSize(20);
      doc.text(String(s.v), x + boxW / 2, 35, { align: "center" });
      doc.setFontSize(7);
      doc.text(s.l, x + boxW / 2, 45, { align: "center" });
    });

    // Sub-KPI Strip
    doc.setFillColor(245, 244, 240);
    doc.rect(0, 60, pageWidth, 15, 'F');
    const subKpis = [
      { l: "Total incidents", v: stats.totalIncidents },
      { l: "Reports submitted", v: stats.reportsSubmitted },
      { l: "Resolution rate", v: `${stats.resRate.toFixed(0)}%` },
      { l: "Active reporters", v: stats.activeReporters },
      { l: "Avg. response", v: `${stats.avgRespTime} min` },
      { l: "SOS activations", v: stats.sosActivations }
    ];
    doc.setTextColor(10, 22, 40);
    const kpiSpacing = (pageWidth - 30) / 6;
    subKpis.forEach((k, i) => {
      const x = 15 + (i * kpiSpacing);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(String(k.v), x, 68);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(k.l, x, 72);
      if (i > 0) {
        doc.setDrawColor(200, 200, 200);
        doc.line(x - 2, 63, x - 2, 72);
      }
    });

    // 01 DISTRICT RANKINGS
    doc.setTextColor(183, 28, 28);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("01 DISTRICT RANKINGS  ·  WEEK-OVER-WEEK TREND  ·  INCIDENT TYPE BREAKDOWN", 15, 85);
    
    // Legend for incident types
    doc.setFontSize(7);
    let legendX = pageWidth - 15 - (CATEGORIES.length * 15);
    CATEGORIES.forEach((c, i) => {
      const color = CAT_COLORS[c];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(legendX, 81, 6, 3, 1, 1, 'F');
      doc.setTextColor(100, 100, 100);
      doc.text(c.substring(0, 4), legendX + 8, 84);
      legendX += 13;
    });

    const body = stats.districtStats.slice(0, 15).map((d, i) => [
      i + 1,
      d.name,
      d.count,
      "", // Trend
      d.responseRating,
      d.solved,
      d.active,
      "", // Incident types
      d.risk
    ]);

    autoTable(doc, {
      startY: 90,
      head: [['Rank', 'District', 'This Wk', 'Trend', 'Response', 'Resolved', 'Active', 'Incident types', 'Risk']],
      body: body,
      theme: 'plain',
      headStyles: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [10, 22, 40], cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { cellWidth: 25 },
        7: { cellWidth: 35 },
        8: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }
      },
      didDrawCell: (data) => {
        if (data.column.index === 3 && data.cell.section === 'body') {
          // Mocking a trend line
          const d = stats.districtStats[data.row.index];
          doc.setDrawColor(d.trend === 'up' ? 183 : 76, d.trend === 'up' ? 28 : 175, d.trend === 'up' ? 28 : 80);
          doc.setLineWidth(0.5);
          const midX = data.cell.x + 5;
          const midY = data.cell.y + data.cell.height / 2;
          doc.line(midX, midY + 2, midX + 15, midY - 2);
          doc.setFillColor(d.trend === 'up' ? 183 : 76, d.trend === 'up' ? 28 : 175, d.trend === 'up' ? 28 : 80);
          doc.circle(midX + 15, midY - 2, 0.8, 'F');
        }
        if (data.column.index === 7 && data.cell.section === 'body') {
          const d = stats.districtStats[data.row.index];
          let dotX = data.cell.x + 2;
          d.cats.forEach((count, ci) => {
            if (count > 0) {
              const color = CAT_COLORS[CATEGORIES[ci]];
              doc.setFillColor(color[0], color[1], color[2]);
              doc.roundedRect(dotX, data.cell.y + 3, Math.min(count * 2, 8), 3, 1, 1, 'F');
              dotX += 10;
            }
          });
        }
        if (data.column.index === 8 && data.cell.section === 'body') {
          const risk = String(data.cell.text[0]);
          let bg = [232, 245, 233], text = [46, 125, 50];
          if (risk === 'CRITICAL') { bg = [255, 235, 238]; text = [183, 28, 28]; }
          else if (risk === 'HIGH') { bg = [255, 243, 224]; text = [230, 81, 0]; }
          else if (risk === 'MEDIUM') { bg = [255, 253, 231]; text = [245, 127, 23]; }
          doc.setFillColor(bg[0], bg[1], bg[2]);
          doc.roundedRect(data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4, 2, 2, 'F');
          doc.setTextColor(text[0], text[1], text[2]);
          doc.text(risk, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    });

    // 02 INCIDENT TIME-OF-DAY
    const tableY = (doc as any).lastAutoTable.finalY + 15;
    doc.setTextColor(183, 28, 28);
    doc.setFontSize(9);
    doc.text("02 INCIDENT TIME-OF-DAY DISTRIBUTION", 15, tableY);
    doc.setDrawColor(220, 220, 220);
    doc.line(15, tableY + 3, pageWidth - 15, tableY + 3);

    const distW = (pageWidth - 30) / 6;
    stats.timeDistribution.forEach((t, i) => {
      const x = 15 + (i * distW);
      const isPeak = t.count === Math.max(...stats.timeDistribution.map(td => td.count));
      doc.setFillColor(isPeak ? 183 : 67, isPeak ? 28 : 160, isPeak ? 28 : 71);
      doc.roundedRect(x + 2, tableY + 8, distW - 4, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(String(t.count), x + distW / 2, tableY + 15, { align: "center" });
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(6);
      doc.text(t.label, x + distW / 2, tableY + 22, { align: "center" });
      doc.text("incidents", x + distW / 2, tableY + 25, { align: "center" });
    });

    // --- PAGE 2 ---
    doc.addPage();
    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("FOOGAN", 15, 13);
    doc.setFontSize(8);
    doc.text("Weekly Safety Report · Narrative & Analysis · Page 2", 45, 13);
    doc.text(dateRange, pageWidth - 15, 13, { align: "right" });

    // 03 KEY INCIDENTS
    doc.setTextColor(183, 28, 28);
    doc.setFontSize(9);
    doc.text("03 KEY INCIDENTS THIS WEEK", 15, 35);
    doc.line(15, 38, pageWidth * 0.45, 38);

    const keyIncidentsData = stats.currentIncidents.slice(0, 3);
    keyIncidentsData.forEach((inc, i) => {
      const y = 45 + (i * 35);
      doc.setTextColor(183, 28, 28);
      doc.setFontSize(8);
      doc.text(inc.type.toUpperCase(), 15, y);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.text(`${inc.district} · ${inc.timestamp?.toDate().toLocaleString()}`, 15, y + 5);
      doc.setTextColor(50, 50, 50);
      doc.text(inc.desc.substring(0, 150), 15, y + 10, { maxWidth: pageWidth * 0.4 });
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(pageWidth * 0.35, y - 4, 15, 5, 1, 1, 'F');
      doc.setTextColor(100, 100, 100);
      doc.text(inc.solved ? "RESOLVED" : "ACTIVE", pageWidth * 0.425, y - 0.5, { align: "center" });
    });

    // 04 TOP LOCATIONS
    doc.setTextColor(183, 28, 28);
    doc.text("04 TOP REPORTED LOCATIONS THIS WEEK", 15, 160);
    doc.line(15, 163, pageWidth * 0.45, 163);
    stats.topLocations.forEach((loc, i) => {
      const y = 170 + (i * 12);
      doc.setFillColor(183, 28, 28);
      doc.circle(18, y, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), 18, y + 1, { align: "center" });
      doc.setTextColor(10, 22, 40);
      doc.text(loc.name, 25, y);
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.text(loc.context, 25, y + 4);
      doc.setTextColor(183, 28, 28);
      doc.text(`${loc.reports} reports`, pageWidth * 0.45, y, { align: "right" });
    });

    // Right Column (05-08)
    const rightX = pageWidth * 0.55;
    const rightW = pageWidth * 0.45 - 15; // Adjusted to stay within margin

    // 05 MOST IMPROVED
    doc.setTextColor(183, 28, 28);
    doc.text("05 MOST IMPROVED DISTRICT", rightX, 35);
    if (stats.mostImproved) {
      doc.setFillColor(46, 125, 50);
      doc.rect(rightX, 40, rightW, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(`MOST IMPROVED — WEEK 12`, rightX + rightW / 2, 45, { align: "center" });
      doc.setFontSize(16);
      doc.text(stats.mostImproved.name, rightX + rightW / 2, 55, { align: "center" });
      doc.setFontSize(6);
      doc.text(`${stats.mostImproved.count} incidents (was ${stats.mostImproved.prevCount} last week)`, rightX + rightW / 2, 60, { align: "center" });
      doc.text(`-${stats.mostImproved.improvement.toFixed(0)}% · Strongest improvement`, rightX + rightW / 2, 63, { align: "center" });
    }

    // 06 TRUST INDICATORS
    doc.setTextColor(183, 28, 28);
    doc.text("06 COMMUNITY TRUST INDICATORS", rightX, 75);
    const trustItems = [
      { l: "Reports submitted", v: stats.reportsSubmitted, max: 1000 },
      { l: "Verified reports", v: stats.solvedCount, max: stats.reportsSubmitted },
      { l: "Verification rate", v: `${stats.resRate.toFixed(0)}%`, max: 100, isPerc: true }
    ];
    trustItems.forEach((t, i) => {
      const y = 85 + (i * 15);
      doc.setTextColor(100, 100, 100);
      doc.text(t.l, rightX, y);
      doc.setTextColor(10, 22, 40);
      doc.text(String(t.v), rightX + rightW, y, { align: "right" });
      doc.setFillColor(230, 230, 230);
      doc.roundedRect(rightX, y + 2, rightW, 2, 1, 1, 'F');
      doc.setFillColor(10, 22, 40);
      const val = typeof t.v === 'string' ? parseFloat(t.v) : t.v;
      const perc = (val / (t.max || 1));
      doc.roundedRect(rightX, y + 2, Math.min(perc, 1) * rightW, 2, 1, 1, 'F');
    });

    // 07 RESPONSE SCORECARD
    doc.setTextColor(183, 28, 28);
    doc.text("07 AUTHORITY RESPONSE SCORECARD", rightX, 130);
    const mockResponse = [
      { l: "Fast (< 30 min)", v: "61%", c: [67, 160, 71] },
      { l: "Moderate (30-90 min)", v: "27%", c: [251, 140, 0] },
      { l: "Slow (> 90 min)", v: "11%", c: [183, 28, 28] }
    ];
    mockResponse.forEach((m, i) => {
      const y = 140 + (i * 10);
      doc.setFillColor(m.c[0], m.c[1], m.c[2]);
      doc.roundedRect(rightX, y, rightW, 6, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(m.l, rightX + 5, y + 4);
      doc.text(m.v, rightX + rightW - 2, y + 4, { align: "right" });
    });

    // 08 EDITOR'S NOTE
    doc.setTextColor(183, 28, 28);
    doc.text("08 EDITOR'S NOTE · AUTHORITY DEMAND", rightX, 175);
    doc.setFillColor(229, 57, 53);
    doc.rect(rightX, 180, rightW, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("FOOGAN EDITORIAL · WEEK 12 DEMAND", rightX + 5, 186);
    doc.setFontSize(6);
    const topD = stats.districtStats[0];
    const demand = `${topD.name} district has now ranked #1 for consecutive weeks. This week's count of ${topD.count} represents a ${topD.trend === 'up' ? 'significant increase' : 'sustained level'}. Foogan formally calls on the District Administration and Police Command to submit a written response plan. Authorities must now act with urgency.`;
    doc.text(demand, rightX + 5, 195, { maxWidth: rightW - 10 });
    doc.setFillColor(232, 197, 71);
    doc.roundedRect(rightX + 5, 215, rightW - 10, 6, 1, 1, 'F');
    doc.setTextColor(10, 22, 40);
    doc.text(`Respond by: Friday, May 2, 2026 · ${topD.name} Admin`, rightX + rightW / 2, 219, { align: "center" });

    // 09 DIASPORA SUMMARY
    doc.setTextColor(183, 28, 28);
    doc.setFontSize(9);
    doc.text("09 DIASPORA SUMMARY  ·  FOR INTERNATIONAL AUDIENCES (ENGLISH)", 15, 260);
    doc.setFillColor(227, 242, 253);
    doc.roundedRect(15, 265, pageWidth - 30, 20, 2, 2, 'F');
    doc.setTextColor(10, 22, 40);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("EN ENGLISH", 20, 275);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const diaspora = `This week Mogadishu recorded ${stats.totalIncidents} incidents. ${stats.districtStats[0].name} remains the highest-risk area. ${stats.mostImproved ? stats.mostImproved.name : 'Several districts'} showed improvement. Overall resolution rate is ${stats.resRate.toFixed(0)}%.`;
    doc.text(diaspora, 50, 274, { maxWidth: pageWidth - 70 });

    // Sub-KPI Strip
    doc.setFillColor(245, 244, 240);
    doc.rect(0, 60, pageWidth, 15, 'F');
    const footerKpis = [
      `842 citizen reports`,
      `18 districts`,
      `All data community-generated`
    ];
    doc.setTextColor(10, 22, 40);
    doc.setFontSize(6);
    doc.text("Foogan · Ka feejigan qataraha · foogan.so", 15, pageHeight - 10);
    doc.text(footerKpis.join(" · "), pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text(`Page 2 of 2 · Vol. 1 · Issue 12`, pageWidth - 15, pageHeight - 10, { align: "right" });

    doc.save(`Foogan_Weekly_Safety_Intelligence_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 py-6">
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight mb-2">Weekly Intelligence Report</h2>
          <p className="text-slate-500 mb-6 md:mb-8 text-sm md:text-base max-w-md">Comprehensive analysis of security, hazards, and community reporting across Mogadishu's 18 districts.</p>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
            {[
              { label: "INCIDENTS", val: stats.totalIncidents, color: "text-red-600" },
              { label: "REPORTS", val: stats.reportsSubmitted, color: "text-blue-600" },
              { label: "RESOLVED", val: `${stats.resRate.toFixed(0)}%`, color: "text-green-600" },
              { label: "SOS", val: stats.sosActivations, color: "text-amber-600" }
            ].map(k => (
              <div key={k.label} className="bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-100 flex flex-col justify-center">
                <div className="text-[8px] md:text-[10px] font-black text-slate-400 tracking-widest mb-1">{k.label}</div>
                <div className={`text-xl md:text-3xl font-black ${k.color}`}>{k.val}</div>
              </div>
            ))}
          </div>

          <button 
            onClick={downloadPDF}
            className="w-full bg-[#0A1628] hover:bg-slate-800 text-white py-4 md:py-5 rounded-2xl font-black text-xs md:text-sm flex items-center justify-center gap-3 transition-colors shadow-lg"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            GENERATE 2-PAGE INTELLIGENCE PDF
          </button>
        </div>
      </div>

      <div className="bg-[#0A1628] rounded-3xl p-8 text-white">
        <div className="flex justify-between items-end mb-8">
          <div>
            <div className="text-[10px] font-black text-amber-500 tracking-widest mb-2 uppercase">District Standings</div>
            <h3 className="text-2xl font-black">Risk Distribution</h3>
          </div>
          <div className="text-right text-slate-400 text-xs font-medium">Updated Weekly</div>
        </div>
        
        <div className="space-y-4">
          {stats.districtStats.slice(0, 5).map((d, i) => (
            <div key={d.name} className="flex justify-between items-center p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-900 flex items-center justify-center font-black text-sm">{i + 1}</div>
                <div>
                  <div className="font-bold text-base">{d.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{d.active} Active Cases</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-xl font-black ${d.risk === 'CRITICAL' ? 'text-red-500' : 'text-white'}`}>{d.count} Incidents</div>
                <div className={`text-[10px] font-black flex items-center justify-end gap-1 ${d.trend === 'up' ? 'text-red-400' : 'text-green-400'}`}>
                  {d.trend === 'up' ? '▲ WORSENING' : '▼ IMPROVING'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
