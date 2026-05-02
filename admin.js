// Check authentication
if (!sessionStorage.getItem('currentUser') || sessionStorage.getItem('userType') !== 'admin') {
    window.location.href = 'index.html';
}

let selectedBarangay = sessionStorage.getItem('selectedBarangay');

// Format date to 12-hour AM/PM
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });
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

// Show barangay selector if not selected
window.onload = function() {
    if (selectedBarangay) {
        document.getElementById('barangaySelector').style.display = 'none';
        document.getElementById('mainContent').style.display = 'flex';
        document.getElementById('currentBarangay').textContent = '📍 ' + selectedBarangay;
        loadDashboard();
    }
};

function selectBarangay() {
    const barangay = document.getElementById('barangaySelect').value;
    if (!barangay) {
        alert('Please select a barangay');
        return;
    }
    selectedBarangay = barangay;
    sessionStorage.setItem('selectedBarangay', barangay);
    document.getElementById('barangaySelector').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
    document.getElementById('currentBarangay').textContent = '📍 ' + barangay;
    loadDashboard();
    
    // Load announcement badge count
    updateAnnouncementBadge();
}

function updateAnnouncementBadge() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!selectedBarangay) return;
    const barangayAnn = (data.announcements || []).filter(a => a.barangay === selectedBarangay);
    const badge = document.getElementById('annBadge');
    if (barangayAnn.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = barangayAnn.length;
    } else {
        badge.style.display = 'none';
    }
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Load section data
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'reports') loadReports();
    if (sectionId === 'schedules') loadSchedules();
    if (sectionId === 'analytics') loadAnalytics();
    if (sectionId === 'wasteEntry') loadWasteEntry();
    if (sectionId === 'feeSettings') loadFeeSettings();
}

