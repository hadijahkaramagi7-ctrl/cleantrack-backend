const pool = require("../config/db");

// List all notifications for the logged-in user (newest first)
const getMyNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, message, status, created_at, read_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Could not load notifications", error: error.message });
  }
};

// Count unread notifications for the badge
const getUnreadCount = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND status = 'unread'",
      [req.user.id],
    );
    res.json({ count: rows[0].count });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Could not count notifications", error: error.message });
  }
};

// Mark a single notification as read (only your own)
const markAsRead = async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications
       SET status = 'read', read_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json({ message: "Notification marked as read" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Could not update notification", error: error.message });
  }
};

// Mark all of my notifications as read
const markAllAsRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET status = 'read', read_at = NOW()
       WHERE user_id = ? AND status = 'unread'`,
      [req.user.id],
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({
      message: "Could not update notifications",
      error: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
