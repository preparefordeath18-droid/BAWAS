// Check authentication
if (!sessionStorage.getItem('currentUser') || sessionStorage.getItem('userType') !== 'resident') {
    window.location.href = 'index.html';
}

let selectedBarangay = sessionStorage.getItem('selectedBarangay');
let selectedIssueType = '';

// Format date to 12-hour AM/PM
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });
}

window.onload = function() {
    if (selectedBarangay) {
        document.getElementById('barangaySelector').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('currentBarangay').textContent = '📍 ' + selectedBarangay;
        loadDashboard();
        updateAnnouncementBadge();
    }
    const fileInput = document.getElementById('reportPhoto');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            document.getElementById('fileName').textContent = this.files[0] ? this.files[0].name : 'No file chosen';
        });
    }
};

function selectBarangay() {
    const barangay = document.getElementById('barangaySelect').value;
    if (!barangay) { alert('Please select a barangay'); return; }
    selectedBarangay = barangay;
    sessionStorage.setItem('selectedBarangay', barangay);
    document.getElementById('barangaySelector').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('currentBarangay').textContent = '📍 ' + barangay;
    loadDashboard();
    updateAnnouncementBadge();
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'reports') loadReports();
    if (sectionId === 'schedules') loadSchedules();
    if (sectionId === 'analytics') loadAnalytics();
}

// ── Dashboard ──────────────────────────────────────────────────

function loadDashboard() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayReports = data.reports.filter(r => r.barangay === selectedBarangay);
    const barangaySchedules = data.schedules.filter(s => s.barangay === selectedBarangay);
    const pendingReports = barangayReports.filter(r => r.status === 'pending');

    const barangayWasteRecords = (data.wasteRecords || []).filter(w => w.barangay === selectedBarangay);
    const totalWaste = barangayWasteRecords.reduce((sum, r) =>
        sum + parseFloat(r.biodegradable||0) + parseFloat(r.nonBiodegradable||0) + parseFloat(r.recyclable||0), 0);
    const totalRecyclable = barangayWasteRecords.reduce((sum, r) => sum + parseFloat(r.recyclable||0), 0);
    const recyclingRate = totalWaste > 0 ? Math.round((totalRecyclable / totalWaste) * 100) : 0;

    document.getElementById('totalWaste').textContent = Math.round(totalWaste);
    document.getElementById('upcomingSchedules').textContent = barangaySchedules.length;
    document.getElementById('pendingReports').textContent = pendingReports.length;
    document.getElementById('recyclingRate').textContent = recyclingRate;

    const dashboardSchedules = document.getElementById('dashboardSchedules');
    const now = new Date();

    if (barangaySchedules.length === 0) {
        dashboardSchedules.innerHTML = '<div style="background:rgba(255,255,255,0.9);padding:12px;border-radius:8px;text-align:center;color:#999;font-size:13px;">No schedules yet</div>';
    } else {
        dashboardSchedules.innerHTML = barangaySchedules.slice(0, 3).map(s => {
            let statusClass = 'upcoming';
            let statusText = s.time ? '🕐 ' + formatTime(s.time) : '';
            if (s.time) {
                const scheduledDT = new Date(s.date + 'T' + s.time);
                const hoursAfter = (now - scheduledDT) / 3600000;
                if (hoursAfter >= 0 && hoursAfter <= 3) {
                    statusClass = 'active-now';
                    statusText = '🟢 Collection happening now!';
                }
            }
            return `<div class="schedule-item ${statusClass}" onclick="showSection('schedules')">
                <div>
                    <div style="font-size:13px;font-weight:600;color:#333;">${s.date} — ${s.purok}</div>
                    <div class="sched-status">${statusText}</div>
                </div>
                <span style="color:#aaa;font-size:16px;">›</span>
            </div>`;
        }).join('');
    }

    const alertsList = document.getElementById('alertsList');
    alertsList.innerHTML = pendingReports.length === 0
        ? '<div style="padding:16px; text-align:center; color:#bbb; font-size:13px;">✅ No pending alerts</div>'
        : `<div class="alerts-header">
                <h3>⚠️ Pending Alerts (${pendingReports.length})</h3>
                <a onclick="showSection('reports')">View all →</a>
           </div>` +
          pendingReports.slice(0, 5).map(report => `
            <div class="alert-item" onclick="openReportDetail('${report.id}')">
                <div class="alert-icon">${report.earlyCollection ? '🚛' : '⚠️'}</div>
                <div class="alert-content">
                    <strong>${report.issueType}${report.earlyCollection ? ' <span style="background:#e3f2fd;color:#1565C0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;">⚡ Early</span>' : ''}</strong>
                    <p>${report.purok} · ${getTimeAgo(report.timestamp)}</p>
                </div>
                <div class="alert-arrow">›</div>
            </div>`).join('');
}

