const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'webview', 'ui');
const outDir = path.join(__dirname, '..', 'out', 'webview', 'ui');

// Create output directory if it doesn't exist
fs.mkdirSync(outDir, { recursive: true });

// Copy files
const files = ['index.html', 'styles.css'];
files.forEach(file => {
  const srcFile = path.join(srcDir, file);
  const outFile = path.join(outDir, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, outFile);
    console.log(`Copied ${file} to out/webview/ui/`);
  } else {
    console.log(`Skipping ${file} (not found)`);
  }
});

// Copy js directory
const jsSrcDir = path.join(srcDir, 'js');
const jsOutDir = path.join(outDir, 'js');
if (fs.existsSync(jsSrcDir)) {
  fs.mkdirSync(jsOutDir, { recursive: true });
  const jsFiles = fs.readdirSync(jsSrcDir);
  jsFiles.forEach(file => {
    const srcFile = path.join(jsSrcDir, file);
    const outFile = path.join(jsOutDir, file);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, outFile);
      console.log(`Copied js/${file} to out/webview/ui/js/`);
    }
  });
}

