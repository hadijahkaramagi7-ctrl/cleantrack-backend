// Background job: every minute, check pickup_schedules for due rows.
// For each due row, create a new pickup_request and advance next_run_at.

const pool = require("../config/db");

const processDueSchedules = async () => {
  try {
    const [due] = await pool.query(
      `SELECT * FROM pickup_schedules
       WHERE active = TRUE AND next_run_at <= NOW()`,
    );

    if (!due.length) return;

    console.log(`[scheduler] ${due.length} schedule(s) due`);

    for (const schedule of due) {
      try {
        // Create the pickup request
        await pool.query(
          `INSERT INTO pickup_requests
           (customer_id, location_id, waste_category_id, description, urgency, estimated_bin_level)
           VALUES (?, ?, ?, ?, 'normal', 70)`,
          [
            schedule.customer_id,
            schedule.location_id,
            schedule.waste_category_id,
            (schedule.description || "Recurring pickup") +
              ` (auto from schedule #${schedule.id})`,
          ],
        );

        // Notify the customer
        await pool.query(
          "INSERT INTO notifications (user_id, title, message, status) VALUES (?, ?, ?, 'unread')",
          [
            schedule.customer_id,
            "Recurring pickup created",
            `A new pickup request has been automatically created from your recurring schedule #${schedule.id}.`,
          ],
        );

        // Advance next_run_at
        const weeksToAdd = schedule.frequency === "biweekly" ? 2 : 1;
        await pool.query(
          `UPDATE pickup_schedules
           SET next_run_at = DATE_ADD(next_run_at, INTERVAL ? WEEK)
           WHERE id = ?`,
          [weeksToAdd, schedule.id],
        );
      } catch (innerErr) {
        console.error(
          `[scheduler] Failed for schedule #${schedule.id}:`,
          innerErr.message,
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Error:", err.message);
  }
};

// Run every 60 seconds
const startScheduler = () => {
  console.log("[scheduler] Background job started — checking every 60s");
  setInterval(processDueSchedules, 60000);
  // Run once at startup too
  processDueSchedules();
};

module.exports = { startScheduler, processDueSchedules };