// ── Reports ────────────────────────────────────────────────────

function loadReports() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayReports = data.reports.filter(r => r.barangay === selectedBarangay);
    renderReports(barangayReports);
}

function filterReports() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const search = document.getElementById('reportSearch').value.toLowerCase();
    const filter = document.getElementById('reportFilter').value;
    let reports = data.reports.filter(r => r.barangay === selectedBarangay);
    if (filter !== 'all') reports = reports.filter(r => r.status === filter);
    if (search) reports = reports.filter(r =>
        r.issueType.toLowerCase().includes(search) ||
        r.purok.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search)
    );
    renderReports(reports);
}

function renderReports(reports) {
    const list = document.getElementById('reportsList');
    const countEl = document.getElementById('reportsCount');
    if (countEl) countEl.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;

    if (reports.length === 0) {
        list.innerHTML = '<div class="no-reports">📋 No reports found</div>';
        return;
    }

    list.innerHTML = reports.sort((a, b) => b.timestamp - a.timestamp).map(report => `
        <div class="report-row ${report.status}" onclick="openReportDetail('${report.id}')">
            <div class="report-row-icon">${report.earlyCollection ? '🚛' : '🗑️'}</div>
            <div class="report-row-main">
                <h4>${report.issueType} ${report.earlyCollection ? '<span style="background:#e3f2fd;color:#1565C0;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;">⚡ Early Collection</span>' : ''}</h4>
                <p>${report.description}</p>
            </div>
            <div class="report-row-purok">${report.purok}</div>
            <div class="report-row-time">${getTimeAgo(report.timestamp)}</div>
            <div class="report-row-actions">
                <span class="status-badge ${report.status}">${report.status}</span>
            </div>
        </div>
    `).join('');
}

function openReportDetail(reportId) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const report = data.reports.find(r => r.id === reportId);
    if (!report) return;

    document.getElementById('detailTitle').textContent = report.issueType +
        (report.earlyCollection ? ' ⚡' : '');

    document.getElementById('reportDetailBody').innerHTML = `
        <div class="report-detail-status-bar">
            <span class="status-badge ${report.status}">${report.status.toUpperCase()}</span>
            ${report.earlyCollection ? '<span style="background:#e3f2fd;color:#1565C0;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;">⚡ Early Collection Request</span>' : ''}
            <span style="font-size:13px;color:#888;">Submitted ${formatDate(report.timestamp)}</span>
        </div>

        ${report.earlyCollection ? `
        <div style="background:#e3f2fd;border-radius:10px;padding:14px 16px;margin-bottom:16px;border-left:4px solid #1565C0;">
            <p style="font-weight:700;color:#1565C0;margin-bottom:6px;">⚡ Early Collection Details</p>
            <p style="font-size:13px;color:#333;margin:3px 0;">🛍️ <strong>${report.bagCount} bags</strong> requested</p>
            <p style="font-size:13px;color:#333;margin:3px 0;">💳 Total Fee: <strong style="color:#9C27B0;">₱${report.totalFee}</strong></p>
            <p style="font-size:12px;color:#888;margin-top:6px;">Payment is being verified by the barangay admin.</p>
        </div>` : ''}

        <div class="report-detail-grid">
            <div class="report-detail-field">
                <label>👤 Submitted By</label>
                <p>${report.submittedBy}</p>
            </div>
            <div class="report-detail-field">
                <label>📍 Location</label>
                <p>${report.purok}, ${report.barangay}</p>
            </div>
            <div class="report-detail-field">
                <label>🗑️ Issue Type</label>
                <p>${report.issueType}</p>
            </div>
            <div class="report-detail-field">
                <label>♻️ Waste Type</label>
                <p>${report.wasteType}</p>
            </div>
        </div>

        <div class="report-detail-desc">
            <label>📝 Description</label>
            <p>${report.description}</p>
        </div>

        ${report.photo ? `
        <div class="report-detail-photo">
            <label>📷 Photo</label>
            <img src="${report.photo}" alt="Report photo" onclick="openLightbox('${report.photo}')">
        </div>` : ''}

        <div class="report-detail-actions">
            <button class="btn-close-detail" onclick="closeReportDetailBtn()">Close</button>
        </div>
    `;

    document.getElementById('reportDetailModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeReportDetail(e) {
    if (e.target === document.getElementById('reportDetailModal')) {
        closeReportDetailBtn();
    }
}