function loadDashboard() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayReports = data.reports.filter(r => r.barangay === selectedBarangay);
    const barangaySchedules = data.schedules.filter(s => s.barangay === selectedBarangay);
    const pendingReports = barangayReports.filter(r => r.status === 'pending');
    
    // Calculate total waste from waste records
    const barangayWasteRecords = data.wasteRecords ? data.wasteRecords.filter(w => w.barangay === selectedBarangay) : [];
    const totalWaste = barangayWasteRecords.reduce((sum, record) => {
        return sum + parseFloat(record.biodegradable || 0) + parseFloat(record.nonBiodegradable || 0) + parseFloat(record.recyclable || 0);
    }, 0);
    
    // Calculate recycling rate (recyclable / total * 100)
    const totalRecyclable = barangayWasteRecords.reduce((sum, record) => sum + parseFloat(record.recyclable || 0), 0);
    const recyclingRate = totalWaste > 0 ? Math.round((totalRecyclable / totalWaste) * 100) : 0;
    
    // Update stats
    document.getElementById('totalWaste').textContent = Math.round(totalWaste);
    document.getElementById('upcomingSchedules').textContent = barangaySchedules.length;
    document.getElementById('pendingReports').textContent = pendingReports.length;
    document.getElementById('recyclingRate').textContent = recyclingRate;
    
    // Update pending fees badge
    const earlyRequests = (data.earlyCollectionRequests || []).filter(r => r.barangay === selectedBarangay && r.paymentStatus === 'pending');
    document.getElementById('pendingFees').textContent = earlyRequests.length;

    // ── Dashboard Schedules with live status ──
    const dashboardSchedules = document.getElementById('dashboardSchedules');
    const now = new Date();

    // Auto-archive schedules past 3 hours
    let schedChanged = false;
    if (!data.scheduleHistory) data.scheduleHistory = [];
    data.schedules.filter(s => s.barangay === selectedBarangay).forEach(schedule => {
        if (!schedule.time) return;
        const scheduledDT = new Date(schedule.date + 'T' + schedule.time);
        const hoursAfter = (now - scheduledDT) / 3600000;
        if (hoursAfter > 3) {
            if (!data.scheduleHistory.find(h => h.id === schedule.id)) {
                data.scheduleHistory.push({ ...schedule, archivedAt: Date.now() });
            }
            data.schedules = data.schedules.filter(s => s.id !== schedule.id);
            schedChanged = true;
        }
    });

    // Auto-clear history when month resets
    const currentMonth = now.getMonth() + '-' + now.getFullYear();
    const filteredHistory = (data.scheduleHistory || []).filter(h => {
        const d = new Date(h.archivedAt);
        return (d.getMonth() + '-' + d.getFullYear()) === currentMonth;
    });
    if (filteredHistory.length !== (data.scheduleHistory || []).length) {
        data.scheduleHistory = filteredHistory;
        schedChanged = true;
    }
    if (schedChanged) localStorage.setItem('bawasData', JSON.stringify(data));

    const freshSchedules = data.schedules.filter(s => s.barangay === selectedBarangay);

    if (freshSchedules.length === 0) {
        dashboardSchedules.innerHTML = '<div style="background:rgba(255,255,255,0.9);padding:12px;border-radius:8px;text-align:center;color:#999;font-size:13px;">No schedules yet</div>';
    } else {
        dashboardSchedules.innerHTML = freshSchedules.slice(0, 3).map(s => {
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
    
    // Load recent alerts
    const alertsList = document.getElementById('alertsList');
    const urgentReports = pendingReports.slice(0, 5);
    
    if (urgentReports.length === 0) {
        alertsList.innerHTML = '<div style="padding:16px; text-align:center; color:#bbb; font-size:13px;">✅ No pending alerts</div>';
    } else {
        alertsList.innerHTML = `
            <div class="alerts-header">
                <h3>⚠️ Pending Alerts (${pendingReports.length})</h3>
                <a onclick="showSection('reports')">View all →</a>
            </div>` +
            urgentReports.map(report => `
            <div class="alert-item" onclick="openReportDetail('${report.id}')">
                <div class="alert-icon">${report.earlyCollection ? '🚛' : '⚠️'}</div>
                <div class="alert-content">
                    <strong>${report.issueType}${report.earlyCollection ? ' <span style="background:#e3f2fd;color:#1565C0;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;">⚡ Early</span>' : ''}</strong>
                    <p>${report.purok} · ${getTimeAgo(report.timestamp)}</p>
                </div>
                <div class="alert-arrow">›</div>
            </div>`).join('');
    }
}

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
                ${report.status === 'pending' ? `<button class="btn-resolve" onclick="event.stopPropagation(); resolveReport('${report.id}')">✓ Resolve</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openReportDetail(reportId) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const report = data.reports.find(r => r.id === reportId);
    if (!report) return;

    document.getElementById('detailTitle').textContent = report.issueType;

    const statusColor = report.status === 'resolved' ? '#4CAF50' : report.status === 'pending' ? '#FF9800' : '#f44336';

    document.getElementById('reportDetailBody').innerHTML = `
        <div class="report-detail-status-bar">
            <span class="status-badge ${report.status}">${report.status.toUpperCase()}</span>
            ${report.earlyCollection ? '<span style="background:#e3f2fd;color:#1565C0;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;">⚡ Early Collection Request</span>' : ''}
            <span style="font-size:13px; color:#888;">Submitted ${formatDate(report.timestamp)}</span>
        </div>

        ${report.earlyCollection ? `
        <div style="background:#e3f2fd;border-radius:10px;padding:14px 16px;margin-bottom:16px;border-left:4px solid #1565C0;">
            <p style="font-weight:700;color:#1565C0;margin-bottom:6px;">⚡ Early Collection Details</p>
            <p style="font-size:13px;color:#333;margin:3px 0;">🛍️ <strong>${report.bagCount} bags</strong> requested</p>
            <p style="font-size:13px;color:#333;margin:3px 0;">💳 Total Fee: <strong style="color:#9C27B0;">₱${report.totalFee}</strong></p>
            <p style="font-size:12px;color:#888;margin-top:6px;">Check the Early Collection section to verify payment.</p>
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
            ${report.status === 'pending' ? `<button class="btn-resolve-detail" onclick="resolveReport('${report.id}'); closeReportDetailBtn()">✓ Mark as Resolved</button>` : ''}
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

function resolveReport(reportId) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const report = data.reports.find(r => r.id === reportId);
    if (report) {
        report.status = 'resolved';
        localStorage.setItem('bawasData', JSON.stringify(data));
        loadReports();
        loadDashboard();
        alert('Report marked as resolved');
    }
}

function loadSchedules() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangaySchedules = data.schedules.filter(s => s.barangay === selectedBarangay);
    const schedulesList = document.getElementById('schedulesList');
    const now = new Date();

    if (barangaySchedules.length === 0) {
        schedulesList.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">No schedules yet. Click "Add New Schedule" to create one.</p>';
    } else {
        schedulesList.innerHTML = barangaySchedules.map(schedule => {
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
                    <button onclick="deleteSchedule('${schedule.id}')" style="margin-top:10px;background-color:#f44336;width:auto;padding:8px 16px;">Delete</button>
                </div>
                <div class="report-arrow">›</div>
            </div>`;
        }).join('');
    }

    // Show history
    const history = (data.scheduleHistory || []).filter(h => h.barangay === selectedBarangay);
    const historySection = document.getElementById('scheduleHistorySection');
    const historyList = document.getElementById('scheduleHistoryList');
    if (history.length > 0) {
        historySection.style.display = 'block';
        historyList.innerHTML = history.sort((a, b) => b.archivedAt - a.archivedAt).map(h => `
            <div class="history-row">
                <span class="done">✅</span>
                <span><strong>${h.purok}</strong> — ${h.date} @ ${formatTime(h.time) || 'N/A'}</span>
                <span style="color:#bbb;font-size:12px;">Completed ${getTimeAgo(h.archivedAt)}</span>
                <button class="history-del" onclick="deleteHistoryItem('${h.id}')" title="Delete">🗑</button>
            </div>`).join('');
    } else {
        historySection.style.display = 'none';
    }
}

