export type QuickCard = { front: string; back: string };
export function parseQuickCards(input: string): QuickCard[] {
  const cards: QuickCard[] = [];
  for(const line of input.split(/\r?\n/u)){
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    const colon = line.indexOf("::");
    const split = tab>=0?{i:tab,length:1}:colon>=0?{i:colon,length:2}:null;
    if (!split) continue;
    const front=line.slice(0,split.i).trim().slice(0,300);
    const back=line.slice(split.i+split.length).trim().slice(0,1200);
    if (front && back) cards.push({front,back});
    if (cards.length >= 300) break;
  }
  return cards;
}
