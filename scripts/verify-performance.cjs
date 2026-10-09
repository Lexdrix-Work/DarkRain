const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'work','perf-regression'),software=process.argv.includes('--software');fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));
if(software){app.commandLine.appendSwitch('use-angle','swiftshader');app.commandLine.appendSwitch('enable-unsafe-swiftshader');}
app.commandLine.appendSwitch('disable-renderer-backgrounding');const errors=[];let complete=false;
const timeout=setTimeout(()=>{console.error('Performance canary timed out');app.exit(1);},120000);
app.whenReady().then(async()=>{let window;
    try{window=new BrowserWindow({width:768,height:432,show:false,webPreferences:{offscreen:true,nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,sandbox:false}});
        window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
        window.webContents.on('render-process-gone',()=>{console.error('Renderer failed');app.exit(1);});
        await window.loadFile(path.join(__dirname,'perf-fixture.html'));
        const {scenes,adapter}=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'perf-scenes.cjs'))})()`);
        const {assessRegression}=await import('../src/core/diagnostics/PerfRegression.js');const assessment=assessRegression(scenes,software?'software':'hardware');
        if(!software&&/swiftshader|llvmpipe|software/i.test(adapter)){assessment.pass=false;assessment.failures.push('Hardware gate requires a real GPU');}
        if(errors.length){assessment.pass=false;assessment.failures.push('renderer console errors');}
        const report={schema:1,capturedAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,resolution:[768,432],renderer:'Three.js WebGLRenderer component canary',adapter,metric:'synchronous render completion plus physics/churn; not presentation intervals',...assessment,scenes,errors};
        fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));complete=true;app.exit(assessment.pass?0:1);
    }catch(error){console.error(error);app.exit(1);}finally{clearTimeout(timeout);window?.destroy();}
});
app.on('before-quit',()=>{if(!complete)process.exitCode=1;});