function deleteHistoryItem(id) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    data.scheduleHistory = (data.scheduleHistory || []).filter(h => h.id !== id);
    localStorage.setItem('bawasData', JSON.stringify(data));
    loadSchedules();
}

function clearScheduleHistory() {
    if (!confirm('Clear all collection history for this barangay?')) return;
    const data = JSON.parse(localStorage.getItem('bawasData'));
    data.scheduleHistory = (data.scheduleHistory || []).filter(h => h.barangay !== selectedBarangay);
    localStorage.setItem('bawasData', JSON.stringify(data));
    loadSchedules();
}

function showAddScheduleForm() {
    document.getElementById('addScheduleForm').style.display = 'block';
}

function hideAddScheduleForm() {
    document.getElementById('addScheduleForm').style.display = 'none';
}

function addSchedule() {
    const purok = document.getElementById('schedulePurok').value;
    const date = document.getElementById('scheduleDate').value;
    const time = document.getElementById('scheduleTime').value;
    
    if (!date) {
        alert('Please select a date');
        return;
    }
    if (!time) {
        alert('Please select a collection time');
        return;
    }
    
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const newSchedule = {
        id: Date.now().toString(),
        barangay: selectedBarangay,
        purok: purok,
        date: date,
        time: time,
        wasteType: 'All Types'
    };
    
    data.schedules.push(newSchedule);
    localStorage.setItem('bawasData', JSON.stringify(data));
    
    hideAddScheduleForm();
    loadSchedules();
    alert('Schedule added successfully');
}

function deleteSchedule(scheduleId) {
    if (confirm('Are you sure you want to delete this schedule?')) {
        const data = JSON.parse(localStorage.getItem('bawasData'));
        data.schedules = data.schedules.filter(s => s.id !== scheduleId);
        localStorage.setItem('bawasData', JSON.stringify(data));
        loadSchedules();
    }
}

