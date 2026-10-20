import {describe,it,expect} from "vitest";
import {planQuickZip} from "./quickZipPack";
describe("bounded ZIP planning",()=>{
 it("numbers sanitized output names and preserves source metadata",()=>{
   expect(planQuickZip([{name:"report.txt",size:10},{name:"a/b.csv",size:2}]))
    .toEqual([{source:"report.txt",output:"001-report.txt",size:10,index:0},{source:"a/b.csv",output:"002-a_b.csv",size:2,index:1}]);
 });
 it("rejects invalid size, too many files and excessive bytes",()=>{
  expect(()=>planQuickZip([])).toThrow();
  expect(()=>planQuickZip([{name:"big",size:16000001}])).toThrow();
  expect(()=>planQuickZip(Array.from({length:51},(_,i)=>({name:String(i),size:1})))).toThrow();
  expect(()=>planQuickZip([{name:"bad",size:-1}])).toThrow();
 });
});
