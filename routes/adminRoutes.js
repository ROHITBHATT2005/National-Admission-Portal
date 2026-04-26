const express = require("express");
const db = require("../db");
const allotment = require("../allotment");
const router = express.Router();
router.post("/api/admin/login", (req,res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM admin_config LIMIT 1", (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ success: false });
        const admin = result[0];
        if (username === admin.username && password === admin.password) {
            req.session.admin = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: "Invalid credentials" });
        }
    });
});
router.get("/api/admin/allotment-status", (req, res) => {
    if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
    db.query("SELECT allotment_announced, counselling_started FROM admin_config LIMIT 1", (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({
            announced: result[0]?.allotment_announced === 1,
            counselling_started: result[0]?.counselling_started === 1
        });
    });
});
router.post("/api/admin/set-allotment-status", async (req, res) => {
    if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
    const { announced } = req.body;
    if (announced === true) {
        console.log("Releasing allotment results – running bulk allotment...");
        const bulkResult = await allotment.processBulkAllotment(db);
        if (!bulkResult.success) {
            return res.status(500).json({ error: "Bulk allotment failed: " + bulkResult.message });
        }
        console.log(`Bulk allotment completed. Allotted ${bulkResult.total_allotted} students.`);
    }
    db.query("UPDATE admin_config SET allotment_announced = ?", [announced ? 1 : 0], (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true });
    });
});
router.post("/api/admin/start-counselling", (req, res) => {
    if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
    db.query("UPDATE admin_config SET counselling_started = 1", (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true });
    });
});
router.post("/api/admin/stop-counselling", (req, res) => {
    if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
    db.query("UPDATE admin_config SET counselling_started = 0", (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ success: true });
    });
});
router.post("/api/bulk-allotment",(req,res) =>{
    if (!req.session.admin) return res.status(403).json({ error: "Unauthorized" });
    allotment.processBulkAllotment(db).then(result => res.json(result)).catch(err => res.status(500).json({ error: err.message }));
});
router.get("/admin/dashboard.html", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin_login.html");
    res.sendFile(path.join(__dirname, "../adminportal/admin/dashboard.html"));
});
module.exports = router;