function loadAnalytics() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayReports = data.reports.filter(r => r.barangay === selectedBarangay);
    const barangayWasteRecords = data.wasteRecords ? data.wasteRecords.filter(w => w.barangay === selectedBarangay) : [];
    
    // Calculate totals
    let totalBio = 0, totalNonBio = 0, totalRec = 0;
    barangayWasteRecords.forEach(record => {
        totalBio += parseFloat(record.biodegradable || 0);
        totalNonBio += parseFloat(record.nonBiodegradable || 0);
        totalRec += parseFloat(record.recyclable || 0);
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

            // Check non-biodegradable specifically
            const prevNonBio = parseFloat(prev.nonBiodegradable||0);
            const lastNonBio = parseFloat(last.nonBiodegradable||0);
            const nonBioDiff = lastNonBio - prevNonBio;
            const nonBioPct = prevNonBio > 0 ? Math.round((nonBioDiff / prevNonBio) * 100) : 0;

            // Also track overall for the message
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
    
    // Calculate percentages for pie chart
    const bioPercent = totalWaste > 0 ? Math.round((totalBio / totalWaste) * 100) : 0;
    const nonBioPercent = totalWaste > 0 ? Math.round((totalNonBio / totalWaste) * 100) : 0;
    const recPercent = totalWaste > 0 ? Math.round((totalRec / totalWaste) * 100) : 0;
    
    document.getElementById('bioPercentage').textContent = bioPercent + '%';
    document.getElementById('nonBioPercentage').textContent = nonBioPercent + '%';
    document.getElementById('recPercentage').textContent = recPercent + '%';
    
    // Draw Pie Chart
    drawPieChart(totalBio, totalNonBio, totalRec);
    
    // Draw Line Chart
    drawLineChart(barangayWasteRecords);
}

function drawPieChart(bio, nonBio, rec) {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 120;
    
    const total = bio + nonBio + rec;
    
    if (total === 0) {
        // Draw empty state
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', centerX, centerY);
        return;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let currentAngle = -Math.PI / 2; // Start from top
    
    // Biodegradable (Green)
    const bioAngle = (bio / total) * 2 * Math.PI;
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + bioAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle += bioAngle;
    
    // Non-Biodegradable (Orange)
    const nonBioAngle = (nonBio / total) * 2 * Math.PI;
    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + nonBioAngle);
    ctx.closePath();
    ctx.fill();
    currentAngle += nonBioAngle;
    
    // Recyclable (Blue)
    const recAngle = (rec / total) * 2 * Math.PI;
    ctx.fillStyle = '#2196F3';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + recAngle);
    ctx.closePath();
    ctx.fill();
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

function loadWasteEntry() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayWasteRecords = data.wasteRecords ? data.wasteRecords.filter(w => w.barangay === selectedBarangay) : [];
    
    // Calculate totals
    let totalBio = 0, totalNonBio = 0, totalRec = 0;
    barangayWasteRecords.forEach(record => {
        totalBio += parseFloat(record.biodegradable || 0);
        totalNonBio += parseFloat(record.nonBiodegradable || 0);
        totalRec += parseFloat(record.recyclable || 0);
    });
    
    const grandTotal = totalBio + totalNonBio + totalRec;
    
    // Update summary cards
    document.getElementById('totalBiodegradable').textContent = Math.round(totalBio);
    document.getElementById('totalNonBiodegradable').textContent = Math.round(totalNonBio);
    document.getElementById('totalRecyclable').textContent = Math.round(totalRec);
    document.getElementById('grandTotal').textContent = Math.round(grandTotal);
    
    // Display records list
    const recordsList = document.getElementById('wasteRecordsList');
    if (barangayWasteRecords.length === 0) {
        recordsList.innerHTML = '<p style="text-align:center;padding:20px;color:#999;">No records yet. Add your first record above.</p>';
    } else {
        const sorted = barangayWasteRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
        const recent = sorted.slice(0, 4);
        const older = sorted.slice(4);

        const renderRecord = record => `
            <div class="report-card">
                <div class="report-icon">📊</div>
                <div class="report-content">
                    <h3>${record.date}</h3>
                    <p>
                        🟢 <strong>${record.biodegradable} kg</strong> Biodegradable &nbsp;|&nbsp;
                        🟠 <strong>${record.nonBiodegradable} kg</strong> Non-Bio &nbsp;|&nbsp;
                        🔵 <strong>${record.recyclable} kg</strong> Recyclable
                    </p>
                    <p style="color:#1976D2;font-weight:600;">Total: ${(parseFloat(record.biodegradable) + parseFloat(record.nonBiodegradable) + parseFloat(record.recyclable)).toFixed(1)} kg</p>
                    <button onclick="deleteWasteRecord('${record.id}')" style="margin-top:8px;background-color:#f44336;width:auto;padding:6px 14px;font-size:13px;">Delete</button>
                </div>
            </div>`;

        let html = recent.map(renderRecord).join('');

        if (older.length > 0) {
            html += `
                <div id="olderRecords" style="display:none;">
                    ${older.map(renderRecord).join('')}
                </div>
                <div style="text-align:center;margin-top:10px;">
                    <button onclick="toggleOlderRecords()" id="viewAllBtn"
                        style="background:none;border:1.5px solid #1976D2;color:#1976D2;padding:8px 24px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:auto;margin:0;">
                        View All ${older.length} Older Records ▼
                    </button>
                </div>`;
        }

        recordsList.innerHTML = html;
    }
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('wasteDate').value = today;
}

