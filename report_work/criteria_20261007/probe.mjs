import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const base=process.cwd(), out=path.join(base,'report_work/criteria_20261007');
const require=createRequire(path.join(base,'backend/package.json'));
const {PrismaClient}=require('@prisma/client');
const settings=JSON.parse(await fs.readFile(path.join(base,'.local/settings.json'),'utf8'));
const db=new PrismaClient({datasources:{db:{url:`postgresql://shoplab:${settings.password}@127.0.0.1:55432/shoplab`}}});
const results=[];
function safe(value){if(Array.isArray(value))return value.map(safe);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/token|password|cookie|secret/i.test(k)?'[đã che]':safe(v)]));return value;}
async function call(id,method,p,body,token,cookie){
 const headers={Origin:'http://localhost:5173',Accept:'application/json'};
 if(body!==undefined)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;if(cookie)headers.Cookie=cookie;
 const r=await fetch('http://localhost:5173/api'+p,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
 const entry={id,method,path:'/api'+p,status:r.status,headers:Object.fromEntries([...r.headers].map(([k,v])=>[k,k==='set-cookie'?v.replace(/shoplab_refresh=[^;]*/,'shoplab_refresh=[đã che]'):v])),request:safe(body),response:safe(data)};
 results.push(entry);return {r,data};
}
try{
 const users=await db.user.findMany({orderBy:{id:'asc'},select:{id:true,email:true,role:true,active:true,passwordHash:true}});
 const dbEvidence=users.slice(0,6).map(u=>({id:u.id,email:u.email,role:u.role,active:u.active,passwordHash:u.passwordHash.slice(0,7)+'[đã che]',hashLength:u.passwordHash.length}));
 await fs.writeFile(path.join(out,'database-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),query:'SELECT id, email, role, active, LEFT("passwordHash",7), LENGTH("passwordHash") FROM "User" ORDER BY id LIMIT 6;',rows:dbEvidence},null,2));
 await call('T01','GET','/auth/me');await call('T02','GET','/admin/users');await call('T03','GET','/does-not-exist');
 await call('T04','POST','/auth/login',{email:'user1@shoplab.local',password:'incorrect-assessment-only'});
 const login=await call('T05','POST','/auth/login',{email:'user1@shoplab.local',password:'Password123!'});
 if(login.r.status!==200)throw Error('Demo login did not succeed; no dependent probes run.');
 const token=login.data.data.accessToken, cookie=login.r.headers.get('set-cookie').split(';')[0];
 await call('T06','GET','/auth/me',undefined,token);
 await call('T07','GET','/admin/users',undefined,token);
 const owner=users.find(x=>x.email==='user2@shoplab.local');
 const order=await db.order.findFirst({where:{userId:owner.id},select:{id:true}});
 if(order)await call('T08','GET','/orders/'+order.id,undefined,token);
 await call('T09','POST','/auth/register',{email:'criteria_mass_assignment_20261007@shoplab.local',username:'criteria_mass_assignment',password:'AssessmentOnly123!',role:'ADMIN'});
 await call('T10','POST','/auth/login',{email:'not-an-email',password:'x'});
 await call('T11','GET','/products?q='+encodeURIComponent("' OR '1'='1"));
 await call('T12','POST','/auth/logout',undefined,undefined,cookie);
 await call('T13','GET','/auth/me',undefined,token);
 await call('T14','POST','/auth/refresh',undefined,undefined,cookie);
 await call('T15','POST','/auth/refresh',undefined);
 const membership=await db.user.count({where:{email:'criteria_mass_assignment_20261007@shoplab.local'}});
 const pg=await db.$queryRaw`SELECT current_setting('listen_addresses') AS listen_addresses, current_setting('port') AS port, current_user AS db_user`;
 const privileges=await db.$queryRaw`SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
 await fs.writeFile(path.join(out,'dynamic-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),scope:'ShopLab DEV localhost:5173 only',results,massAssignmentAccountCreated:membership,databaseListener:pg,dbRolePrivileges:privileges},null,2));
 console.log(JSON.stringify({cases:results.map(({id,status})=>({id,status})),massAssignmentAccountCreated:membership,databaseListener:pg,dbRolePrivileges:privileges}));
}finally{await db.$disconnect()}