function closeReportDetailBtn() {
    document.getElementById('reportDetailModal').classList.remove('open');
    document.body.style.overflow = '';
}

// ── Schedules ──────────────────────────────────────────────────

function loadSchedules() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangaySchedules = data.schedules.filter(s => s.barangay === selectedBarangay);
    const schedulesList = document.getElementById('schedulesList');
    const now = new Date();

    schedulesList.innerHTML = barangaySchedules.length === 0
        ? '<p style="text-align:center;padding:40px;color:#999;">No schedules available yet</p>'
        : barangaySchedules.map(schedule => {
            let statusBadge = '';
            if (schedule.time) {
                const scheduledDT = new Date(schedule.date + 'T' + schedule.time);
                const hoursAfter = (now - scheduledDT) / 3600000;
                if (hoursAfter >= 0 && hoursAfter <= 3) {
                    statusBadge = '<span style="background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-left:8px;">🟢 Active Now</span>';
                }
            }
            return `
            <div class="report-card">
                <div class="report-icon">📅</div>
                <div class="report-content">
                    <h3>${schedule.purok} ${statusBadge}</h3>
                    <p>📆 <strong>${schedule.date}</strong> &nbsp;|&nbsp; 🕐 <strong>${formatTime(schedule.time) || 'No time set'}</strong></p>
                </div>
                <div class="report-arrow">›</div>
            </div>`;
        }).join('');
}

// ── Analytics ──────────────────────────────────────────────────