function addWasteRecord() {
    const date = document.getElementById('wasteDate').value;
    const biodegradable = document.getElementById('biodegradable').value;
    const nonBiodegradable = document.getElementById('nonBiodegradable').value;
    const recyclable = document.getElementById('recyclable').value;
    const messageDiv = document.getElementById('wasteMessage');
    
    if (!date) {
        messageDiv.textContent = 'Please select a date';
        messageDiv.className = 'error';
        return;
    }
    
    if (!biodegradable || !nonBiodegradable || !recyclable) {
        messageDiv.textContent = 'Please enter all waste weights';
        messageDiv.className = 'error';
        return;
    }
    
    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!data.wasteRecords) {
        data.wasteRecords = [];
    }
    
    const newRecord = {
        id: Date.now().toString(),
        barangay: selectedBarangay,
        date: date,
        biodegradable: biodegradable,
        nonBiodegradable: nonBiodegradable,
        recyclable: recyclable,
        timestamp: Date.now()
    };
    
    data.wasteRecords.push(newRecord);
    localStorage.setItem('bawasData', JSON.stringify(data));
    
    messageDiv.textContent = 'Record added successfully!';
    messageDiv.className = 'success';
    
    // Clear form
    document.getElementById('biodegradable').value = '';
    document.getElementById('nonBiodegradable').value = '';
    document.getElementById('recyclable').value = '';
    
    // Reload the page
    loadWasteEntry();
    
    // Clear message after 2 seconds
    setTimeout(() => {
        messageDiv.textContent = '';
    }, 2000);
}

function deleteWasteRecord(recordId) {
    if (confirm('Are you sure you want to delete this record?')) {
        const data = JSON.parse(localStorage.getItem('bawasData'));
        data.wasteRecords = data.wasteRecords.filter(r => r.id !== recordId);
        localStorage.setItem('bawasData', JSON.stringify(data));
        loadWasteEntry();
        loadDashboard();
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
        // Set up annType listener once
        const annTypeEl = document.getElementById('annType');
        if (annTypeEl) annTypeEl.onchange = function() {
            document.getElementById('annScheduleTime').style.display =
                this.value === 'schedule' ? 'block' : 'none';
        };
    }
}

