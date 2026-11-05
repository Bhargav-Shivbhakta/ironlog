/* Laptop "new look" switch. Classic = old Hub, New = Mac feel with Windows controls.
   Stored per device in localStorage key hub-lap-look ('new' default on wide screens, 'classic'). */
(function(){
  var KEY='hub-lap-look',d=document.documentElement;
  function get(){try{return localStorage.getItem(KEY)||'new'}catch(e){return 'new'}}
  function set(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  function apply(){var wide=Math.min(window.innerWidth||9999,screen.width||9999)>700;d.classList.toggle('lap-look',wide&&get()==='new');paint()}
  function paint(){var m=get();document.querySelectorAll('#lap-look-toggle button').forEach(function(b){b.classList.toggle('on',b.dataset.look===m)})}
  window.addEventListener('resize',apply);
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('#lap-look-toggle button');
    if(b){set(b.dataset.look);apply();return}
    var w=e.target.closest&&e.target.closest('.lap-titlebar .lt-wc');
    if(!w)return;
    if(w.dataset.act==='max'){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}catch(x){}}
    else if(w.dataset.act==='close'){try{window.close()}catch(x){}}
  });
  document.addEventListener('keydown',function(e){
    if(!d.classList.contains('lap-look'))return;
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==='N'||e.key==='n')){var q=document.querySelector('.lap-titlebar .lt-add');if(q){e.preventDefault();q.click()}}
  });
  apply();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);
})();
