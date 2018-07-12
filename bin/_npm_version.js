#!/usr/bin/env node
'use strict';
/* eslint-env node */
const fs = require('fs');
const path = require('path');

const {version, description} = require('../package.json');

const manifestPath = path.join(__dirname, '..', 'manifest.json');
const original = fs.readFileSync(manifestPath, 'utf8');
const manifestBody = JSON.parse(original);
manifestBody.version = version;
manifestBody.description = description;
const updated = JSON.stringify(manifestBody, null, 4);
fs.writeFileSync(manifestPath, updated);