function loadAnnouncements() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const barangayAnn = (data.announcements || []).filter(a => a.barangay === selectedBarangay);
    const list = document.getElementById('announcementsList');
    const badge = document.getElementById('annBadge');

    // Update badge
    if (barangayAnn.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = barangayAnn.length;
    } else {
        badge.style.display = 'none';
    }

    if (barangayAnn.length === 0) {
        list.innerHTML = '<div class="no-announcements">No announcements yet</div>';
        return;
    }

    list.innerHTML = barangayAnn.sort((a, b) => b.timestamp - a.timestamp).map(ann => `
        <div class="announcement-card ${ann.type === 'schedule' ? 'schedule-type' : ''}">
            <div class="announcement-meta">
                <span class="announcement-tag ${ann.type === 'schedule' ? 'schedule' : ''}">
                    ${ann.type === 'schedule' ? '📅 Schedule' : '📢 General'}
                </span>
                <span class="announcement-date">${formatDate(ann.timestamp)}</span>
            </div>
            <p class="announcement-text">${ann.text}</p>
            ${ann.type === 'schedule' && ann.scheduleTime ? `<p class="announcement-schedule-time">🕐 Collection: ${formatDate(ann.scheduleTime)}</p>` : ''}
            <button class="btn-delete-ann" onclick="deleteAnnouncement('${ann.id}')">🗑 Delete</button>
        </div>
    `).join('');
}

function postAnnouncement() {
    const text = document.getElementById('annText').value.trim();
    const type = document.getElementById('annType').value;
    const scheduleTime = document.getElementById('annScheduleTime').value;
    const msgDiv = document.getElementById('annMessage');

    if (!text) {
        msgDiv.textContent = 'Please write an announcement';
        msgDiv.className = 'error';
        return;
    }

    if (type === 'schedule' && !scheduleTime) {
        msgDiv.textContent = 'Please select a collection date & time';
        msgDiv.className = 'error';
        return;
    }

    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!data.announcements) data.announcements = [];

    data.announcements.push({
        id: Date.now().toString(),
        barangay: selectedBarangay,
        type: type,
        text: text,
        scheduleTime: scheduleTime || null,
        timestamp: Date.now(),
        postedBy: sessionStorage.getItem('currentUser')
    });

    localStorage.setItem('bawasData', JSON.stringify(data));

    // Clear form
    document.getElementById('annText').value = '';
    document.getElementById('annScheduleTime').value = '';
    document.getElementById('annScheduleTime').style.display = 'none';
    document.getElementById('annType').value = 'general';
    msgDiv.textContent = 'Announcement posted!';
    msgDiv.className = 'success';
    setTimeout(() => { msgDiv.textContent = ''; }, 2000);

    loadAnnouncements();
}

function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    const data = JSON.parse(localStorage.getItem('bawasData'));
    data.announcements = data.announcements.filter(a => a.id !== id);
    localStorage.setItem('bawasData', JSON.stringify(data));
    loadAnnouncements();
}

// ── Early Collection Fee ────────────────────────────────────────

function loadFeeSettings() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const settings = (data.feeSettings || {})[selectedBarangay] || {};

    // Populate settings form
    if (settings.feePerBag) document.getElementById('feePerBag').value = settings.feePerBag;
    if (settings.gcashNumber) document.getElementById('gcashNumber').value = settings.gcashNumber;
    if (settings.gcashName) document.getElementById('gcashName').value = settings.gcashName;

    // Load fee requests
    loadFeeRequests();
}

function saveFeeSettings() {
    const feePerBag = document.getElementById('feePerBag').value;
    const gcashNumber = document.getElementById('gcashNumber').value.trim();
    const gcashName = document.getElementById('gcashName').value.trim();
    const msgDiv = document.getElementById('feeSettingsMsg');

    if (!feePerBag || !gcashNumber || !gcashName) {
        msgDiv.textContent = 'Please fill in all fields';
        msgDiv.className = 'error';
        return;
    }

    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!data.feeSettings) data.feeSettings = {};
    data.feeSettings[selectedBarangay] = { feePerBag, gcashNumber, gcashName };
    localStorage.setItem('bawasData', JSON.stringify(data));

    msgDiv.textContent = '✅ Settings saved!';
    msgDiv.className = 'success';
    setTimeout(() => { msgDiv.textContent = ''; }, 2000);
}

