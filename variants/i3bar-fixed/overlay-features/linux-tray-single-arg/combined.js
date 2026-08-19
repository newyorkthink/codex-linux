"use strict";

const trayCompatibility = require("./patch.js");
const titlebarOverlayTheme = require("./components/titlebar-overlay-theme/patch.js");

module.exports = {
  descriptors: [
    ...titlebarOverlayTheme.descriptors,
    ...trayCompatibility.descriptors,
  ],
};
