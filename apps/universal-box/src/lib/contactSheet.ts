/** Pure bounded layout for a browser-canvas photo contact sheet. */
export type ContactSheetOptions={count:number;columns:number;cellWidth:number;cellHeight:number;margin:number;captions:boolean};
export type ContactSheetSlot={index:number;x:number;y:number;width:number;height:number;labelY:number};
export function contactSheetLayout(options:ContactSheetOptions):{
 width:number;height:number;rows:number;slots:ContactSheetSlot[];
}{
 const {count,columns,cellWidth,cellHeight,margin,captions}=options;
 if(![count,columns,cellWidth,cellHeight,margin].every(Number.isSafeInteger))
   throw new Error("Sheet dimensions must be whole numbers.");
 if(count<1||count>12)throw new Error("Choose 1–12 images.");
 if(columns<1||columns>6)throw new Error("Columns must be 1–6.");
 if(cellWidth<120||cellWidth>700||cellHeight<120||cellHeight>700)
   throw new Error("Cell dimensions must be 120–700 pixels.");
 if(margin<4||margin>48)throw new Error("Margins must be 4–48 pixels.");
 const rows=Math.ceil(count/columns);
 const labelHeight=captions?32:0;
 const strideY=cellHeight+labelHeight;
 const width=columns*cellWidth+(columns+1)*margin;
 const height=rows*strideY+(rows+1)*margin;
 if(width*height>12_000_000)throw new Error("Contact sheet would exceed 12 million pixels.");
 const slots=Array.from({length:count},(_,index)=>{
   const col=index%columns,row=Math.floor(index/columns);
   return {index,x:margin+col*(cellWidth+margin),y:margin+row*(strideY+margin),
     width:cellWidth,height:cellHeight,labelY:margin+row*(strideY+margin)+cellHeight+22};
 });
 return {width,height,rows,slots};
}
