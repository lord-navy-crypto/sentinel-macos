/** One-shot user-selected File objects, retained in app memory only across workspace navigation.
 * Never scans, reads, uploads or persists the bytes. FileIntake still requires user approval.
 */
let pending:File[]=[];
export function queueFilesForIntake(files:readonly File[]):number{
 pending=files.filter(file=>file instanceof File).slice(0,80);
 return pending.length;
}
export function consumeFilesForIntake():File[]{
 const files=pending;
 pending=[];
 return files;
}
