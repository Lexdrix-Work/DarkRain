// setup.cjs - Run with: node scripts/setup.cjs

const fs = require('fs');
const path = require('path');

// This script lives in scripts/, so resolve directories against the project root
const projectRoot = path.join(__dirname, '..');

const directories = [
    'public/assets',
    'public/assets/textures',
    'public/assets/models',
    'public/assets/sounds',
    'public/assets/fonts',
    'src/core',
    'src/entities',
    'src/systems',
    'src/world',
    'src/ui',
    'src/data',
    'src/styles'
];

console.log('Setting up Dark Rain project structure...\n');

// Create directories and .gitkeep files
directories.forEach(dir => {
    const fullPath = path.join(projectRoot, dir);

    // Create directory if it doesn't exist
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created directory: ${dir}`);
    } else {
        console.log(`Directory exists: ${dir}`);
    }

    // Create .gitkeep file
    const gitkeepPath = path.join(fullPath, '.gitkeep');
    if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, '');
        console.log(`  Created .gitkeep in ${dir}`);
    }
});

console.log('\nProject structure setup complete!');
console.log('\nNext steps:');
console.log('1. Run: npm install');
console.log('2. Run: npm start');
