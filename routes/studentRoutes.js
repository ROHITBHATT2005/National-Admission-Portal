const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { protect } = require("../middleware/auth");
const router = express.Router();
const uploadDir = path.join(__dirname,"../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, req.session.user.appNo + "-" + unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 } });
router.post("/login", (req, res) => {
    const { application_no, password } = req.body;
    db.query("SELECT counselling_started FROM admin_config LIMIT 1", (err, configResult) => {
        if (err) return res.status(500).json({ success: false });
        if (!configResult[0]?.counselling_started) {
            return res.status(403).json({ success: false, message: "Counselling not started" });
        }
        db.query("SELECT * FROM students WHERE application_no=? AND password=?", [application_no, password], (err, result) => {
            if (err || result.length === 0) return res.status(401).json({ success: false, message: "Wrong credentials" });
            req.session.user = { appNo: application_no };
            res.json({ success: true });
        });
    });
});
router.get("/api/me", protect, (req, res) => {
    db.query("SELECT full_name, application_no, phone, email, student_rank, father_name, mother_name, age, aadhar, state, district, address, category FROM students WHERE application_no=?", [req.session.user.appNo], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json(result[0]);
    });
});
router.get("/api/has-choices", protect, (req, res) => {
    db.query("SELECT COUNT(*) as count FROM choices WHERE application_no = ?", [req.session.user.appNo], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ hasChoices: result[0].count > 0 });
    });
});
router.get("/api/allotment", protect, (req, res) => {
    const appNo = req.session.user.appNo;
    db.query(`
        SELECT ar.institute_id, ar.program_id, ar.doc_verification_status as verification_status, ar.doc_verification_remark as verification_remark,
               i.institute_name, p.program_name, ar.allotted_rank, ar.category
        FROM allotment_results ar
        LEFT JOIN institutes i ON ar.institute_id = i.id
        LEFT JOIN programs p ON ar.program_id = p.id
        WHERE ar.application_no = ?
    `, [appNo], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) {
            db.query("SELECT student_rank, category FROM students WHERE application_no = ?", [appNo], (err2, student) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ allotted: false, rank: student[0]?.student_rank, category: student[0]?.category });
            });
        } else {
            res.json({ allotted: true, ...result[0] });
        }
    });
});
router.get("/api/student/documents", protect, (req, res) => {
    const appNo = req.session.user.appNo;
    db.query("SELECT id, document_name, verification_status, verification_remark FROM documents WHERE application_no = ?", [appNo], (err, docs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(docs);
    });
});
router.post("/api/student/upload-documents", protect, upload.fields([
    { name: "tenth", maxCount: 1 },
    { name: "twelfth", maxCount: 1 },
    { name: "category", maxCount: 1 },
    { name: "aadhar", maxCount: 1 }
]), (req, res) => {
    const appNo = req.session.user.appNo;
    db.query("SELECT application_no FROM allotment_results WHERE application_no = ?", [appNo], (err, allotRes) => {
        if (err || allotRes.length === 0) {
            return res.status(403).json({ success: false, message: "No seat allotted" });
        }
        const files = req.files;
        const updates = [];
        const docMap = {
            tenth: "10th Marksheet",
            twelfth: "12th Marksheet",
            category: "Category Certificate",
            aadhar: "Aadhar Card"
        };
        for (const [field, docName] of Object.entries(docMap)) {
            if (files[field] && files[field][0]) {
                updates.push([appNo, docName, files[field][0].filename]);
            }
        }
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No files selected" });
        }
        const namesToReplace = updates.map(u => u[1]);
        db.query("DELETE FROM documents WHERE application_no = ? AND document_name IN (?)", [appNo, namesToReplace], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Error cleaning old docs" });
            const values = updates.map(([app, name, filepath]) => [app, name, filepath, "Pending", null]);
            db.query("INSERT INTO documents (application_no, document_name, document_path, verification_status, verification_remark) VALUES ?", [values], (err) => {
                if (err) return res.status(500).json({ success: false, message: "DB error" });
                db.query("SELECT verification_status FROM documents WHERE application_no = ?", [appNo], (err, docs) => {
                    if (err) return res.status(500).json({ success: false });
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
                        if (err) return res.status(500).json({ success: false });
                        res.json({ success: true, message: "Documents uploaded successfully. Awaiting verification." });
                    });
                });
            });
        });
    });
});
router.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/HomePage.html"));
});
router.get("/profile/dashboard.html", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "../student-portal/profile/dashboard.html"));
});
router.get("/profile/allotment.html", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "../student-portal/profile/allotment.html"));
});
router.get("/profile/documentupload.html", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "../student-portal/profile/documentupload.html"));
});
router.get("/profile/choicefilling.html", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "../student-portal/profile/choicefilling.html"));
});
router.get("/profile/viewchoices.html", protect, (req, res) => {
    res.sendFile(path.join(__dirname, "../student-portal/profile/viewchoices.html"));
});
router.post("/api/submitchoices", protect, (req, res) => {
    const { choices } = req.body;
    const appNo = req.session.user.appNo;
    if (!choices || choices.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid choices" });
    }
    db.query("DELETE FROM choices WHERE application_no=?", [appNo], (err) => {
        if (err) return res.status(500).json({ success: false });
        const values = choices.map(c => [appNo, c.institute_id, c.program_id, c.priority]);
        db.query("INSERT INTO choices (application_no, institute_id, program_id, priority) VALUES ?", [values], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
    });
});
router.get("/api/mychoices", protect, (req, res) => {
    const appNo = req.session.user.appNo;
    db.query(`
        SELECT c.priority, c.institute_id, c.program_id, 
               i.institute_name, p.program_name
        FROM choices c
        JOIN institutes i ON c.institute_id = i.id
        JOIN programs p ON c.program_id = p.id
        WHERE c.application_no = ?
        ORDER BY c.priority ASC
    `, [appNo], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json(result);
    });
});
module.exports = router;