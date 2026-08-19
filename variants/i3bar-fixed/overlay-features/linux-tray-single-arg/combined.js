"use strict";

const trayCompatibility = require("./patch.js");
const conversationTabs = require("./components/conversation-tabs.js");
const titlebarOverlayTheme = require("./components/titlebar-overlay-theme/patch.js");

module.exports = {
  descriptors: [
    ...conversationTabs.descriptors,
    ...titlebarOverlayTheme.descriptors,
    ...trayCompatibility.descriptors,
  ],
};