function loadAnalytics() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayReports = data.reports.filter(r => r.barangay === selectedBarangay);
    const barangayWasteRecords = (data.wasteRecords || []).filter(w => w.barangay === selectedBarangay);

    let totalBio = 0, totalNonBio = 0, totalRec = 0;
    barangayWasteRecords.forEach(record => {
        totalBio += parseFloat(record.biodegradable||0);
        totalNonBio += parseFloat(record.nonBiodegradable||0);
        totalRec += parseFloat(record.recyclable||0);
    });

    const totalWaste = totalBio + totalNonBio + totalRec;
    const recyclingRate = totalWaste > 0 ? Math.round((totalRec / totalWaste) * 100) : 0;

    // ── Live Collection Efficiency ──
    const now = new Date();
    const barangaySchedules = data.schedules ? data.schedules.filter(s => s.barangay === selectedBarangay) : [];
    const pastSchedules = barangaySchedules.filter(s => new Date(s.date + 'T' + (s.time || '23:59')) <= now);
    let onTime = 0, delayed = 0, missed = 0;
    pastSchedules.forEach(schedule => {
        const scheduledDT = new Date(schedule.date + 'T' + (schedule.time || '23:59'));
        const record = barangayWasteRecords.find(r => r.date === schedule.date);
        if (record) {
            const hoursAfter = (new Date(record.timestamp) - scheduledDT) / 3600000;
            if (hoursAfter <= 3) onTime++;   // within 3-hr window = on time
            else delayed++;                   // after 3 hrs but same day = delayed
        } else {
            const nextDay = new Date(scheduledDT);
            nextDay.setDate(nextDay.getDate() + 1);
            if (now >= nextDay) missed++;     // next day passed, no record = missed
        }
    });
    const totalPast = pastSchedules.length;
    const collectionEfficiency = totalPast > 0 ? Math.round((onTime / totalPast) * 100) : 0;

    document.getElementById('monthlyWaste').textContent = Math.round(totalWaste).toLocaleString();
    document.getElementById('analyticsRecycling').textContent = recyclingRate;
    document.getElementById('collectionEfficiency').textContent = collectionEfficiency;
    const effLabel = document.getElementById('efficiencyLabel');
    if (effLabel) {
        effLabel.innerHTML = totalPast === 0
            ? '% — No past schedules yet'
            : `% &nbsp;|&nbsp; ✅ ${onTime} On Time &nbsp; ⚠️ ${delayed} Delayed &nbsp; ❌ ${missed} Missed`;
    }

    // ── Trend Banner ──
    const trendBanner = document.getElementById('trendBanner');
    if (trendBanner) {
        if (barangayWasteRecords.length < 2) {
            trendBanner.innerHTML = `
                <div class="trend-banner stable">
                    <div class="trend-icon">📊</div>
                    <div class="trend-text">
                        <strong>Not enough data yet</strong>
                        <p>Add at least 2 waste records to start tracking the community trend.</p>
                    </div>
                </div>`;
        } else {
            const sorted = [...barangayWasteRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
            const prev = sorted[sorted.length - 2];
            const last = sorted[sorted.length - 1];

            // Check non-biodegradable specifically at 50%
            const prevNonBio = parseFloat(prev.nonBiodegradable||0);
            const lastNonBio = parseFloat(last.nonBiodegradable||0);
            const nonBioDiff = lastNonBio - prevNonBio;
            const nonBioPct = prevNonBio > 0 ? Math.round((nonBioDiff / prevNonBio) * 100) : 0;

            // Overall for message
            const prevTotal = parseFloat(prev.biodegradable||0) + parseFloat(prev.nonBiodegradable||0) + parseFloat(prev.recyclable||0);
            const lastTotal = parseFloat(last.biodegradable||0) + parseFloat(last.nonBiodegradable||0) + parseFloat(last.recyclable||0);
            const diff = lastTotal - prevTotal;
            const pct = prevTotal > 0 ? Math.abs(Math.round((diff / prevTotal) * 100)) : 0;

            if (nonBioDiff > 0 && nonBioPct >= 50) {
                trendBanner.innerHTML = `
                    <div class="trend-banner critical">
                        <div class="trend-icon">🚨</div>
                        <div class="trend-text">
                            <strong>ALERT: Waste levels are critically high — Action Required!</strong>
                            <p>Waste levels have exceeded the threshold. The community needs to urgently reassess their waste management practices to prevent further escalation.</p>
                        </div>
                    </div>`;
            } else {
                const msg = diff > 0
                    ? `Waste increased slightly by ${pct}% — still within acceptable range.`
                    : diff < 0
                    ? `Waste decreased by ${pct}% from the last record. Keep it up!`
                    : `Waste levels are stable with no change from the last record.`;
                trendBanner.innerHTML = `
                    <div class="trend-banner down">
                        <div class="trend-icon">✅</div>
                        <div class="trend-text">
                            <strong>Community is in good condition
                                <button class="trend-info-btn" onclick="toggleTrendInfo()" title="How is this determined?">?</button>
                            </strong>
                            <p>${msg}</p>
                            <div class="trend-info-popup" id="trendInfoPopup">
                                <strong>📋 How this is determined:</strong>
                                <ul>
                                    <li>✅ <strong>Good condition</strong> — waste levels are within acceptable range compared to the previous record, or waste is stable/decreasing.</li>
                                    <li>🚨 <strong>Alert triggered</strong> — a significant increase in waste is detected from the last record.</li>
                                    <li>📊 The system compares the <strong>two most recent waste records</strong> to calculate the change.</li>
                                    <li>📉 A decrease in waste means the community's waste management is improving.</li>
                                </ul>
                            </div>
                        </div>
                    </div>`;
            }
        }
    }

    const bioPercent = totalWaste > 0 ? Math.round((totalBio / totalWaste) * 100) : 0;
    const nonBioPercent = totalWaste > 0 ? Math.round((totalNonBio / totalWaste) * 100) : 0;
    const recPercent = totalWaste > 0 ? Math.round((totalRec / totalWaste) * 100) : 0;

    document.getElementById('bioPercentage').textContent = bioPercent + '%';
    document.getElementById('nonBioPercentage').textContent = nonBioPercent + '%';
    document.getElementById('recPercentage').textContent = recPercent + '%';

    drawPieChart(totalBio, totalNonBio, totalRec);
    drawLineChart(barangayWasteRecords);
}

