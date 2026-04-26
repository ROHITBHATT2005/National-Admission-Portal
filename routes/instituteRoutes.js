const express = require("express");
const path = require("path");
const db = require("../db");
const router = express.Router();
router.post("/api/institute/login", (req, res) => {
    const { username, password } = req.body;
    db.query(
        `SELECT ia.institute_id, i.institute_name 
         FROM institute_admins ia
         JOIN institutes i ON ia.institute_id = i.id
         WHERE ia.username = ? AND ia.password = ?`,
        [username, password],
        (err, result) => {
            if (err || result.length === 0) return res.status(401).json({ success: false, message: "Invalid credentials" });
            req.session.institute = { id: result[0].institute_id, name: result[0].institute_name, username };
            res.json({ success: true });
        }
    );
});
router.get("/api/institute/allotted", (req, res) => {
    if (!req.session.institute) return res.status(403).json({ error: "Unauthorized" });
    const instId = req.session.institute.id;
    db.query(`
        SELECT s.application_no, s.full_name, p.program_name, 
               ar.doc_verification_status as overall_status,
               EXISTS(SELECT 1 FROM documents WHERE application_no = s.application_no) as documents_uploaded
        FROM allotment_results ar
        JOIN students s ON ar.application_no = s.application_no
        JOIN programs p ON ar.program_id = p.id
        WHERE ar.institute_id = ?
    `, [instId], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});
router.get("/api/institute/documents/:appNo", (req, res) => {
    if (!req.session.institute) return res.status(403).send("Access denied");
    const appNo = req.params.appNo;
    db.query("SELECT id, document_name, document_path, verification_status, verification_remark FROM documents WHERE application_no = ?", [appNo], (err, docs) => {
        if (err) return res.status(500).send("Database error");
        if (docs.length === 0) return res.send("<h2>No documents uploaded yet.</h2><a href='javascript:history.back()'>Back</a>");
        let html = `
            <!DOCTYPE html>
            <html>
            <head><title>Document Verification</title><link rel="stylesheet" href="/style.css"><style>
                .doc-card { border:1px solid #ddd; padding:15px; margin:10px 0; border-radius:8px; }
                .status-pending{ color:#ff9800; } .status-verified{ color:#4CAF50; } .status-rejected{ color:#f44336; }
                button { margin:5px; padding:5px 15px; cursor:pointer; }
                .remark-box { margin-top:10px; padding:8px; background:#f5f5f5; border-radius:5px; }
            </style></head>
            <body><header><div class="logo">Document Verification</div><nav><a href="/instituteadmin/dashboard.html">Dashboard</a><a href="/logout">Logout</a></nav></header>
            <section class="section"><div class="card"><h2>Documents for Student: ${appNo}</h2>`;
        docs.forEach(doc => {
            const statusClass = doc.verification_status === 'Verified' ? 'status-verified' : (doc.verification_status === 'Rejected' ? 'status-rejected' : 'status-pending');
            html += `
                <div class="doc-card" id="doc-${doc.id}">
                    <p><strong>Document:</strong> ${doc.document_name} &nbsp; <a href="/uploads/${doc.document_path}" target="_blank">📄 View</a></p>
                    <p><strong>Status:</strong> <span class="${statusClass}">${doc.verification_status || 'Pending'}</span></p>
                    ${doc.verification_remark ? `<div class="remark-box"><strong>Remark:</strong> ${doc.verification_remark}</div>` : ''}
                    <div>
                        <button onclick="verifyDoc(${doc.id}, 'Verified', '')">✅ Verify</button>
                        <button onclick="rejectDoc(${doc.id})">❌ Reject</button>
                    </div>
                </div>
            `;
        });
        html += `<div style="margin-top:20px;"><a href="/instituteadmin/dashboard.html" class="btn">Back to Dashboard</a></div>
            </div></section>
            <script>
            async function verifyDoc(docId, status, remark) {
                const res = await fetch('/api/institute/verify-document', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ document_id: docId, status, remark })
                });
                const data = await res.json();
                if(data.success) location.reload();
                else alert('Failed to update');
            }
            async function rejectDoc(docId) {
                const remark = prompt('Enter reason for rejection:');
                if(remark) await verifyDoc(docId, 'Rejected', remark);
            }
            </script>
            </body></html>`;
        res.send(html);
    });
});
router.post("/api/institute/verify-document", (req, res) => {
    if (!req.session.institute) return res.status(403).json({ error: "Unauthorized" });
    const { document_id, status, remark } = req.body;
    db.query("UPDATE documents SET verification_status = ?, verification_remark = ? WHERE id = ?", [status, remark || null, document_id], (err) => {
        if (err) return res.status(500).json({ error: err });
        db.query("SELECT application_no FROM documents WHERE id = ?", [document_id], (err, docResult) => {
            if (err || docResult.length === 0) return res.status(500).json({ error: "Document not found" });
            const appNo = docResult[0].application_no;
            db.query("SELECT verification_status FROM documents WHERE application_no = ?", [appNo], (err, docs) => {
                if (err) return res.status(500).json({ error: err });
                let overall = "Accepted";
                for (let doc of docs) {
                    if (doc.verification_status === "Rejected") {
                        overall = "Rejected";
                        break;
                    } else if (doc.verification_status !== "Verified") {
                        overall = "Pending";
                    }
                }
                db.query("UPDATE allotment_results SET doc_verification_status = ? WHERE application_no = ?", [overall, appNo], (err) => {
                    if (err) return res.status(500).json({ error: err });
                    res.json({ success: true });
                });
            });
        });
    });
});
router.get("/instituteadmin/dashboard.html", (req, res) => {
    if (!req.session.institute) return res.redirect("/admin_login.html");
    res.sendFile(path.join(__dirname, "../adminportal/instituteadmin/dashboard.html"));
});

module.exports = router;