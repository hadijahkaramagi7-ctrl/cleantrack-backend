-- Migration 001: Add is_favourite column to customer_locations
-- Date: 2026-10-10
-- Purpose: Support Favourite Locations feature

USE cleantrack_uganda;

ALTER TABLE customer_locations
ADD COLUMN is_favourite BOOLEAN NOT NULL DEFAULT FALSE;