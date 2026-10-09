const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['out','dist']){
    const target=path.resolve(root,name);
    if(path.dirname(target)!==root)throw new Error('Invalid generated directory');
    fs.rmSync(target,{recursive:true,force:true});
}
