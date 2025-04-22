const fs = require('fs');
const path = require('path');

// Function to find all C++ files and pair headers with implementations
function scanCppProject(rootDir, plugin, module, extensions, inFiles=undefined, includeStats=false) {
    const files = inFiles || new Map(); // Stores all found files by basename
  
    function walk(currentDir) {
      fs.readdirSync(currentDir).forEach(file => {
        const fullPath = path.join(currentDir, file);
        const stats = fs.statSync(fullPath);
  
        if (stats.isDirectory()) {
          walk(fullPath);
        } else if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          if (extensions.includes(ext)) {
            const basename = path.basename(file, ext);
            const fileType = ext === '.cpp' ? 'implementation' : 'header';
            
            if (!files.has(basename)) {
              files.set(basename, { name: basename, plugin, module });
            }
            
            files.get(basename)[fileType] = fullPath;
            
            if (includeStats) {
              files.get(basename).stats = files.get(basename).stats || {};
              files.get(basename).stats[fileType] = {
                size: stats.size,
                mtime: stats.mtime,
                inode: stats.ino
              };
            }
          }
        }
      });
    }

    let targetDir = rootDir;

    if (plugin != undefined) {
        targetDir = path.join(targetDir, 'Plugins', plugin);
    }

    if (module != undefined && module !== '*') {
        targetDir = path.join(targetDir, 'Source', module)
    }
    else {
        // Module is undefined, so we're gonna do it for each module
        targetDir = path.join(targetDir, 'Source')
        let modules = [];
        fs.readdirSync(targetDir).forEach(file => {
            const fullPath = path.join(targetDir, file);
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory() && files != undefined) {
                modules.push(file);
            }
        });

        modules.forEach(mod => {
            console.log("Subscanning module:", mod);
            scanCppProject(rootDir, plugin, mod, extensions, files, includeStats);
        })
        return Array.from(files.values());
    }
  
    console.log("Starting walk:", targetDir, plugin, module)
    walk(targetDir);
    return Array.from(files.values());
  }
  

module.exports = scanCppProject;