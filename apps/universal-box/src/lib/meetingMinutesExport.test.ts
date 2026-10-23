import {describe,it,expect} from "vitest";
import JSZip from "jszip";
import {parseWorkspaceCsv} from "./csvCleanroom";
import {MEETING_SAMPLE,MEETING_ACTION_SAMPLE,MEETING_ACTION_HEADERS,planMeetingMinutes} from "./meetingMinutes";
import {exportMeetingMinutes,meetingMinutesText} from "./meetingMinutesExport";
describe("Real meeting minutes Word and task CSV delivery",()=>{
 it("exports a real editable DOCX, CSV, plain text and audited ZIP",async()=>{
  const plan=planMeetingMinutes(MEETING_SAMPLE,MEETING_ACTION_SAMPLE);
  const result=await exportMeetingMinutes(plan);
  const zip=await JSZip.loadAsync(result,{checkCRC32:true});
  for(const p of ["meeting/meeting-minutes.docx","meeting/meeting-minutes.txt",
   "actions/assigned-actions.csv","reports/manifest.json"])
   expect(zip.file(p),p).not.toBeNull();
  const docx=await JSZip.loadAsync(await zip.file("meeting/meeting-minutes.docx")!.async("uint8array"));
  const xml=await docx.file("word/document.xml")!.async("string");
  expect(xml).toContain("Project status and next steps");
  expect(xml).toContain("Review prototype changes");
  expect(xml).toContain("Jordan");
  expect(xml).toContain("2026-11-02");
  const csv=await zip.file("actions/assigned-actions.csv")!.async("string");
  expect(csv[0]).toBe("\uFEFF");
  const rows=parseWorkspaceCsv(csv);
  expect(rows[0]).toEqual(MEETING_ACTION_HEADERS);
  expect(rows).toHaveLength(3);
  expect(rows[1][2]).toBe("Alex");
  expect(rows[2][5]).toBe("in_progress");
  const txt=await zip.file("meeting/meeting-minutes.txt")!.async("string");
  expect(txt).toContain("Keep the next release scope focused.");
  expect(txt).not.toContain("Automated transcript generated");
  expect(meetingMinutesText(plan)).toBe(txt);
  const manifest=JSON.parse(await zip.file("reports/manifest.json")!.async("string"));
  expect(manifest.actionCount).toBe(2);
  expect(manifest.statusCounts).toEqual({todo:1,inProgress:1,done:0});
  expect(manifest.limitations).toEqual(expect.arrayContaining([expect.stringContaining("No audio transcript")]));
 });
 it("keeps actual Chinese text inside Word and Excel-friendly task CSV",async()=>{
  const input={...MEETING_SAMPLE,title:"年度项目例会",attendees:"张三\n李四",
   decisions:"确认人员分工\n整理交付文件"};
  const csv=MEETING_ACTION_HEADERS.join(",")+
   "\nCN-01,准备中文文档,李四,2026-11-02,high,todo,确认交付";
  const bytes=await exportMeetingMinutes(planMeetingMinutes(input,csv));
  const zip=await JSZip.loadAsync(bytes);
  const word=await JSZip.loadAsync(await zip.file("meeting/meeting-minutes.docx")!.async("uint8array"));
  const xml=await word.file("word/document.xml")!.async("string");
  expect(xml).toContain("年度项目例会");
  expect(xml).toContain("准备中文文档");
  expect(xml).toContain("确认人员分工");
  expect(await zip.file("actions/assigned-actions.csv")!.async("string")).toContain("准备中文文档");
 });
});
