
const scanCppProject = require('./scanner')
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs');

const { JSONCanvas } = require ('@trbn/jsoncanvas');

/*
**Resource Definition Asset**
[H](jetbrains://rd/navigate/reference?project=TheEngineer&path=Plugins/EconModel/Source/EconModel/Public/EconResourceDefinition.h:1:1) [CPP](jetbrains://rd/navigate/reference?project=TheEngineer&path=Plugins/EconModel/Source/EconModel/Private/EconResourceDefinition.cpp:1:1)

C:\P4W\Four_Main\TheEngineer\Plugins\EconModel\Source\EconModel_Editor\Public\AssetTools\AssetTypeAction_EconResource.h

*/


// Configure command line interface
const argv = yargs(hideBin(process.argv))
  .option('directory', {
    alias: 'd',
    type: 'string',
    description: 'Root project directory to scan. Defaults to current folder',
    default: process.cwd()
  })
  .option('name', {
    alias: 'n',
    type: 'string',
    description: 'Project name',
  })
  .option('extensions', {
    alias: 'e',
    type: 'array',
    description: 'File extensions to include',
    default: ['.h', '.hpp', '.cpp']
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output file (JSON format)'
  })
  .option('modules', {
    alias: 'm',
    type: 'array',
    description: 'Modules to include. For plugins, do [pluginName]/[moduleName]. For root, do Root/[moduleName]. For all modules, do [pluginName]/*',
    default: ['Root:*']
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Verbose output'
  })
  .option('ide', {
    type: 'string',
    description: 'Which IDE to format the link for opening the files. Options: [rider, vscode, raw]',
    default: 'rider'
  })
  .version()
  .help()
  .argv;


if (!argv.directory) {
    console.error('Usage: node index.js <project-directory>');
    process.exit(1);
}

// Scan the project
let modulesToScan = new Map();


for (let mod of argv.modules)
{
    const split = mod.split('/');
    const parent = split[0];
    const moduleName = split[1];

    if (!modulesToScan.has(parent)) {
        modulesToScan.set(parent, [])
    }
    let exist = modulesToScan.get(parent)
    exist.push(moduleName);
    modulesToScan.set(parent, exist)
}


let fileMap = new Map();
let filePairs = [];
modulesToScan.forEach((list, source) => {
    list.forEach((module) => {
        console.log("Scanning ", source, ' : ', module);
        filePairs = scanCppProject(argv.directory, source.trim().toLowerCase() == 'root' ? undefined:source, module, argv.extensions, fileMap)
    })
})

function formatToolboxLink(file) {
    const rootDir = argv.directory;
    const path = file.substr(rootDir.length)
    if (argv.ide == 'rider')
        return `jetbrains://rd/navigate/reference?project=${argv.name}&path=${path}`
    if (argv.ide == 'vscode')
        return `vscode://${path}`
    return `file://${path}`


}


// Output results
console.log(`Found ${filePairs.length} C++ file pairs in ${argv.directory}:`);
filePairs = filePairs.map((pair) => {
    if (pair.implementation) pair.implementation = formatToolboxLink(pair.implementation);
    if (pair.header) pair.header = formatToolboxLink(pair.header);
    return pair;
})
//console.log(filePairs);


let Canvas = new JSONCanvas();
const filesByPlugin = new Map();

let updatingExistingCanvas = false;

const fileDim = {x: 304, y:92};
const margin = 15;

let pluginX = 0;
let pluginY = 0;

try {
    const data = fs.readFileSync(argv.output);
    
    Canvas = JSONCanvas.fromString(data);
    console.log(`Loaded ${Canvas.getNodes().length} nodes`)
    updatingExistingCanvas = true;

    for (let n of Canvas.getNodes()) {
        if (n.y+n.height > pluginY) {
            pluginY = n.y+n.height + margin;
        }
    }
}
catch (err) {
    console.error("Error loading existing file: ", err)
}


filePairs.forEach((file) => {
    let plugin = file.plugin;
    let module = file.module;
    if (plugin == undefined || plugin.trim().toLowerCase == 'root') {
        plugin = argv.name;
    }

    if (!filesByPlugin.has(plugin)) {
        filesByPlugin.set(plugin, {
            name: plugin,
            modules: {}
        })
    }

    filesByPlugin.get(plugin).modules[module] = filesByPlugin.get(plugin).modules[module] || {}
    filesByPlugin.get(plugin).modules[module][file.name] = file;
})

