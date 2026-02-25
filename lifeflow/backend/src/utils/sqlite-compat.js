/**
 * SQLite-compatible model patches
 * Replaces PostgreSQL-specific types with SQLite-compatible ones
 */

const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Patch DataTypes for SQLite compatibility
const originalArray = DataTypes.ARRAY;
const originalJsonb = DataTypes.JSONB;

// Override ARRAY -> TEXT (JSON serialized)
DataTypes.ARRAY = (type) => DataTypes.TEXT;

// JSONB -> TEXT (JSON serialized)
// Already TEXT in SQLite

// Override UUIDV4 to use uuid library
const patchModel = (Model) => {
  // No-op, handled at model level
};

module.exports = { patchModel };
