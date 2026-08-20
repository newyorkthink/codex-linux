"use strict";

const trayCompatibility = require("./patch.js");
const imagePreviewCloseSafe = require("./components/image-preview-close-safe.js");
const titlebarOverlayTheme = require("./components/titlebar-overlay-theme/patch.js");

module.exports = {
  descriptors: [
    ...imagePreviewCloseSafe.descriptors,
    ...titlebarOverlayTheme.descriptors,
    ...trayCompatibility.descriptors,
  ],
};
