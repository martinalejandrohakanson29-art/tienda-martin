const fs = require('fs');
const path = 'server.js';
const path2 = '.next/standalone/server.js';
if (fs.existsSync(path)) {
    console.log('Found server.js');
} else if (fs.existsSync(path2)) {
    console.log('Found .next/standalone/server.js');
} else {
    console.log('Not found');
}
