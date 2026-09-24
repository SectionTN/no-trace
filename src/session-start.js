#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { emit } = require("./hook");

const rules = fs
	.readFileSync(path.join(__dirname, "..", "context.md"), "utf8")
	.trim();
emit("SessionStart", { additionalContext: rules });
