/**
 * @fileoverview Zone Registry — defines all venue zones, aliases, sheet ranges, and alternatives.
 * @module config/zones
 */

"use strict";

/**
 * @typedef {Object} Zone
 * @property {string} name - Canonical zone name
 * @property {string[]} aliases - Lowercase aliases for NLP matching
 * @property {string} range - Google Sheets cell range for this zone
 * @property {string[]} alternatives - Alternative zones for rerouting
 */

/** @type {Zone[]} */
const ZONES = [
    {
        name: "South Gate",
        aliases: ["south gate", "south entrance", "s gate"],
        range: "venue_status!B2:H2",
        alternatives: ["North Gate", "East Gate", "West Gate"],
    },
    {
        name: "North Gate",
        aliases: ["north gate", "north entrance", "n gate"],
        range: "venue_status!B3:H3",
        alternatives: ["South Gate", "East Gate", "West Gate"],
    },
    {
        name: "Food Court A",
        aliases: ["food court a", "food court 1", "food area a"],
        range: "venue_status!B4:H4",
        alternatives: ["Food Court B"],
    },
    {
        name: "Food Court B",
        aliases: ["food court b", "food court 2", "food area b"],
        range: "venue_status!B6:H6",
        alternatives: ["Food Court A"],
    },
    {
        name: "East Gate",
        aliases: ["east gate", "east entrance", "e gate"],
        range: "venue_status!B7:H7",
        alternatives: ["West Gate", "North Gate"],
    },
    {
        name: "West Gate",
        aliases: ["west gate", "west entrance", "w gate"],
        range: "venue_status!B8:H8",
        alternatives: ["East Gate", "South Gate"],
    },
    {
        name: "Main Stage",
        aliases: ["main stage", "stage", "main arena"],
        range: "venue_status!B9:H9",
        alternatives: ["Side Stage"],
    },
    {
        name: "Restroom",
        aliases: ["restroom", "washroom", "bathroom", "toilet"],
        range: "venue_status!B10:H10",
        alternatives: [],
    },
    {
        name: "Parking",
        aliases: ["parking", "car park", "parking lot"],
        range: "venue_status!B11:H11",
        alternatives: [],
    },
];

module.exports = { ZONES };
