/** Minimal, local-only LAN invitation preview/validation for the Commons UI.
 * Native Rust parses and authenticates the invitation again; this is not a trust anchor.
 */
export type ParsedLanInvite={ip:string;port:number;key:string};
export type NearbyEndpoint={ip:string;port:number};
function validLocalIp(ip:string):boolean{
 const values=ip.split(".");
 if(values.length!==4||values.some(x=>!/^\d{1,3}$/.test(x)||(x.length>1&&x[0]==="0")))return false;
 const [a,b,c,d]=values.map(Number);
 if([a,b,c,d].some(n=>n>255))return false;
 return a===10||a===127||(a===172&&b>=16&&b<=31)||
  (a===192&&b===168)||(a===169&&b===254);
}
export function parseCommonsLanInvite(text:string):ParsedLanInvite{
 const clean=text.trim();
 if(clean.length>180||/[\u0000-\u001f\u007f]/u.test(clean))throw Error("LAN invitation is malformed.");
 const matched=/^uboxlan:\/\/([0-9.]+):([0-9]{1,5})\/([A-Za-z0-9_-]{43})$/u.exec(clean);
 if(!matched||!validLocalIp(matched[1]))throw Error("LAN invitation must use a permitted local IPv4 endpoint.");
 const port=Number(matched[2]);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error("LAN invitation has an invalid port.");
 return {ip:matched[1],port,key:matched[3]};
}
/** Full invites must agree with the selected Bonjour endpoint.
 * The native one-time secret stays private and cannot be advertised by mDNS.
 */
export function keyFromNearbyInput(input:string,peer:NearbyEndpoint):string{
 const value=input.trim();
 if(value.startsWith("uboxlan://")){
  const invite=parseCommonsLanInvite(value);
  if(invite.ip!==peer.ip||invite.port!==peer.port)
   throw Error("Invitation address does not match the selected nearby device. Select the correct device or use manual receipt.");
  return invite.key;
 }
 if(!/^[A-Za-z0-9_-]{43}$/u.test(value))throw Error("Paste the private 43-character key or full LAN invitation.");
 return value;
}
export function canReceiveLan(invite:string):boolean{
 try{parseCommonsLanInvite(invite);return true;}catch{return false;}
}
