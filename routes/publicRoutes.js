const express = require("express");
const db = require("../db");
const router = express.Router();
router.get("/api/counselling-status", (req, res) => {
    db.query("SELECT counselling_started FROM admin_config LIMIT 1", (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ started: result[0]?.counselling_started === 1 });
    });
});
router.get("/api/allotment-announced", (req, res) => {
    db.query("SELECT allotment_announced FROM admin_config LIMIT 1", (err, result) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ announced: result[0]?.allotment_announced === 1 });
    });
});
router.get("/api/institutes", (req, res) => {
    db.query("SELECT id, institute_name FROM institutes", (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json(result);
    });
});
router.get("/api/programs", (req, res) => {
    db.query("SELECT id, program_name FROM programs", (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json(result);
    });
});
router.get("/api/public/seat-matrix", (req, res) => {
    db.query(`
        SELECT i.institute_name, p.program_name, 
               sm.total_seats, sm.general_seats, sm.obc_seats, 
               sm.sc_seats, sm.st_seats, sm.ews_seats
        FROM seat_matrix sm
        JOIN institutes i ON sm.institute_id = i.id
        JOIN programs p ON sm.program_id = p.id
        ORDER BY i.id, p.id
    `, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
router.get("/api/public/seat-matrix-by-institute", (req, res) => {
    const { institute_id } = req.query;
    if (!institute_id) return res.status(400).json({ error: "Institute ID required" });
    db.query(`
        SELECT p.program_name, 
               sm.general_cutoff, sm.obc_cutoff, sm.sc_cutoff, sm.st_cutoff, sm.ews_cutoff
        FROM seat_matrix sm
        JOIN programs p ON sm.program_id = p.id
        WHERE sm.institute_id = ?
        ORDER BY p.id
    `, [institute_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});
module.exports = router;