const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'node_modules', '@hpcc-js', 'wasm', 'dist');
const destDir = path.join(__dirname, '..', 'public', 'vendor', '@hpcc-js', 'wasm', 'dist');

async function copyFiles() {
  try {
    await fs.ensureDir(destDir); // Ensures destination directory exists, creates if not.
    await fs.copy(sourceDir, destDir);
    console.log('Successfully copied @hpcc-js/wasm files.');
  } catch (err) {
    console.error('Error copying @hpcc-js/wasm files:', err);
    process.exit(1); // Exit with an error code if copying fails
  }
}

copyFiles();
