#!/usr/bin/env node
/*
 * Next.js 16.4.x can leave stale development route validators under
 * .next/dev/types after routes are moved or deleted. Those generated files
 * must not be checked as part of a production build.
 *
 * Run this only as part of "npm run build" after stopping "next dev".
 * Preserve the rest of .next/dev (cache and logs).
 */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const devTypesDirectory = path.join(projectRoot, '.next', 'dev', 'types');

try {
  if (fs.existsSync(devTypesDirectory)) {
    fs.rmSync(devTypesDirectory, { recursive: true, force: true });
    console.log('[build] Removed stale Next.js development route types.');
  } else {
    console.log('[build] No stale Next.js development route types found.');
  }
} catch (error) {
  console.error(
    '[build] Could not remove stale Next.js development route types. ' +
      'Stop the Next.js development server and retry.',
  );
  console.error(error);
  process.exit(1);
}
