/* Water -> Grocery pantry.
   Water drunk (Hub widget or Gym check-in) comes out of the Kirkland water stock in Grocery's Pantry.
   Idempotent: apps/grocery-v4/data/waterDeducted remembers how many ml of each profile+date were already
   taken out of stock, so we only ever apply the DIFFERENCE. Undo or lowering a day's total puts the water back. */
(function(){
  var PID='costco-water';
  var chain=Promise.resolve();
  function gref(db,uid,key){return db.collection('users').doc(uid).collection('apps').doc('grocery-v4').collection('data').doc(key)}
  function pantryStatus(onHand,full){var r=full>0?Math.max(0,onHand||0)/full:0;if(r<=0)return'finished';if(r<=.15)return'low';if(r<=.4)return'25';if(r<=.65)return'half';if(r<=.9)return'75';return'full'}
  function pantryFull(onHand,pkg){pkg=pkg||1;return Math.max(pkg,Math.ceil(Math.max(0,onHand||0)/pkg)*pkg)}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  var UNIT_ML={ml:1,l:1000,gallon:3785.41};

  async function run(db,uid,profile,date,ml){
    ml=Math.max(0,Math.round(Number(ml)||0));
    var key=String(profile||'').toLowerCase()+'|'+date;
    var ledgerSnap=await gref(db,uid,'waterDeducted').get();
    var ledger={};
    try{ledger=(ledgerSnap.exists&&ledgerSnap.data().json)?JSON.parse(ledgerSnap.data().json):{}}catch(e){ledger={}}
    var done=Number(ledger[key])||0;
    var delta=ml-done;
    if(!delta)return{changed:false};
    var snap=await gref(db,uid,'modernState').get();
    if(!snap.exists||!snap.data().json)return{changed:false,reason:'no-grocery'};
    var g=JSON.parse(snap.data().json);
    var inv=g.inventory&&g.inventory[PID];
    if(!inv)return{changed:false,reason:'not-in-pantry'}; // never bought or counted in Grocery, so nothing real to take it from
    var p=(g.products||[]).find(function(x){return x.id===PID});
    var per=p&&UNIT_ML[p.purchaseUnit];
    if(!p||!per)return{changed:false,reason:'no-unit'};
    var amt=delta/per; // purchase units (+ = drank more)
    inv.onHand=Math.max(0,(inv.onHand||0)-amt);
    inv.status=pantryStatus(inv.onHand,pantryFull(inv.onHand,p.purchaseQty||1));
    if(delta>0){
      g.stockLog=g.stockLog||[];
      g.stockLog.push({pid:PID,date:date,delta:Math.round(amt*1000)/1000});
      var c=new Date();c.setDate(c.getDate()-60);var cut=iso(c);
      g.stockLog=g.stockLog.filter(function(e){return e.date>=cut});
    }else{ // undo: take the matching usage back out of the log so the run-out prediction stays honest
      var back=-amt;g.stockLog=g.stockLog||[];
      for(var i=g.stockLog.length-1;i>=0&&back>0.0005;i--){
        var e=g.stockLog[i];if(e.pid!==PID||e.date!==date)continue;
        var take=Math.min(e.delta,back);e.delta=Math.round((e.delta-take)*1000)/1000;back-=take;
      }
      g.stockLog=g.stockLog.filter(function(e){return e.delta>0});
    }
    ledger[key]=ml;
    // keep the ledger small: only the last ~90 entries
    var ks=Object.keys(ledger).sort();if(ks.length>180)ks.slice(0,ks.length-180).forEach(function(k){delete ledger[k]});
    await gref(db,uid,'waterDeducted').set({json:JSON.stringify(ledger)});
    try{
      await gref(db,uid,'modernState').set({json:JSON.stringify(g)},{merge:true});
      await gref(db,uid,'inventory').set({json:JSON.stringify(g.inventory)},{merge:true});
    }catch(err){ // roll the ledger back so the next attempt retries instead of losing the water
      ledger[key]=done;try{await gref(db,uid,'waterDeducted').set({json:JSON.stringify(ledger)})}catch(e){}
      throw err;
    }
    return{changed:true,delta:delta};
  }

  window.WaterPantry={
    /* ml = the day's TOTAL water in ml. Safe to call repeatedly. */
    sync:function(db,uid,profile,date,ml){
      if(!db||!uid||!profile||!date)return Promise.resolve({changed:false});
      chain=chain.then(function(){return run(db,uid,profile,date,ml)}).catch(function(e){console.warn('water->pantry',e);return{changed:false,error:true}});
      return chain;
    }
  };
})();
