import * as XLSX from "xlsx";

export type ImportRow={date:string;description:string;amount:number;type:"expense"|"income";categoryId:number|null};
type Category={id:number;name:string};

const clean=(value:unknown)=>String(value??"").trim();
const key=(value:unknown)=>clean(value).replace(/[\s'"״׳_.-]/g,"").toLowerCase();
const aliases={
  date:["תאריך","תאריךעסקה","תאריךערך","יוםעסקה","date"],
  description:["תיאור","תיאורהפעולה","פרטים","שםביתעסק","ביתעסק","description","details"],
  debit:["חובה","סכוםחובה","משיכה","חיוב","debit"],
  credit:["זכות","סכוםזכות","הפקדה","credit"],
  amount:["סכום","סכוםעסקה","amount"],
};
const findColumn=(headers:unknown[],names:string[])=>headers.findIndex(h=>names.includes(key(h)));
const numberValue=(value:unknown)=>{if(typeof value==="number")return value;const normalized=clean(value).replace(/[₪,\s]/g,"").replace(/^\((.*)\)$/,"-$1");const n=Number(normalized);return Number.isFinite(n)?n:0};
const dateValue=(value:unknown)=>{let d:Date|undefined;if(value instanceof Date)d=value;else if(typeof value==="number"){const parsed=XLSX.SSF.parse_date_code(value);if(parsed)d=new Date(parsed.y,parsed.m-1,parsed.d)}else{const s=clean(value),m=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);if(m)d=new Date(Number(m[3])<100?2000+Number(m[3]):Number(m[3]),Number(m[2])-1,Number(m[1]));else if(s)d=new Date(s)}if(!d||Number.isNaN(d.getTime()))return "";return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const keywordCategories:Record<string,string[]>={
  "AliExpress":["aliexpress","עלי אקספרס","אליאקספרס"],"BIT":[" bit ","העברה בביט","תשלום בביט"],"PAYBOX":["paybox","פייבוקס"],"הכנסה":["משכורת","שכר עבודה","זיכוי משכורת"],
  "רכב ודלק":["פז","דלק","סונול","דור אלון","yellow","כביש 6","פנגו","סלופארק","חניון"],
  "אוכל בחוץ":["וולט","wolt","מסעדה","קפה","פיצה","בורגר","מקדונלד"],
  "קניות":["שופרסל","רמי לוי","ויקטורי","יוחננוף","סופר","מחסני השוק","אושר עד"],
  "חשבונות":["חשמל","מים","ארנונה","בזק","הוט","סלקום","פרטנר"],
  "מנויים":["netflix","spotify","google","apple","youtube"],
  "בריאות":["סופר פארם","בית מרקחת","מכבי","כללית","רופא"],
  "דיור":["שכירות","משכנתא","ועד בית"],
};
function categoryFor(description:string,categories:Category[]){const text=` ${description.toLowerCase()} `;const exact=categories.find(c=>text.includes(c.name.toLowerCase()));if(exact)return exact.id;for(const[name,words]of Object.entries(keywordCategories)){if(words.some(w=>text.includes(w))){const category=categories.find(c=>c.name.toLowerCase()===name.toLowerCase());if(category)return category.id}}return null}

export async function parseLeumiFile(file:File,categories:Category[]){
  const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:""});
  const headerIndex=rows.slice(0,25).findIndex(row=>findColumn(row,aliases.date)>=0&&findColumn(row,aliases.description)>=0&&(findColumn(row,aliases.amount)>=0||findColumn(row,aliases.debit)>=0||findColumn(row,aliases.credit)>=0));
  if(headerIndex<0)throw new Error("לא נמצאו עמודות תאריך, תיאור וסכום בקובץ");
  const headers=rows[headerIndex],dateCol=findColumn(headers,aliases.date),descriptionCol=findColumn(headers,aliases.description),debitCol=findColumn(headers,aliases.debit),creditCol=findColumn(headers,aliases.credit),amountCol=findColumn(headers,aliases.amount);
  const parsed:ImportRow[]=[];let skipped=0;
  for(const row of rows.slice(headerIndex+1)){
    const date=dateValue(row[dateCol]),description=clean(row[descriptionCol]);if(!date||!description){if(row.some(Boolean))skipped++;continue}
    const debit=debitCol>=0?numberValue(row[debitCol]):0,credit=creditCol>=0?numberValue(row[creditCol]):0,generic=amountCol>=0?numberValue(row[amountCol]):0;
    const type:ImportRow["type"]=credit?"income":debit?"expense":generic<0?"expense":"income",amount=Math.abs(credit||debit||generic);if(!amount){skipped++;continue}
    parsed.push({date,description,amount,type,categoryId:categoryFor(description,categories)});
  }
  if(!parsed.length)throw new Error("לא נמצאו עסקאות תקינות בקובץ");
  return{rows:parsed,skipped};
}
