/** Specific recovery advice without exposing stack traces or pretending success. */
export function playerError(error,operation='save'){
 const detail=String(error?.message||error||'No diagnostic detail available').replace(/[\r\n]+/g,' ').slice(0,180),code=String(error?.code||'');
 if(/ENOSPC|disk.*full|quota/i.test(code+' '+detail))return 'Storage is full. Free disk space, then retry. Your previous saves are kept.';
 if(/EACCES|EPERM|permission|access denied/i.test(code+' '+detail))return 'Dark Rain cannot write to its save folder. Check folder permissions, then retry. Your previous saves are kept.';
 if(/ended|campaign ended/i.test(detail))return 'This hardcore expedition has ended. Start a new expedition or choose another campaign.';
 if(/invalid|checksum|corrupt|validation/i.test(detail))return 'This record failed validation. Try the recovered backup or another save slot.';
 if(operation==='world'&&/unreachable|out of memory|memory allocation/i.test(detail))return 'World initialization stopped. Restart Dark Rain after closing unused applications. Details: '+detail;
 const verb=operation==='load'?'Load failed':operation==='world'?'World entry failed':'Save failed';
 return verb+': '+detail+'. '+(operation==='save'?'Retry before leaving; this progress is not yet saved.':'Return to the menu and choose another save or retry.');
}
