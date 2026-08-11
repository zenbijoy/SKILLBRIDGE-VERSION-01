const fs = require('fs');
const path = require('path');
const d = 'src/pages';
fs.readdirSync(d).forEach(f => {
  if (f.endsWith('.tsx')) {
    const p = path.join(d, f);
    let c = fs.readFileSync(p, 'utf8');
    c = c.replace(/import React(,[^;]+)? from ['"]react['"];?\n?/, '');
    fs.writeFileSync(p, c);
  }
});
let ap = 'src/App.tsx';
fs.writeFileSync(ap, fs.readFileSync(ap, 'utf8').replace(/import React(,[^;]+)? from ['"]react['"];?\n?/, ''));
console.log('Fixed imports');
