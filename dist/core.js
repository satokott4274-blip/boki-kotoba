/* Device-local learning state. No network or external dependencies. */
(function(root){
'use strict';
const DAY=86400000, GRADES=['3','2','industrial'];
function dayKey(time=Date.now()){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function blank(){return {version:1,grade:'3',stats:{},days:{},sessions:{}};}
function num(v,max=1000000){return Number.isFinite(v)&&v>=0?Math.min(Math.floor(v),max):0;}
function clean(raw,ids){const s=blank();if(!raw||raw.version!==1)return s;s.grade=GRADES.includes(raw.grade)?raw.grade:'3';
for(const [id,v] of Object.entries(raw.stats||{})){if(!ids.has(id)||!v||typeof v!=='object')continue;s.stats[id]={seen:num(v.seen),correct:num(v.correct),wrong:num(v.wrong),streak:num(v.streak,20),last:num(v.last,1e15),due:num(v.due,1e15)};}
for(const [k,v] of Object.entries(raw.days||{})){if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&v&&typeof v==='object')s.days[k]={answered:num(v.answered),correct:num(v.correct),cards:num(v.cards)};}
for(const grade of GRADES){let q=raw.sessions?.[grade];if(!q||!Array.isArray(q.questions)||!q.questions.length||q.questions.length>10)continue;
const valid=q.questions.every(x=>x&&ids.has(x.cardId)&&typeof x.prompt==='string'&&x.prompt.length<500&&Array.isArray(x.options)&&x.options.length>=2&&x.options.length<=4&&x.options.every(o=>typeof o==='string'&&o.length<150)&&Number.isInteger(x.answer)&&x.answer>=0&&x.answer<x.options.length&&typeof x.explanation==='string'&&x.explanation.length<1000);
if(!valid||!Number.isInteger(q.index)||q.index<0||q.index>=q.questions.length)continue;
const selected=Number.isInteger(q.selected)&&q.selected>=0&&q.selected<q.questions[q.index].options.length?q.selected:null;
s.sessions[grade]={...q,selected,results:Array.isArray(q.results)?q.results.filter(x=>x&&ids.has(x.cardId)&&typeof x.correct==='boolean').slice(0,q.questions.length):[]};}
return s;}
function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function inGrade(c,grade){if(grade==='3')return c.grade==='3';if(grade==='2')return c.grade==='3'||c.grade==='2';return c.grade==='industrial'||['材料','仕掛品','製品','売上原価','売上','売掛金','買掛金','給料','法定福利費','減価償却費','未払費用'].includes(c.term);}
function weak(v){return !!v&&v.wrong>0&&v.streak<2;}
function due(v,now=Date.now()){return !!v&&v.seen>0&&v.due<=now;}
function mastered(v){return !!v&&v.streak>=3;}
function record(state,id,ok,kind='quiz',now=Date.now()){
 const prev=state.stats[id]||{seen:0,correct:0,wrong:0,streak:0,last:0,due:0};
 const streak=ok?Math.min(prev.streak+1,20):0;
 const intervals=[DAY,3*DAY,7*DAY,14*DAY,30*DAY];
 state.stats[id]={seen:prev.seen+1,correct:prev.correct+(ok?1:0),wrong:prev.wrong+(ok?0:1),streak,last:now,due:now+(ok?intervals[Math.min(streak-1,4)]:10*60000)};
 const key=dayKey(now);const d=state.days[key]||(state.days[key]={answered:0,correct:0,cards:0});
 if(kind==='quiz'){d.answered++;if(ok)d.correct++;}else d.cards++;
 return state.stats[id];
}
function streakDays(days,now=Date.now()){let n=0;const d=new Date(now);if(!(days[dayKey(d)]?.answered||days[dayKey(d)]?.cards))d.setDate(d.getDate()-1);while(days[dayKey(d)]?.answered||days[dayKey(d)]?.cards){n++;d.setDate(d.getDate()-1);if(n>3660)break;}return n;}
function rank(c,state,now){let v=state.stats[c.id];return weak(v)?0:due(v,now)?1:!v?2:3;}
function makeQuestions(data,state,grade,mode='daily',rng=Math.random,now=Date.now()){
 const map=new Map(data.cards.map(c=>[c.id,c]));
 let cards=data.cards.filter(c=>inGrade(c,grade)&&c.quizEligible!==false);
 if(mode==='review')cards=cards.filter(c=>weak(state.stats[c.id])||due(state.stats[c.id],now));
 const candidates=shuffle(cards,rng).sort((a,b)=>rank(a,state,now)-rank(b,state,now));
 const scenarioIds=new Set(data.scenarios.map(q=>q.answerId));cards=[];
 for(let i=0;i<10&&candidates.length;i++){let pos=i%3===0?candidates.findIndex(c=>scenarioIds.has(c.id)):0;if(pos<0)pos=0;cards.push(candidates.splice(pos,1)[0]);}
 return cards.map((c,i)=>{
  const scenarios=data.scenarios.filter(q=>q.answerId===c.id&&q.options.every(id=>map.has(id)));
  const kind=scenarios.length&&(i%3===0||c.category==='集計'||c.category==='その他')?'scenario':i%3===1&&['借','貸','両'].includes(c.side)?'side':'category';
  let prompt,options,correct,explanation,type;
  if(kind==='scenario'){
   const q=scenarios[Math.floor(rng()*scenarios.length)];prompt=q.prompt;options=shuffle(q.options,rng).map(id=>map.get(id).term);correct=c.term;explanation=q.explanation;type='取引から答える';
  }else if(kind==='side'){
   prompt=`「${c.term}」が増加・発生するとき、記入する側は？`;options=['借方（左）','貸方（右）','取引の内容による'];correct={'借':options[0],'貸':options[1],'両':options[2]}[c.side];explanation=`${c.term}：${c.meaning} ${c.side==='両'?'借方・貸方は取引の内容で変わります。':`増加・発生は${correct}、減少・取消は逆側に記入します。`}`;type='借方・貸方';
  }else{
   prompt=`「${c.term}」の分類は？`;const cats=['資産','負債','純資産','収益','費用','評価勘定','集計','その他'];options=shuffle([c.category,...shuffle(cats.filter(v=>v!==c.category),rng).slice(0,3)],rng);correct=c.category;explanation=`${c.term}は${c.category==='評価勘定'?'資産を減額する評価勘定':c.category==='集計'?'原価の集計・振替に使う科目':c.category}です。${c.meaning}`;type='科目の分類';
  }
  return {cardId:c.id,type,prompt,options,answer:options.indexOf(correct),explanation};
 });
}
function answerSession(state,grade,choice,now=Date.now()){
 const s=state.sessions[grade];if(!s||s.selected!==null)return false;const q=s.questions[s.index];if(!Number.isInteger(choice)||choice<0||choice>=q.options.length)return false;
 s.selected=choice;const correct=choice===q.answer;s.results.push({cardId:q.cardId,correct});record(state,q.cardId,correct,'quiz',now);return true;
}
const api={DAY,dayKey,blank,clean,shuffle,inGrade,weak,due,mastered,record,streakDays,makeQuestions,answerSession};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudyCore=api;
})(typeof window!=='undefined'?window:this);
