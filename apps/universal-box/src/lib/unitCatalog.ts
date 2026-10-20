/** Desktop-local equivalent of Knowledge Explorer's 8 unit groups + temperature and AP constants. */
export const UNIT_GROUPS={
  Length:{m:1,cm:.01,mm:.001,km:1000,ft:.3048,in:.0254,mi:1609.344,"Å":1e-10},
  Mass:{kg:1,g:.001,mg:1e-6,lb:.45359237,u:1.6605390666e-27},
  Energy:{J:1,kJ:1000,Wh:3600,eV:1.602176634e-19,keV:1.602176634e-16,cal:4.184,kWh:3.6e6},
  Speed:{"m/s":1,"km/h":1000/3600,mph:.44704,kn:.514444,c:2.99792458e8},
  Force:{N:1,kN:1000,lbf:4.4482216152605,dyn:1e-5},
  Pressure:{Pa:1,kPa:1000,atm:101325,bar:1e5,mmHg:133.322,psi:6894.757293},
  Charge:{C:1,mC:1e-3,"μC":1e-6,nC:1e-9,e:1.602176634e-19},
  Time:{s:1,ms:1e-3,min:60,h:3600,day:86400},
} as const;
export type UnitGroup=keyof typeof UNIT_GROUPS;
export type TemperatureUnit="C"|"F"|"K";
export function convertUnits(group:UnitGroup,value:number,from:string,to:string):number{
  const units=UNIT_GROUPS[group] as Record<string,number>;
  if(!Number.isFinite(value)||!Object.prototype.hasOwnProperty.call(units,from)||!Object.prototype.hasOwnProperty.call(units,to))throw Error("Invalid unit or value.");
  const out=value*units[from]/units[to];
  if(!Number.isFinite(out))throw Error("Conversion out of numerical range.");
  return out;
}
export function convertTemperature(value:number,from:TemperatureUnit,to:TemperatureUnit):number{
  if(!Number.isFinite(value))throw Error("Invalid temperature.");
  const kelvin=from==="K"?value:from==="C"?value+273.15:(value-32)*5/9+273.15;
  // Absolute-zero physical bound, while avoiding floating point artifacts.
  if(kelvin< -1e-9)throw Error("Temperature cannot be below absolute zero.");
  const valid=Math.max(0,kelvin);
  return to==="K"?valid:to==="C"?valid-273.15:(valid-273.15)*9/5+32;
}
export const PHYSICAL_CONSTANTS=[
  {name:"g (Earth)",value:"9.80 m/s²",insert:"9.8"},
  {name:"c (light)",value:"2.998×10⁸ m/s",insert:"2.99792458e8"},
  {name:"h (Planck)",value:"6.626×10⁻³⁴ J·s",insert:"6.62607015e-34"},
  {name:"ħ",value:"1.055×10⁻³⁴ J·s",insert:"1.054571817e-34"},
  {name:"e (elementary charge)",value:"1.602×10⁻¹⁹ C",insert:"1.602176634e-19"},
  {name:"k (Boltzmann)",value:"1.381×10⁻²³ J/K",insert:"1.380649e-23"},
  {name:"N_A (Avogadro)",value:"6.022×10²³ mol⁻¹",insert:"6.02214076e23"},
  {name:"R (gas)",value:"8.314 J/(mol·K)",insert:"8.314462618"},
  {name:"ε₀",value:"8.854×10⁻¹² C²/(N·m²)",insert:"8.8541878128e-12"},
  {name:"μ₀",value:"4π×10⁻⁷ T·m/A",insert:"1.25663706212e-6"},
  {name:"G (gravity)",value:"6.674×10⁻¹¹ N·m²/kg²",insert:"6.6743e-11"},
  {name:"mₑ",value:"9.109×10⁻³¹ kg",insert:"9.1093837015e-31"},
  {name:"mₚ",value:"1.673×10⁻²⁷ kg",insert:"1.67262192369e-27"},
  {name:"F (Faraday)",value:"96485 C/mol",insert:"96485.3321"},
] as const;
