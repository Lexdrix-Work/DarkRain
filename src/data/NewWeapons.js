const base={accuracy:.88,automatic:false,weight:2,recoil:.12,range:150,ammoType:'rifle',reloadTime:2.6,fireRate:4,magazineSize:20,damage:50};
export const AdditionalWeapons={
    crowbar:{...base,id:'crowbar',name:'Pry Bar',type:'melee',shape:'crowbar',damage:48,structureDamage:65,range:1.8,fireRate:1.5,magazineSize:Infinity,ammoType:null,reloadTime:0,recoil:0,weight:1.4},
    fireaxe:{...base,id:'fireaxe',name:'Fire Axe',type:'melee',shape:'axe',damage:82,structureDamage:100,range:2,fireRate:1,magazineSize:Infinity,ammoType:null,reloadTime:0,recoil:0,weight:3.2},
    sledgehammer:{...base,id:'sledgehammer',name:'Sledgehammer',type:'melee',shape:'hammer',damage:100,structureDamage:180,range:2.2,fireRate:.75,magazineSize:Infinity,ammoType:null,reloadTime:0,recoil:0,weight:5},
    compact9:{...base,id:'compact9',name:'Kestrel 9 Compact',type:'pistol',shape:'compact',damage:32,ammoType:'pistol',range:65,magazineSize:15,reloadTime:1.8,recoil:.07,weight:.8},
    heavy45:{...base,id:'heavy45',name:'Harrier .45',type:'pistol',shape:'heavy',damage:43,ammoType:'pistol',range:80,magazineSize:10,reloadTime:2.1,recoil:.14,weight:1.1},
    revolver357:{...base,id:'revolver357',name:'Ranger .357',type:'pistol',shape:'revolver',damage:65,ammoType:'pistol',range:100,magazineSize:6,reloadTime:3.4,recoil:.23,weight:1.2},
    smg9:{...base,id:'smg9',name:'Swift 9 SMG',type:'rifle',shape:'smg',damage:30,ammoType:'pistol',range:100,magazineSize:32,reloadTime:2.2,automatic:true,fireRate:13,recoil:.055,weight:2.5},
    carbine556:{...base,id:'carbine556',name:'Meridian 5.56',type:'rifle',shape:'carbine',damage:53,range:260,magazineSize:30,reloadTime:2.35,automatic:true,fireRate:9,recoil:.10,weight:3},
    bolt308:{...base,id:'bolt308',name:'Ridgeline .308',type:'sniper',shape:'bolt',damage:145,ammoType:'sniper',range:600,magazineSize:5,reloadTime:3.8,fireRate:.75,recoil:.28,weight:4.2,scopeZoom:5},
    pump12:{...base,id:'pump12',name:'Marsh 12 Pump',type:'shotgun',shape:'pump',damage:110,ammoType:'shotgun',range:38,magazineSize:6,reloadTime:4.2,fireRate:1.1,recoil:.32,pellets:8,spread:.085,weight:3.6},
    support762:{...base,id:'support762',name:'Atlas 7.62 Support',type:'rifle',shape:'support',damage:62,range:350,magazineSize:60,reloadTime:4.6,automatic:true,fireRate:8,recoil:.20,weight:7.3}
};
