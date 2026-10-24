/* 仅用于本地浏览器验证：内存存档、模拟酒馆、无真实 API 请求。 */
(() => {
 const fixture=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(window.__FIXTURE_BASE64__),c=>c.charCodeAt(0))));
 const memory=new Map();
 const storage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear(),key:i=>[...memory.keys()][i]??null,get length(){return memory.size}};
 Object.defineProperty(window,'localStorage',{configurable:true,get:()=>storage});
 window.toastr={error:message=>{window.__startupError=message;document.documentElement.dataset.previewReady='false'}};
 window.__memory=memory;window.__requests=[];window.__persistCount=0;window.__mainCalls=0;window.__mockDelay=15;window.__finishReason='stop';
 window.__previewEntries=[
  {world:'剧情设定',comment:'院内日常',content:'WORLD_ALLOWED_CONTENT',position:0,order:100},
  {world:'旧变量书',comment:'[mvu]变量维护',content:'WORLD_MVU_EXCLUDED_CONTENT',position:0,order:200},
  {world:'规则背景',comment:'额外事件背景',content:'WORLD_OPTIONAL_CONTENT',position:1,order:100},
 ];
 const callbacks=new Map();
 const eventTypes=Object.fromEntries(['CHAT_CHANGED','GENERATION_STARTED','GENERATION_AFTER_COMMANDS','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_EDITED','MESSAGE_UPDATED'].map(k=>[k,k]));
 const ctx={characterId:0,characters:[{name:fixture.cardName,avatar:'libei-preview.png'}],name1:'玩家',name2:fixture.cardName,groupId:null,
  chat:[{is_user:false,is_system:false,mes:fixture.rules.initials[1].match,swipe_id:0}],
  getCurrentChatId:()=>window.__chatId||'libei-v2-preview',
  eventTypes,eventSource:{on:(type,fn)=>{if(!callbacks.has(type))callbacks.set(type,[]);callbacks.get(type).push(fn)},removeListener:(type,fn)=>callbacks.set(type,(callbacks.get(type)||[]).filter(f=>f!==fn))},
  setExtensionPrompt:(id,content)=>{window.__storyPrompt=content},
  extensionSettings:{libei_status_v2:{enabled:true,legacyMigrationResolved:true,ui:{theme:'day',navPosition:'auto',navTapClose:true,showTopBar:true,showQuickReply:true,showFloorPanel:true,showOrb:true,orbImage:'',orbShape:'bookmark',orbOpacity:62,orbSize:48},channels:[],assignments:{summary:'',resummary:''},exclusions:{excludedChars:[],excludedWorldNames:[],excludedWorldInfoPatterns:['\\[mvu[\\s\\S]*?\\]'],renderWorldInfoTemplates:false}}},
  getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'preview-csrf'}),
  saveSettingsDebounced:()=>{window.__persistCount++},
  getWorldInfoNames:()=>['剧情设定','旧变量书','规则背景'],substituteParams:s=>s,
  generateRaw:async({prompt})=>{window.__mainCalls++;window.__requests.push({kind:'main',messages:JSON.parse(JSON.stringify(prompt))});await new Promise(resolve=>setTimeout(resolve,window.__mockDelay));return '[{"op":"replace","path":"/世界/时间","value":"08:35"}]'},
 };
 window.__previewContext=ctx;window.SillyTavern={getContext:()=>ctx};
 window.__emit=async(type,...args)=>{for(const fn of [...(callbacks.get(type)||[])])await fn(...args)};
 window.__LIBEI_NATIVE_PREVIEW__={extension_prompt_types:{IN_CHAT:1},extension_prompt_roles:{SYSTEM:0},isGenerating:()=>false};
 const delay=signal=>new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException('预览请求取消','AbortError'));return}const timer=setTimeout(done,window.__mockDelay);function done(){signal?.removeEventListener('abort',abort);resolve()}function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('预览请求取消','AbortError'))}signal?.addEventListener('abort',abort,{once:true})});
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(url,options={})=>{
  const address=new URL(String(url),location.href);
  if(address.origin!==location.origin)throw Error('预览禁止外部请求');
  if(!address.pathname.startsWith('/api/'))return nativeFetch(url,options);
  const body=JSON.parse(options.body||'{}');window.__requests.push({kind:address.pathname.endsWith('/status')?'models':'secondary',body});
  await delay(options.signal);
  if(address.pathname.endsWith('/status'))return new Response(JSON.stringify({data:[{id:'preview-model-A'},{id:'preview-model-B'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  const test=body.messages?.some(m=>m.content?.includes('回复"ok"两个字符'));
  const text=test?'ok':'[{"op":"replace","path":"/世界/时间","value":"09:10"}]';
  return new Response(JSON.stringify({choices:[{finish_reason:window.__finishReason,message:{content:text}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 window.addEventListener('libei:v2-ready',()=>{const root=document.getElementById('libei-v2-shadow-host')?.shadowRoot;const title=root?.querySelector('.bbs-brand-name');if(title)title.textContent='黎北 · 演示数据';document.documentElement.dataset.previewReady='true'});
})();
