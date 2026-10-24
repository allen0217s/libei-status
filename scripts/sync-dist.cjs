'use strict';
// 酒馆直接加载仓库根目录；源码构建后同步两项运行资源。
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
for(const name of ['index.js','index.css'])fs.copyFileSync(path.join(root,'dist',name),path.join(root,name));
console.log('Root bundle SHA256: '+createHash('sha256').update(fs.readFileSync(path.join(root,'index.js'))).digest('hex'));
