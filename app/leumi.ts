import * as XLSX from "xlsx";

export type ImportRow={date:string;description:string;amount:number;type:"expense"|"income";categoryId:number|null;source:"leumi"|"max";sourceCategory?:string;notes?:string};
type Category={id:number;name:string};

const clean=(value:unknown)=>String(value??"").trim();
const key=(value:unknown)=>clean(value).replace(/[\s'"״׳_.-]/g,"").toLowerCase();
const aliases={
  date:["תאריך","תאריךעסקה","תאריךחיוב","תאריךערך","יוםעסקה","date"],
  description:["תיאור","תיאורהפעולה","פרטים","שםביתעסק","שםביתהעסק","ביתעסק","description","details"],
  debit:["חובה","סכוםחובה","משיכה","חיוב","debit"],
  credit:["זכות","סכוםזכות","הפקדה","credit"],
  amount:["סכום","סכוםעסקה","סכוםחיוב","amount"],
};
const findColumn=(headers:unknown[],names:string[])=>headers.findIndex(h=>names.includes(key(h)));
const numberValue=(value:unknown)=>{if(typeof value==="number")return value;const normalized=clean(value).replace(/[₪,\s]/g,"").replace(/^\((.*)\)$/,"-$1");const n=Number(normalized);return Number.isFinite(n)?n:0};
const dateValue=(value:unknown)=>{let d:Date|undefined;if(value instanceof Date)d=value;else if(typeof value==="number"){const parsed=XLSX.SSF.parse_date_code(value);if(parsed)d=new Date(parsed.y,parsed.m-1,parsed.d)}else{const s=clean(value),m=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);if(m)d=new Date(Number(m[3])<100?2000+Number(m[3]):Number(m[3]),Number(m[2])-1,Number(m[1]));else if(s)d=new Date(s)}if(!d||Number.isNaN(d.getTime()))return "";return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const dateInStatementMonth=(transactionDate:string,chargeDate:string)=>{if(!chargeDate)return transactionDate;const charge=new Date(`${chargeDate}T12:00:00`);charge.setMonth(charge.getMonth()-1);const year=charge.getFullYear(),month=charge.getMonth()+1,day=transactionDate?Number(transactionDate.slice(8,10)):1,lastDay=new Date(year,month,0).getDate();return `${year}-${String(month).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`};
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

const maxCategoryMap:Record<string,string>={
  "עיצוב הבית":"קניות","אופנה":"קניות","קוסמטיקה וטיפוח":"קניות","מזון וצריכה":"קניות",
  "מסעדות, קפה וברים":"אוכל בחוץ","תחבורה ורכבים":"רכב ודלק","רפואה ובתי מרקחת":"בריאות",
  "עירייה וממשלה":"חשבונות","שירותי תקשורת":"חשבונות",
};
function categoryForMax(description:string,sourceCategory:string,categories:Category[]){
  const byDescription=categoryFor(description,categories);if(byDescription)return byDescription;
  const mapped=maxCategoryMap[sourceCategory];return mapped?categories.find(c=>c.name===mapped)?.id??null:null;
}

export async function parseLeumiFile(file:File,categories:Category[]){
  const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const parsed:ImportRow[]=[];let skipped=0,recognizedSheets=0;
  for(const sheetName of workbook.SheetNames){
    const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName],{header:1,raw:true,defval:""});
    const headerIndex=rows.slice(0,25).findIndex(row=>findColumn(row,aliases.date)>=0&&findColumn(row,aliases.description)>=0&&(findColumn(row,aliases.amount)>=0||findColumn(row,aliases.debit)>=0||findColumn(row,aliases.credit)>=0));
    if(headerIndex<0)continue;recognizedSheets++;
    const headers=rows[headerIndex],isMax=findColumn(headers,["4ספרותאחרונותשלכרטיסהאשראי"])>=0&&findColumn(headers,["תאריךחיוב"])>=0;
    const dateCol=isMax?findColumn(headers,["תאריךחיוב"]):findColumn(headers,aliases.date),transactionDateCol=isMax?findColumn(headers,["תאריךעסקה"]):-1,descriptionCol=findColumn(headers,aliases.description),debitCol=findColumn(headers,aliases.debit),creditCol=findColumn(headers,aliases.credit),amountCol=isMax?findColumn(headers,["סכוםחיוב"]):findColumn(headers,aliases.amount),sourceCategoryCol=findColumn(headers,["קטגוריה"]),notesCol=findColumn(headers,["הערות"]);
    for(const row of rows.slice(headerIndex+1)){
      const chargeDate=dateValue(row[dateCol]),transactionDate=transactionDateCol>=0?dateValue(row[transactionDateCol]):"",date=isMax?dateInStatementMonth(transactionDate,chargeDate):chargeDate,description=clean(row[descriptionCol]);if(!date||!description){if(row.some(Boolean)&&clean(row[0])!=="סך הכל")skipped++;continue}
      const debit=debitCol>=0?numberValue(row[debitCol]):0,credit=creditCol>=0?numberValue(row[creditCol]):0,generic=amountCol>=0?numberValue(row[amountCol]):0;
      const type:ImportRow["type"]=isMax?(generic<0?"income":"expense"):(credit?"income":debit?"expense":generic<0?"expense":"income"),amount=Math.abs(credit||debit||generic);if(!amount){skipped++;continue}
      const sourceCategory=sourceCategoryCol>=0?clean(row[sourceCategoryCol]):"",notes=notesCol>=0?clean(row[notesCol]):"";
      parsed.push({date,description,amount,type,categoryId:isMax?categoryForMax(description,sourceCategory,categories):categoryFor(description,categories),source:isMax?"max":"leumi",sourceCategory:sourceCategory||undefined,notes:notes||undefined});
    }
  }
  if(!recognizedSheets)throw new Error("לא נמצאו עמודות תאריך, תיאור וסכום בקובץ");
  if(!parsed.length)throw new Error("לא נמצאו עסקאות תקינות בקובץ");
  return{rows:parsed,skipped,provider:parsed.every(r=>r.source==="max")?"MAX":parsed.every(r=>r.source==="leumi")?"לאומי":"משולב"};
}
