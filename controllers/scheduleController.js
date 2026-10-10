const pool = require("../config/db");

// Helper: given day_of_week + time_of_day, compute the next datetime >= now
const computeNextRun = (dayOfWeek, timeOfDay) => {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const targetDay = days.indexOf(dayOfWeek.toLowerCase());
  const [hours, minutes] = timeOfDay.split(":").map(Number);

  const now = new Date();
  const candidate = new Date();
  candidate.setHours(hours, minutes, 0, 0);

  const currentDay = now.getDay();
  let daysAhead = (targetDay - currentDay + 7) % 7;

  if (daysAhead === 0 && candidate <= now) {
    daysAhead = 7;
  }

  candidate.setDate(candidate.getDate() + daysAhead);
  return candidate;
};

const createSchedule = async (req, res) => {
  try {
    const {
      location_id,
      waste_category_id,
      description,
      frequency,
      day_of_week,
      time_of_day,
    } = req.body;

    if (
      !location_id ||
      !waste_category_id ||
      !frequency ||
      !day_of_week ||
      !time_of_day
    ) {
      return res.status(400).json({
        message: "Location, waste type, frequency, day, and time are required",
      });
    }

    if (!["weekly", "biweekly"].includes(frequency)) {
      return res
        .status(400)
        .json({ message: "Frequency must be weekly or biweekly" });
    }

    const [locations] = await pool.query(
      "SELECT id FROM customer_locations WHERE id = ? AND user_id = ?",
      [location_id, req.user.id],
    );
    if (!locations.length) {
      return res.status(403).json({
        message: "You can only schedule pickups for your own locations",
      });
    }

    const nextRun = computeNextRun(day_of_week, time_of_day);

    const [result] = await pool.query(
      `INSERT INTO pickup_schedules
       (customer_id, location_id, waste_category_id, description, frequency, day_of_week, time_of_day, next_run_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        req.user.id,
        location_id,
        waste_category_id,
        description || null,
        frequency,
        day_of_week.toLowerCase(),
        time_of_day,
        nextRun,
      ],
    );

    res.status(201).json({ message: "Schedule created", id: result.insertId });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Could not create schedule", error: error.message });
  }
};

const getMySchedules = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ps.*, wc.name AS waste_type, cl.location_name
       FROM pickup_schedules ps
       JOIN waste_categories wc ON wc.id = ps.waste_category_id
       JOIN customer_locations cl ON cl.id = ps.location_id
       WHERE ps.customer_id = ?
       ORDER BY ps.created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Could not load schedules", error: error.message });
  }
};

const pauseSchedule = async (req, res) => {
  const [result] = await pool.query(
    "UPDATE pickup_schedules SET active = FALSE WHERE id = ? AND customer_id = ?",
    [req.params.id, req.user.id],
  );
  if (!result.affectedRows)
    return res.status(404).json({ message: "Schedule not found" });
  res.json({ message: "Schedule paused" });
};

const resumeSchedule = async (req, res) => {
  const [rows] = await pool.query(
    "SELECT day_of_week, time_of_day FROM pickup_schedules WHERE id = ? AND customer_id = ?",
    [req.params.id, req.user.id],
  );
  if (!rows.length)
    return res.status(404).json({ message: "Schedule not found" });

  const nextRun = computeNextRun(rows[0].day_of_week, rows[0].time_of_day);

  await pool.query(
    "UPDATE pickup_schedules SET active = TRUE, next_run_at = ? WHERE id = ? AND customer_id = ?",
    [nextRun, req.params.id, req.user.id],
  );
  res.json({ message: "Schedule resumed" });
};

const deleteSchedule = async (req, res) => {
  const [result] = await pool.query(
    "DELETE FROM pickup_schedules WHERE id = ? AND customer_id = ?",
    [req.params.id, req.user.id],
  );
  if (!result.affectedRows)
    return res.status(404).json({ message: "Schedule not found" });
  res.json({ message: "Schedule deleted" });
};

module.exports = {
  createSchedule,
  getMySchedules,
  pauseSchedule,
  resumeSchedule,
  deleteSchedule,
};