function loadFeeRequests() {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const requests = (data.earlyCollectionRequests || []).filter(r => r.barangay === selectedBarangay);
    const list = document.getElementById('feeRequestsList');

    // Update dashboard badge
    const pending = requests.filter(r => r.paymentStatus === 'pending');
    document.getElementById('pendingFees').textContent = pending.length;

    if (requests.length === 0) {
        list.innerHTML = '<div class="fee-empty">💳 No early collection requests yet</div>';
        return;
    }

    list.innerHTML = requests.sort((a, b) => b.timestamp - a.timestamp).map(req => `
        <div class="fee-request-row" onclick="openFeeReportDetail('${req.id}')" style="cursor:pointer;">
            <div class="fee-request-avatar">👤</div>
            <div class="fee-request-info">
                <h4>${req.submittedBy} &nbsp;<span class="status-badge ${req.paymentStatus}">${req.paymentStatus.toUpperCase()}</span></h4>
                <p>${req.purok} &nbsp;·&nbsp; ${req.bagCount} bags &nbsp;·&nbsp; ${formatDate(req.timestamp)}</p>
                <div class="fee-request-meta">
                    <span class="fee-amount">₱${req.totalFee}</span>
                    <span style="font-size:12px;color:#aaa;">${req.description ? req.description.slice(0,40) + '...' : ''}</span>
                </div>
            </div>
            ${req.paymentProof ? `<img src="${req.paymentProof}" class="fee-proof-img" onclick="event.stopPropagation(); openLightbox('${req.paymentProof}')" title="View payment proof">` : '<span style="font-size:12px;color:#f44336;flex-shrink:0;">No proof</span>'}
            ${req.paymentStatus === 'pending' ? `
            <div class="fee-request-actions" onclick="event.stopPropagation()">
                <button class="btn-fee-paid" onclick="markFeePaid('${req.id}')">✓ Paid</button>
                <button class="btn-fee-reject" onclick="rejectFeeRequest('${req.id}')">✕ Reject</button>
            </div>` : ''}
        </div>
    `).join('');
}

function markFeePaid(requestId) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const req = data.earlyCollectionRequests.find(r => r.id === requestId);
    if (req) {
        req.paymentStatus = 'paid';
        localStorage.setItem('bawasData', JSON.stringify(data));
        loadFeeRequests();
        alert('Payment marked as paid!');
    }
}

function rejectFeeRequest(requestId) {
    if (!confirm('Reject this early collection request?')) return;
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const req = data.earlyCollectionRequests.find(r => r.id === requestId);
    if (req) {
        req.paymentStatus = 'rejected';
        localStorage.setItem('bawasData', JSON.stringify(data));
        loadFeeRequests();
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
// Also checks and archives expired schedules
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
    // Always check for expired schedules regardless of active section
    checkAndArchiveSchedules();
}, 30000);

function checkAndArchiveSchedules() {
    if (!selectedBarangay) return;
    const data = JSON.parse(localStorage.getItem('bawasData'));
    if (!data.schedules) return;

    const now = new Date();
    let changed = false;
    if (!data.scheduleHistory) data.scheduleHistory = [];

    data.schedules.filter(s => s.barangay === selectedBarangay && s.time).forEach(schedule => {
        const scheduledDT = new Date(schedule.date + 'T' + schedule.time);
        const hoursAfter = (now - scheduledDT) / 3600000;
        if (hoursAfter > 3) {
            if (!data.scheduleHistory.find(h => h.id === schedule.id)) {
                data.scheduleHistory.push({ ...schedule, archivedAt: Date.now() });
            }
            data.schedules = data.schedules.filter(s => s.id !== schedule.id);
            changed = true;
        }
    });

    if (changed) {
        localStorage.setItem('bawasData', JSON.stringify(data));
        // Refresh dashboard if visible
        const activeSection = document.querySelector('.section.active');
        if (activeSection?.id === 'dashboard') loadDashboard();
        if (activeSection?.id === 'schedules') loadSchedules();
    }
}

