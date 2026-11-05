/* Detailed settings (gear) for the widgets that had none: Chores, Training, Quick links, Grocery, Budget, Pledge, Cook together.
   Each option is stored with the widget like every other widget setting and applied as a data-x-<key> flag on the card, which app.css reads.
   Flags live on the card, so they survive the widget repainting itself (ticking a chore, adding an expense...). */
(function(){
'use strict';
if(typeof WIDGET_TYPES==='undefined'||typeof wsAll!=='function')return;
const B=(key,label,hint,def)=>({key,label,hint,type:'bool',def:def!==false});
const DEFS={
  chores:[{h:'Show'},{key:'max',label:'How many to list',type:'seg',opts:[['3','3'],['6','6'],['all','All']],def:'all'},B('sum','Summary chips (to do, overdue, total time, done this week)'),B('fit','"I have 15 / 30 / 60 min" picker'),B('snooze','Move-to-later button on each chore'),B('sub','Room, minutes and due status under each name'),B('link','"Open Chores" link')],
  training:[{h:'Show'},B('week','"This week" strip'),B('link','"Open Training" link when there is no plan')],
  quicklinks:[{h:'Show'},B('training','Training'),B('nutrition','Nutrition'),B('household','Household'),B('status','Status line under each name','e.g. "2 chores due today"')],
  grocery:[{h:'Show'},B('prog','Bought of planned, with a progress bar'),B('hide','Hide items already bought','Bought items drop off the list instead of moving to the bottom',false),B('link','"Open Grocery" link')],
  budget:[{h:'Show'},B('pace','Pace line and left per day'),B('cats','Top three categories'),B('owe','Who owes whom and Settle all'),B('tabs','Add / Recent / Bills panel','The way to add, edit and pay from the card'),{key:'tab',label:'Panel that opens first',type:'seg',opts:[['add','Add'],['recent','Recent'],['bills','Bills']],def:'add'},B('link','"Open Budget" link')],
  pledge:[{h:'Show'},B('list','Pledge cards with a tick'),B('week','This week stamps (tap an earlier day to catch up)'),B('prize','Prize and ticks left to unlock'),B('others','Pledges that are not due today (rest days)'),B('link','"Open Pledge" link')],
  cook:[{h:'Show'},B('method','Method under each recipe'),B('link','"Open Diet" link')]
};
function flag(el,type,def){
  const card=el&&el.closest?el.closest('.widget-card'):null;if(!card)return;
  const w=(state.widgets||[]).find(x=>x.type===type),S=wsAll(w,def);
  Object.keys(S).forEach(k=>card.setAttribute('data-x-'+k,String(S[k])));
}
Object.keys(DEFS).forEach(type=>{
  const def=WIDGET_TYPES[type];if(!def||def.__x)return;def.__x=1;def.settings=DEFS[type];
  const orig=def.render;
  def.render=function(el){const r=orig.apply(this,arguments);flag(el,type,def);return r&&r.then?r.then(()=>flag(el,type,def)):r};
});
/* chores repaint themselves when you tick one, without going through render() */
if(typeof renderChoresListInto==='function'){const o=renderChoresListInto;window.renderChoresListInto=function(el){const r=o.apply(this,arguments);flag(el,'chores',WIDGET_TYPES.chores);return r}}
})();
