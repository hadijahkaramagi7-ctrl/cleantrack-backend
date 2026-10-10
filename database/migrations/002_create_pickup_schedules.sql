-- Migration 002: Create pickup_schedules table
-- Date: 2026-10-10
-- Purpose: Support Recurring Pickup Schedules feature

USE cleantrack_uganda;

CREATE TABLE pickup_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  location_id INT NOT NULL,
  waste_category_id INT NOT NULL,
  description TEXT,
  frequency ENUM('weekly', 'biweekly') NOT NULL DEFAULT 'weekly',
  day_of_week ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
  time_of_day TIME NOT NULL,
  next_run_at DATETIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES customer_locations(id) ON DELETE CASCADE,
  FOREIGN KEY (waste_category_id) REFERENCES waste_categories(id)
);