function drawPieChart(bio, nonBio, rec) {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2, r = 120;
    const total = bio + nonBio + rec;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (total === 0) {
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2*Math.PI); ctx.fill();
        ctx.fillStyle = '#999'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
        ctx.fillText('No data yet', cx, cy); return;
    }
    let angle = -Math.PI / 2;
    [[bio, '#4CAF50'], [nonBio, '#FF9800'], [rec, '#2196F3']].forEach(([val, color]) => {
        const sweep = (val / total) * 2 * Math.PI;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + sweep);
        ctx.closePath(); ctx.fill();
        angle += sweep;
    });
}

function drawLineChart(records) {
    var container = document.getElementById('lineChart');
    if (!container) return;

    if (!records || records.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:30px;color:#bbb;">No data yet. Add waste records to see the trend.</p>';
        return;
    }

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthMap = {};
    var monthOrder = [];

    records.forEach(function(r) {
        var parts = r.date.split('-');
        var key = parts[0] + '-' + parts[1];
        if (!monthMap[key]) {
            monthMap[key] = { label: monthNames[parseInt(parts[1])-1] + ' ' + parts[0], total: 0, rec: 0 };
            monthOrder.push(key);
        }
        monthMap[key].total += parseFloat(r.biodegradable||0) + parseFloat(r.nonBiodegradable||0) + parseFloat(r.recyclable||0);
        monthMap[key].rec   += parseFloat(r.recyclable||0);
    });

    monthOrder.sort();
    var pts = monthOrder.map(function(k){ return monthMap[k]; });
    var maxVal = Math.max.apply(null, pts.map(function(p){ return p.total; }).concat([1]));

    var rows = pts.map(function(p) {
        var barW = Math.max(Math.round((p.total / maxVal) * 100), 2);
        var recW = Math.max(Math.round((p.rec   / maxVal) * 100), 2);
        return '<tr>' +
            '<td style="padding:8px 12px;font-size:13px;font-weight:600;color:#555;white-space:nowrap;width:70px;">' + p.label + '</td>' +
            '<td style="padding:8px 4px;width:100%;">' +
                '<div style="background:#f0f0f0;border-radius:4px;overflow:hidden;margin-bottom:3px;">' +
                    '<div style="height:14px;width:' + barW + '%;background:linear-gradient(to right,#2e7d32,#66BB6A);border-radius:4px;"></div>' +
                '</div>' +
                '<div style="background:#f0f0f0;border-radius:4px;overflow:hidden;">' +
                    '<div style="height:10px;width:' + recW + '%;background:linear-gradient(to right,#1565C0,#42A5F5);border-radius:4px;"></div>' +
                '</div>' +
            '</td>' +
            '<td style="padding:8px 12px;font-size:12px;color:#333;white-space:nowrap;text-align:right;">' +
                '<span style="color:#2e7d32;font-weight:700;">' + Math.round(p.total) + ' kg</span><br>' +
                '<span style="color:#1565C0;font-size:11px;">' + Math.round(p.rec) + ' kg recycled</span>' +
            '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML =
        '<div style="padding:10px 0;">' +
            '<div style="display:flex;gap:16px;margin-bottom:12px;font-size:12px;">' +
                '<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:14px;height:10px;background:#4CAF50;border-radius:2px;"></span>Total Collected</span>' +
                '<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:14px;8px;height:8px;background:#2196F3;border-radius:2px;"></span>Recycled</span>' +
            '</div>' +
            '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
        '</div>';
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function selectIssueType(type) {
    selectedIssueType = type;
    document.getElementById('issueType').value = type;
    document.querySelectorAll('.issue-btn').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
}

function submitReport() {
    const purok = document.getElementById('reportPurok').value;
    const wasteType = document.getElementById('reportWasteType').value;
    const description = document.getElementById('reportDescription').value;
    const photoInput = document.getElementById('reportPhoto');
    const messageDiv = document.getElementById('reportMessage');

    if (!purok) { messageDiv.textContent = 'Please select a purok'; messageDiv.className = 'error'; return; }
    if (!selectedIssueType) { messageDiv.textContent = 'Please select an issue type'; messageDiv.className = 'error'; return; }
    if (!description) { messageDiv.textContent = 'Please provide a description'; messageDiv.className = 'error'; return; }

    const data = JSON.parse(localStorage.getItem('bawasData'));
    const newReport = {
        id: Date.now().toString(),
        barangay: selectedBarangay,
        purok, wasteType, issueType: selectedIssueType, description,
        status: 'pending', timestamp: Date.now(),
        submittedBy: sessionStorage.getItem('currentUser'),
        photo: null
    };

    if (photoInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = e => { newReport.photo = e.target.result; saveReport(newReport, data, messageDiv); };
        reader.readAsDataURL(photoInput.files[0]);
    } else {
        saveReport(newReport, data, messageDiv);
    }
}

function saveReport(report, data, messageDiv) {
    const earlyCheck = document.getElementById('earlyCollectionCheck');

    if (earlyCheck && earlyCheck.checked) {
        const bagCount = document.getElementById('bagCount').value;
        const settings = (data.feeSettings || {})[selectedBarangay];
        const proofInput = document.getElementById('paymentProof');

        if (!bagCount || bagCount < 5) { messageDiv.textContent = 'Minimum of 5 bags required for early collection'; messageDiv.className = 'error'; return; }
        if (!settings) { messageDiv.textContent = 'Fee not set by admin yet'; messageDiv.className = 'error'; return; }
        if (!proofInput.files.length) { messageDiv.textContent = 'Please upload your GCash payment screenshot'; messageDiv.className = 'error'; return; }

        const totalFee = bagCount * parseFloat(settings.feePerBag);
        const reader = new FileReader();
        reader.onload = function(e) {
            if (!data.earlyCollectionRequests) data.earlyCollectionRequests = [];
            data.earlyCollectionRequests.push({
                id: Date.now().toString(),
                barangay: selectedBarangay,
                purok: report.purok,
                description: report.description,
                bagCount, totalFee: totalFee.toFixed(2),
                paymentProof: e.target.result,
                paymentStatus: 'pending',
                submittedBy: report.submittedBy,
                timestamp: Date.now()
            });

            // Tag the report as early collection
            report.earlyCollection = true;
            report.bagCount = bagCount;
            report.totalFee = totalFee.toFixed(2);

            data.reports.push(report);
            localStorage.setItem('bawasData', JSON.stringify(data));

            earlyCheck.checked = false;
            document.getElementById('earlyCollectionForm').style.display = 'none';
            document.getElementById('bagCount').value = '';
            document.getElementById('totalFeeDisplay').innerHTML = '';
            document.getElementById('paymentProof').value = '';
            document.getElementById('proofFileName').textContent = 'No file chosen';
            document.getElementById('proofPreview').style.display = 'none';
            document.getElementById('proofPreviewImg').src = '';

            messageDiv.textContent = '✅ Report & payment submitted! Admin will verify your payment.';
            messageDiv.className = 'success';
            setTimeout(() => { messageDiv.textContent = ''; showSection('dashboard'); }, 2000);
        };
        reader.readAsDataURL(proofInput.files[0]);
    } else {
        data.reports.push(report);
        localStorage.setItem('bawasData', JSON.stringify(data));
        messageDiv.textContent = 'Report submitted successfully!';
        messageDiv.className = 'success';
        document.getElementById('reportPurok').value = 'Purok 3';
        document.getElementById('reportDescription').value = '';
        document.getElementById('reportPhoto').value = '';
        document.getElementById('fileName').textContent = 'No file chosen';
        selectedIssueType = '';
        document.querySelectorAll('.issue-btn').forEach(btn => btn.classList.remove('selected'));
        setTimeout(() => { messageDiv.textContent = ''; showSection('dashboard'); }, 1500);
    }
}

// ── Announcements ──────────────────────────────────────────────

function toggleAnnouncements() {
    const modal = document.getElementById('announcementModal');
    modal.classList.toggle('open');
    if (modal.classList.contains('open')) {
        loadAnnouncements();
        // Hide badge once opened
        const badge = document.getElementById('annBadge');
        if (badge) badge.style.display = 'none';
    }
}

function updateAnnouncementBadge() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!selectedBarangay) return;
    const barangayAnn = (data.announcements || []).filter(a => a.barangay === selectedBarangay);
    const badge = document.getElementById('annBadge');
    if (barangayAnn.length > 0) { badge.style.display = 'flex'; badge.textContent = barangayAnn.length; }
    else badge.style.display = 'none';
}

function loadAnnouncements() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayAnn = (data.announcements || []).filter(a => a.barangay === selectedBarangay);
    const list = document.getElementById('announcementsList');
    const badge = document.getElementById('annBadge');
    if (barangayAnn.length > 0) { badge.style.display = 'flex'; badge.textContent = barangayAnn.length; }
    else badge.style.display = 'none';
    list.innerHTML = barangayAnn.length === 0
        ? '<div class="no-announcements">No announcements from your barangay admin yet</div>'
        : barangayAnn.sort((a,b) => b.timestamp - a.timestamp).map(ann => `
            <div class="announcement-card ${ann.type === 'schedule' ? 'schedule-type' : ''}">
                <div class="announcement-meta">
                    <span class="announcement-tag ${ann.type === 'schedule' ? 'schedule' : ''}">
                        ${ann.type === 'schedule' ? '📅 Schedule' : '📢 General'}
                    </span>
                    <span class="announcement-date">${formatDate(ann.timestamp)}</span>
                </div>
                <p class="announcement-text">${ann.text}</p>
                ${ann.type === 'schedule' && ann.scheduleTime ? `<p class="announcement-schedule-time">🕐 Collection: ${formatDate(ann.scheduleTime)}</p>` : ''}
            </div>`).join('');
}