function formatTime(time) {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
}




function toggleOlderRecords() {
    const older = document.getElementById('olderRecords');
    const btn = document.getElementById('viewAllBtn');
    if (!older || !btn) return;
    const isHidden = older.style.display === 'none';
    older.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden
        ? 'Show Less ▲'
        : `View All ${older.children.length} Older Records ▼`;
}

function toggleTrendInfo() {
    const popup = document.getElementById('trendInfoPopup');
    if (popup) popup.classList.toggle('open');
}

function openFeeReportDetail(requestId) {
    const data = JSON.parse(localStorage.getItem('bawasData'));
    const req = (data.earlyCollectionRequests || []).find(r => r.id === requestId);
    if (!req) return;

    // Find the linked report
    const report = data.reports.find(r =>
        r.submittedBy === req.submittedBy &&
        r.purok === req.purok &&
        r.earlyCollection === true &&
        Math.abs(r.timestamp - req.timestamp) < 5000
    );

    document.getElementById('detailTitle').textContent = '⚡ Early Collection Request';

    document.getElementById('reportDetailBody').innerHTML = `
        <div class="report-detail-status-bar">
            <span class="status-badge ${req.paymentStatus}">${req.paymentStatus.toUpperCase()}</span>
            <span style="background:#e3f2fd;color:#1565C0;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;">⚡ Early Collection</span>
            <span style="font-size:13px;color:#888;">${formatDate(req.timestamp)}</span>
        </div>

        <div style="background:#e3f2fd;border-radius:10px;padding:14px 16px;margin-bottom:16px;border-left:4px solid #1565C0;">
            <p style="font-weight:700;color:#1565C0;margin-bottom:8px;">⚡ Collection Details</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:700;">Submitted By</p><p style="font-size:14px;font-weight:600;">${req.submittedBy}</p></div>
                <div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:700;">Purok</p><p style="font-size:14px;font-weight:600;">${req.purok}</p></div>
                <div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:700;">Bags Requested</p><p style="font-size:14px;font-weight:600;">🛍️ ${req.bagCount} bags</p></div>
                <div><p style="font-size:11px;color:#888;text-transform:uppercase;font-weight:700;">Total Fee</p><p style="font-size:14px;font-weight:700;color:#9C27B0;">₱${req.totalFee}</p></div>
            </div>
        </div>

        ${report ? `
        <div class="report-detail-desc">
            <label>📝 Resident's Description</label>
            <p>${report.description}</p>
        </div>
        ${report.photo ? `
        <div class="report-detail-photo">
            <label>📷 Issue Photo</label>
            <img src="${report.photo}" alt="Issue photo" onclick="openLightbox('${report.photo}')">
        </div>` : ''}` : `
        <div class="report-detail-desc">
            <label>📝 Description</label>
            <p>${req.description || 'No description provided'}</p>
        </div>`}

        ${req.paymentProof ? `
        <div class="report-detail-photo">
            <label>💳 GCash Payment Proof</label>
            <img src="${req.paymentProof}" alt="Payment proof" onclick="openLightbox('${req.paymentProof}')">
        </div>` : '<p style="color:#f44336;font-size:13px;margin-bottom:16px;">⚠️ No payment proof uploaded</p>'}

        <div class="report-detail-actions">
            ${req.paymentStatus === 'pending' ? `
                <button class="btn-resolve-modal" onclick="markFeePaid('${req.id}'); closeReportDetailBtn()">✓ Mark as Paid</button>
                <button style="padding:12px 20px;background:#fff0f0;color:#f44336;border:1px solid #ffcdd2;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:auto;margin:0;" onclick="rejectFeeRequest('${req.id}'); closeReportDetailBtn()">✕ Reject</button>
            ` : ''}
            <button class="btn-close-modal" onclick="closeReportDetailBtn()">Close</button>
        </div>
    `;

    document.getElementById('reportDetailModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}
