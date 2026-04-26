async function queryPromise(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}
async function processBulkAllotment(db) {
    try {
        console.log("========== STARTING BULK ALLOTMENT ==========");
        const students = await queryPromise(db, `
            SELECT s.application_no, s.student_rank, LOWER(s.category) as category
            FROM students s
            WHERE EXISTS (SELECT 1 FROM choices c WHERE c.application_no = s.application_no)
            ORDER BY s.student_rank ASC
        `);
        console.log(`Found ${students.length} students with submitted choices`);
        let seats = await queryPromise(db, `SELECT * FROM seat_availability`);
        let seatMap = {};
        seats.forEach(s => {
            const key = `${s.institute_id}_${s.program_id}_${s.category}`;
            seatMap[key] = {
                total: s.total_seats,
                filled: 0,
                cutoff: s.cutoff_rank
            };
        });
        const allotments = [];
        let totalAllotted = 0;
        for (const student of students) {
            const studentCategory = student.category;
            const studentRank = student.student_rank;
            const choices = await queryPromise(db, `
                SELECT institute_id, program_id, priority
                FROM choices
                WHERE application_no = ?
                ORDER BY priority ASC
            `, [student.application_no]);
            let allotted = false;
            for (const choice of choices) {
                const key = `${choice.institute_id}_${choice.program_id}_${studentCategory}`;
                const seat = seatMap[key];
                if (seat && seat.filled < seat.total && studentRank <= seat.cutoff) {
                    seat.filled++;
                    allotments.push({
                        application_no: student.application_no,
                        institute_id: choice.institute_id,
                        program_id: choice.program_id,
                        allotted_rank: studentRank,
                        category: studentCategory,
                        round: 1
                    });
                    totalAllotted++;
                    allotted = true;
                    break;
                }
            }
        }
        for (const key in seatMap) {
            const parts = key.split('_');
            const instId = parts[0];
            const progId = parts[1];
            const cat = parts[2];
            await queryPromise(db, `
                UPDATE seat_availability
                SET filled_seats = ?
                WHERE institute_id = ? AND program_id = ? AND category = ?
            `, [seatMap[key].filled, instId, progId, cat]);
        }
        await queryPromise(db, "DELETE FROM allotment_results", []);
        for (const allot of allotments) {
            await queryPromise(db, `
                INSERT INTO allotment_results
                (application_no, institute_id, program_id, allotted_rank, category, round)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [allot.application_no, allot.institute_id, allot.program_id,
            allot.allotted_rank, allot.category, allot.round]);
        }
        console.log(`✅ Bulk allotment completed. Total students: ${students.length}, Allotted: ${totalAllotted}`);
        return {
            success: true,
            total_students: students.length,
            total_allotted: totalAllotted,
        };
    } catch (error) {
        console.error("Bulk allotment error:", error);
        return { success: false, message: error.message };
    }
}
async function getAllotment(db, appNo) {
    try {
        const student = await queryPromise(db, `SELECT student_rank, category FROM students WHERE application_no = ?`, [appNo]);
        if (student.length === 0) {
            return { success: false, message: "Student not found" };
        }
        const studentRank = student[0].student_rank;
        const studentCategory = student[0].category.toUpperCase();
        const config = await queryPromise(db, `SELECT allotment_announced FROM admin_config WHERE id = 1`);
        const announced = config[0]?.allotment_announced === 1;
        if (!announced) {
            return {
                success: true,
                allotted: false,
                message: "Allotment results have not been released yet.",
                data: { rank: studentRank, category: studentCategory }
            };
        }
        const result = await queryPromise(db, `
            SELECT ar.*, i.institute_name, p.program_name
            FROM allotment_results ar
            JOIN institutes i ON ar.institute_id = i.id
            JOIN programs p ON ar.program_id = p.id
            WHERE ar.application_no = ?
        `, [appNo]);
        if (result.length === 0) {
            return {
                success: true,
                allotted: false,
                message: "No seat allotted to you.",
                data: { rank: studentRank, category: studentCategory }
            };
        }
        const data = result[0];
        const cutoffRow = await queryPromise(db, `
            SELECT cutoff_rank FROM seat_availability
            WHERE institute_id = ? AND program_id = ? AND category = ?
        `, [data.institute_id, data.program_id, data.category]);
        const cutoffMet = cutoffRow.length > 0 ? cutoffRow[0].cutoff_rank : 'N/A';
        return {
            success: true,
            allotted: true,
            data: {
                institute_name: data.institute_name,
                program_name: data.program_name,
                rank: data.allotted_rank,
                category: data.category.toUpperCase(),
                round: data.round,
                cutoff_met: cutoffMet
            }
        };
    } catch (error) {
        console.error("Get allotment error:", error);
        return { success: false, message: error.message };
    }
}
module.exports = { processBulkAllotment, getAllotment };