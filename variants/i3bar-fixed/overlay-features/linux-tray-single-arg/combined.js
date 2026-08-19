"use strict";

const trayCompatibility = require("./patch.js");
const conversationTabs = require("./components/conversation-tabs.js");
const defaultHighReasoning = require("./components/default-high-reasoning.js");
const imagePreviewCloseSafe = require("./components/image-preview-close-safe.js");
const suppressWorkHandoff = require("./components/suppress-work-handoff.js");
const titlebarOverlayTheme = require("./components/titlebar-overlay-theme/patch.js");

module.exports = {
  descriptors: [
    ...conversationTabs.descriptors,
    ...defaultHighReasoning.descriptors,
    ...imagePreviewCloseSafe.descriptors,
    ...suppressWorkHandoff.descriptors,
    ...titlebarOverlayTheme.descriptors,
    ...trayCompatibility.descriptors,
  ],
};