function AddOrUpdateNode(data) {
    for (let n of Canvas.getNodes()) {
        if (n.originalId == data.originalId) {
            if (n.type == 'text') {
                // Just find and replace the URL section of text
                n.links = data.links
                n.text = n.text.replace(/\[H\]\([^\[]+\) *\[CPP\]\([^\[]+\)/, data.links);
            }

            return false;
        }
    }
    Canvas.addNode(data)
    return true;
}

function GetNodeRect(originalId, def) {
    for (let n of Canvas.getNodes()) {
        if (n.originalId == originalId) { 
            return {
                x: n.x,
                y: n.y,
                width: n.width,
                height: n.height,
                max: {
                    x: n.x+n.width,
                    y: n.y+n.height,
                }
            }
        }
    }
    console.log("Failed to find node rect for ", originalId)
    return def;
}

filesByPlugin.forEach((pluginData, pluginName) => {
    console.log("Plugin", pluginName)

    const modCount = Object.keys(pluginData.modules).length
    let maxFiles = 0;
    Object.entries(pluginData.modules).forEach(([moduleName, fileList]) => {
        if (Object.keys(fileList).length > maxFiles) maxFiles = Object.keys(fileList).length;
    })

    let width = modCount * (fileDim.x + margin*2 + margin) + margin*2;
    let height = maxFiles * (fileDim.y + margin) + margin*2 + pluginY + margin*4;
    

    let pluginDims = GetNodeRect('plugin-' + pluginName, {x: pluginX, y: pluginY, width, height})

    let modX = pluginDims.x + margin;
    let modY = pluginDims.y + margin*4;

    // Add a group node for the plugin
    let addedPluginContents = AddOrUpdateNode({
        id:'plugin-' + pluginName,
        originalId:'plugin-' + pluginName,
        fileType:'plugin',
        pluginName,
        type: 'group',
        label: `Plugin: ${pluginName}`,
        x: pluginDims.x,
        y: pluginDims.y,
        
        width: pluginDims.width,
        height: pluginDims.height,
    })

    Object.entries(pluginData.modules).forEach(([moduleName, fileList]) => {
        console.log("Module", moduleName)

        // Add a group node for the module within the plugin
        let modWidth = fileDim.x + margin*2;
        let modHeight = Object.keys(fileList).length * (fileDim.y + margin) + margin;

        let modDims = GetNodeRect(`module-${pluginName}::${moduleName}`, {x: modX, y: modY, modWidth, modHeight})

        let addedModuleContents = AddOrUpdateNode({
            id:`module-${pluginName}::${moduleName}`,
            originalId:`module-${pluginName}::${moduleName}`,
            fileType:'module',
            pluginName,
            moduleName,
            type: 'group',
            label: `Module: ${moduleName}`,
            x: modDims.x,
            y: modDims.y,
            
            width: modDims.width,
            height: modDims.height,
        })

        let fileX = modDims.x + margin;
        let fileY = modDims.y + margin;

        // If we're appending to an existing document, just place the file node below the group if it exists
        if (updatingExistingCanvas && modDims.max) {
            fileY = modDims.max.y+margin;
        }

        Object.entries(fileList).forEach(([fileName,fileData]) => {
            if (AddOrUpdateNode({
                id:`file-${pluginName}::${moduleName}::${fileName}`,
                originalId:`file-${pluginName}::${moduleName}::${fileName}`,
                fileType:'file',
                pluginName,
                moduleName,
                fileName,
                type: 'text',
                x: fileX,
                y: fileY,
                width: fileDim.x,
                height: fileDim.y,
                text: `**${fileData.name}**\n[H](${fileData.header}) [CPP](${fileData.implementation})`,
                links: `[H](${fileData.header}) [CPP](${fileData.implementation})`
            })) {
                
                console.log("New file node", fileName)
                // Only start offsetting if we've actually added the node
                fileY += fileDim.y + margin;
                addedModuleContents = true;
            }
        })

        if (addedModuleContents) {
            modX += modWidth + margin;
            addedPluginContents = true;
        }
    })

    if (addedPluginContents) {
        pluginX += width + margin*2;
    }
})


//console.log(Canvas.toString());

// Output handling
if (argv.output) {
    fs.writeFileSync(argv.output, Canvas.toString());
    console.log(`Results saved to ${argv.output}`);
}