// ── Early Collection Fee ────────────────────────────────────────

function toggleEarlyCollection() {
    const checked = document.getElementById('earlyCollectionCheck').checked;
    document.getElementById('earlyCollectionForm').style.display = checked ? 'block' : 'none';
    if (!checked) return;

    const data = JSON.parse(localStorage.getItem('bawasData'));
    const settings = (data.feeSettings || {})[selectedBarangay];
    if (!settings) {
        document.getElementById('feeDisplay').innerHTML = '⚠️ Admin has not set the fee yet.';
        document.getElementById('gcashDetails').innerHTML = '';
        return;
    }
    document.getElementById('feeDisplay').innerHTML = `Fee: <strong>₱${settings.feePerBag} per bag</strong>`;
    document.getElementById('gcashDetails').innerHTML = `
        <p style="font-weight:600;color:#2e7d32;margin-bottom:8px;">💚 Pay via GCash:</p>
        <p style="font-size:18px;font-weight:bold;color:#333;">${settings.gcashNumber}</p>
        <p style="color:#555;">${settings.gcashName}</p>
        <p style="color:#888;font-size:13px;margin-top:6px;">Send the exact amount, then upload your screenshot below.</p>
    `;
}

function handleProofUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    document.getElementById('proofFileName').textContent = file.name;

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('proofPreview');
        const img = document.getElementById('proofPreviewImg');
        img.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function calculateFee() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const settings = (data.feeSettings || {})[selectedBarangay];
    const display = document.getElementById('totalFeeDisplay');
    if (!settings) return;
    const bags = parseInt(document.getElementById('bagCount').value) || 0;
    if (bags > 0 && bags < 5) {
        display.style.display = 'block';
        display.style.background = '#f44336';
        display.innerHTML = `⚠️ Minimum of 5 bags required`;
        return;
    }
    if (bags >= 5) {
        const total = bags * parseFloat(settings.feePerBag);
        display.style.display = 'block';
        display.style.background = '#1976D2';
        display.innerHTML = `🛍️ ${bags} bag${bags > 1 ? 's' : ''} × ₱${settings.feePerBag} = <span style="font-size:28px;">₱${total.toFixed(2)}</span>`;
    } else {
        display.style.display = 'none';
        display.innerHTML = '';
    }
}

// ── Lightbox ───────────────────────────────────────────────────

function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lightboxImg').src = '';
    document.body.style.overflow = '';
}

// Close on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeLightbox();
        closeReportDetailBtn();
    }
});


// Auto-refresh time displays every 30 seconds
// Also refreshes schedule status live
setInterval(() => {
    const activeSection = document.querySelector('.section.active');
    if (activeSection) {
        const sectionId = activeSection.id;
        if (sectionId === 'dashboard') loadDashboard();
        if (sectionId === 'reports') {
            const currentSearch = document.getElementById('reportSearch')?.value || '';
            const currentFilter = document.getElementById('reportFilter')?.value || 'all';
            if (currentSearch || currentFilter !== 'all') filterReports();
            else loadReports();
        }
        if (sectionId === 'schedules') loadSchedules();
    }
}, 30000);

function formatTime(time) {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
}




function toggleTrendInfo() {
    const popup = document.getElementById('trendInfoPopup');
    if (popup) popup.classList.toggle('open');
}
