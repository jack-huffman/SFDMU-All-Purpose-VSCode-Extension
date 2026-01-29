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

// Copy js directory recursively (including subdirectories)
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      const relativePath = path.relative(path.join(srcDir, 'js'), srcPath);
      console.log(`Copied js/${relativePath} to out/webview/ui/js/${relativePath}`);
    }
  }
}

const jsSrcDir = path.join(srcDir, 'js');
const jsOutDir = path.join(outDir, 'js');
if (fs.existsSync(jsSrcDir)) {
  copyDirectory(jsSrcDir, jsOutDir);
}

// Copy codicons from node_modules to out directory for self-contained packaging
const codiconsSrcDir = path.join(__dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist');
const codiconsOutDir = path.join(__dirname, '..', 'out', 'webview', 'ui', 'codicons');
if (fs.existsSync(codiconsSrcDir)) {
  fs.mkdirSync(codiconsOutDir, { recursive: true });
  const codiconFiles = ['codicon.css', 'codicon.ttf'];
  codiconFiles.forEach(file => {
    const srcFile = path.join(codiconsSrcDir, file);
    const outFile = path.join(codiconsOutDir, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, outFile);
      console.log(`Copied codicons/${file} to out/webview/ui/codicons/`);
    } else {
      console.log(`Warning: codicon file ${file} not found`);
    }
  });
} else {
  console.log(`Warning: codicons directory not found at ${codiconsSrcDir}`);
}

