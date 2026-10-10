const pool = require("../config/db");

const createNotification = async (userId, title, message) => {
  if (!userId) return;
  await pool.query(
    "INSERT INTO notifications (user_id, title, message, status) VALUES (?, ?, ?, 'unread')",
    [userId, title, message],
  );
};

const getPickupCustomerForAssignment = async (assignmentId) => {
  const [rows] = await pool.query(
    `SELECT pr.customer_id, pr.id AS pickup_id
     FROM pickup_assignments pa
     JOIN pickup_requests pr ON pr.id = pa.pickup_request_id
     WHERE pa.id = ?`,
    [assignmentId],
  );
  return rows[0] || null;
};

const getManagerCompanyId = async (managerId) => {
  const [companies] = await pool.query(
    "SELECT id FROM waste_companies WHERE manager_id = ?",
    [managerId],
  );
  return companies[0]?.id;
};

const createAssignment = async (req, res) => {
  const { pickup_request_id, truck_id, driver_id } = req.body;
  const companyId = await getManagerCompanyId(req.user.id);

  if (!companyId)
    return res.status(400).json({ message: "Create a company profile first" });
  if (!pickup_request_id || !truck_id || !driver_id) {
    return res
      .status(400)
      .json({ message: "Pickup request, truck, and driver are required" });
  }

  const [trucks] = await pool.query(
    "SELECT id FROM trucks WHERE id = ? AND company_id = ?",
    [truck_id, companyId],
  );
  if (!trucks.length)
    return res
      .status(403)
      .json({ message: "You can only assign your own company trucks" });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [assignment] = await connection.query(
      `INSERT INTO pickup_assignments
       (pickup_request_id, company_id, truck_id, driver_id, assigned_by, status)
       VALUES (?, ?, ?, ?, ?, 'assigned')`,
      [pickup_request_id, companyId, truck_id, driver_id, req.user.id],
    );

    const [pickupUpdate] = await connection.query(
      "UPDATE pickup_requests SET status = 'assigned' WHERE id = ? AND status = 'pending'",
      [pickup_request_id],
    );

    if (!pickupUpdate.affectedRows) {
      throw new Error("Pickup request is not pending or does not exist");
    }

    await connection.commit();
    res
      .status(201)
      .json({ message: "Pickup assigned", id: assignment.insertId });
  } catch (error) {
    await connection.rollback();
    res
      .status(500)
      .json({ message: "Could not assign pickup", error: error.message });
  } finally {
    connection.release();
  }
};

const getDriverJobs = async (req, res) => {
  const [jobs] = await pool.query(
    `SELECT pa.*, pr.description, pr.urgency, pr.estimated_bin_level, pr.photo,
            wc.name AS waste_type, cl.location_name, cl.district, cl.address_details
     FROM pickup_assignments pa
     JOIN pickup_requests pr ON pr.id = pa.pickup_request_id
     JOIN waste_categories wc ON wc.id = pr.waste_category_id
     JOIN customer_locations cl ON cl.id = pr.location_id
     WHERE pa.driver_id = ?
     ORDER BY pa.assigned_at DESC`,
    [req.user.id],
  );
  res.json(jobs);
};

const getCompanyJobs = async (req, res) => {
  const companyId = await getManagerCompanyId(req.user.id);
  if (!companyId) return res.json([]);

  const [jobs] = await pool.query(
    `SELECT pa.*, pr.description, pr.urgency, pr.status AS pickup_status,
            wc.name AS waste_type, cl.location_name, cl.district,
            d.full_name AS driver_name, t.truck_number_plate
     FROM pickup_assignments pa
     JOIN pickup_requests pr ON pr.id = pa.pickup_request_id
     JOIN waste_categories wc ON wc.id = pr.waste_category_id
     JOIN customer_locations cl ON cl.id = pr.location_id
     JOIN users d ON d.id = pa.driver_id
     JOIN trucks t ON t.id = pa.truck_id
     WHERE pa.company_id = ?
     ORDER BY pa.assigned_at DESC`,
    [companyId],
  );
  res.json(jobs);
};

const updateStatus = async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ["assigned", "on_the_way", "collected", "failed"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const [result] = await pool.query(
    "UPDATE pickup_assignments SET status = ? WHERE id = ? AND driver_id = ?",
    [status, req.params.id, req.user.id],
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: "Assignment not found" });

  await pool.query(
    `UPDATE pickup_requests pr
     JOIN pickup_assignments pa ON pa.pickup_request_id = pr.id
     SET pr.status = ?
     WHERE pa.id = ?`,
    [status, req.params.id],
  );

  // Notify the customer about the status change
  const pickup = await getPickupCustomerForAssignment(req.params.id);
  if (pickup) {
    const statusLabels = {
      assigned: "has been assigned to a driver",
      on_the_way: "driver is on the way",
      collected: "has been collected",
      failed: "could not be completed",
    };
    await createNotification(
      pickup.customer_id,
      "Pickup status updated",
      `Your pickup request #${pickup.pickup_id} ${statusLabels[status] || status}.`,
    );
  }

  res.json({ message: "Assignment status updated" });
};

const completeAssignment = async (req, res) => {
  const { collection_notes, waste_quantity_collected } = req.body;
  const proofPhoto = req.file
    ? `/uploads/proof-photos/${req.file.filename}`
    : null;

  const [result] = await pool.query(
    `UPDATE pickup_assignments
     SET status = 'collected', collection_notes = ?, waste_quantity_collected = ?, proof_photo = COALESCE(?, proof_photo), completed_at = NOW()
     WHERE id = ? AND driver_id = ?`,
    [
      collection_notes || null,
      waste_quantity_collected || null,
      proofPhoto,
      req.params.id,
      req.user.id,
    ],
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: "Assignment not found" });

  await pool.query(
    `UPDATE pickup_requests pr
     JOIN pickup_assignments pa ON pa.pickup_request_id = pr.id
     SET pr.status = 'collected', pr.completed_at = NOW()
     WHERE pa.id = ?`,
    [req.params.id],
  );

  const pickup = await getPickupCustomerForAssignment(req.params.id);
  if (pickup) {
    await createNotification(
      pickup.customer_id,
      "Pickup collected",
      `Your pickup request #${pickup.pickup_id} has been marked as collected. Thank you!`,
    );
  }

  res.json({ message: "Pickup marked as collected" });
};

const failAssignment = async (req, res) => {
  const { failure_reason } = req.body;
  if (!failure_reason)
    return res.status(400).json({ message: "Failure reason is required" });

  const [result] = await pool.query(
    "UPDATE pickup_assignments SET status = 'failed', failure_reason = ?, completed_at = NOW() WHERE id = ? AND driver_id = ?",
    [failure_reason, req.params.id, req.user.id],
  );

  if (!result.affectedRows)
    return res.status(404).json({ message: "Assignment not found" });

  await pool.query(
    `UPDATE pickup_requests pr
     JOIN pickup_assignments pa ON pa.pickup_request_id = pr.id
     SET pr.status = 'failed', pr.completed_at = NOW()
     WHERE pa.id = ?`,
    [req.params.id],
  );

  const pickup = await getPickupCustomerForAssignment(req.params.id);
  if (pickup) {
    await createNotification(
      pickup.customer_id,
      "Pickup could not be completed",
      `Your pickup request #${pickup.pickup_id} failed. Reason: ${failure_reason}`,
    );
  }

  res.json({ message: "Pickup marked as failed" });
};

module.exports = {
  createAssignment,
  getDriverJobs,
  getCompanyJobs,
  updateStatus,
  completeAssignment,
  failAssignment,
};
